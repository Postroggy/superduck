# Advanced SuperDuck Commands

Reference for less common `superduck 0.2.7` commands. Prefer checking
`superduck --help` and `superduck <command> --help` if the installed version
differs.

## Console Monitoring

Filter console output so real sites do not flood the context.

```bash
superduck --session "$SID" --tab "$TAB" console --pattern error --limit 20
superduck --session "$SID" --tab "$TAB" console --only-errors --limit 20
superduck --session "$SID" --tab "$TAB" console --clear
```

## Network Monitoring

Network tracking starts when `network` is first called for a tab. Initialize it,
trigger the request or refresh, then read filtered results.

```bash
superduck --session "$SID" --tab "$TAB" network --url-pattern /api/ --limit 20
superduck --session "$SID" --tab "$TAB" exec 'fetch("/api/ping").catch(()=>{})'
sleep 1
superduck --session "$SID" --tab "$TAB" network --url-pattern /api/ --limit 20
```

Use `--clear` after reading if you need a fresh capture window.

`--bodies` adds request/response bodies and captured WebSocket frames
(`--max-body-chars` clips each payload, default 4000, `0` = no clip). This is the
*assembled* view: the request list, timings, bodies and frames already joined, so
you do not rebuild `requestId -> getResponseBody` by hand. For interception,
blocking, extra headers or the raw `Network.webSocketFrame*` events, use
`cdp Network.*` on the same tab.

## Raw CDP

`cdp` forwards any DevTools Protocol method verbatim. Enable a domain first, then
call it; results come back as plain protocol JSON.

```bash
superduck --session "$SID" --tab "$TAB" cdp Network.enable
superduck --session "$SID" --tab "$TAB" cdp Page.getLayoutMetrics
superduck --session "$SID" --tab "$TAB" cdp CSS.enable
superduck --session "$SID" --tab "$TAB" cdp CSS.getMatchedStylesForNode --params-file node.json
superduck --session "$SID" --tab "$TAB" cdp status
superduck --session "$SID" --tab "$TAB" cdp events --pattern Debugger.paused --wait-ms 8000
superduck cdp targets --pattern worker
```

A script keeps a whole sequence inside one call: steps are `{"method","params"}`,
`{"waitFor":"Debugger.paused","timeoutMs":5000}` (waits for a *new* event) or
`{"sleepMs":200}`, and params can reference earlier steps
(`"${2.event.params.callFrames.0.callFrameId}"`).

```bash
superduck --session "$SID" --tab "$TAB" cdp --script breakpoint-steps.json
```

On Windows PowerShell pass JSON through a file (`--params-file`, `--script`):
native arguments lose their double quotes.

## End-to-End Encrypted Sockets

A Noise/AES-GCM tunnel (`/v1/noise`-style URLs, high-entropy frame bytes) never
yields plaintext at the protocol layer. Hook the page's encrypt/decrypt instead:

```bash
SKILL_DIR="${SUPERDUCK_SKILL_DIR:-$HOME/.agent/skills/superduck}"
node "$SKILL_DIR/scripts/cdp-ws-plaintext.mjs" list-hooks
node "$SKILL_DIR/scripts/cdp-ws-plaintext.mjs" wrap --hooks ws,crypto --out /tmp/probe.json
superduck --session "$SID" --tab "$TAB" cdp Runtime.evaluate --params-file /tmp/probe.json
# ... drive the app ...
superduck --session "$SID" --tab "$TAB" cdp Runtime.evaluate \
  --params '{"expression":"JSON.stringify(globalThis.__sdWs||[])","returnByValue":true}' > /tmp/log.json
node "$SKILL_DIR/scripts/cdp-ws-plaintext.mjs" decode /tmp/log.json --out /tmp/plain.txt
```

Plaintext often turns out to be a protobuf envelope carrying HTTP requests inside
the socket, with zstd-compressed bodies; `decode` expands the fields and decompresses
the bodies. If page hooks see nothing at all, the socket lives in a worker — check
`cdp targets` and drive that target with `--target`.

## Ref-Based Interaction

`read_page` returns refs for accessible elements. Refs are usually more stable
than coordinates.

```bash
superduck --session "$SID" --tab "$TAB" read_page --filter interactive
superduck --session "$SID" --tab "$TAB" left_click --ref ref_3
superduck --session "$SID" --tab "$TAB" hover --ref ref_4
superduck --session "$SID" --tab "$TAB" right_click --ref ref_5
superduck --session "$SID" --tab "$TAB" double_click --ref ref_6
```

If a ref becomes stale, rerun `read_page` immediately before using it.

## Form Input

`form_input` writes to a field ref. It does not inspect or list fields.

```bash
superduck --session "$SID" --tab "$TAB" read_page --filter interactive
superduck --session "$SID" --tab "$TAB" form_input --ref ref_7 --value "Ada Lovelace"
superduck --session "$SID" --tab "$TAB" form_input --ref ref_8 --value "true" --string
```

If `form_input` fails on a field, use `left_click --ref` followed by `type`, or
set the field with `exec` and dispatch `input`/`change` events.

## Scrolling

`scroll` sends wheel ticks at a viewport coordinate.

