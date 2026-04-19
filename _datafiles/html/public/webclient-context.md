# GoMud Web Client — Developer Context

This document describes the architecture of the web client and explains how to
create new virtual windows that respond to GMCP payloads.

---

## File Map

```
webclient-pure.html                               Page shell, layout, settings modal, init bridge
static/js/webclient-core.js                      Core infrastructure (loaded first)
static/js/fx.js                                  Visual effects library (FX global)
static/js/triggers.js                            Text-trigger engine (Triggers global)
static/js/windows/window-gametime.js             Time & Date window (left dock)
static/js/windows/window-character.js            Character window (left dock)
static/js/windows/window-gear.js                 Gear window (left dock)
static/js/windows/window-vitals.js               Vitals window (left dock)
static/js/windows/window-status.js               Worth window (left dock)
static/js/windows/window-party.js                Party window (left dock)
static/js/windows/window-map.js                  Map window (right dock)
static/js/windows/window-room.js                 Room Info window (right dock)
static/js/windows/window-online.js               Online Players window (right dock, off by default)
static/js/windows/window-comm.js                 Communications window (right dock)
static/js/windows/window-modal.js                Help/content modal overlay (global, no dock)
static/css/windows.css                           Shared dock/panel styles
```

`webclient-pure.html` is a Go template. All static asset paths must be prefixed
with `{{ .CONFIG.FilePaths.WebCDNLocation }}`. To add a new window module, add
one `<script>` tag in the appropriate dock comment block.

---

## Current Window Layout

### Left dock

| File | Title | Tabs | GMCP namespaces |
|---|---|---|---|
| `window-gametime.js` | Time & Date | — | `Gametime` |
| `window-character.js` | Character | Overview, Quests, Skills, Jobs, Effects | `Char.Info`, `Char.Stats`, `Char.Quests`, `Char.Skills`, `Char.Jobs`, `Char.Affects`, `Char` |
| `window-gear.js` | Gear | Worn, Backpack | `Char.Inventory`, `Char.Inventory.Backpack`, `Char` |
| `window-vitals.js` | Vitals | — | `Char.Vitals`, `Char` |
| `window-status.js` | Worth | — | `Char.Worth`, `Char` |
| `window-party.js` | Party | — | `Party`, `Party.Vitals` |

### Right dock

| File | Title | Tabs | GMCP namespaces | Notes |
|---|---|---|---|---|
| `window-map.js` | Map | — | `Room`, `World` | `offOnLoad: false` |
| `window-room.js` | Room Info | — | `Room.Info` | `offOnLoad: false` |
| `window-online.js` | Online | — | `Game` | `offOnLoad: true` — hidden until user opens it |
| `window-comm.js` | Communications | Say, Whisper, Party, Broadcasts | `Comm` | |

### Modal overlay

| File | Global | Trigger |
|---|---|---|
| `window-modal.js` | `GameModal` | GMCP `Help` namespace, or `GameModal.open(...)` from any JS |

---

## Architecture Overview

`webclient-core.js` defines these globals, available to all window modules:

```
injectStyles(css)    Append a <style> block to <head>
uiMenu(event, items) Spawn a small context menu near a click (see below)
VirtualWindows       Registry: register(), handleGMCP(), openAll()
VirtualWindow        Class: lifecycle for a single panel
DockSlots            Object: { left, right } DockSlot instances (populated by Client.init())
Client               Shared state and services
```

`fx.js` and `triggers.js` are loaded after `webclient-core.js` and before any window
modules, and expose two additional globals:

```
FX                   Visual effects: FX.Confetti(duration)
Triggers             Text-trigger engine: Triggers.Try(str), Triggers.matchPattern(pattern, str),
                     Triggers.stripAnsi(str), Triggers.ParseNumber(value)
```

### Load and init sequence

1. `webclient-core.js` executes — all globals are defined.
2. Window module scripts execute in order — each calls `VirtualWindows.register(...)`,
   recording the window instance and its GMCP handlers.
3. The page `onload` fires, calling `Client.init()`.
4. `Client.init()` initialises `DockSlots`, mounts the terminal, sets up the
   WebSocket and volume sliders, then calls `VirtualWindows.openAll()` — every
   registered window opens immediately on page load (unless `offOnLoad: true`).
5. When the WebSocket receives a `!!GMCP(...)` message, `VirtualWindows.handleGMCP()`
   dispatches it to all matching handlers. Handlers whose associated window has
   been closed by the user are silently skipped.

### Terminal font size

`resizeTerminal()` automatically adjusts the xterm.js font size based on how
many dock slots are occupied:

| Dock state | Font size |
|---|---|
| Neither slot has panels | 20px |
| One slot has panels | 18px |
| Both slots have panels | 16px |

---

## uiMenu — Context Menu Utility

