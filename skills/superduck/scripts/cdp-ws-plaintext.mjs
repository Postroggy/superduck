#!/usr/bin/env node
// End-to-end-encrypted WebSocket probe for SuperDuck's raw CDP channel.
//
// A CDP client only ever sees ciphertext for a Noise/AES-GCM tunnel (`/v1/noise`
// style sockets): grabbing "more" frames never turns into plaintext. The plaintext
// already exists inside the page, at the boundary where the SDK encrypts/decrypts.
// This script is a *kit*, not a fixed recipe — pick the hooks you need, or append
// your own JS, then decode whatever the page logged.
//
//   node cdp-ws-plaintext.mjs list-hooks
//   node cdp-ws-plaintext.mjs wrap --hooks ws,crypto > /tmp/probe.json
//   superduck --session "$SID" --tab "$TAB" cdp Runtime.evaluate --params-file /tmp/probe.json
//   # ... drive the app so the traffic happens ...
//   superduck --session "$SID" --tab "$TAB" cdp Runtime.evaluate \
//     --params "{\"expression\":\"JSON.stringify(globalThis.__sdWs||[])\",\"returnByValue\":true}" > /tmp/log.json
//   node cdp-ws-plaintext.mjs decode /tmp/log.json --out /tmp/plain.txt
//
// Everything is intentionally overridable: `--extra hook.js` injects your own code
// into the same IIFE, `as-params` wraps any script file, and `decode` is driven by
// the data (base64 payloads and text entries), not by fixed field names.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const BUCKET_DEFAULT = '__sdWs';

// --- hook snippets, each is plain page JS with no external deps -------------
const HOOKS = {
  ws: `  const socketProto = window.WebSocket && WebSocket.prototype;
  if (socketProto && !socketProto.__sdWsSend) {
    const originalSend = socketProto.send;
    socketProto.send = function (data) {
      push({ dir: 'ws-out', url: String(this.url), payload: encode(data) });
      return originalSend.call(this, data);
    };
    const originalAdd = socketProto.addEventListener;
    socketProto.addEventListener = function (type, listener, options) {
      if (type === 'message') {
        const wrapped = function (event) {
          push({ dir: 'ws-in', url: String(this.url), payload: encode(event.data) });
          return listener.apply(this, arguments);
        };
        return originalAdd.call(this, type, wrapped, options);
      }
      return originalAdd.call(this, type, listener, options);
    };
    socketProto.__sdWsSend = true;
  }`,

  crypto: `  const subtle = window.SubtleCrypto && window.SubtleCrypto.prototype;
  if (subtle && !subtle.__sdWsCrypto) {
    const originalEncrypt = subtle.encrypt;
    subtle.encrypt = async function (algorithm, key, data) {
      push({ dir: 'crypto-out', algo: algorithm && algorithm.name, payload: encode(data) });
      return originalEncrypt.call(this, algorithm, key, data);
    };
    const originalDecrypt = subtle.decrypt;
    subtle.decrypt = async function (algorithm, key, data) {
      const output = await originalDecrypt.call(this, algorithm, key, data);
      push({ dir: 'crypto-in', algo: algorithm && algorithm.name, payload: encode(output) });
      return output;
    };
    subtle.__sdWsCrypto = true;
  }`,

  json: `  const originalParse = JSON.parse;
  JSON.parse = function (text, reviver) {
    try {
      if (typeof text === 'string' && text.length > 1 && text.length < 200000) {
        const head = text[0];
        if (head === '{' || head === '[') {
          push({ dir: 'json-in', text: text.slice(0, 4000), size: text.length });
        }
      }
    } catch (error) {
      /* logging must never break the app */
    }
    return originalParse.call(this, text, reviver);
  };`,

  worker: `  const originalWorker = window.Worker;
  if (originalWorker) {
    window.Worker = function (url, options) {
      push({ dir: 'worker', text: String(url).slice(0, 300), size: 0 });
      return options === undefined ? new originalWorker(url) : new originalWorker(url, options);
    };
    window.Worker.prototype = originalWorker.prototype;
  }`,

  xhr: `  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    push({ dir: 'xhr', text: method + ' ' + String(url).slice(0, 200), size: 0 });
    return originalOpen.apply(this, arguments);
  };`
};

