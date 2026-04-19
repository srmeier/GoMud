/* global Client, ResizeObserver, VirtualWindow, VirtualWindows, injectStyles, uiMenu */

/**
 * window-map.js
 *
 * Virtual window: Map with two tabs — "2D" (flat grid) and "3D" (isometric).
 *
 * Both views share a single data pipeline:
 *   - One roomInfoStore, one roomCache, one World.Map request per session.
 *   - Shared color/symbol lookup tables.
 *
 * Responds to GMCP namespaces:
 *   Room      - incremental update as the player moves room-to-room
 *   World.Map - bulk snapshot of all visited rooms, requested once on connect
 */

'use strict';

(function () {

    // =========================================================================
    // Shared constants
    // =========================================================================

    var ZOOM_STEP = 1.25;
    var ZOOM_MIN  = 0.25;
    var ZOOM_MAX  = 4.0;

    var CENTER_EASE_DURATION = 0.2;

    var CONNECTION_COLOR        = '#7a4a1a';
    var CURRENT_ROOM_COLOR      = '#c20000';
    var CURRENT_ROOM_TEXT_COLOR = '#ffffff';
    var SYMBOL_TEXT_COLOR       = '#e0e0e0';

    var SYMBOL_COLORS = {
        '~':  '#2a53f7',   // shore / water edge
        '\u2248':  '#0033cd',   // open water
        '\u2663':  '#1a6b1a',   // forest
        '\u2668':  '#4a6b20',   // swamp
        '\u2744':  '#b8d8f0',   // snow
        '\u232c':  '#5a4a38',   // cave
        '\u2a55':  '#7a6a50',   // mountains
        '\u25bc':  '#8a7a5a',   // cliffs
        '\u2302':  '#8a6a3a',   // house / building
        '*':  '#d4aa55',   // desert
        "'":  '#6a8a30',   // farmland
        '=':  '#a07840',   // road
        '$':  '#2a7a2a',   // shop
        '%':  '#2a5a8a',   // trainer
        '\u265c':  '#4a4a4a',   // wall
        '+':  '#5fb7ff',   // healer
        '\u2022':  '#3a3a4a',   // generic / default
    };

    var DEFAULT_ROOM_COLOR = '#3a3a4a';

    var ENVIRONMENT_SYMBOLS = {
        'Forest':    '\u2663',
        'Swamp':     '\u2668',
        'Snow':      '\u2744',
        'Cave':      '\u232c',
        'Dungeon':   '\u232c',
        'Mountains': '\u2a55',
        'Cliffs':    '\u25bc',
        'House':     '\u2302',
        'Desert':    '*',
        'Farmland':  "'",
        'Road':      '=',
        'Shore':     '~',
        'Water':     '\u2248',
    };

    var ENVIRONMENT_COLORS = {
        'Forest':    '#1a6b1a',
        'Swamp':     '#4a6b20',
        'Snow':      '#b8d8f0',
        'Cave':      '#5a4a38',
        'Dungeon':   '#5a4a38',
        'Mountains': '#7a6a50',
        'Cliffs':    '#8a7a5a',
        'House':     '#8a6a3a',
        'Desert':    '#d4aa55',
        'Farmland':  '#6a8a30',
        'Road':      '#a07840',
        'Shore':     '#2a53f7',
        'Water':     '#0033cd',
        'City':      '#5a5a6a',
        'Fort':      '#5a5a6a',
        'Land':      '#3a3a4a',
    };

    // =========================================================================
    // Shared helpers
    // =========================================================================

    function symbolForRoom(info) {
        if (info.mapsymbol) { return info.mapsymbol; }
        if (info.environment && ENVIRONMENT_SYMBOLS[info.environment]) {
            return ENVIRONMENT_SYMBOLS[info.environment];
        }
        return '\u2022';
    }

    function colorForSymbol(sym, env) {
        if (sym && SYMBOL_COLORS[sym]) { return SYMBOL_COLORS[sym]; }
        if (env && ENVIRONMENT_COLORS[env]) { return ENVIRONMENT_COLORS[env]; }
        return DEFAULT_ROOM_COLOR;
    }

    function smoothstep(t) {
        return t * t * (3 - 2 * t);
    }

    // =========================================================================
    // Shared data pipeline
    // =========================================================================

    /** Full GMCP info objects keyed by roomId — used by both views for tooltips. */
    var roomInfoStore = new Map();

    /**
     * roomCache: keyed by roomId.
     * { RoomId, zoneName, x, y, z, symbol, env, exits, stubs, hasUp, hasDown }
     * exits includes cross-z exits (for 3D); same-z only used by 2D view.
     */
    var roomCache = {};

    var worldMapRequested = false;

    function upsertRoomCache(id, zoneName, gx, gy, gz, sym, env, exitsv2) {
        var exitIds   = [];
        var exitStubs = [];
        var hasUp     = false;
        var hasDown   = false;

        if (exitsv2) {
            for (var dir in exitsv2) {
                var exitInfo = exitsv2[dir];

                if (exitInfo.dz > 0) { hasUp   = true; }
                if (exitInfo.dz < 0) { hasDown = true; }

                if (exitInfo.dx === 0 && exitInfo.dy === 0 && exitInfo.dz === 0) { continue; }

                var isSecret    = Array.isArray(exitInfo.details) && exitInfo.details.indexOf('secret') !== -1;
                var isLocked    = Array.isArray(exitInfo.details) && exitInfo.details.indexOf('locked') !== -1;
                var destVisited = roomInfoStore.has(exitInfo.num);

                if (isSecret && !destVisited) { continue; }

                if (destVisited) {
                    exitIds.push({ num: exitInfo.num, locked: isLocked, secret: isSecret, dz: exitInfo.dz });
                } else {
                    exitStubs.push({ dx: exitInfo.dx, dy: exitInfo.dy, dz: exitInfo.dz, locked: isLocked, secret: isSecret });
                }
            }
        }

        roomCache[id] = {
            RoomId:   id,
            zoneName: zoneName,
            x: gx, y: gy, z: gz,
            symbol:   sym,
            env:      env,
            exits:    exitIds,
            stubs:    exitStubs,
            hasUp:    hasUp,
            hasDown:  hasDown,
        };
    }

    function ingestWorldMap(entries) {
        if (!Array.isArray(entries) || entries.length === 0) { return; }

        entries.forEach(function (info) {
            if (info.num) { roomInfoStore.set(info.num, info); }
        });

        entries.forEach(function (info) {
            var id = info.num;
            if (!id) { return; }
            var coords = info.coords ? info.coords.split(',').map(function (s) { return s.trim(); }) : null;
            if (!coords || coords.length < 4) { return; }
            var zoneName = coords[0];
            var gx = parseInt(coords[1], 10);
            var gy = parseInt(coords[2], 10);
            var gz = parseInt(coords[3], 10);
            var isZoneRoot = Array.isArray(info.details) && info.details.indexOf('root') !== -1;
            if (gx === 0 && gy === 0 && !isZoneRoot) { return; }
            upsertRoomCache(id, zoneName, gx, gy, gz, symbolForRoom(info), info.environment || '', info.exitsv2);
        });

        view2d.onWorldMap();
        view3d.onWorldMap();
    }

    // =========================================================================
    // Shared tooltip (one element, used by whichever view is active)
    // =========================================================================

    var tooltip          = null;
    var tooltipHideTimer = null;

    function ensureTooltip(idSuffix) {
        if (tooltip) { return; }
        tooltip = document.createElement('div');
        tooltip.id = 'map-tooltip';
        document.body.appendChild(tooltip);
    }

    function showTooltip(mouseX, mouseY, info, showZ) {
        ensureTooltip();
        clearTimeout(tooltipHideTimer);

        var html = '<div class="tt-name">' + (info.name || 'Unknown') + '</div>';
        var rows = [];
        if (info.environment) { rows.push({ label: 'Env',    value: info.environment }); }
        if (info.maplegend)   { rows.push({ label: 'Type',   value: info.maplegend   }); }
        if (info.mapsymbol)   { rows.push({ label: 'Symbol', value: info.mapsymbol   }); }
        if (info.area)        { rows.push({ label: 'Area',   value: info.area        }); }
        if (showZ && info.coords) {
            var c = info.coords.split(',').map(function (s) { return s.trim(); });
            if (c.length >= 4) { rows.push({ label: 'Z', value: c[3] }); }
        }
        if (rows.length > 0) {
            html += '<hr class="tt-divider">';
            rows.forEach(function (r) {
                html += '<div class="tt-row"><span class="tt-label">' + r.label +
                        '</span><span class="tt-value">' + r.value + '</span></div>';
            });
        }

        var details    = info.details || [];
        var badgeOrder = ['pvp', 'bank', 'trainer', 'storage', 'character', 'ephemeral'];
        var badges     = badgeOrder.filter(function (d) { return details.indexOf(d) !== -1; });
        if (badges.length > 0) {
            html += '<hr class="tt-divider"><div class="tt-badges">';
            badges.forEach(function (b) { html += '<span class="tt-badge ' + b + '">' + b + '</span>'; });
            html += '</div>';
        }

        if (info.exitsv2) {
            var exitNames = Object.keys(info.exitsv2).filter(function (dir) {
                var e = info.exitsv2[dir];
                return !(Array.isArray(e.details) && e.details.indexOf('secret') !== -1) ||
                       roomInfoStore.has(e.num);
            }).sort();
            if (exitNames.length > 0) {
                html += '<hr class="tt-divider"><div class="tt-row">' +
                        '<span class="tt-label">Exits</span>' +
                        '<span class="tt-value">' + exitNames.join(', ') + '</span></div>';
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

    // =========================================================================
    // Styles
    // =========================================================================

    injectStyles([
        '#map-window {',
        '    display: flex;',
        '    flex-direction: column;',
        '    width: 100%;',
        '    height: 100%;',
        '    background: #1e1e1e;',
        '}',
        '#map-tab-bar {',
        '    display: flex;',
        '    flex-shrink: 0;',
        '    background: #1a1a1a;',
        '    border-bottom: 1px solid #333;',
        '}',
        '#map-tab-bar button {',
        '    flex: 1;',
        '    padding: 4px 0;',
        '    background: none;',
        '    border: none;',
        '    border-bottom: 2px solid transparent;',
        '    color: #888;',
        '    font-size: 11px;',
        '    font-family: monospace;',
        '    cursor: pointer;',
        '    letter-spacing: 0.05em;',
        '}',
        '#map-tab-bar button:hover { color: #ccc; }',
        '#map-tab-bar button.active {',
        '    color: #dffbd1;',
        '    border-bottom-color: #1c6b60;',
        '}',
        '#map-panels {',
        '    flex: 1;',
        '    position: relative;',
        '    overflow: hidden;',
        '}',
        '.map-panel {',
        '    position: absolute;',
        '    inset: 0;',
        '    display: none;',
        '}',
        '.map-panel.active { display: block; }',
        '.map-canvas-wrap {',
        '    width: 100%;',
        '    height: 100%;',
        '    position: relative;',
        '    overflow: hidden;',
        '}',
        '.map-canvas-wrap canvas {',
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
        '#map-tooltip .tt-name { font-size:0.85em; font-weight:bold; color:#dffbd1; margin-bottom:4px; line-height:1.3; }',
        '#map-tooltip .tt-divider { border:none; border-top:1px solid #1c6b60; margin:5px 0; }',
        '#map-tooltip .tt-row { display:flex; justify-content:space-between; align-items:baseline; gap:8px; font-size:0.75em; line-height:1.6; }',
        '#map-tooltip .tt-label { color:#7ab8a0; text-transform:uppercase; letter-spacing:0.04em; font-size:0.88em; flex-shrink:0; }',
        '#map-tooltip .tt-value { color:#dffbd1; text-align:right; }',
        '#map-tooltip .tt-badges { display:flex; flex-wrap:wrap; gap:3px; margin-top:4px; }',
        '#map-tooltip .tt-badge { font-size:0.62em; padding:1px 4px; border-radius:3px; background:#1a2e28; color:#7ab8a0; border:1px solid #1c6b60; }',
        '#map-tooltip .tt-badge.pvp     { background:#3d0f0f; color:#e06060; border-color:#6b1c1c; }',
        '#map-tooltip .tt-badge.bank    { background:#0f2e10; color:#56d44a; border-color:#1c6b1c; }',
        '#map-tooltip .tt-badge.trainer { background:#2e2000; color:#fdd;    border-color:#6b5010; }',
        '#map-tooltip .tt-badge.storage { background:#1a1200; color:#c8a800; border-color:#6b5010; }',
        '.map-controls {',
        '    position: absolute;',
        '    top: 6px;',
        '    right: 6px;',
        '    display: flex;',
        '    align-items: center;',
        '    gap: 2px;',
        '    z-index: 10;',
        '}',
        '.map-controls .ctrl-sep {',
        '    width: 1px; height: 16px;',
        '    background: #555;',
        '    margin: 0 3px;',
        '}',
        '.map-controls button {',
        '    width: 22px; height: 22px;',
        '    padding: 0;',
        '    font-size: 14px;',
        '    line-height: 1;',
        '    background: rgba(0,0,0,0.55);',
        '    color: #ccc;',
        '    border: 1px solid #555;',
        '    border-radius: 3px;',
        '    cursor: pointer;',
        '}',
        '.map-controls button:hover { background: rgba(0,0,0,0.8); color: #fff; }',
    ].join('\n'));

    // =========================================================================
    // 2D view
    // =========================================================================

    var view2d = (function () {

        // -- Constants ---------------------------------------------------------
        var ROOM_SIZE        = 28;
        var ROOM_GAP         = 14;
        var BASE_STEP        = ROOM_SIZE + ROOM_GAP;
        var CONNECTION_WIDTH = 4;
        var ROOM_BORDER_WIDTH = 1.5;
        var SYMBOL_FONT_SIZE  = 14;
        var MAP_BACKGROUND    = '#2b2b2b';
        var ROOM_BORDER_COLOR = '#000000';

        // -- State -------------------------------------------------------------
        var canvas        = null;
        var ctx           = null;
        var container     = null;
        var rooms         = new Map();
        var edges         = new Map();
        var zoneExitStubs = [];
        var currentRoomId = null;
        var cameraX = 0, cameraY = 0;
        var easeStartX = 0, easeStartY = 0;
        var easeTargetX = 0, easeTargetY = 0;
        var easeStartTime = null, easeRafId = null;
        var panOffsetX = 0, panOffsetY = 0;
        var dragActive = false;
        var dragStartPxX = 0, dragStartPxY = 0;
        var dragStartPanX = 0, dragStartPanY = 0;
        var zoomScale     = 1.0;
        var currentZoneKey = '';

        // -- Helpers -----------------------------------------------------------
        function resizeCanvas() {
            if (!canvas || !container) { return; }
            canvas.width  = container.clientWidth  || 1;
            canvas.height = container.clientHeight || 1;
        }

        function gridToCanvas(gx, gy) {
            var midX = Math.floor(canvas.width  / 2);
            var midY = Math.floor(canvas.height / 2);
            var step = BASE_STEP * zoomScale;
            return {
                px: midX + (gx - cameraX - panOffsetX) * step,
                py: midY + (gy - cameraY - panOffsetY) * step,
            };
        }

        function setCameraTarget(tx, ty) {
            panOffsetX = 0; panOffsetY = 0;
            if (CENTER_EASE_DURATION <= 0) { cameraX = tx; cameraY = ty; render(); return; }
            if (easeRafId !== null) { cancelAnimationFrame(easeRafId); easeRafId = null; }
            easeStartX = cameraX; easeStartY = cameraY;
            easeTargetX = tx; easeTargetY = ty;
            easeStartTime = null;
            function step(ts) {
                if (easeStartTime === null) { easeStartTime = ts; }
                var t = Math.min((ts - easeStartTime) / 1000 / CENTER_EASE_DURATION, 1);
                var s = smoothstep(t);
                cameraX = easeStartX + (easeTargetX - easeStartX) * s;
                cameraY = easeStartY + (easeTargetY - easeStartY) * s;
                render();
                easeRafId = t < 1 ? requestAnimationFrame(step) : null;
            }
            easeRafId = requestAnimationFrame(step);
        }

        function addOrUpdateRoom(id, gx, gy, symbol, env) {
            var rc = roomCache[id];
            rooms.set(id, { x: gx, y: gy, symbol: symbol || '\u2022', env: env || '',
                            hasUp: rc ? rc.hasUp : false, hasDown: rc ? rc.hasDown : false });
        }

        function addEdge(idA, idB, locked, secret) {
            var key = idA < idB ? (idA + '-' + idB) : (idB + '-' + idA);
            if (!edges.has(key)) {
                edges.set(key, { locked: !!locked, secret: !!secret });
            } else {
                var ex = edges.get(key);
                ex.locked = ex.locked || !!locked;
                ex.secret = ex.secret || !!secret;
            }
        }

        function resetMap() {
            rooms.clear(); edges.clear(); zoneExitStubs = [];
            currentRoomId = null;
            cameraX = 0; cameraY = 0; panOffsetX = 0; panOffsetY = 0;
            dragActive = false;
            if (easeRafId !== null) { cancelAnimationFrame(easeRafId); easeRafId = null; }
        }

        function replayZone(zoneKey) {
            resetMap();
            var zMatch = zoneKey.match(/\/z:(-?\d+)$/);
            if (!zMatch) { return; }
            var targetZ = parseInt(zMatch[1], 10);
            var visited = {}, queue = [];
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
                addOrUpdateRoom(r.RoomId, r.x, r.y, r.symbol, r.env);
                if (Array.isArray(r.exits)) {
                    r.exits.forEach(function (exit) {
                        if (exit.dz === 0 && !visited[exit.num] && roomCache[exit.num]) {
                            queue.push(exit.num);
                        }
                    });
                }
            }
            rooms.forEach(function (room, id) {
                var r = roomCache[id];
                if (!r) { return; }
                if (Array.isArray(r.exits)) {
                    r.exits.forEach(function (exit) {
                        if (exit.dz === 0 && rooms.has(exit.num)) {
                            addEdge(id, exit.num, exit.locked, exit.secret);
                        }
                    });
                }
                if (Array.isArray(r.stubs)) {
                    r.stubs.forEach(function (stub) {
                        if (stub.dz === 0) {
                            zoneExitStubs.push({ roomId: id, dx: stub.dx, dy: stub.dy,
                                                 locked: stub.locked, secret: stub.secret });
                        }
                    });
                }
            });
        }

        // -- Rendering ---------------------------------------------------------
        function drawLineBadge(mx, my, type) {
            var sz = Math.max(7, Math.round(CONNECTION_WIDTH * zoomScale * 2.5));
            var half = sz / 2;
            ctx.save();
            ctx.fillStyle = MAP_BACKGROUND;
            ctx.fillRect(mx - half, my - half, sz, sz);
            if (type === 'secret') {
                ctx.fillStyle = '#d4a843';
                ctx.font = 'bold ' + Math.round(sz * 0.85) + 'px monospace';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText('?', mx, my);
            } else {
                var kc = '#9ab0d4', lw = Math.max(1, sz * 0.14);
                ctx.strokeStyle = kc; ctx.fillStyle = kc;
                ctx.lineWidth = lw; ctx.lineCap = 'round';
                var bowR = sz * 0.22, bowCx = mx - sz * 0.14, bowCy = my;
                ctx.beginPath(); ctx.arc(bowCx, bowCy, bowR, 0, Math.PI * 2); ctx.stroke();
                var shaftX1 = bowCx + bowR, shaftX2 = mx + half * 0.82;
                ctx.beginPath(); ctx.moveTo(shaftX1, bowCy); ctx.lineTo(shaftX2, bowCy); ctx.stroke();
                var toothH = sz * 0.18;
                var t1x = shaftX1 + (shaftX2 - shaftX1) * 0.45;
                var t2x = shaftX1 + (shaftX2 - shaftX1) * 0.72;
                ctx.beginPath();
                ctx.moveTo(t1x, bowCy); ctx.lineTo(t1x, bowCy + toothH);
                ctx.moveTo(t2x, bowCy); ctx.lineTo(t2x, bowCy + toothH);
                ctx.stroke();
            }
            ctx.restore();
        }

        function render() {
            if (!ctx || !canvas) { return; }
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = MAP_BACKGROUND;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.strokeStyle = CONNECTION_COLOR;
            ctx.lineWidth   = CONNECTION_WIDTH * zoomScale;
            ctx.lineCap     = 'round';

            edges.forEach(function (flags, key) {
                var parts = key.split('-');
                var rA = rooms.get(parseInt(parts[0], 10));
                var rB = rooms.get(parseInt(parts[1], 10));
                if (!rA || !rB) { return; }
                var pA = gridToCanvas(rA.x, rA.y), pB = gridToCanvas(rB.x, rB.y);
                ctx.beginPath(); ctx.moveTo(pA.px, pA.py); ctx.lineTo(pB.px, pB.py); ctx.stroke();
                if (flags.locked || flags.secret) {
                    drawLineBadge((pA.px + pB.px) / 2, (pA.py + pB.py) / 2,
                                  flags.secret ? 'secret' : 'key');
                }
            });

            var stubLen = BASE_STEP * zoomScale * 0.55;
            zoneExitStubs.forEach(function (stub) {
                var r = rooms.get(stub.roomId);
                if (!r) { return; }
                var p = gridToCanvas(r.x, r.y);
                var len = Math.sqrt(stub.dx * stub.dx + stub.dy * stub.dy);
                if (len === 0) { return; }
                var ex = p.px + (stub.dx / len) * stubLen;
                var ey = p.py + (stub.dy / len) * stubLen;
                ctx.beginPath(); ctx.moveTo(p.px, p.py); ctx.lineTo(ex, ey); ctx.stroke();
                if (stub.locked || stub.secret) {
                    drawLineBadge((p.px + ex) / 2, (p.py + ey) / 2, stub.secret ? 'secret' : 'key');
                }
            });

            var scaledSize   = ROOM_SIZE        * zoomScale;
            var scaledBorder = ROOM_BORDER_WIDTH * zoomScale;
            var scaledFont   = SYMBOL_FONT_SIZE  * zoomScale;
            var half         = scaledSize / 2;

            rooms.forEach(function (room, id) {
                var p         = gridToCanvas(room.x, room.y);
                var isCurrent = (id === currentRoomId);
                var fill      = isCurrent ? CURRENT_ROOM_COLOR : colorForSymbol(room.symbol, room.env);
                var rx = p.px - half, ry = p.py - half;
                ctx.fillStyle = fill; ctx.fillRect(rx, ry, scaledSize, scaledSize);
                ctx.strokeStyle = ROOM_BORDER_COLOR; ctx.lineWidth = scaledBorder;
                ctx.strokeRect(rx, ry, scaledSize, scaledSize);
                ctx.fillStyle    = isCurrent ? CURRENT_ROOM_TEXT_COLOR : SYMBOL_TEXT_COLOR;
                ctx.font         = 'bold ' + scaledFont + 'px monospace';
                ctx.textAlign    = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(room.symbol || '\u2022', p.px, p.py);
                if (room.hasUp || room.hasDown) {
                    var arrowSize = Math.max(5, scaledSize * 0.28);
                    var margin    = Math.max(2, scaledSize * 0.1);
                    ctx.font      = 'bold ' + arrowSize + 'px monospace';
                    ctx.fillStyle = isCurrent ? CURRENT_ROOM_TEXT_COLOR : SYMBOL_TEXT_COLOR;
                    if (room.hasDown) {
                        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
                        ctx.fillText('\u25be', rx + margin, ry + scaledSize - margin);
                    }
                    if (room.hasUp) {
                        ctx.textAlign = 'right'; ctx.textBaseline = 'top';
                        ctx.fillText('\u25b4', rx + scaledSize - margin, ry + margin);
                    }
                }
            });
        }

        function roomAtPoint(cx, cy) {
            var half = (ROOM_SIZE * zoomScale) / 2, found = null;
            rooms.forEach(function (room, id) {
                var p = gridToCanvas(room.x, room.y);
                if (cx >= p.px - half && cx <= p.px + half &&
                    cy >= p.py - half && cy <= p.py + half) { found = id; }
            });
            return found;
        }

        // -- DOM ---------------------------------------------------------------
        function createPanel() {
            var wrap = document.createElement('div');
            wrap.className = 'map-canvas-wrap';

            canvas = document.createElement('canvas');
            canvas.id = 'map-2d-canvas';
            wrap.appendChild(canvas);
            ctx = canvas.getContext('2d');

            canvas.addEventListener('mouseleave', function () {
                hideTooltip();
                if (dragActive) { dragActive = false; canvas.style.cursor = ''; }
            });
            canvas.addEventListener('mousedown', function (e) {
                if (e.button !== 0) { return; }
                dragActive = true;
                dragStartPxX = e.clientX; dragStartPxY = e.clientY;
                dragStartPanX = panOffsetX; dragStartPanY = panOffsetY;
                canvas.style.cursor = 'grabbing'; e.preventDefault();
            });
            canvas.addEventListener('mousemove', function (e) {
                var rect = canvas.getBoundingClientRect();
                if (dragActive) {
                    var step = BASE_STEP * zoomScale;
                    panOffsetX = dragStartPanX - (e.clientX - dragStartPxX) / step;
                    panOffsetY = dragStartPanY - (e.clientY - dragStartPxY) / step;
                    render(); return;
                }
                var id   = roomAtPoint(e.clientX - rect.left, e.clientY - rect.top);
                var info = id !== null ? roomInfoStore.get(id) : null;
                if (info) { clearTimeout(tooltipHideTimer); showTooltip(e.clientX, e.clientY, info, false); }
                else      { hideTooltip(); }
            });
            canvas.addEventListener('mouseup', function (e) {
                if (!dragActive) { return; }
                var dx = e.clientX - dragStartPxX, dy = e.clientY - dragStartPxY;
                dragActive = false; canvas.style.cursor = '';
                if (Math.abs(dx) > 4 || Math.abs(dy) > 4) { canvas.dataset.suppressClick = '1'; }
            });
            canvas.addEventListener('click', function (e) {
                if (canvas.dataset.suppressClick) { delete canvas.dataset.suppressClick; return; }
                var charInfo = Client.GMCPStructs.Char && Client.GMCPStructs.Char.Info;
                if (!charInfo || charInfo.role !== 'admin') { return; }
                var rect = canvas.getBoundingClientRect();
                var id   = roomAtPoint(e.clientX - rect.left, e.clientY - rect.top);
                if (id === null) { return; }
                e.stopPropagation();
                uiMenu(e, [{ label: 'teleport ' + id, cmd: 'teleport ' + id },
                            { label: 'room info ' + id, cmd: 'room info ' + id }]);
            });
            canvas.addEventListener('wheel', function (e) {
                e.preventDefault();
                zoomScale = e.deltaY < 0
                    ? Math.min(ZOOM_MAX, zoomScale * ZOOM_STEP)
                    : Math.max(ZOOM_MIN, zoomScale / ZOOM_STEP);
                render();
            }, { passive: false });

            var controls = document.createElement('div');
            controls.className = 'map-controls';
            var btnOut = document.createElement('button');
            btnOut.textContent = '\u2212'; btnOut.title = 'Zoom out';
            btnOut.addEventListener('click', function () {
                zoomScale = Math.max(ZOOM_MIN, zoomScale / ZOOM_STEP); render();
            });
            var btnIn = document.createElement('button');
            btnIn.textContent = '+'; btnIn.title = 'Zoom in';
            btnIn.addEventListener('click', function () {
                zoomScale = Math.min(ZOOM_MAX, zoomScale * ZOOM_STEP); render();
            });
            controls.appendChild(btnOut);
            controls.appendChild(btnIn);
            wrap.appendChild(controls);

            container = wrap;
            return wrap;
        }

        function onActivate() {
            resizeCanvas();
            render();
        }

        function onWorldMap() {
            resizeCanvas();
            if (currentZoneKey) {
                var savedId = currentRoomId;
                replayZone(currentZoneKey);
                currentRoomId = savedId;
            }
            render();
        }

        function onRoomUpdate(info, gx, gy, gz, sym, env) {
            resizeCanvas();
            var zoneKey = info.coords.split(',').map(function (s) { return s.trim(); })[0] + '/z:' + gz;
            if (currentZoneKey !== zoneKey) {
                currentZoneKey = zoneKey;
                replayZone(zoneKey);
            } else {
                addOrUpdateRoom(info.num, gx, gy, sym, env);
                var rc = roomCache[info.num];
                if (rc) {
                    if (Array.isArray(rc.exits)) {
                        rc.exits.forEach(function (exit) {
                            if (exit.dz !== 0) { return; }
                            var destRc = roomCache[exit.num];
                            if (destRc) {
                                if (!rooms.has(exit.num)) {
                                    addOrUpdateRoom(exit.num, destRc.x, destRc.y, destRc.symbol, destRc.env);
                                }
                                addEdge(info.num, exit.num, exit.locked, exit.secret);
                            }
                        });
                    }
                    if (Array.isArray(rc.stubs)) {
                        rc.stubs.forEach(function (stub) {
                            if (stub.dz === 0) {
                                zoneExitStubs.push({ roomId: info.num, dx: stub.dx, dy: stub.dy,
                                                     locked: stub.locked, secret: stub.secret });
                            }
                        });
                    }
                }
            }
            currentRoomId = info.num;
            setCameraTarget(gx, gy);
        }

        function setupResizeObserver(win) {
            if (typeof ResizeObserver === 'undefined') { return; }
            var ro = new ResizeObserver(function () { resizeCanvas(); render(); });
            var orig = win.open.bind(win);
            win.open = function () { orig(); if (container) { ro.observe(container); } };
        }

        return {
            createPanel:        createPanel,
            onActivate:         onActivate,
            onWorldMap:         onWorldMap,
            onRoomUpdate:       onRoomUpdate,
            setupResizeObserver: setupResizeObserver,
            getCurrentRoomId:   function () { return currentRoomId; },
        };

    }());

    // =========================================================================
    // 3D view
    // =========================================================================

    var view3d = (function () {

        // -- Constants ---------------------------------------------------------
        var TILE_HW         = 20;
        var TILE_HH         = 10;
        var TILE_DEPTH      = 7;
        var GRID_STEP_XY    = 1.6;
        var Z_STEP          = 120;
        var CONNECTION_WIDTH = 2;
        var MAP_BG           = '#1e1e2e';
        var TILE_BORDER_COLOR = '#000000';
        var TILE_BORDER_WIDTH = 0.8;
        var SIDE_DARKEN       = 0.55;
        var SYMBOL_FONT_SIZE  = 10;
        var SPACING_STEP = 1.25;
        var SPACING_MIN  = 0.4;
        var SPACING_MAX  = 4.0;

        // -- State -------------------------------------------------------------
        var canvas    = null;
        var ctx       = null;
        var container = null;
        var rooms3d   = new Map();
        var edges3d   = new Map();
        var currentRoomId  = null;
        var camX = 0, camY = 0, camZ = 0;
        var easeStartX = 0, easeStartY = 0, easeStartZ = 0;
        var easeTargetX = 0, easeTargetY = 0, easeTargetZ = 0;
        var easeStartTime = null, easeRafId = null;
        var panOffsetX = 0, panOffsetY = 0;
        var dragActive = false;
        var dragStartPxX = 0, dragStartPxY = 0;
        var dragStartPanX = 0, dragStartPanY = 0;
        var zoomScale    = 1.0;
        var hoveredZ     = null;
        var currentRoomKey = '';

        var spacingScale = (function () {
            var saved = parseFloat(localStorage.getItem('map3d.spacingScale'));
            return (isFinite(saved) && saved >= SPACING_MIN && saved <= SPACING_MAX) ? saved : 1.0;
        }());

        // -- Helpers -----------------------------------------------------------
        function resizeCanvas() {
            if (!canvas || !container) { return; }
            canvas.width  = container.clientWidth  || 1;
            canvas.height = container.clientHeight || 1;
        }

        function darkenColor(hex, factor) {
            var r = Math.round(parseInt(hex.slice(1, 3), 16) * factor);
            var g = Math.round(parseInt(hex.slice(3, 5), 16) * factor);
            var b = Math.round(parseInt(hex.slice(5, 7), 16) * factor);
            return '#' + ('0' + r.toString(16)).slice(-2) +
                         ('0' + g.toString(16)).slice(-2) +
                         ('0' + b.toString(16)).slice(-2);
        }

        function isoProject(gx, gy, gz) {
            var step = TILE_HW * GRID_STEP_XY * spacingScale * zoomScale;
            var zs   = Z_STEP  * spacingScale * zoomScale;
            var midX = Math.floor(canvas.width  / 2);
            var midY = Math.floor(canvas.height / 2);
            var relX = gx - camX - panOffsetX;
            var relY = gy - camY - panOffsetY;
            var relZ = gz - camZ;
            return {
                sx: midX + (relX - relY) * step,
                sy: midY + (relX + relY) * (step / 2) - relZ * zs,
            };
        }

        function setCameraTarget(tx, ty, tz) {
            panOffsetX = 0; panOffsetY = 0;
            if (CENTER_EASE_DURATION <= 0) { camX = tx; camY = ty; camZ = tz; render(); return; }
            if (easeRafId !== null) { cancelAnimationFrame(easeRafId); easeRafId = null; }
            easeStartX = camX; easeStartY = camY; easeStartZ = camZ;
            easeTargetX = tx; easeTargetY = ty; easeTargetZ = tz;
            easeStartTime = null;
            function step(ts) {
                if (easeStartTime === null) { easeStartTime = ts; }
                var t = Math.min((ts - easeStartTime) / 1000 / CENTER_EASE_DURATION, 1);
                var s = smoothstep(t);
                camX = easeStartX + (easeTargetX - easeStartX) * s;
                camY = easeStartY + (easeTargetY - easeStartY) * s;
                camZ = easeStartZ + (easeTargetZ - easeStartZ) * s;
                render();
                easeRafId = t < 1 ? requestAnimationFrame(step) : null;
            }
            easeRafId = requestAnimationFrame(step);
        }

        function tileAttachPoint(sx, sy, dx, dy) {
            var hw = TILE_HW * zoomScale, hh = TILE_HH * zoomScale;
            if (dx !== 0 && dy !== 0) {
                if (dx > 0 && dy > 0) { return { sx: sx,      sy: sy + hh }; }
                if (dx > 0 && dy < 0) { return { sx: sx + hw, sy: sy      }; }
                if (dx < 0 && dy > 0) { return { sx: sx - hw, sy: sy      }; }
                return { sx: sx, sy: sy - hh };
            }
            if (dx > 0) { return { sx: sx + hw / 2, sy: sy + hh / 2 }; }
            if (dx < 0) { return { sx: sx - hw / 2, sy: sy - hh / 2 }; }
            if (dy > 0) { return { sx: sx - hw / 2, sy: sy + hh / 2 }; }
            if (dy < 0) { return { sx: sx + hw / 2, sy: sy - hh / 2 }; }
            return { sx: sx, sy: sy };
        }

        function addRoom3d(id, gx, gy, gz, symbol, env) {
            rooms3d.set(id, { x: gx, y: gy, z: gz, symbol: symbol || '\u2022', env: env || '' });
        }

        function addEdge3d(idA, idB, rA, rB) {
            var key, dx, dy, dz;
            if (idA < idB) {
                key = idA + '-' + idB;
                dx = rB.x - rA.x; dy = rB.y - rA.y; dz = rB.z - rA.z;
            } else {
                key = idB + '-' + idA;
                dx = rA.x - rB.x; dy = rA.y - rB.y; dz = rA.z - rB.z;
            }
            if (!edges3d.has(key)) { edges3d.set(key, { dx: dx, dy: dy, dz: dz }); }
        }

        function resetMap3d() {
            rooms3d.clear(); edges3d.clear();
            currentRoomId = null;
            panOffsetX = 0; panOffsetY = 0;
            dragActive = false;
            if (easeRafId !== null) { cancelAnimationFrame(easeRafId); easeRafId = null; }
        }

        function replayZone3d(startId) {
            resetMap3d();
            if (!roomCache[startId]) { return; }
            var visited = {}, queue = [startId];
            while (queue.length > 0) {
                var id = queue.shift();
                if (visited[id]) { continue; }
                visited[id] = true;
                var r = roomCache[id];
                if (!r) { continue; }
                addRoom3d(r.RoomId, r.x, r.y, r.z, r.symbol, r.env);
                if (Array.isArray(r.exits)) {
                    r.exits.forEach(function (exit) {
                        if (!visited[exit.num] && roomCache[exit.num]) { queue.push(exit.num); }
                    });
                }
            }
            rooms3d.forEach(function (room, id) {
                var r = roomCache[id];
                if (!r || !Array.isArray(r.exits)) { return; }
                r.exits.forEach(function (exit) {
                    if (rooms3d.has(exit.num)) { addEdge3d(id, exit.num, r, roomCache[exit.num]); }
                });
            });
        }

        // -- Rendering ---------------------------------------------------------
        function drawTile(gx, gy, gz, topColor, isCurrent, symbol) {
            var hw  = TILE_HW    * zoomScale;
            var hh  = TILE_HH    * zoomScale;
            var dep = TILE_DEPTH * zoomScale;
            var bw  = TILE_BORDER_WIDTH * zoomScale;
            var p   = isoProject(gx, gy, gz);
            var sx  = p.sx, sy = p.sy;
            var leftColor  = darkenColor(topColor, SIDE_DARKEN * 0.8);
            var rightColor = darkenColor(topColor, SIDE_DARKEN);

            ctx.beginPath();
            ctx.moveTo(sx, sy - hh); ctx.lineTo(sx + hw, sy);
            ctx.lineTo(sx, sy + hh); ctx.lineTo(sx - hw, sy);
            ctx.closePath();
            ctx.fillStyle = topColor; ctx.fill();
            ctx.strokeStyle = TILE_BORDER_COLOR; ctx.lineWidth = bw; ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(sx - hw, sy); ctx.lineTo(sx, sy + hh);
            ctx.lineTo(sx, sy + hh + dep); ctx.lineTo(sx - hw, sy + dep);
            ctx.closePath();
            ctx.fillStyle = leftColor; ctx.fill();
            ctx.strokeStyle = TILE_BORDER_COLOR; ctx.lineWidth = bw; ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(sx, sy + hh); ctx.lineTo(sx + hw, sy);
            ctx.lineTo(sx + hw, sy + dep); ctx.lineTo(sx, sy + hh + dep);
            ctx.closePath();
            ctx.fillStyle = rightColor; ctx.fill();
            ctx.strokeStyle = TILE_BORDER_COLOR; ctx.lineWidth = bw; ctx.stroke();

            ctx.fillStyle    = isCurrent ? CURRENT_ROOM_TEXT_COLOR : SYMBOL_TEXT_COLOR;
            ctx.font         = 'bold ' + (SYMBOL_FONT_SIZE * zoomScale) + 'px monospace';
            ctx.textAlign    = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(symbol || '\u2022', sx, sy);
        }

        function render() {
            if (!ctx || !canvas) { return; }
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = MAP_BG; ctx.fillRect(0, 0, canvas.width, canvas.height);
            if (rooms3d.size === 0) { return; }

            var list = [];
            rooms3d.forEach(function (room, id) {
                list.push({ id: id, x: room.x, y: room.y, z: room.z,
                            symbol: room.symbol, env: room.env });
            });
            list.sort(function (a, b) {
                return (a.x + a.y - a.z * 2) - (b.x + b.y - b.z * 2);
            });

            var playerZ = (currentRoomId !== null && rooms3d.has(currentRoomId))
                ? rooms3d.get(currentRoomId).z : (camZ | 0);
            var activeZ = (hoveredZ !== null) ? hoveredZ : playerZ;

            ctx.strokeStyle = CONNECTION_COLOR;
            ctx.lineWidth   = CONNECTION_WIDTH * zoomScale;
            ctx.lineCap     = 'round';

            edges3d.forEach(function (edge, key) {
                var parts = key.split('-');
                var rA = rooms3d.get(parseInt(parts[0], 10));
                var rB = rooms3d.get(parseInt(parts[1], 10));
                if (!rA || !rB) { return; }
                var zDiff = Math.max(Math.abs(rA.z - activeZ), Math.abs(rB.z - activeZ));
                ctx.globalAlpha = zDiff === 0 ? 1.0 : 0.25;
                var pA = isoProject(rA.x, rA.y, rA.z);
                var pB = isoProject(rB.x, rB.y, rB.z);
                var startPt, endPt;
                if (edge.dz !== 0) {
                    startPt = pA; endPt = pB;
                } else {
                    startPt = tileAttachPoint(pA.sx, pA.sy,  edge.dx,  edge.dy);
                    endPt   = tileAttachPoint(pB.sx, pB.sy, -edge.dx, -edge.dy);
                }
                ctx.beginPath(); ctx.moveTo(startPt.sx, startPt.sy);
                ctx.lineTo(endPt.sx, endPt.sy); ctx.stroke();
            });
            ctx.globalAlpha = 1.0;

            list.forEach(function (item) {
                var isCurrent = (item.id === currentRoomId);
                var topColor  = isCurrent ? CURRENT_ROOM_COLOR : colorForSymbol(item.symbol, item.env);
                ctx.globalAlpha = Math.abs(item.z - activeZ) === 0 ? 1.0 : 0.25;
                drawTile(item.x, item.y, item.z, topColor, isCurrent, item.symbol);
            });
            ctx.globalAlpha = 1.0;
        }

        function roomAtPoint(cx, cy) {
            var step = TILE_HW * GRID_STEP_XY * spacingScale * zoomScale;
            var hw = step, hh = step / 2, found = null;
            var list = [];
            rooms3d.forEach(function (room, id) { list.push({ id: id, x: room.x, y: room.y, z: room.z }); });
            list.sort(function (a, b) { return (b.x + b.y - b.z * 2) - (a.x + a.y - a.z * 2); });
            for (var i = 0; i < list.length; i++) {
                var item = list[i];
                var p = isoProject(item.x, item.y, item.z);
                if (Math.abs(cx - p.sx) / hw + Math.abs(cy - p.sy) / hh <= 1) {
                    found = item.id; break;
                }
            }
            return found;
        }

        // -- DOM ---------------------------------------------------------------
        function createPanel() {
            var wrap = document.createElement('div');
            wrap.className = 'map-canvas-wrap';

            canvas = document.createElement('canvas');
            canvas.id = 'map-3d-canvas';
            wrap.appendChild(canvas);
            ctx = canvas.getContext('2d');

            canvas.addEventListener('mouseleave', function () {
                hideTooltip();
                if (hoveredZ !== null) { hoveredZ = null; render(); }
                if (dragActive) { dragActive = false; canvas.style.cursor = ''; }
            });
            canvas.addEventListener('mousedown', function (e) {
                if (e.button !== 0) { return; }
                dragActive = true;
                dragStartPxX = e.clientX; dragStartPxY = e.clientY;
                dragStartPanX = panOffsetX; dragStartPanY = panOffsetY;
                canvas.style.cursor = 'grabbing'; e.preventDefault();
            });
            canvas.addEventListener('mousemove', function (e) {
                var rect = canvas.getBoundingClientRect();
                if (dragActive) {
                    var step = TILE_HW * GRID_STEP_XY * spacingScale * zoomScale;
                    var dsx = e.clientX - dragStartPxX, dsy = e.clientY - dragStartPxY;
                    panOffsetX = dragStartPanX - (dsx / step + dsy * 2 / step) / 2;
                    panOffsetY = dragStartPanY - (dsy * 2 / step - dsx / step) / 2;
                    render(); return;
                }
                var id   = roomAtPoint(e.clientX - rect.left, e.clientY - rect.top);
                var info = id !== null ? roomInfoStore.get(id) : null;
                if (info) {
                    clearTimeout(tooltipHideTimer);
                    showTooltip(e.clientX, e.clientY, info, true);
                    var hRoom = rooms3d.get(id);
                    var newZ  = (hRoom && hRoom.z !== null) ? hRoom.z : null;
                    if (newZ !== hoveredZ) { hoveredZ = newZ; render(); }
                } else {
                    hideTooltip();
                    if (hoveredZ !== null) { hoveredZ = null; render(); }
                }
            });
            canvas.addEventListener('mouseup', function (e) {
                if (!dragActive) { return; }
                var dx = e.clientX - dragStartPxX, dy = e.clientY - dragStartPxY;
                dragActive = false; canvas.style.cursor = '';
                if (Math.abs(dx) > 4 || Math.abs(dy) > 4) { canvas.dataset.suppressClick = '1'; }
            });
            canvas.addEventListener('click', function (e) {
                if (canvas.dataset.suppressClick) { delete canvas.dataset.suppressClick; return; }
                var charInfo = Client.GMCPStructs.Char && Client.GMCPStructs.Char.Info;
                if (!charInfo || charInfo.role !== 'admin') { return; }
                var rect = canvas.getBoundingClientRect();
                var id   = roomAtPoint(e.clientX - rect.left, e.clientY - rect.top);
                if (id === null) { return; }
                e.stopPropagation();
                uiMenu(e, [{ label: 'teleport ' + id, cmd: 'teleport ' + id },
                            { label: 'room info ' + id, cmd: 'room info ' + id }]);
            });
            canvas.addEventListener('wheel', function (e) {
                e.preventDefault();
                zoomScale = e.deltaY < 0
                    ? Math.min(ZOOM_MAX, zoomScale * ZOOM_STEP)
                    : Math.max(ZOOM_MIN, zoomScale / ZOOM_STEP);
                render();
            }, { passive: false });

            var controls = document.createElement('div');
            controls.className = 'map-controls';

            var btnZoomOut = document.createElement('button');
            btnZoomOut.textContent = '\u2212'; btnZoomOut.title = 'Zoom out';
            btnZoomOut.addEventListener('click', function () {
                zoomScale = Math.max(ZOOM_MIN, zoomScale / ZOOM_STEP); render();
            });
            var btnZoomIn = document.createElement('button');
            btnZoomIn.textContent = '+'; btnZoomIn.title = 'Zoom in';
            btnZoomIn.addEventListener('click', function () {
                zoomScale = Math.min(ZOOM_MAX, zoomScale * ZOOM_STEP); render();
            });
            var sep = document.createElement('span');
            sep.className = 'ctrl-sep';
            var btnSpacingOut = document.createElement('button');
            btnSpacingOut.textContent = '\u2212'; btnSpacingOut.title = 'Decrease spacing';
            btnSpacingOut.addEventListener('click', function () {
                spacingScale = Math.max(SPACING_MIN, spacingScale / SPACING_STEP);
                localStorage.setItem('map3d.spacingScale', spacingScale); render();
            });
            var btnSpacingIn = document.createElement('button');
            btnSpacingIn.textContent = '+'; btnSpacingIn.title = 'Increase spacing';
            btnSpacingIn.addEventListener('click', function () {
                spacingScale = Math.min(SPACING_MAX, spacingScale * SPACING_STEP);
                localStorage.setItem('map3d.spacingScale', spacingScale); render();
            });

            controls.appendChild(btnZoomOut);
            controls.appendChild(btnZoomIn);
            controls.appendChild(sep);
            controls.appendChild(btnSpacingOut);
            controls.appendChild(btnSpacingIn);
            wrap.appendChild(controls);

            container = wrap;
            return wrap;
        }

        function onActivate() {
            resizeCanvas();
            render();
        }

        function onWorldMap() {
            resizeCanvas();
            if (currentRoomId && roomCache[currentRoomId]) {
                var savedId = currentRoomId;
                replayZone3d(savedId);
                currentRoomId = savedId;
            }
            render();
        }

        function onRoomUpdate(info, gx, gy, gz, sym, env) {
            resizeCanvas();
            var roomKey = info.num + '';
            if (currentRoomKey !== roomKey) {
                currentRoomKey = roomKey;
                currentRoomId  = info.num;
                replayZone3d(info.num);
            } else {
                addRoom3d(info.num, gx, gy, gz, sym, env);
                var rc = roomCache[info.num];
                if (rc && Array.isArray(rc.exits)) {
                    rc.exits.forEach(function (exit) {
                        var destRc = roomCache[exit.num];
                        if (destRc) {
                            if (!rooms3d.has(exit.num)) {
                                addRoom3d(exit.num, destRc.x, destRc.y, destRc.z, destRc.symbol, destRc.env);
                            }
                            addEdge3d(info.num, exit.num, roomCache[info.num], destRc);
                        }
                    });
                }
            }
            currentRoomId = info.num;
            setCameraTarget(gx, gy, gz);
        }

        function setupResizeObserver(win) {
            if (typeof ResizeObserver === 'undefined') { return; }
            var ro = new ResizeObserver(function () { resizeCanvas(); render(); });
            var orig = win.open.bind(win);
            win.open = function () { orig(); if (container) { ro.observe(container); } };
        }

        return {
            createPanel:         createPanel,
            onActivate:          onActivate,
            onWorldMap:          onWorldMap,
            onRoomUpdate:        onRoomUpdate,
            setupResizeObserver: setupResizeObserver,
        };

    }());

    // =========================================================================
    // Window DOM — tab bar + two panels
    // =========================================================================

    var activeTab   = localStorage.getItem('map.activeTab') === '3d' ? '3d' : '2d';
    var panel2d     = null;
    var panel3d     = null;
    var tabBtn2d    = null;
    var tabBtn3d    = null;

    function switchTab(tab) {
        activeTab = tab;
        localStorage.setItem('map.activeTab', tab);
        panel2d.classList.toggle('active', tab === '2d');
        panel3d.classList.toggle('active', tab === '3d');
        tabBtn2d.classList.toggle('active', tab === '2d');
        tabBtn3d.classList.toggle('active', tab === '3d');
        if (tab === '2d') { view2d.onActivate(); }
        else              { view3d.onActivate(); }
    }

    function createDOM() {
        var root = document.createElement('div');
        root.id = 'map-window';

        var tabBar = document.createElement('div');
        tabBar.id = 'map-tab-bar';

        tabBtn2d = document.createElement('button');
        tabBtn2d.textContent = '2D';
        tabBtn2d.addEventListener('click', function () { switchTab('2d'); });

        tabBtn3d = document.createElement('button');
        tabBtn3d.textContent = '3D';
        tabBtn3d.addEventListener('click', function () { switchTab('3d'); });

        tabBar.appendChild(tabBtn2d);
        tabBar.appendChild(tabBtn3d);
        root.appendChild(tabBar);

        var panels = document.createElement('div');
        panels.id = 'map-panels';

        panel2d = document.createElement('div');
        panel2d.className = 'map-panel';
        panel2d.appendChild(view2d.createPanel());

        panel3d = document.createElement('div');
        panel3d.className = 'map-panel';
        panel3d.appendChild(view3d.createPanel());

        panels.appendChild(panel2d);
        panels.appendChild(panel3d);
        root.appendChild(panels);

        document.body.appendChild(root);

        // Apply initial active tab without triggering resize before DOM is ready
        panel2d.classList.toggle('active', activeTab === '2d');
        panel3d.classList.toggle('active', activeTab === '3d');
        tabBtn2d.classList.toggle('active', activeTab === '2d');
        tabBtn3d.classList.toggle('active', activeTab === '3d');

        return root;
    }

    // =========================================================================
    // VirtualWindow
    // =========================================================================

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

    view2d.setupResizeObserver(win);
    view3d.setupResizeObserver(win);

    // =========================================================================
    // GMCP update logic
    // =========================================================================

    function updateWorldMap() {
        var worldData = Client.GMCPStructs.World;
        if (!worldData || !Array.isArray(worldData.Map)) { return; }
        win.open();
        if (!win.isOpen()) { return; }
        ingestWorldMap(worldData.Map);
    }

    function updateMap() {
        var obj = Client.GMCPStructs.Room;
        if (!obj || !obj.Info) { return; }
        win.open();
        if (!win.isOpen()) { return; }

        if (!worldMapRequested) {
            worldMapRequested = true;
            Client.GMCPRequest('World.Map');
        }

        var info     = obj.Info;
        var coords   = info.coords.split(',').map(function (s) { return s.trim(); });
        var gx       = parseInt(coords[1], 10);
        var gy       = parseInt(coords[2], 10);
        var gz       = parseInt(coords[3], 10);
        var sym      = symbolForRoom(info);
        var env      = info.environment || '';

        roomInfoStore.set(info.num, info);
        upsertRoomCache(info.num, coords[0], gx, gy, gz, sym, env, info.exitsv2);

        var winBox = win.get();
        if (winBox) { winBox.setTitle('map (' + info.area + ')'); }

        view2d.onRoomUpdate(info, gx, gy, gz, sym, env);
        view3d.onRoomUpdate(info, gx, gy, gz, sym, env);
    }

    // =========================================================================
    // Registration
    // =========================================================================

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