```bash
superduck --session "$SID" --tab "$TAB" scroll 900 700 --direction down --amount 5
superduck --session "$SID" --tab "$TAB" scroll 900 300 --direction up --amount 3
```

`scroll_to` scrolls an element ref into view.

```bash
superduck --session "$SID" --tab "$TAB" read_page
superduck --session "$SID" --tab "$TAB" scroll_to --ref ref_12
```

For absolute page positions, use JavaScript:

```bash
superduck --session "$SID" --tab "$TAB" exec 'window.scrollTo(0, 0)'
superduck --session "$SID" --tab "$TAB" exec 'window.scrollTo(0, document.body.scrollHeight)'
```

## Screenshots, Region Zoom, Resize, and Viewport Emulation

```bash
superduck --session "$SID" --tab "$TAB" screenshot --output /tmp/
superduck --session "$SID" --tab "$TAB" screenshot --output /tmp/step1.jpg
superduck --session "$SID" --tab "$TAB" zoom 100 100 600 500 --output /tmp/region.jpg
superduck --session "$SID" --tab "$TAB" resize 1366 768
superduck --session "$SID" --tab "$TAB" viewport 375 812 --dpr 2 --mobile
superduck --session "$SID" --tab "$TAB" viewport --clear --reload
```

`zoom` captures or inspects a rectangular region. It is not browser page zoom.
For screenshot output, a directory path ending in `/` auto-generates a filename;
a file path uses that basename but may be extension-aligned to the real image
format, commonly `.jpg`.

`resize` moves the real browser window, so browser chrome eats into the result,
`devicePixelRatio` keeps the display scale, the OS rejects tiny sizes, and a
maximized window is restored first. `viewport` overrides the layout viewport
instead: media queries, `innerWidth`, `devicePixelRatio` (`--dpr`) and `screen.*`
follow the emulated size, with `--mobile` for mobile viewport behaviour, and no
window is moved. Prefer `viewport` for breakpoint work; use `resize` only when the
real window size is the thing under test.

Emulation belongs to the debugger session and is dropped when it detaches
(service worker restart, browser restart, user cancelling the debugging infobar).
After clearing a mobile emulation the page keeps its emulated layout until it
reloads, which is why `--clear` takes `--reload`.

Raw CDP equivalent, when you need more knobs:

```bash
superduck --session "$SID" --tab "$TAB" cdp Emulation.setDeviceMetricsOverride \
  --params '{"width":375,"height":812,"deviceScaleFactor":2,"mobile":true,"screenWidth":375,"screenHeight":812}'
superduck --session "$SID" --tab "$TAB" cdp Emulation.setTouchEmulationEnabled --params '{"enabled":true,"maxTouchPoints":5}'
superduck --session "$SID" --tab "$TAB" cdp Emulation.clearDeviceMetricsOverride
```

## Uploads

Two commands, picked by source — both target the page via `--ref` or `--coord`:

- `upload_image` drops an image already in the session (prior `screenshot` or
  user-uploaded image, referenced by `--image-id`) onto a file input or drag
  target. `--filename` defaults to `image.png`.
- `upload_file` uploads one or more local files from disk via repeatable
  `--path` (absolute paths; the input needs `multiple` for more than one).

```bash
superduck --session "$SID" --tab "$TAB" upload_image --image-id <id> --ref ref_9 --filename image.png
superduck --session "$SID" --tab "$TAB" upload_image --image-id <id> --coord 500,400
superduck --session "$SID" --tab "$TAB" upload_file --path /abs/report.pdf --ref ref_9
```

## Shortcuts

Shortcuts are saved prompts stored in the extension. The CLI fetches prompts for
the local agent; it does not execute them.

```bash
superduck shortcuts list
superduck shortcuts list --json
superduck shortcuts get <name-or-id> --show-vars
superduck shortcuts get <name-or-id> --var search_query=deepseek --json
```

## GIF Recording

GIF commands require `--tab`, but actions performed through CLI commands may
record 0 frames. Use screenshots plus `ffmpeg` for CLI-only workflows.

```bash
superduck --session "$SID" gif start --tab "$TAB"
# perform MCP/browser actions
superduck --session "$SID" gif stop --tab "$TAB"
superduck --session "$SID" gif export --tab "$TAB" --download --filename workflow.gif
```

## Keyboard and Coordinates

```bash
superduck --session "$SID" --tab "$TAB" key Enter
superduck --session "$SID" --tab "$TAB" key "Control+a"
superduck --session "$SID" --tab "$TAB" left_click 300 400
superduck --session "$SID" --tab "$TAB" left_click_drag 100 200 500 300
superduck --session "$SID" --tab "$TAB" triple_click 400 300
```

Modifier behavior depends on focus, OS, and page handlers. For high-reliability
text replacement, prefer `form_input` or `exec`.

## JSON Output Mode

```bash
superduck --json tabs
superduck --json --session "$SID" --tab "$TAB" context
```

`tabs --json` and `context --json` are structured. Many action commands return
JSON envelopes whose `output` value is still human-readable text and may include
`Tab Context`.

## Custom Socket and Timeout

```bash
superduck --socket /custom/path/to/socket.sock version
superduck --timeout 60 --session "$SID" --tab "$TAB" navigate https://very-slow-site.com
```