function buildProbe(options) {
  const bucket = options.tag ?? BUCKET_DEFAULT;
  const names = options.hooks ?? ['ws', 'crypto', 'json'];
  const unknown = names.filter((name) => !HOOKS[name]);
  if (unknown.length > 0) {
    throw new Error(`unknown hook(s): ${unknown.join(', ')} — try: list-hooks`);
  }
  const body = names.map((name) => HOOKS[name]).join('\n\n');
  const extra = options.extraPath ? fs.readFileSync(options.extraPath, 'utf8') : '';
  return `(() => {
  const bucket = (globalThis.${bucket} = globalThis.${bucket} || []);
  const maxEntries = ${Number(options.maxEntries ?? 200)};
  const maxBytes = ${Number(options.maxBytes ?? 40000)};
  const push = (entry) => {
    if (bucket.length >= maxEntries) return;
    bucket.push(Object.assign({ t: Date.now() }, entry));
  };
  const encode = (value) => {
    try {
      const bytes =
        value instanceof ArrayBuffer
          ? new Uint8Array(value)
          : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      if (bytes.byteLength > maxBytes) return { skipped: bytes.byteLength };
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i += 0x8000) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      }
      return { base64: btoa(binary), size: bytes.byteLength };
    } catch (error) {
      return { error: String(error) };
    }
  };

${body}
${extra}

  push({ dir: 'installed', text: location.href, size: 0, bucket: ${JSON.stringify(bucket)} });
})();`;
}

// --- CDP result decoding ----------------------------------------------------
function readVarint(bytes, offset) {
  let result = 0;
  let shift = 0;
  let position = offset;
  for (;;) {
    if (position >= bytes.length) return null;
    const byte = bytes[position++];
    result += (byte & 0x7f) * 2 ** shift;
    shift += 7;
    if ((byte & 0x80) === 0) break;
    if (shift > 63) return null;
  }
  return { value: result, offset: position };
}

function fields(bytes) {
  const parsed = [];
  let offset = 0;
  while (offset < bytes.length) {
    const tag = readVarint(bytes, offset);
    if (!tag || tag.value === 0) return parsed;
    offset = tag.offset;
    const number = Math.floor(tag.value / 8);
    const wire = tag.value & 7;
    if (number < 1 || number > 1024) return parsed;
    if (wire === 0) {
      const value = readVarint(bytes, offset);
      if (!value) return parsed;
      offset = value.offset;
      parsed.push({ number, wire, value: value.value });
    } else if (wire === 2) {
      const length = readVarint(bytes, offset);
      if (!length) return parsed;
      offset = length.offset;
      const end = offset + length.value;
      if (end > bytes.length) return parsed;
      parsed.push({ number, wire, bytes: bytes.subarray(offset, end) });
      offset = end;
    } else if (wire === 1) {
      if (offset + 8 > bytes.length) return parsed;
      parsed.push({ number, wire, fixed: bytes.subarray(offset, offset + 8).toString('hex') });
      offset += 8;
    } else if (wire === 5) {
      if (offset + 4 > bytes.length) return parsed;
      parsed.push({ number, wire, fixed: bytes.subarray(offset, offset + 4).toString('hex') });
      offset += 4;
    } else {
      return parsed;
    }
  }
  return parsed;
}

function decompress(bytes) {
  const zstd = bytes.length > 4 && bytes[0] === 0x28 && bytes[1] === 0xb5 && bytes[2] === 0x2f && bytes[3] === 0xfd;
  const gzip = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  const deflate = bytes.length > 2 && bytes[0] === 0x78;
  try {
    if (zstd && zlib.zstdDecompressSync) return { encoding: 'zstd', bytes: zlib.zstdDecompressSync(bytes) };
    if (gzip) return { encoding: 'gzip', bytes: zlib.gunzipSync(bytes) };
    if (deflate) return { encoding: 'deflate', bytes: zlib.inflateSync(bytes) };
  } catch (error) {
    return undefined;
  }
  return undefined;
}

function asText(bytes) {
  if (bytes.length === 0) return undefined;
  const printable = [...bytes].filter(
    (byte) => byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte < 127) || byte >= 0xc2
  ).length;
  return printable / bytes.length > 0.9 ? bytes.toString('utf8') : undefined;
}

function walk(bytes, depth, out) {
  const parsed = fields(bytes);
  if (parsed.length === 0) return false;
  const indent = '  '.repeat(depth);
  for (const field of parsed) {
    if (field.wire === 0) {
      out.push(`${indent}${field.number}: ${field.value}`);
      continue;
    }
    if (field.wire !== 2) {
      out.push(`${indent}${field.number}: fixed(${field.fixed})`);
      continue;
    }
    const body = decompress(field.bytes);
    if (body) {
      out.push(`${indent}${field.number}: ${body.encoding}(${field.bytes.length}) -> ${body.bytes.length}B`);
      const inner = asText(body.bytes);
      if (inner) out.push(`${indent}  ${inner.slice(0, 3000).replace(/\n/g, ' ')}`);
      continue;
    }
    const text = asText(field.bytes);
    if (text && !/[\x00-\x08\x0e-\x1f]/.test(text)) {
      out.push(`${indent}${field.number}: ${JSON.stringify(text.slice(0, 600))}`);
      continue;
    }
    const before = out.length;
    if (walk(field.bytes, depth + 1, out)) {
      out.splice(before, 0, `${indent}${field.number} {`);
      out.push(`${indent}}`);
    } else {
      out.push(
        `${indent}${field.number}: bytes(${field.bytes.length}) ${field.bytes.subarray(0, 24).toString('hex')}`
      );
    }
  }
  return true;
}