`uiMenu(event, items)` spawns a small styled context menu anchored near the
cursor. Selecting an item sends the associated command via `Client.SendInput()`.
Only one menu can be open at a time; opening a new one dismisses the previous.

```js
// items: Array<{ label: string, cmd: string }>
canvas.addEventListener('click', function(e) {
    uiMenu(e, [
        { label: 'look longsword',   cmd: 'look longsword'   },
        { label: 'remove longsword', cmd: 'remove longsword' },
    ]);
});
```

- Dismisses on any outside `mousedown`.
- Positioned below-right of the click, flipping left/up if it would overflow
  the viewport.
- Styled to match the game UI palette.

---

## GameModal — Help/Content Overlay

`window-modal.js` exposes `window.GameModal` before `DOMContentLoaded`. It
renders content in a centered modal with a header, scrollable body, and footer.

```js
GameModal.open({
    title:  'Help: cast',   // header text
    body:   '...',          // content string
    format: 'terminal',     // 'terminal' (ANSI via xterm.js) | 'html'
});

GameModal.close();
```

The modal also registers a GMCP handler for the `Help` namespace. Any
`!!GMCP(Help {...})` payload from the server automatically opens the modal.

The modal always opens scrolled to the top. Close with Esc, the × button, or
clicking outside the panel.

---

## VirtualWindow Lifecycle

A `VirtualWindow` has four states:

| `_win` value | Meaning |
|---|---|
| `undefined` | Never opened (before first `open()` call) |
| `'docked'` | Content is in a dock slot panel; no WinBox exists |
| WinBox instance | Floating, visible |
| `false` | Closed by the user; will not reopen for this session |

`open()` is idempotent — safe to call on every GMCP update. It is a no-op if
the window is already open or has been closed by the user.

### Constructor options

```js
new VirtualWindow(id, {
    factory(),        // required — called once on first open; returns WinBox opts
    dock,             // optional — 'left' | 'right'; enables docking
    defaultDocked,    // optional — boolean; start docked instead of floating
    dockedHeight,     // optional — number (px); preferred panel height when docked
    offOnLoad,        // optional — boolean; start closed (user must open manually)
})
```

Setting `offOnLoad: true` initialises `_win` to `false`, so `VirtualWindows.openAll()`
skips the window entirely. It will not open until the user explicitly opens it (e.g.
via a terminal command).

The `factory()` function must:
- Create the content DOM element
- Append it to `document.body` (required before WinBox can mount it)
- Return a WinBox options object with at minimum `{ title, mount: el }`

### Methods

```js
win.open()      // Open (first call) or no-op (already open or closed)
win.isOpen()    // true when floating or docked
win.get()       // Returns WinBox instance when floating, null when docked/closed
win.dock()      // Move from floating to docked
win.undock()    // Move from docked to floating
```

---

## VirtualWindows Registry

```js
VirtualWindows.register({
    window:       win,            // VirtualWindow instance (enables openAll + GMCP skip)
    gmcpHandlers: ['Foo.Bar'],    // GMCP namespaces this module handles
    onGMCP(namespace, body) {     // called on matching GMCP payload
        // ...
    },
});
```

**Dispatch rules:**
- Namespaces are matched from most-specific to least-specific. A payload of
  `Char.Vitals` matches `Char.Vitals` before `Char`.
- Multiple modules may register for the same namespace — all matching handlers
  are called.
- The special namespace `'*'` matches every incoming GMCP payload regardless of
  name.
- If a handler's associated `window` is closed (`_win === false`), it is
  skipped entirely.
