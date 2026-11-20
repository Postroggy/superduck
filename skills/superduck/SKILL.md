---
name: superduck
description: "Control the user's local Chrome/Edge browser through the SuperDuck extension and `superduck` CLI. Use when a task needs the real browser session: current tab context, logged-in sites, cookies, navigation, page reading/scraping, form interaction, screenshots, managed tab handoff, or raw Chrome DevTools Protocol (`superduck cdp`) for breakpoints, call-frame locals, the CSS cascade, request/response bodies, WebSocket frames, request interception, worker targets, or socket plaintext. Triggers include: use my browser, use my Chrome, I'm logged in, open/navigate a page, read/scrape this page, inspect comments, click/fill a page, capture a screenshot, set a breakpoint, inspect the CSS cascade, get the response body, intercept requests, capture WebSocket frames, inspect a worker, decrypt a socket. Do not use for headless/cloud browser work."
allowed-tools: Bash(superduck *), Bash(node *)
---

# Browser Automation with SuperDuck

Use SuperDuck to control the user's local Chrome/Edge browser through the
`superduck` CLI. It uses the user's real browser state, including existing
cookies and logins.

This skill assumes the current CLI contract where JSON tab-group commands expose
`.tabContext.currentTabId`. If behavior looks wrong, run `superduck version` and
`superduck --help` before adapting examples to the installed binary.

## Core Workflow

Prefer element refs from `read_page` over coordinates. Coordinates are a
fallback for canvas, custom widgets, or elements that do not expose a useful ref.

```bash
superduck doctor
# Mint one session id per task and pass it to every browser command so this
# task owns its own tab group and does not collide with other concurrent tasks.
SID=$(superduck session new)
# Create (or reuse) the session's tab group and name it in one step.
# The 🦆 marker is auto-prepended. --name is ignored if the group already exists.
TAB=$(superduck --session "$SID" --json tab_group list --create-if-empty --name "🔎 <short task name>" \
  | jq -r '.tabContext.currentTabId')
superduck --session "$SID" --tab "$TAB" navigate https://example.com/
superduck --session "$SID" --tab "$TAB" context
superduck --session "$SID" --tab "$TAB" read_page
superduck --session "$SID" --tab "$TAB" read_page --filter interactive
superduck --session "$SID" --tab "$TAB" left_click --ref ref_1
# Before ending a turn that did any browser work, run finalize — it must be
# the last browser action of the turn. Do not call browser tools after it.
superduck --session "$SID" tab_group finalize
```

If you skip `--session`, CLI calls in the same shell fall back to a shared
`cli:ppid:<parent-pid>` session, so concurrent tasks from that shell would step
on each other's tabs. Mint a fresh `SID` per task with `superduck session new`
instead. Pass `--name "🔎 <task>"` to `tab_group list --create-if-empty` to title the group at
creation; the 🦆 marker is always prepended automatically (do not add it
yourself), so every SuperDuck-opened group is identifiable at a glance. To
rename a group mid-task, run `superduck --session "$SID" session name "<text>"`.

New tabs usually start on a Chrome internal page. Navigate to an `https://`
page before using `exec`, `read_page`, or screenshots. `about:` and `data:`
URLs may be rejected by `navigate`.

## Tab Lifecycle

Start by reusing the current session group:

```bash
superduck --session "$SID" tab_group list --create-if-empty
```

Capture the tab id from the JSON envelope. `tabContext.currentTabId` is the
canonical field used by the current CLI and help text:

```bash
TAB=$(superduck --session "$SID" --json tab_group list --create-if-empty \
  | jq -r '.tabContext.currentTabId')
```

Do not run `tab_group new` after `tab_group list --create-if-empty`. That creates
an unused group before the real work starts. Use exactly one tab acquisition
command for a task: normally `tab_group list --create-if-empty`. Use
`superduck --session "$SID" tab_group new --force` only when you intentionally
want to discard the current session group and start a separate context.

Same-session continuation is automatic while you are doing the browser work.
Before ending any turn that did browser work, run exactly one
`superduck --session "$SID" tab_group finalize` command so the managed group is
released. Treat finalize as the last browser action of the turn: do not call any
SuperDuck browser tool after finalizing. If more browser work is needed in a
later turn, do it then and finalize again at the end of that turn. Do not answer
the user, ask a follow-up, or inspect the repo for cleanup details before
running finalize; decide the tab disposition from the task outcome.

