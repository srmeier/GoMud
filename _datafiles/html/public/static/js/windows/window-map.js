/* global Client, ResizeObserver, VirtualWindow, VirtualWindows, injectStyles */

/**
 * window-map.js
 *
 * Virtual window: map (symbol-based room grid canvas).
 *
 * Rooms are drawn as fixed-size squares with their MapSymbol centered inside.
 * Background color per room is determined by a symbol-to-color lookup table.
 * Connections between rooms are drawn as brown lines behind the room squares.
 * The map stays centered on the player's current room at all times.
 * - / + overlay buttons zoom the map in and out.
 *
 * Responds to GMCP namespaces:
 *   Room      - incremental update as the player moves room-to-room
 *   World.Map - bulk snapshot of all visited rooms, requested once on connect
 *
 * Reads:
 *   Client.GMCPStructs.Room.Info
 *   Client.GMCPStructs.World.Map
 */

'use strict';

(function () {

    // -------------------------------------------------------------------------
    // Layout constants — edit these to adjust the visual appearance
    // -------------------------------------------------------------------------

    /** Width and height of each room square in pixels (at zoom level 1). */
    var ROOM_SIZE = 28;

    /**
     * Gap between room squares in pixels (at zoom level 1).
     * Total grid step = ROOM_SIZE + ROOM_GAP.
     */
    var ROOM_GAP = 14;

    /** Multiplicative step applied on each zoom in/out button press. */
    var ZOOM_STEP = 1.25;

    /** Minimum and maximum allowed zoom scale. */
    var ZOOM_MIN = 0.25;
    var ZOOM_MAX = 4.0;

    /**
     * Duration in seconds for the camera to ease to a new room.
     * Set to 0 to disable easing and snap instantly.
     */
    var CENTER_EASE_DURATION = 0.2;

    /** Stroke width of the brown connection lines between rooms. */
    var CONNECTION_WIDTH = 4;

    /** Stroke width of the black border drawn around each room square. */
    var ROOM_BORDER_WIDTH = 1.5;

    /** Font size for the symbol drawn inside each room square (in pixels). */
    var SYMBOL_FONT_SIZE = 14;

    /** Background color of the map canvas. */
    var MAP_BACKGROUND = '#2b2b2b';

    /** Border color drawn around each room square. */
    var ROOM_BORDER_COLOR = '#000000';

    /** Color of the connection lines between rooms. */
    var CONNECTION_COLOR = '#7a4a1a';

    /** Fill color used for the player's current room. */
    var CURRENT_ROOM_COLOR = '#c20000';

    /** Text color used for the symbol inside the player's current room. */
    var CURRENT_ROOM_TEXT_COLOR = '#ffffff';

    /**
     * Symbol-to-color lookup table.
     *
     * Maps a room's MapSymbol string to a background fill color for the room
     * square.  Add, remove, or change entries here to adjust the color scheme.
     * Symbols not listed fall back to DEFAULT_ROOM_COLOR.
     */
    var SYMBOL_COLORS = {
        // Biome defaults (matched to biome symbol values)
        '~':  '#2a53f7',   // shore / water edge
        '≈':  '#0033cd',   // open water
        '♣':  '#1a5c1a',   // forest
        '♨':  '#3d5c1a',   // swamp
        '❄':  '#a0c8e0',   // snow
        '⌬':  '#4a3a2a',   // cave
        '⩕':  '#6b5a3a',   // mountains
        '▼':  '#7a6a4a',   // cliffs
        '⌂':  '#7a5a2a',   // house
        '*':  '#c8a050',   // desert
        "'":  '#5a7a2a',   // farmland

        // Common room-specific symbols
        '$':  '#2a6a2a',   // shop
        '%':  '#2a5a7a',   // trainer
        '♜':  '#3a3a3a',   // wall
        '+':  '#5fb7ff',   // healer
        '•':  '#3a3a4a',   // generic / default biome dot
    };

    /** Fallback color for symbols not found in SYMBOL_COLORS. */
    var DEFAULT_ROOM_COLOR = '#3a3a4a';

    /** Text color for symbol labels inside room squares. */
    var SYMBOL_TEXT_COLOR = '#e0e0e0';

    // -------------------------------------------------------------------------
    // Derived base values (do not edit)
    // -------------------------------------------------------------------------
    var BASE_STEP = ROOM_SIZE + ROOM_GAP;

    // -------------------------------------------------------------------------
    // Styles
    // -------------------------------------------------------------------------
    injectStyles([
        '#map-canvas-container {',
        '    width: 100%;',
        '    height: 100%;',
        '    background: ' + MAP_BACKGROUND + ';',
        '    overflow: hidden;',
        '    position: relative;',
        '}',
        '#map-canvas {',
        '    display: block;',
        '    position: absolute;',
        '    top: 0; left: 0;',
        '    cursor: grab;',
        '}',
        '#map-tooltip {',
        '    position: fixed;',
        '    z-index: 99999;',
        '    pointer-events: none;',
        '    background: #0d2e28;',
        '    border: 1px solid #1c6b60;',
        '    border-radius: 6px;',
        '    box-shadow: 0 4px 16px rgba(0,0,0,0.7);',
        '    padding: 8px 10px;',
        '    min-width: 140px;',
        '    max-width: 240px;',
        '    display: none;',
        '    font-family: monospace;',
        '}',
        '#map-tooltip .tt-name {',
        '    font-size: 0.85em;',
        '    font-weight: bold;',
        '    color: #dffbd1;',
        '    margin-bottom: 4px;',
        '    line-height: 1.3;',
        '}',
        '#map-tooltip .tt-divider {',
        '    border: none;',
        '    border-top: 1px solid #1c6b60;',
        '    margin: 5px 0;',
        '}',
        '#map-tooltip .tt-row {',
        '    display: flex;',
        '    justify-content: space-between;',
        '    align-items: baseline;',
        '    gap: 8px;',
        '    font-size: 0.75em;',
        '    line-height: 1.6;',
        '}',
        '#map-tooltip .tt-label {',
        '    color: #7ab8a0;',
        '    text-transform: uppercase;',
        '    letter-spacing: 0.04em;',
        '    font-size: 0.88em;',
        '    flex-shrink: 0;',
        '}',
        '#map-tooltip .tt-value {',
        '    color: #dffbd1;',
        '    text-align: right;',
        '}',
        '#map-tooltip .tt-badges {',
        '    display: flex;',
        '    flex-wrap: wrap;',
        '    gap: 3px;',
        '    margin-top: 4px;',
        '}',
        '#map-tooltip .tt-badge {',
        '    font-size: 0.62em;',
        '    padding: 1px 4px;',
        '    border-radius: 3px;',
        '    background: #1a2e28;',
        '    color: #7ab8a0;',
        '    border: 1px solid #1c6b60;',
        '}',
        '#map-tooltip .tt-badge.pvp     { background: #3d0f0f; color: #e06060; border-color: #6b1c1c; }',
        '#map-tooltip .tt-badge.bank    { background: #0f2e10; color: #56d44a; border-color: #1c6b1c; }',
        '#map-tooltip .tt-badge.trainer { background: #2e2000; color: #fdd;    border-color: #6b5010; }',
        '#map-tooltip .tt-badge.storage { background: #1a1200; color: #c8a800; border-color: #6b5010; }',
        '#map-zoom-controls {',
        '    position: absolute;',
        '    top: 6px;',
        '    right: 6px;',
        '    display: flex;',
        '    gap: 3px;',
        '    z-index: 10;',
        '}',
        '#map-zoom-controls button {',
        '    width: 22px;',
        '    height: 22px;',
        '    padding: 0;',
        '    font-size: 14px;',
        '    line-height: 1;',
        '    background: rgba(0,0,0,0.55);',
        '    color: #ccc;',
        '    border: 1px solid #555;',
        '    border-radius: 3px;',
        '    cursor: pointer;',
        '}',
        '#map-zoom-controls button:hover {',
        '    background: rgba(0,0,0,0.8);',
        '    color: #fff;',
        '}',
    ].join('\n'));

    // -------------------------------------------------------------------------
    // Module state
    // -------------------------------------------------------------------------

    /** Canvas element. */
    var canvas = null;
    /** 2D rendering context. */
    var ctx = null;
    /** Container div. */
    var container = null;

    /**
     * rooms: Map<RoomId, { x, y, symbol, isCurrent }>
     * Stores the grid position and symbol for every known room.
     */
    var rooms = new Map();

    /**
     * edges: Map of canonical "minId-maxId" strings to { locked, secret } flags.
     */
    var edges = new Map();

    /**
     * zoneExitStubs: Array of { roomId, dx, dy } for exits that leave the
     * known map (unvisited destinations).  Drawn as short stub lines outward.
     */
    var zoneExitStubs = [];

    /** RoomId of the player's current room. */
    var currentRoomId = null;

    /**
     * Camera position in grid coordinates. Interpolates toward the current
     * room's grid position when CENTER_EASE_DURATION > 0.
     */
    var cameraX = 0;
    var cameraY = 0;

    /** Animation state for camera easing. */
    var easeStartX   = 0;
    var easeStartY   = 0;
    var easeTargetX  = 0;
    var easeTargetY  = 0;
    var easeStartTime = null;
    var easeRafId    = null;

    /**
     * Pan offset in grid coordinates applied on top of the camera position.
     * Set by click-drag.  Cleared when the player moves to a new room.
     */
    var panOffsetX = 0;
    var panOffsetY = 0;

    /** Drag state for click-and-pan. */
    var dragActive    = false;
    var dragStartPxX  = 0;
    var dragStartPxY  = 0;
    var dragStartPanX = 0;
    var dragStartPanY = 0;

    /** Current zoom scale factor. */
    var zoomScale = 1.0;

    /** Map<RoomId, full GMCP info object> for tooltip data. */
    var roomInfoStore = new Map();

    /** Tooltip DOM element, created lazily. */
    var tooltip = null;
    /** setTimeout handle for hiding the tooltip. */
    var tooltipHideTimer = null;

    /**
     * Per-room info cache, keyed by roomId.
     * Stores { RoomId, x, y, z, zoneName, symbol, exits, stubs } for every
     * ingested room so we can do cross-zone flood-fills at render time.
     */
    var roomCache = {};

    /** The zone key ("zoneName/z:N") of the zone the player is currently in. */
    var currentZoneKey = '';

    /** True once World.Map has been requested this session, to avoid re-requesting. */
    var worldMapRequested = false;

    // -------------------------------------------------------------------------
    // Color lookup helper
    // -------------------------------------------------------------------------
    function colorForSymbol(sym) {
        if (!sym) { return DEFAULT_ROOM_COLOR; }
        return SYMBOL_COLORS[sym] || DEFAULT_ROOM_COLOR;
    }

    // -------------------------------------------------------------------------
    // Canvas helpers
    // -------------------------------------------------------------------------

    function resizeCanvas() {
        if (!canvas || !container) { return; }
        canvas.width  = container.clientWidth  || 1;
        canvas.height = container.clientHeight || 1;
    }

    /**
     * Convert a room's grid (x, y) to canvas pixel coordinates, centered on
     * the current room, respecting the current zoom scale.
     */
    function gridToCanvas(gx, gy) {
        var midX = Math.floor(canvas.width  / 2);
        var midY = Math.floor(canvas.height / 2);
        var step = BASE_STEP * zoomScale;

        return {
            px: midX + (gx - cameraX - panOffsetX) * step,
            py: midY + (gy - cameraY - panOffsetY) * step,
        };
    }

    // -------------------------------------------------------------------------
    // Camera easing
    // -------------------------------------------------------------------------

    /** Smoothstep easing: maps t in [0,1] to a smooth curve. */
    function smoothstep(t) {
        return t * t * (3 - 2 * t);
    }

    /**
     * Begin easing the camera toward the given grid target.
     * If CENTER_EASE_DURATION is 0, snaps immediately.
     */
    function setCameraTarget(tx, ty) {
        // Clear any manual pan so the view re-centres on the player.
        panOffsetX = 0;
        panOffsetY = 0;

        if (CENTER_EASE_DURATION <= 0) {
            cameraX = tx;
            cameraY = ty;
            render();
            return;
        }

        // Cancel any in-progress ease
        if (easeRafId !== null) { cancelAnimationFrame(easeRafId); easeRafId = null; }

        easeStartX    = cameraX;
        easeStartY    = cameraY;
        easeTargetX   = tx;
        easeTargetY   = ty;
        easeStartTime = null;

        function step(timestamp) {
            if (easeStartTime === null) { easeStartTime = timestamp; }
            var elapsed  = (timestamp - easeStartTime) / 1000;
            var t        = Math.min(elapsed / CENTER_EASE_DURATION, 1);
            var s        = smoothstep(t);
            cameraX = easeStartX + (easeTargetX - easeStartX) * s;
            cameraY = easeStartY + (easeTargetY - easeStartY) * s;
            render();
            if (t < 1) {
                easeRafId = requestAnimationFrame(step);
            } else {
                easeRafId = null;
            }
        }

        easeRafId = requestAnimationFrame(step);
    }

    // -------------------------------------------------------------------------
    // Rendering
    // -------------------------------------------------------------------------

    /**
     * Draw a small badge on a connection line at (mx, my).
     * type: 'key' draws a key icon; 'secret' draws a question mark.
     * The badge is a filled square sized to fit neatly on the line.
     */
    function drawLineBadge(mx, my, type) {
        var sz   = Math.max(7, Math.round(CONNECTION_WIDTH * zoomScale * 2.5));
        var half = sz / 2;



        ctx.save();

        // Background square
        ctx.fillStyle = MAP_BACKGROUND;
        ctx.fillRect(mx - half, my - half, sz, sz);

        if (type === 'secret') {
            // Question mark in gold
            ctx.fillStyle    = '#d4a843';
            ctx.font         = 'bold ' + Math.round(sz * 0.85) + 'px monospace';
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('?', mx, my);
        } else {
            // Key icon drawn with canvas primitives
            // Color
            var kc = '#9ab0d4';
            var lw = Math.max(1, sz * 0.14);
            ctx.strokeStyle = kc;
            ctx.fillStyle   = kc;
            ctx.lineWidth   = lw;
            ctx.lineCap     = 'round';

            // Key bow (small circle on the left side)
            var bowR  = sz * 0.22;
            var bowCx = mx - sz * 0.14;
            var bowCy = my;
            ctx.beginPath();
            ctx.arc(bowCx, bowCy, bowR, 0, Math.PI * 2);
            ctx.stroke();

            // Key shaft (horizontal line to the right)
            var shaftX1 = bowCx + bowR;
            var shaftX2 = mx + half * 0.82;
            ctx.beginPath();
            ctx.moveTo(shaftX1, bowCy);
            ctx.lineTo(shaftX2, bowCy);
            ctx.stroke();

            // Two small teeth on the shaft
            var toothH = sz * 0.18;
            var t1x    = shaftX1 + (shaftX2 - shaftX1) * 0.45;
            var t2x    = shaftX1 + (shaftX2 - shaftX1) * 0.72;
            ctx.beginPath();
            ctx.moveTo(t1x, bowCy);
            ctx.lineTo(t1x, bowCy + toothH);
            ctx.moveTo(t2x, bowCy);
            ctx.lineTo(t2x, bowCy + toothH);
            ctx.stroke();
        }

        ctx.restore();
    }

    function render() {
        if (!ctx || !canvas) { return; }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Map background
        ctx.fillStyle = MAP_BACKGROUND;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw connection lines first (behind rooms)
        ctx.strokeStyle = CONNECTION_COLOR;
        ctx.lineWidth   = CONNECTION_WIDTH * zoomScale;
        ctx.lineCap     = 'round';

        edges.forEach(function (flags, key) {
            var parts = key.split('-');
            var idA   = parseInt(parts[0], 10);
            var idB   = parseInt(parts[1], 10);
            var rA    = rooms.get(idA);
            var rB    = rooms.get(idB);
            if (!rA || !rB) { return; }

            var pA = gridToCanvas(rA.x, rA.y);
            var pB = gridToCanvas(rB.x, rB.y);

            ctx.beginPath();
            ctx.moveTo(pA.px, pA.py);
            ctx.lineTo(pB.px, pB.py);
            ctx.stroke();

            if (flags.locked || flags.secret) {
                var mx = (pA.px + pB.px) / 2;
                var my = (pA.py + pB.py) / 2;
                drawLineBadge(mx, my, flags.secret ? 'secret' : 'key');
            }
        });

        // Draw zone-exit stubs: short lines from room center outward
        var stubLen = (BASE_STEP * zoomScale) * 0.55;
        zoneExitStubs.forEach(function (stub) {
            var r = rooms.get(stub.roomId);
            if (!r) { return; }
            var p   = gridToCanvas(r.x, r.y);
            var len = Math.sqrt(stub.dx * stub.dx + stub.dy * stub.dy);
            if (len === 0) { return; }
            var nx  = stub.dx / len;
            var ny  = stub.dy / len;
            var ex  = p.px + nx * stubLen;
            var ey  = p.py + ny * stubLen;
            ctx.beginPath();
            ctx.moveTo(p.px, p.py);
            ctx.lineTo(ex, ey);
            ctx.stroke();

            if (stub.locked || stub.secret) {
                var mx = (p.px + ex) / 2;
                var my = (p.py + ey) / 2;
                drawLineBadge(mx, my, stub.secret ? 'secret' : 'key');
            }
        });

        // Draw room squares
        var scaledSize        = ROOM_SIZE        * zoomScale;
        var scaledBorderWidth = ROOM_BORDER_WIDTH * zoomScale;
        var scaledFontSize    = SYMBOL_FONT_SIZE  * zoomScale;
        var half              = scaledSize / 2;

        rooms.forEach(function (room, id) {
            var p         = gridToCanvas(room.x, room.y);
            var isCurrent = (id === currentRoomId);
            var fillColor = isCurrent ? CURRENT_ROOM_COLOR : colorForSymbol(room.symbol);
            var rx        = p.px - half;
            var ry        = p.py - half;

            // Room fill
            ctx.fillStyle = fillColor;
            ctx.fillRect(rx, ry, scaledSize, scaledSize);

            // Room border
            ctx.strokeStyle = ROOM_BORDER_COLOR;
            ctx.lineWidth   = scaledBorderWidth;
            ctx.strokeRect(rx, ry, scaledSize, scaledSize);

            // Symbol label
            var sym = room.symbol || '•';
            ctx.fillStyle    = isCurrent ? CURRENT_ROOM_TEXT_COLOR : SYMBOL_TEXT_COLOR;
            ctx.font         = 'bold ' + scaledFontSize + 'px monospace';
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(sym, p.px, p.py);

            // Vertical-exit indicators: small arrows in the bottom corners
            if (room.hasUp || room.hasDown) {
                var arrowSize = Math.max(5, scaledSize * 0.28);
                var margin    = Math.max(2, scaledSize * 0.1);
                ctx.font         = 'bold ' + arrowSize + 'px monospace';
                ctx.textBaseline = 'alphabetic';
                ctx.fillStyle    = isCurrent ? CURRENT_ROOM_TEXT_COLOR : SYMBOL_TEXT_COLOR;
                if (room.hasDown) {
                    ctx.textAlign = 'left';
                    ctx.fillText('▾', rx + margin, ry + scaledSize - margin);
                }
                if (room.hasUp) {
                    ctx.textAlign    = 'right';
                    ctx.textBaseline = 'top';
                    ctx.fillText('▴', rx + scaledSize - margin, ry + margin);
                }
            }
        });
    }

    // -------------------------------------------------------------------------
    // Room and edge management
    // -------------------------------------------------------------------------

    function addOrUpdateRoom(id, gx, gy, symbol) {
        var rc = roomCache[id];
        rooms.set(id, { x: gx, y: gy, symbol: symbol || '•', hasUp: rc ? rc.hasUp : false, hasDown: rc ? rc.hasDown : false });
    }

    function addEdge(idA, idB, locked, secret) {
        var key = idA < idB ? (idA + '-' + idB) : (idB + '-' + idA);
        if (!edges.has(key)) {
            edges.set(key, { locked: !!locked, secret: !!secret });
        } else {
            // Merge flags — if either direction reports locked/secret, keep it.
            var existing = edges.get(key);
            existing.locked = existing.locked || !!locked;
            existing.secret = existing.secret || !!secret;
        }
    }

    function resetMap() {
        rooms.clear();
        edges.clear(); // Map.clear() works the same as Set.clear()
        zoneExitStubs = [];
        currentRoomId = null;
        cameraX = 0;
        cameraY = 0;
        panOffsetX = 0;
        panOffsetY = 0;
        dragActive = false;
        if (easeRafId !== null) { cancelAnimationFrame(easeRafId); easeRafId = null; }
    }

    /**
     * Rebuild the visible map by flood-filling from the given zone key.
     *
     * Starting from all rooms belonging to zoneKey, we follow same-z exits
     * across zone boundaries to include any spatially connected visited rooms.
     * Rooms in disconnected zones (no dx/dy path) are naturally excluded.
     */
    function replayZone(zoneKey) {
        resetMap();

        // Collect the z-level for this zone key so we only cross into rooms
        // on the same z-plane.
        var zMatch = zoneKey.match(/\/z:(-?\d+)$/);
        if (!zMatch) { return; }
        var targetZ = parseInt(zMatch[1], 10);

        // BFS: start with all rooms whose zone key matches, then follow
        // same-z exits to rooms in other zones.
        var visited = {};
        var queue   = [];

        for (var rid in roomCache) {
            var rc = roomCache[rid];
            if (rc.z === targetZ && rc.zoneName + '/z:' + rc.z === zoneKey) {
                queue.push(parseInt(rid, 10));
            }
        }

        while (queue.length > 0) {
            var id = queue.shift();
            if (visited[id]) { continue; }
            visited[id] = true;

            var r = roomCache[id];
            if (!r) { continue; }

            addOrUpdateRoom(r.RoomId, r.x, r.y, r.symbol);

            // Follow exits to connected rooms on the same z-plane
            if (Array.isArray(r.exits)) {
                r.exits.forEach(function (exit) {
                    if (!visited[exit.num] && roomCache[exit.num]) {
                        queue.push(exit.num);
                    }
                });
            }
        }

        // Second pass: add edges and stubs for all rooms now in the render set
        rooms.forEach(function (room, id) {
            var r = roomCache[id];
            if (!r) { return; }

            if (Array.isArray(r.exits)) {
                r.exits.forEach(function (exit) {
                    if (rooms.has(exit.num)) {
                        addEdge(id, exit.num, exit.locked, exit.secret);
                    }
                });
            }
            if (Array.isArray(r.stubs)) {
                r.stubs.forEach(function (stub) {
                    zoneExitStubs.push({ roomId: id, dx: stub.dx, dy: stub.dy, locked: stub.locked, secret: stub.secret });
                });
            }
        });
    }

    // -------------------------------------------------------------------------
    // World.Map ingestion
    // Loads the full visited-room snapshot from the server, populating the
    // roomCache and roomInfoStore.  Called once per session.
    // -------------------------------------------------------------------------
    function ingestWorldMap(entries) {
        if (!Array.isArray(entries) || entries.length === 0) { return; }

        // First pass: populate roomInfoStore so all rooms are "visited" before
        // we compute exit lists.  This ensures cross-zone exits are treated as
        // full edges regardless of the order entries arrive.
        entries.forEach(function (info) {
            if (info.num) {
                roomInfoStore.set(info.num, info);
            }
        });

        // Second pass: parse coordinates and build the room cache.
        entries.forEach(function (info) {
            var id = info.num;
            if (!id) { return; }

            // Parse coordinates from the coord string
            var coords = info.coords ? info.coords.split(',').map(function (s) { return s.trim(); }) : null;
            if (!coords || coords.length < 4) { return; }

            var zoneName = coords[0];
            var gx       = parseInt(coords[1], 10);
            var gy       = parseInt(coords[2], 10);
            var gz       = parseInt(coords[3], 10);

            // Skip rooms at 0,0 that are not the zone root — they have no
            // valid mapped position and would render on top of the origin.
            var isZoneRoot = Array.isArray(info.details) && info.details.indexOf('root') !== -1;
            if (gx === 0 && gy === 0 && !isZoneRoot) { return; }

            upsertRoomCache(id, zoneName, gx, gy, gz, info.mapsymbol || '•', info.exitsv2);
        });

        // Rebuild the visible map for the current zone
        if (currentZoneKey) {
            var savedCurrentId = currentRoomId;
            replayZone(currentZoneKey);
            currentRoomId = savedCurrentId;
        }

        render();
    }

    /**
     * Insert or update a room in roomCache, computing its exit list and stubs
     * from the exitsv2 map.  An exit becomes a full edge target when the
     * destination is visited (in roomInfoStore) and dz === 0.  Otherwise it
     * becomes a stub.
     */
    function upsertRoomCache(id, zoneName, gx, gy, gz, sym, exitsv2) {
        var exitIds   = [];
        var exitStubs = [];
        var hasUp     = false;
        var hasDown   = false;

        if (exitsv2) {
            for (var dir in exitsv2) {
                var exitInfo = exitsv2[dir];

                // Track vertical exits for the in-tile indicator.
                if (exitInfo.dz > 0) { hasUp   = true; }
                if (exitInfo.dz < 0) { hasDown = true; }

                // Exits with no spatial delta are non-directional (portals, custom
                // named exits, etc.).  They connect to rooms that belong to a
                // different coordinate graph, so skip them entirely — the map will
                // reset naturally when the player enters such a room.
                if (exitInfo.dx === 0 && exitInfo.dy === 0 && exitInfo.dz === 0) { continue; }

                // Only handle same-z exits for the flat map.
                if (exitInfo.dz !== 0) { continue; }

                var isSecret    = Array.isArray(exitInfo.details) && exitInfo.details.indexOf('secret') !== -1;
                var isLocked    = Array.isArray(exitInfo.details) && exitInfo.details.indexOf('locked') !== -1;
                var destVisited = roomInfoStore.has(exitInfo.num);

                // Secret exits are suppressed until the destination is visited.
                if (isSecret && !destVisited) { continue; }

                if (destVisited) {
                    // Destination is known — draw a full edge regardless of zone.
                    exitIds.push({ num: exitInfo.num, locked: isLocked, secret: isSecret });
                } else {
                    // Destination not yet visited — draw a stub in the exit direction.
                    exitStubs.push({ dx: exitInfo.dx, dy: exitInfo.dy, locked: isLocked, secret: isSecret });
                }
            }
        }

        roomCache[id] = { RoomId: id, zoneName: zoneName, x: gx, y: gy, z: gz, symbol: sym, exits: exitIds, stubs: exitStubs, hasUp: hasUp, hasDown: hasDown };
    }

    // -------------------------------------------------------------------------
    // Hit-testing: find the room id under a canvas-relative pixel position.
    // Returns the room id or null.
    // -------------------------------------------------------------------------
    function roomAtCanvasPoint(cx, cy) {
        var half  = (ROOM_SIZE * zoomScale) / 2;
        var found = null;
        rooms.forEach(function (room, id) {
            var p = gridToCanvas(room.x, room.y);
            if (cx >= p.px - half && cx <= p.px + half &&
                cy >= p.py - half && cy <= p.py + half) {
                found = id;
            }
        });
        return found;
    }

    // -------------------------------------------------------------------------
    // Tooltip
    // -------------------------------------------------------------------------
    function ensureTooltip() {
        if (tooltip) { return; }
        tooltip = document.createElement('div');
        tooltip.id = 'map-tooltip';
        document.body.appendChild(tooltip);
    }

    function showTooltip(mouseX, mouseY, info) {
        ensureTooltip();
        clearTimeout(tooltipHideTimer);

        var html = '<div class="tt-name">' + (info.name || 'Unknown') + '</div>';

        var rows = [];
        if (info.environment) { rows.push({ label: 'Env',    value: info.environment }); }
        if (info.maplegend)   { rows.push({ label: 'Type',   value: info.maplegend   }); }
        if (info.mapsymbol)   { rows.push({ label: 'Symbol', value: info.mapsymbol   }); }
        if (info.area)        { rows.push({ label: 'Area',   value: info.area        }); }

        if (rows.length > 0) {
            html += '<hr class="tt-divider">';
            rows.forEach(function (r) {
                html += '<div class="tt-row">' +
                    '<span class="tt-label">' + r.label + '</span>' +
                    '<span class="tt-value">' + r.value + '</span>' +
                    '</div>';
            });
        }

        var details    = info.details || [];
        var badgeOrder = ['pvp', 'bank', 'trainer', 'storage', 'character', 'ephemeral'];
        var badges     = badgeOrder.filter(function (d) { return details.indexOf(d) !== -1; });
        if (badges.length > 0) {
            html += '<hr class="tt-divider"><div class="tt-badges">';
            badges.forEach(function (b) {
                html += '<span class="tt-badge ' + b + '">' + b + '</span>';
            });
            html += '</div>';
        }

        if (info.exitsv2) {
            var exitNames = Object.keys(info.exitsv2).filter(function (dir) {
                var e = info.exitsv2[dir];
                var isSecret = Array.isArray(e.details) && e.details.indexOf('secret') !== -1;
                return !isSecret || roomInfoStore.has(e.num);
            }).sort();
            if (exitNames.length > 0) {
                html += '<hr class="tt-divider">' +
                    '<div class="tt-row">' +
                    '<span class="tt-label">Exits</span>' +
                    '<span class="tt-value">' + exitNames.join(', ') + '</span>' +
                    '</div>';
            }
        }

        tooltip.innerHTML     = html;
        tooltip.style.display = 'block';
        positionTooltip(mouseX, mouseY);
    }

    function positionTooltip(mouseX, mouseY) {
        if (!tooltip) { return; }
        var ttW  = tooltip.offsetWidth;
        var ttH  = tooltip.offsetHeight;
        var vw   = window.innerWidth;
        var vh   = window.innerHeight;
        var left = mouseX + 14;
        if (left + ttW > vw - 8) { left = mouseX - ttW - 14; }
        left = Math.max(8, left);
        var top = mouseY - Math.floor(ttH / 2);
        if (top + ttH > vh - 8) { top = vh - ttH - 8; }
        top = Math.max(8, top);
        tooltip.style.left = left + 'px';
        tooltip.style.top  = top  + 'px';
    }

    function hideTooltip() {
        tooltipHideTimer = setTimeout(function () {
            if (tooltip) { tooltip.style.display = 'none'; }
        }, 80);
    }

    // -------------------------------------------------------------------------
    // Zoom controls
    // -------------------------------------------------------------------------
    function zoomIn() {
        zoomScale = Math.min(ZOOM_MAX, zoomScale * ZOOM_STEP);
        render();
    }

    function zoomOut() {
        zoomScale = Math.max(ZOOM_MIN, zoomScale / ZOOM_STEP);
        render();
    }

    // -------------------------------------------------------------------------
    // DOM factory
    // -------------------------------------------------------------------------
    function createDOM() {
        resetMap();
        currentZoneKey = '';
        roomCache      = {};

        container = document.createElement('div');
        container.id = 'map-canvas-container';

        canvas = document.createElement('canvas');
        canvas.id = 'map-canvas';
        container.appendChild(canvas);
        ctx = canvas.getContext('2d');

        canvas.addEventListener('mouseleave', function (e) {
            hideTooltip();
            if (dragActive) {
                dragActive = false;
                canvas.style.cursor = '';
            }
        });

        // --- Drag to pan ---
        canvas.addEventListener('mousedown', function (e) {
            if (e.button !== 0) { return; }
            dragActive    = true;
            dragStartPxX  = e.clientX;
            dragStartPxY  = e.clientY;
            dragStartPanX = panOffsetX;
            dragStartPanY = panOffsetY;
            canvas.style.cursor = 'grabbing';
            e.preventDefault();
        });

        canvas.addEventListener('mousemove', function (e) {
            var rect = canvas.getBoundingClientRect();
            if (dragActive) {
                var step = BASE_STEP * zoomScale;
                panOffsetX = dragStartPanX - (e.clientX - dragStartPxX) / step;
                panOffsetY = dragStartPanY - (e.clientY - dragStartPxY) / step;
                render();
                return;
            }
            var id   = roomAtCanvasPoint(e.clientX - rect.left, e.clientY - rect.top);
            var info = id !== null ? roomInfoStore.get(id) : null;
            if (info) {
                clearTimeout(tooltipHideTimer);
                showTooltip(e.clientX, e.clientY, info);
            } else {
                hideTooltip();
            }
        });

        canvas.addEventListener('mouseup', function (e) {
            if (!dragActive) { return; }
            var dx = e.clientX - dragStartPxX;
            var dy = e.clientY - dragStartPxY;
            dragActive = false;
            canvas.style.cursor = '';
            // If the mouse moved more than a few pixels, suppress the
            // subsequent click so it doesn't open the admin menu.
            if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
                canvas.dataset.suppressClick = '1';
            }
        });

        canvas.addEventListener('click', function (e) {
            if (canvas.dataset.suppressClick) {
                delete canvas.dataset.suppressClick;
                return;
            }
            var charInfo = Client.GMCPStructs.Char && Client.GMCPStructs.Char.Info;
            if (!charInfo) { return; }
            if (charInfo.role !== 'admin') { return; }
            var rect  = canvas.getBoundingClientRect();
            var id    = roomAtCanvasPoint(e.clientX - rect.left, e.clientY - rect.top);
            if (id === null) { return; }
            e.stopPropagation();
            uiMenu(e, [
                { label: 'teleport ' + id,  cmd: 'teleport ' + id  },
                { label: 'room info ' + id, cmd: 'room info ' + id },
            ]);
        });

        var controls = document.createElement('div');
        controls.id = 'map-zoom-controls';

        var btnOut = document.createElement('button');
        btnOut.textContent = '\u2212';
        btnOut.addEventListener('click', zoomOut);

        var btnIn = document.createElement('button');
        btnIn.textContent = '+';
        btnIn.addEventListener('click', zoomIn);

        controls.appendChild(btnOut);
        controls.appendChild(btnIn);
        container.appendChild(controls);

        document.body.appendChild(container);
        return container;
    }

    // -------------------------------------------------------------------------
    // VirtualWindow instance
    // -------------------------------------------------------------------------
    var win = new VirtualWindow('Map', {
        dock:          'right',
        defaultDocked: true,
        dockedHeight:  363,
        factory: function () {
            var el = createDOM();
            return {
                title:      'Map',
                mount:      el,
                background: '#1e1e1e',
                border:     1,
                x:          'right',
                y:          66,
                width:      363,
                height:     20 + 363,
                header:     20,
                bottom:     60,
            };
        },
    });

    // -------------------------------------------------------------------------
    // Update logic
    // -------------------------------------------------------------------------

    function updateWorldMap() {
        var worldData = Client.GMCPStructs.World;
        if (!worldData || !Array.isArray(worldData.Map)) { return; }

        win.open();
        if (!win.isOpen()) { return; }

        resizeCanvas();
        ingestWorldMap(worldData.Map);
    }

    function updateMap() {
        var obj = Client.GMCPStructs.Room;
        if (!obj || !obj.Info) { return; }

        win.open();
        if (!win.isOpen()) { return; }

        // Request the full visited-room snapshot once per session
        if (!worldMapRequested) {
            worldMapRequested = true;
            Client.GMCPRequest('World.Map');
        }

        var info = obj.Info;

        var winBox = win.get();
        if (winBox) {
            winBox.setTitle('map (' + info.area + ')');
        }

        // Resize canvas to match container each update (handles dock resize)
        resizeCanvas();

        // Parse coordinate string: "zoneName, x, y, z"
        var coords   = info.coords.split(',').map(function (s) { return s.trim(); });
        var zoneName = coords[0];
        var gz       = parseInt(coords[3], 10);
        var zoneKey  = zoneName + '/z:' + gz;

        var gx = parseInt(coords[1], 10);
        var gy = parseInt(coords[2], 10);

        // Determine symbol: use room's own mapsymbol if set, else fall back to
        // the biome symbol embedded in the maplegend/environment fields.
        var sym = info.mapsymbol || '•';

        // Store GMCP info for tooltip use
        roomInfoStore.set(info.num, info);

        // Update the room cache entry for the current room.
        upsertRoomCache(info.num, zoneName, gx, gy, gz, sym, info.exitsv2);

        // If the player has moved to a different zone/z-plane, rebuild the
        // entire visible map via a cross-zone flood-fill.  This handles the
        // case where the new zone has no spatial connection to the previous one.
        if (currentZoneKey !== zoneKey) {
            currentZoneKey = zoneKey;
            replayZone(zoneKey);
        } else {
            // Same zone — incrementally add the current room and its edges.
            addOrUpdateRoom(info.num, gx, gy, sym);

            var rc = roomCache[info.num];
            if (rc) {
                if (Array.isArray(rc.exits)) {
                    rc.exits.forEach(function (exit) {
                        var destRc = roomCache[exit.num];
                        if (destRc) {
                            if (!rooms.has(exit.num)) {
                                addOrUpdateRoom(exit.num, destRc.x, destRc.y, destRc.symbol);
                            }
                            addEdge(info.num, exit.num, exit.locked, exit.secret);
                        }
                    });
                }
                if (Array.isArray(rc.stubs)) {
                    rc.stubs.forEach(function (stub) {
                        zoneExitStubs.push({ roomId: info.num, dx: stub.dx, dy: stub.dy, locked: stub.locked, secret: stub.secret });
                    });
                }
            }
        }

        currentRoomId = info.num;

        setCameraTarget(gx, gy);
    }

    // -------------------------------------------------------------------------
    // Handle container resize (ResizeObserver when available)
    // -------------------------------------------------------------------------
    function setupResizeObserver() {
        if (typeof ResizeObserver === 'undefined') { return; }
        var ro = new ResizeObserver(function () {
            resizeCanvas();
            render();
        });
        // Observe lazily — container may not exist yet at registration time.
        var orig = win.open.bind(win);
        win.open = function () {
            orig();
            if (container) { ro.observe(container); }
        };
    }
    setupResizeObserver();

    // -------------------------------------------------------------------------
    // Registration
    // -------------------------------------------------------------------------
    VirtualWindows.register({
        window:       win,
        gmcpHandlers: ['Room', 'World'],
        onGMCP: function (namespace) {
            if (namespace === 'World.Map') {
                updateWorldMap();
            } else if (namespace === 'Room.Info' || namespace === 'Room') {
                updateMap();
            }
        },
    });

}());