- Pass `window: null` for handlers that have no associated window (e.g. the
  modal's `Help` handler).

**`Client.GMCPStructs`** is updated before `onGMCP` is called, so handlers
always read the latest value from it directly rather than from the `body`
argument.

---

## Client API (available to window modules)

```js
Client.GMCPStructs          // Object tree of all received GMCP data
Client.sliderValues         // Current volume levels by category key
Client.MusicPlayer          // MP3Player instance (background music)
Client.SoundPlayer          // MP3Player instance (sound effects)
Client.term                 // xterm.js Terminal instance
Client.sendData(str)        // Send a string over the WebSocket; returns bool
Client.SendInput(str)       // Send a command string to the server (alias for sendData)
Client.GMCPRequest(ns)      // Ask the server to re-send a GMCP namespace (e.g. 'Room.Info')
Client.GetGMCP(path)        // Read a value from GMCPStructs by dot-path (e.g. 'Char.Vitals')
Client.getNetStats()        // Returns current network traffic counters (see below)
Client.debugLog(msg)        // Log only when Client.debug === true
Client.debug                // get/set — enable verbose logging from console
Client.registerCommand(name, description, fn)   // Add a !terminal command
Client.registerShortcut(code, command)          // Add a keyboard shortcut
```

### Client.getNetStats()

Returns a snapshot of network traffic since the last connection:

```js
{
    totalBytesSent:     number,   // bytes sent over the WebSocket
    totalBytesReceived: number,   // bytes received over the WebSocket
    gmcpInBytes:        object,   // { [namespace]: bytes } — per-namespace GMCP receive totals
    connectTime:        number,   // Date.now() value at last connect, or null if not connected
}
```

All counters reset to zero on each new WebSocket connection. Used by the
Settings → Stats tab for live traffic monitoring.

---

## GMCP Data — Char.Info

`Client.GMCPStructs.Char.Info` contains the current player's identity. Key fields:

```js
{
    account:   string,   // login username
    name:      string,   // character name
    class:     string,   // current profession/class
    race:      string,   // character race
    alignment: string,   // alignment string
    level:     number,   // character level
    role:      string,   // server-side role: 'user' | 'admin' | 'guest'
}
```

`role` is always present (no `omitempty`). Use it to gate admin-only UI:

```js
var info = Client.GMCPStructs.Char && Client.GMCPStructs.Char.Info;
if (info && info.role === 'admin') {
    // show admin controls
}
```

---

## Settings Modal (webclient-pure.html)

The settings modal has tabs managed by the inline `<script>` in
`webclient-pure.html`. Tabs: **Volume**, **Windows**, **Triggers**, **Stats**.

### Stats tab

Displays live network traffic stats, refreshed every 500ms while the tab is
visible. Powered by `Client.getNetStats()`. Contains:

- **Connected for** — elapsed time since last WebSocket connect
- **Sent / Received** — total bytes with per-second rate
- **GMCP In** — collapsible section showing bytes received per GMCP namespace

The interval starts when the Stats tab is activated and stops when switching
away or closing the modal. A `MutationObserver` on the backdrop restarts the
interval if the modal is reopened with Stats already active.

---

## Map Window (window-map.js)

### Layout constants

All visual parameters are declared at the top of the file and can be edited:

```js
ROOM_SIZE            // px — room square side length at zoom 1
ROOM_GAP             // px — gap between room squares at zoom 1
ZOOM_STEP            // multiplicative zoom step per button press
ZOOM_MIN / ZOOM_MAX  // zoom scale bounds
CENTER_EASE_DURATION // seconds to ease-pan to a new room (0 = instant snap)
CONNECTION_WIDTH     // px — connection line stroke width
ROOM_BORDER_WIDTH    // px — room square border stroke width
SYMBOL_FONT_SIZE     // px — symbol text size at zoom 1
SYMBOL_COLORS        // map of symbol string → fill color
DEFAULT_ROOM_COLOR   // fallback fill color
```

### Camera easing

When the player moves to a new room the map pans smoothly using
`setCameraTarget(x, y)`, driven by `requestAnimationFrame` with a smoothstep
curve over `CENTER_EASE_DURATION` seconds. Set `CENTER_EASE_DURATION = 0` to
disable.

### Admin click menu

When `Char.Info.role === 'admin'`, clicking a room square on the canvas opens a
`uiMenu` with:

- `teleport <roomId>` — teleport to the room
- `room info <roomId>` — display room info in the terminal

---

## Character Window (window-character.js)

### Tabs

| Tab | Content |
|---|---|
| Overview | Name · class · race (clickable → `Help race <name>`), alignment, stats grid (each stat clickable → `Help <statname>`), equipped items with hover tooltips and click menu |
| Backpack | Carried items with hover tooltips and click menu |
| Quests | Active quests with progress bars, click to expand description |
| Skills | Skill levels with pip indicators, click → `Help <skillname>` GMCP request |
| Jobs | Profession completion bars, click → `Help <jobname>` GMCP request |

### Equipment click menu

Clicking a worn item opens a `uiMenu` with `look <item>` and `remove <item>`.
Empty slots produce no menu.

### Backpack click menu

Commands offered depend on item type/subtype from the GMCP payload:

| type / subtype | commands |
|---|---|
| `weapon` or subtype `wearable` | `look`, `equip` |
| subtype `edible` | `look`, `eat` |
| subtype `drinkable` | `look`, `drink` |
| subtype `usable` | `look`, `use` |
| subtype `throwable` | `look`, `throw` |
| type `readable` | `look`, `read` |
| everything else | `look` only |

---

## Worth Window (window-status.js)

Displays XP progress bar and gold (carried + bank). No tabs.

---

## Creating a New Window Module

### 1. Create the file

`static/js/windows/window-example.js`

Every module is an IIFE to keep all state private. The pattern is:
- `injectStyles()` at the top for CSS
- `createDOM()` builds and appends the content element
- A `VirtualWindow` instance with `factory()` returning WinBox opts
- One or more update functions that read from `Client.GMCPStructs`
- `VirtualWindows.register()` at the bottom

```js
/* global Client, VirtualWindow, VirtualWindows, injectStyles */
'use strict';

(function() {

    // -- Styles (injected once at script load time) --------------------------
    injectStyles(`
        #example-content {
            color: #fff;
            padding: 8px;
            font-family: monospace;
        }
    `);

    // -- DOM factory --------------------------------------------------------
    // Called once on first open. Must append to document.body.
    function createDOM() {
        const el = document.createElement('div');
        el.id = 'example-content';
        el.textContent = 'Waiting for data...';
        document.body.appendChild(el);
        return el;
    }

    // -- VirtualWindow instance ---------------------------------------------
    const win = new VirtualWindow('Example', {
        dock:          'right',   // 'left' | 'right' — enables docking
        defaultDocked: true,      // start docked on page load
        dockedHeight:  200,       // preferred height (px) when docked
        factory() {
            const el = createDOM();
            return {
                title:      'Example',
                mount:      el,
                background: '#1c6b60',
                border:     1,
                x:          'right',
                y:          0,
                width:      363,
                height:     220,
                header:     20,
                bottom:     60,
            };
        },
    });

    // -- Update logic -------------------------------------------------------
    function update() {
        const data = Client.GMCPStructs.Some && Client.GMCPStructs.Some.Namespace;
        if (!data) { return; }

        win.open();
        if (!win.isOpen()) { return; }

        document.getElementById('example-content').textContent = data.someField;
    }

    // -- Registration -------------------------------------------------------
    VirtualWindows.register({
        window:       win,
        gmcpHandlers: ['Some.Namespace', 'Some'],
        onGMCP() { update(); },
    });

})();
```