Omit tabs by default. `finalize` never closes a tab — it only releases the
managed tab group. Omitted tabs are ungrouped (removed from the managed group)
and left open in the window, so the user's pages are never lost. Omit research,
search, source, intermediate, duplicate, blank, error, and login/navigation
tabs once you have what you need; they will simply leave the managed group and
stay open. If the user asked a question and the answer can be given in the
chat, omit the tab even if it helped you answer. Do not ask the user whether to
clean up ordinary intermediate tabs; make the disposition decision from the
task outcome.

When the tabs you opened were only your own scratch work — test runs, fixtures,
pages you loaded to verify a behaviour and nobody needs to see again — close
them instead of leaving them to pile up:

```bash
superduck --session "$SID" tab_group close 123 456   # ids from tab_group list
```

Use `--deliverable TAB` when the tab itself is a user-facing output or a page
the user explicitly asked to keep open or inspect directly. Examples include a
created/edited document, dashboard, checkout/cart, submitted form result, or a
requested open page. Deliverable tabs stay open, leave the managed tab group,
and get a ✓ badge so the user can spot them:

```bash
superduck --session "$SID" tab_group finalize --deliverable "$TAB"
```

Use `--handoff TAB` only when the task is unfinished and a later turn should
continue from that live page, such as a login, approval, payment, CAPTCHA, or
other user-input checkpoint. Handoff tabs stay in the managed tab group for
continuation:

```bash
superduck --session "$SID" tab_group finalize --handoff "$TAB"
```

Omitted tabs (SuperDuck-created or user-origin) are ungrouped and left open —
finalize releases the managed group, it never closes your pages.

## Tab Management

```bash
superduck --session "$SID" tab_group list --create-if-empty
superduck --session "$SID" tab_group finalize
superduck tabs
superduck --session "$SID" --tab "$TAB" context
```

`tab_group list --create-if-empty` is the normal reuse path. `tab_group new`
requires `--force` after a session group exists and should not be part of normal
browser work. `tabs --json` and `context --json` are structured; many other
`--json` commands still wrap human-readable output in an `output` string.

## Navigation and Waiting

```bash
superduck --session "$SID" --tab "$TAB" navigate https://example.com/
superduck --session "$SID" --tab "$TAB" context
sleep 2
```

Use `context` to verify load. If using `wait`, the unit is seconds:
`superduck --session "$SID" --tab "$TAB" wait 1`, not `wait 1000`.

## Reading and Extraction

```bash
superduck --session "$SID" --tab "$TAB" read_page --filter interactive
superduck --session "$SID" --tab "$TAB" page_text
superduck --session "$SID" --tab "$TAB" exec 'JSON.stringify({title: document.title, url: location.href})'
```

`page_text` is quick but may compress whitespace. Use `exec` for structured
data. The helper `scripts/extract-data.mjs` strips the trailing `Tab Context`
from `exec` output and is safer for repeated scraping tasks.

## Interaction

Use refs when possible:

```bash
superduck --session "$SID" --tab "$TAB" read_page --filter interactive
superduck --session "$SID" --tab "$TAB" left_click --ref ref_3
superduck --session "$SID" --tab "$TAB" hover --ref ref_4
superduck --session "$SID" --tab "$TAB" right_click --ref ref_5
superduck --session "$SID" --tab "$TAB" double_click --ref ref_6
```

Use coordinates only when needed:

```bash
superduck --session "$SID" --tab "$TAB" left_click 300 400
superduck --session "$SID" --tab "$TAB" type "text to type"
superduck --session "$SID" --tab "$TAB" key Enter
```

Keyboard modifier behavior can vary by OS/browser focus. For fragile form
editing, prefer `exec` or `form_input --ref ... --value ...` when the ref works.

## Forms

`form_input` writes a value to a field ref; it does not list fields.

```bash
superduck --session "$SID" --tab "$TAB" read_page --filter interactive
superduck --session "$SID" --tab "$TAB" form_input --ref ref_7 --value "Ada Lovelace"
```

If `form_input` reports a stale ref, rerun `read_page`, or focus the field with
`left_click --ref` and use `type`. For complex forms, use `exec` to set values
and dispatch input/change events.

## Scrolling

`scroll` sends wheel ticks at a viewport coordinate:

```bash
superduck --session "$SID" --tab "$TAB" scroll 800 700 --direction down --amount 5
superduck --session "$SID" --tab "$TAB" scroll 800 300 --direction up --amount 3
```