function loadEntries(text) {
  const trimmed = String(text).trim().replace(/^\uFEFF/, '');
  if (trimmed === '') throw new Error('empty input — pipe the CDP Runtime.evaluate output');
  const parsed = JSON.parse(trimmed);
  const unwrap = (value) => {
    const inner = value?.result?.result?.value ?? value?.result?.value ?? value?.value;
    if (typeof inner === 'string') return JSON.parse(inner);
    if (Array.isArray(inner)) return inner;
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.events)) return value.events; // `cdp events` output
    throw new Error('unrecognised log shape');
  };
  const entries = unwrap(parsed);
  return Array.isArray(entries) ? entries : [entries];
}

function decodeEntries(entries, options) {
  const wanted = options.dirs ? new Set(options.dirs.split(',').map((dir) => dir.trim())) : undefined;
  const out = [];
  const counts = {};
  for (const entry of entries) {
    const dir = entry?.dir ?? entry?.method ?? 'unknown';
    counts[dir] = (counts[dir] ?? 0) + 1;
    if (wanted && !wanted.has(dir)) continue;

    const text = entry?.text ?? entry?.method;
    const payload = entry?.payload ?? entry?.params ?? {};
    if (payload && typeof payload.base64 === 'string') {
      out.push(`\n=== ${dir} ${entry.algo ?? ''} size=${payload.size ?? '?'}`.replace(/\s+$/, ''));
      walk(Buffer.from(payload.base64, 'base64'), 0, out);
      continue;
    }
    if (typeof text === 'string') {
      const flat = text.replace(/\s+/g, ' ');
      out.push(`\n=== ${dir} ${entry.size ?? flat.length}B\n  ${flat.slice(0, options.maxText ?? 1200)}`);
    }
  }
  out.unshift(`# entries=${entries.length} ${JSON.stringify(counts)}`);
  return out.join('\n');
}

// --- CLI --------------------------------------------------------------------
function parseArgs(argv) {
  const options = {};
  const positional = [];
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }
    const key = token.slice(2);
    if (key === 'no-tree' || key === 'stdout') {
      options[key] = true;
      continue;
    }
    options[key] = argv[++index];
  }
  return { options, positional };
}

function main() {
  const mode = process.argv[2] ?? 'wrap';
  const { options } = parseArgs(process.argv.slice(3));

  if (mode === 'list-hooks') {
    process.stdout.write(Object.keys(HOOKS).join('\n') + '\n');
    return;
  }

  if (mode === 'wrap') {
    const hooks = options.hooks ? options.hooks.split(',').map((name) => name.trim()) : undefined;
    const params = {
      expression: buildProbe({
        hooks,
        extraPath: options.extra,
        maxEntries: options['max-entries'],
        maxBytes: options['max-bytes'],
        tag: options.tag
      }),
      returnByValue: true
    };
    const output = JSON.stringify(params);
    if (options.out) {
      fs.writeFileSync(path.resolve(options.out), output, 'utf8');
      process.stderr.write(`wrote ${options.out}\n`);
    } else {
      process.stdout.write(output);
    }
    return;
  }

  if (mode === 'as-params') {
    const sourceFile = process.argv[3];
    if (!sourceFile) throw new Error('as-params needs a JS file');
    const output = JSON.stringify({ expression: fs.readFileSync(sourceFile, 'utf8'), returnByValue: true });
    if (options.out) {
      fs.writeFileSync(path.resolve(options.out), output, 'utf8');
      process.stderr.write(`wrote ${options.out}\n`);
    } else {
      process.stdout.write(output);
    }
    return;
  }

  if (mode === 'decode') {
    const logFile = process.argv.slice(3).find((token) => !token.startsWith('--') && token !== options.out &&
      token !== options.dirs && token !== options['max-text']);
    const source = logFile ? fs.readFileSync(path.resolve(logFile), 'utf8') : fs.readFileSync(0, 'utf8');
    const report = decodeEntries(loadEntries(source), {
      dirs: options.dirs,
      maxText: options['max-text'] ? Number(options['max-text']) : undefined
    });
    if (options.out) {
      fs.writeFileSync(path.resolve(options.out), report, 'utf8');
      process.stderr.write(`wrote ${options.out}\n`);
    } else {
      process.stdout.write(report + '\n');
    }
    return;
  }

  throw new Error(`unknown mode: ${mode} (wrap | as-params | decode | list-hooks)`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`cdp-ws-plaintext: ${error.message}\n`);
  process.exit(1);
}