### 2. Register the script in `webclient-pure.html`

Add one `<script>` tag in the appropriate dock comment block:

```html
<!-- Left dock -->
<script src="{{ .CONFIG.FilePaths.WebCDNLocation }}/static/js/windows/window-example.js"></script>
```

That is all that is required. The window will open on page load, respond to its
GMCP namespaces, and stop receiving payloads if the user closes it.

---

## GMCP Namespace Conventions

Namespaces follow a dot-separated hierarchy. Register the most specific
namespace you need. If you need to handle both a parent and a child namespace,
list both — the dispatch walks from most-specific to least-specific and stops at
the first level that has any registered handlers, calling all of them.

```js
// Receives Char.Worth payloads directly, and also bare Char payloads.
gmcpHandlers: ['Char.Worth', 'Char'],
```

Always read from `Client.GMCPStructs` inside `onGMCP` rather than from the
`body` argument. The store is the source of truth and is always current.

---

## Dock Slot Behaviour

- Two slots exist: `#dock-left` and `#dock-right`, both flex children of
  `#main-container`.
- A slot is zero-width when empty and expands to its stored width when it
  contains panels. A drag handle appears between the slot and the terminal
  when panels are present, allowing the slot width to be resized.
- Panels within a slot can be resized vertically by dragging the handle
  between them.
- Each docked panel has a titlebar with:
  - A pop-out arrow — undocks the panel to a floating WinBox
  - An X — closes the window for the session
- When a floating window has `dock` configured, its WinBox header contains a
  dock button (↓ arrow) that moves it back into the slot.
- Closing a window (from either floating or docked state) sets `_win = false`
  and deregisters it from GMCP dispatch for the remainder of the session.

---

## Extension Points

### Adding a terminal command

```js
Client.registerCommand('!example', 'Print example info', (input) => {
    Client.term.writeln('Example command ran.');
    return true;  // return true to consume the input (clears the field)
});
```

Commands are matched against the exact input string before it is sent to the
server. Return `true` to prevent the string from being sent.

The only built-in terminal command is `!gmcp` — removed. The command table is
now empty by default; window modules add entries via `registerCommand`.

### Adding a keyboard shortcut

```js
// Sends 'look' when the user presses Tab with an empty input field.
Client.registerShortcut('Tab', 'look');
```

The `code` value is a `KeyboardEvent.code` string (e.g. `'KeyM'`, `'Tab'`,
`'F11'`). Shortcuts only fire when the command input field is empty.

### Adding a comm channel tab

In `window-comm.js`, add an entry to the `CHANNELS` array:

```js
{ id: 'guild', label: 'Guild', cssClass: 'guild', active: false },
```

No other changes are required. The tab and its panel are created automatically.

### Adding a Settings tab

The settings modal tabs are defined in `webclient-pure.html`. To add a new tab:

1. Add a `<button class="settings-tab-btn" data-tab="tab-foo">Foo</button>` to
   `#settings-tab-bar`.
2. Add a `<div class="settings-tab-panel" id="tab-foo">...</div>` inside
   `#settings-tab-body`.
3. If the tab needs activation logic (e.g. a live-update interval), add a
   handler inside the `tabBar.addEventListener('click', ...)` block within
   `DOMContentLoaded`.