`scroll_to` scrolls an element ref into view:

```bash
superduck --session "$SID" --tab "$TAB" read_page
superduck --session "$SID" --tab "$TAB" scroll_to --ref ref_12
```

For top/bottom page jumps, use JavaScript:

```bash
superduck --session "$SID" --tab "$TAB" exec 'window.scrollTo(0, document.body.scrollHeight)'
```

## Screenshots and Visual Checks

```bash
superduck --session "$SID" --tab "$TAB" screenshot --output /tmp/
superduck --session "$SID" --tab "$TAB" screenshot --output /tmp/step1.jpg
superduck --session "$SID" --tab "$TAB" zoom 100 100 600 500 --output /tmp/region.jpg
```

`--output /tmp/` saves an auto-named JPEG. `--output /tmp/name.png` may be
written as `/tmp/name.jpg` when the browser returns JPEG data. `zoom` captures a
rectangular region; it is not page zoom.

## Responsive Checks

Two different tools. `viewport` emulates the size inside the current window and is
what you want for breakpoints; `resize` moves the real window and is visible to the
user.

```bash
superduck --session "$SID" --tab "$TAB" viewport 375 812 --dpr 2 --mobile
superduck --session "$SID" --tab "$TAB" screenshot --output /tmp/mobile.jpg
superduck --session "$SID" --tab "$TAB" viewport 1280 800
superduck --session "$SID" --tab "$TAB" screenshot --output /tmp/desktop.jpg
superduck --session "$SID" --tab "$TAB" viewport --clear --reload
```

`viewport` sets width, height, deviceScaleFactor and mobile emulation, so
`innerWidth`, `devicePixelRatio`, `screen.*` and media queries all follow the
emulated numbers while the window itself stays where it is. Widths below the
minimum real window (about 500px on Windows) are reachable this way.

`resize <width> <height>` changes the real window: the viewport ends up smaller
than the requested size because browser chrome takes space, `devicePixelRatio`
stays at the display scale, and the OS refuses very small sizes. It also
un-maximizes the window, which is visible to the user, so prefer `viewport`
unless the task is about the real window size.

Emulation lives on the debugger session: it ends when the debugger detaches
(service worker restart, browser restart, or the user cancelling Chrome's
debugging infobar). Mobile emulation also leaves the page laid out at the
emulated width after clearing, hence `--clear --reload`.

## Console and Network

Always filter noisy pages:

```bash
superduck --session "$SID" --tab "$TAB" console --pattern error --limit 20
superduck --session "$SID" --tab "$TAB" console --only-errors --limit 20
superduck --session "$SID" --tab "$TAB" network --url-pattern /api/ --limit 20
superduck --session "$SID" --tab "$TAB" network --url-pattern /api/ --bodies --limit 5
```

Network tracking starts when `network` is first called. Call it once, trigger
the request or refresh the page, then call it again to inspect captured entries.
`--bodies` fetches response bodies through `Network.getResponseBody` while Chrome
still holds them, and prints request bodies plus captured WebSocket frames;
`--max-body-chars` clips each payload (default 4000, `0` = no clip).

`network` is the assembled view: it keeps the request list, timings, bodies and
WebSocket frames in one place so you do not rebuild them from `requestId`s every
time. For anything past that view — interception, blocking, per-request headers,
raw `webSocketFrame*` events — use `cdp Network.*` against the same tab.

## Raw CDP (`cdp`)

`cdp` is the escape hatch for anything the curated commands do not cover: DOM/CSS
rule origin and cascade inspection, breakpoints, network interception, emulation,
performance traces. It is a peer of `exec` and is a **thin passthrough**: the
method and params go to the tab's debugger session untouched, and the result is
printed verbatim. There is no method whitelist and no SuperDuck envelope.

Pick the surface before you write anything:

| Need | Use |
|---|---|
| JS value or assertion in the page | `exec` |
| Request list with bodies and WS frames, already joined | `network --bodies` |
| Breakpoints, stepping, call-frame locals | `cdp Debugger.*` + `cdp events --pattern Debugger.paused` |
| CSS cascade, rule origin, overridden declarations | `cdp CSS.getMatchedStylesForNode` |
| Intercept/rewrite/block requests, extra headers, throttling | `cdp Fetch.*` / `cdp Network.setExtraHTTPHeaders` |
| Raw event stream (WS frames, console, lifecycle) | `cdp <Domain>.enable` + `cdp events` |
| Socket or crypto invisible on the main thread | `cdp targets` → `--target` |
| Plaintext of an end-to-end encrypted tunnel | `scripts/cdp-ws-plaintext.mjs` |

```bash
# one command — result printed exactly as CDP returns it
superduck --session "$SID" --tab "$TAB" cdp Network.enable
superduck --session "$SID" --tab "$TAB" cdp Page.getLayoutMetrics
superduck --session "$SID" --tab "$TAB" cdp CSS.getMatchedStylesForNode --params-file styles.json
superduck --session "$SID" --tab "$TAB" cdp Runtime.evaluate --params-file eval.json

# a CDP script: ordered commands in one round trip
superduck --session "$SID" --tab "$TAB" cdp --script steps.json
```

On Windows PowerShell pass params through `--params-file`: native arguments lose
their double quotes, so `--params '{"depth":1}'` arrives mangled (the CLI repairs
bare keys, but quoted values cannot be recovered). `--script -` reads the command
array from stdin.

Domains must be enabled before they emit anything: `cdp Network.enable`,
`cdp Debugger.enable`, `cdp CSS.enable`, `cdp Runtime.enable`.

### Scripts: chaining and waiting inside one call

A script step is one of three shapes. Later steps can reference earlier results,
so a breakpoint run does not need a round trip per command:

```json
[
  { "method": "Debugger.enable" },
  { "method": "Debugger.setBreakpointByUrl",
    "params": { "url": "app.js", "lineNumber": 42 } },
  { "waitFor": "Debugger.paused", "timeoutMs": 5000 },
  { "method": "Debugger.evaluateOnCallFrame",
    "params": { "callFrameId": "${2.event.params.callFrames.0.callFrameId}",
                "expression": "JSON.stringify(user)" } },
  { "method": "Debugger.resume" },
  { "sleepMs": 200 }
]
```

- `{method, params}` — one protocol command; result is the raw payload.
- `{waitFor, timeoutMs}` — blocks until a buffered event whose method contains
  the string arrives (max 15s, default 5s). Only new events count.
- `{sleepMs}` — pause between steps (max 5s).
- `${n.path}` / `${prev.path}` — substitute a value from step `n`'s result:
  `${0.result.requestId}`, `${2.event.params.callFrames.0.callFrameId}`.
  Unresolvable references stay literal so you can see what failed.

Output is one entry per step: `{ok:true,result}` / `{ok:true,event}` /
`{ok:false,error}`. It stops at the first failure unless `--continue-on-error`.

### `cdp status` — the session state you do not have to re-derive

```bash
superduck --session "$SID" --tab "$TAB" cdp status
```

Reports `attached`, `enabledDomains`, `breakpoints` (with resolved location),
`paused` (reason, duration, top frame, frame list), `lastCommand`/`lastError`,
`events {capturing, buffered, nextSeq}`, `network {tracking, requests}`.

While a tab is paused, page tools (`exec`, `navigate`, clicks/typing, screenshots,
uploads, `batch`) return the paused frame instead of hanging on the timeout; use
the debugger (`resume`, `stepOver`, `evaluateOnCallFrame`) to get out.

Events are buffered per tab from the first `cdp` call, because CDP cannot hand them
back synchronously. `cdp events` returns `{cursor, events}` (`dropped` when the
buffer overflowed); follow with `--cursor`, filter with `--pattern`, drain with
`--clear`.

### `cdp targets` — worker and service-worker debuggees

```bash
superduck cdp targets [--pattern worker]
superduck --target <targetId> cdp Runtime.evaluate --params-file expr.json
```

Web workers and service workers have their own `targetId`, so they take `--target`
instead of `--tab`; neither form needs a tab. Sockets, crypto or wasm often live
there. Worker targets answer commands only — `events`, `status` and `network` stay
tab-bound. `Target.*` is refused (`Not allowed`); the listing comes from
`chrome.debugger.getTargets()`.

### End-to-end encrypted sockets

A Noise/AES-GCM tunnel (`/v1/noise`-style URL, high-entropy frames) is ciphertext
however completely you capture it. Hook the page's own encrypt/decrypt:
`crypto-in` is post-decrypt plaintext, `crypto-out` is pre-encrypt plaintext.

```bash
SKILL_DIR="${SUPERDUCK_SKILL_DIR:-$HOME/.agent/skills/superduck}"
# hooks: ws | crypto | json | worker | xhr
node "$SKILL_DIR/scripts/cdp-ws-plaintext.mjs" wrap --hooks ws,crypto --out /tmp/probe.json
superduck --session "$SID" --tab "$TAB" cdp Runtime.evaluate --params-file /tmp/probe.json
# trigger traffic, then read the log
superduck --session "$SID" --tab "$TAB" cdp Runtime.evaluate \
  --params '{"expression":"JSON.stringify(globalThis.__sdWs||[])","returnByValue":true}' > /tmp/log.json
node "$SKILL_DIR/scripts/cdp-ws-plaintext.mjs" decode /tmp/log.json --out /tmp/plain.txt
```

`wrap`: `--hooks`, `--extra hook.js`, `--max-entries`, `--max-bytes`, `--tag`.
`as-params any.js` wraps any page script for `Runtime.evaluate`. `decode`: `--dirs`,
`--max-text`; base64 payloads walk a protobuf tree with zstd/gzip/deflate
decompression, text entries print as-is.

Plaintext is usually a protobuf envelope carrying HTTP over the socket with
zstd-compressed bodies; `decode` expands both. `json-in` is the JSON the app parsed.
No `crypto-*` entries means the socket lives in a worker: `cdp targets`, then `--target`.

For stepping: `cdp Debugger.stepOver`, then
`cdp events --pattern Debugger.paused --wait-ms 5000`; `cdp status` shows where you are.

## Uploads: Images vs. Local Files

Two distinct commands — pick by **source**, not by target:

- **`upload_image`** — source is an **image already in this session** (a prior
  `screenshot`, or an image the user dropped into chat). Pass its `--image-id`.
  The image is dropped onto a file input (`--ref`) or a visible drag target
  (`--coord`). `--filename` is optional, default `image.png`.
- **`upload_file`** — source is a **file on the local disk** (PDF, spreadsheet,
  photo, …). Pass repeatable `--path` with absolute paths. The browser reads
  the file directly; its contents are not transferred through the CLI.

Both commands target the page the same way: provide exactly one of `--ref`
(an element reference from `read_page`/`find` — works for hidden
`<input type=file>`, and for `<label>`/`<button>` that controls or contains
one) or `--coord x,y` (a visible button/label that opens the native file
picker, which is intercepted automatically).

```bash
# Upload a previously captured image by its image-id
superduck --session "$SID" --tab "$TAB" upload_image --image-id <id> --ref ref_9
superduck --session "$SID" --tab "$TAB" upload_image --image-id <id> --coord 500,400 --filename photo.png

# Upload one or more local files (repeat --path; the input needs multiple for >1)
superduck --session "$SID" --tab "$TAB" upload_file --path /abs/path/report.pdf --ref ref_9
superduck --session "$SID" --tab "$TAB" upload_file --path /abs/a.pdf --path /abs/b.pdf --ref ref_9
superduck --session "$SID" --tab "$TAB" upload_file --path /abs/path/photo.png --coord 500,400
```

## Shortcuts and GIFs

Shortcuts are saved prompts, not directly executed workflows:

```bash
superduck shortcuts list
superduck shortcuts get <name-or-id> --json
```

`gif start/stop/export` requires `--tab`, but CLI-triggered actions may capture
0 frames. For CLI workflows, prefer screenshots plus `ffmpeg`.

## Reference Documentation

- [Advanced Commands](references/advanced-commands.md): command syntax and less common operations.
- [Data Extraction](references/data-extraction.md): robust extraction patterns and helper script use.
- [Troubleshooting](references/troubleshooting.md): common failures and fixes.

## Helper Scripts and Templates

- `scripts/extract-data.mjs`: scrape selector text/href/html as clean JSON.
- `scripts/check-superduck-status.mjs`: quick local install/socket check.
- `scripts/cdp-ws-plaintext.mjs`: probe kit for encrypted sockets — `list-hooks`,
  `wrap` (pick/append page hooks), `as-params` (wrap any page script), `decode`
  (protobuf tree + zstd/gzip bodies + text entries). Not a fixed recipe: edit the
  hook snippets or inject your own with `--extra`.
- `templates/web-scraping.sh`: shell wrapper around `extract-data.mjs`.
- `templates/screenshot-comparison.sh`: capture multiple URLs.
- `templates/form-automation.sh`: form filling scaffold.
