/* global Client, VirtualWindow, VirtualWindows, injectStyles, uiMenu */

/**
 * window-room.js
 *
 * Virtual window: Room Info — right dock.
 *
 * Displays the current room's name, area, environment, detail badges,
 * exit badges, and contents (NPCs, players, items, containers).
 *
 * Responds to GMCP namespace:
 *   Room.Info — full room update (also handles sub-namespace updates)
 *
 * Reads: Client.GMCPStructs.Room.Info
 */

'use strict';

(function() {

    injectStyles(`
        /* ---- shell ---- */
        #room-window {
            height: 100%;
            display: flex;
            flex-direction: column;
            background: #161e1d;
            overflow: hidden;
        }

        /* ---- header ---- */
        #rw-header {
            flex-shrink: 0;
            padding: 7px 10px 5px;
            background: #0d2e28;
            border-bottom: 1px solid #0f3333;
        }

        #rw-room-name {
            font-size: 0.88em;
            font-weight: bold;
            color: #dffbd1;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            margin-bottom: 2px;
        }

        #rw-room-meta {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        #rw-area {
            font-size: 0.65em;
            color: #7ab8a0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            flex: 1;
            min-width: 0;
        }

        #rw-env {
            font-size: 0.62em;
            color: #3a6e5e;
            white-space: nowrap;
            flex-shrink: 0;
        }

        #rw-badges {
            display: flex;
            flex-wrap: wrap;
            gap: 3px;
            margin-top: 4px;
        }

        .rw-badge {
            font-size: 0.58em;
            padding: 1px 5px;
            border-radius: 3px;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            font-weight: bold;
        }

        .rw-badge.pvp       { background: #3d0f0f; color: #e06060; border: 1px solid #6b1c1c; }
        .rw-badge.bank      { background: #1a2500; color: #b8d43a; border: 1px solid #4a6010; }
        .rw-badge.trainer   { background: #00182a; color: #3ab8d4; border: 1px solid #0f4a5a; }
        .rw-badge.storage   { background: #1a1a00; color: #d4c43a; border: 1px solid #5a5010; }
        .rw-badge.ephemeral { background: #1a001a; color: #b83ad4; border: 1px solid #5a1060; }
        .rw-badge.character { background: #001a1a; color: #3ad4b8; border: 1px solid #0f6050; }
        .rw-badge.root      { background: #001a00; color: #3ad460; border: 1px solid #0f5020; }

        /* ---- exits ---- */
        #rw-exits {
            padding: 5px 10px 6px;
            border-bottom: 1px solid #0f3333;
            flex-shrink: 0;
        }

        #rw-exits-label {
            font-size: 0.6em;
            color: #3a6e5e;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            margin-bottom: 4px;
        }

        #rw-exits-list {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
        }

        .rw-exit-badge {
            font-size: 0.65em;
            padding: 2px 7px;
            border-radius: 3px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            cursor: pointer;
            user-select: none;
            transition: background 0.12s, color 0.12s;
        }

        .rw-exit-badge.open {
            background: #0d2e28;
            color: #3ad4b8;
            border: 1px solid #1c6b60;
        }

        .rw-exit-badge.open:hover {
            background: #1c6b60;
            color: #dffbd1;
        }

        .rw-exit-badge.locked {
            background: #1e1800;
            color: #d4a83a;
            border: 1px solid #5a4a10;
        }

        .rw-exit-badge.locked:hover {
            background: #3a3000;
            color: #f0c84a;
        }

        .rw-exit-badge.secret {
            background: #0a0a0a;
            color: #2a4a44;
            border: 1px solid #1a2a28;
        }

        .rw-exit-badge.secret:hover {
            background: #0f1f1c;
            color: #3a6e5e;
        }

        /* ---- scroll body (exits + contents together) ---- */
        #rw-body {
            flex: 1;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
        }

        #rw-body::-webkit-scrollbar       { width: 4px; }
        #rw-body::-webkit-scrollbar-track  { background: #111; }
        #rw-body::-webkit-scrollbar-thumb  { background: #1c6b60; border-radius: 2px; }

        .rw-section {
            flex-shrink: 0;
        }

        .rw-section-header {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 4px 10px 3px;
            background: #111a19;
            border-bottom: 1px solid #0f3333;
        }

        .rw-section-title {
            font-size: 0.62em;
            color: #7ab8a0;
            text-transform: uppercase;
            letter-spacing: 0.07em;
            flex: 1;
        }

        .rw-section-count {
            font-size: 0.6em;
            color: #3ad4b8;
            font-weight: bold;
            background: #0d2e28;
            border: 1px solid #1c6b60;
            border-radius: 8px;
            padding: 0 5px;
            min-width: 16px;
            text-align: center;
        }

        .rw-section-count.zero {
            color: #3a5e50;
            border-color: #0f3333;
            background: transparent;
        }

        .rw-section-body {
            display: flex;
            flex-direction: column;
        }

        /* ---- rows ---- */
        .rw-row {
            display: flex;
            align-items: center;
            gap: 5px;
            padding: 3px 10px;
            border-bottom: 1px solid #0a1612;
            cursor: pointer;
            min-height: 20px;
        }

        .rw-row:last-child { border-bottom: none; }

        .rw-row:hover { background: #0a1e1a; }

        .rw-row.aggro { background: #1a0808; }
        .rw-row.aggro:hover { background: #2a0c0c; }

        .rw-row-name {
            flex: 1;
            font-size: 0.76em;
            color: #dffbd1;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .rw-row.aggro .rw-row-name { color: #f4a0a0; }

        .rw-row-adj {
            font-size: 0.63em;
            color: #3a6e5e;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 80px;
            flex-shrink: 0;
        }

        .rw-icon {
            font-size: 0.7em;
            flex-shrink: 0;
            line-height: 1;
        }

        .rw-icon.quest  { color: #d4a843; }
        .rw-icon.aggro  { color: #e06060; }
        .rw-icon.locked { color: #d4a83a; }
        .rw-icon.usable { color: #3ab8d4; }

        .rw-empty {
            font-size: 0.7em;
            color: #2a4a44;
            font-style: italic;
            padding: 6px 10px;
        }
    `);

    // -----------------------------------------------------------------------
    // DOM factory
    // -----------------------------------------------------------------------
    function buildSection(id, title) {
        const section = document.createElement('div');
        section.className = 'rw-section';
        section.id = 'rws-' + id;

        const header = document.createElement('div');
        header.className = 'rw-section-header';
        header.innerHTML =
            '<span class="rw-section-title">' + title + '</span>' +
            '<span class="rw-section-count zero" id="rws-count-' + id + '">0</span>';

        const body = document.createElement('div');
        body.className = 'rw-section-body';
        body.id = 'rws-body-' + id;

        section.appendChild(header);
        section.appendChild(body);
        return section;
    }

    function createDOM() {
        const el = document.createElement('div');
        el.id = 'room-window';

        el.innerHTML =
            '<div id="rw-header">' +
                '<div id="rw-room-name">\u2014</div>' +
                '<div id="rw-room-meta">' +
                    '<span id="rw-area"></span>' +
                    '<span id="rw-env"></span>' +
                '</div>' +
                '<div id="rw-badges"></div>' +
            '</div>';

        const body = document.createElement('div');
        body.id = 'rw-body';

        const exits = document.createElement('div');
        exits.id = 'rw-exits';
        exits.innerHTML = '<div id="rw-exits-label">Exits</div><div id="rw-exits-list"></div>';
        body.appendChild(exits);

        body.appendChild(buildSection('npcs',       'NPCs'));
        body.appendChild(buildSection('players',    'Players'));
        body.appendChild(buildSection('items',      'Items'));
        body.appendChild(buildSection('containers', 'Containers'));
        el.appendChild(body);

        document.body.appendChild(el);
        return el;
    }

    // -----------------------------------------------------------------------
    // VirtualWindow
    // -----------------------------------------------------------------------
    const win = new VirtualWindow('RoomInfo', {
        dock:          'right',
        defaultDocked: true,
        dockedHeight:  340,
        factory() {
            const el = createDOM();
            return {
                title:      'Room Info',
                mount:      el,
                background: '#161e1d',
                border:     1,
                x:          'right',
                y:          0,
                width:      280,
                height:     400,
                header:     20,
                bottom:     60,
            };
        },
    });

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------
    const BADGE_LABELS = {
        pvp:       'PvP',
        bank:      'Bank',
        trainer:   'Trainer',
        storage:   'Storage',
        ephemeral: 'Ephemeral',
        character: 'Char Room',
        root:      'Zone Root',
    };

    function setSection(id, rows) {
        const body  = document.getElementById('rws-body-' + id);
        const count = document.getElementById('rws-count-' + id);
        if (!body || !count) { return; }

        body.innerHTML = '';
        count.textContent = rows.length;
        count.classList.toggle('zero', rows.length === 0);

        if (rows.length === 0) {
            const empty = document.createElement('div');
            empty.className   = 'rw-empty';
            empty.textContent = 'None';
            body.appendChild(empty);
            return;
        }

        rows.forEach(function(row) { body.appendChild(row); });
    }

    function makeRow(name, opts) {
        opts = opts || {};
        const row = document.createElement('div');
        row.className = 'rw-row' + (opts.aggro ? ' aggro' : '');

        if (opts.aggro) {
            const icon = document.createElement('span');
            icon.className   = 'rw-icon aggro';
            icon.textContent = '\u2022';
            icon.title       = 'aggressive';
            row.appendChild(icon);
        }

        if (opts.quest) {
            const icon = document.createElement('span');
            icon.className   = 'rw-icon quest';
            icon.textContent = '\u25c6';
            icon.title       = 'quest';
            row.appendChild(icon);
        }

        const nameEl = document.createElement('span');
        nameEl.className   = 'rw-row-name';
        nameEl.textContent = name;
        row.appendChild(nameEl);

        if (opts.adj && opts.adj.length > 0) {
            const adjEl = document.createElement('span');
            adjEl.className   = 'rw-row-adj';
            adjEl.textContent = opts.adj.join(', ');
            adjEl.title       = opts.adj.join(', ');
            row.appendChild(adjEl);
        }

        if (opts.locked) {
            const icon = document.createElement('span');
            icon.className   = 'rw-icon locked';
            icon.textContent = '\u{1f512}';
            icon.title       = opts.hasKey ? 'locked (have key)' : opts.hasCombo ? 'locked (have combo)' : 'locked';
            row.appendChild(icon);
        }

        if (opts.usable) {
            const icon = document.createElement('span');
            icon.className   = 'rw-icon usable';
            icon.textContent = '\u2699';
            icon.title       = 'craftable';
            row.appendChild(icon);
        }

        row.addEventListener('click', function(e) {
            uiMenu(e, opts.menuItems || [{ label: 'look ' + name, cmd: 'look ' + name }]);
        });

        return row;
    }

    // -----------------------------------------------------------------------
    // Update
    // -----------------------------------------------------------------------
    function update() {
        const room = Client.GMCPStructs.Room && Client.GMCPStructs.Room.Info;
        if (!room) { return; }

        win.open();
        if (!win.isOpen()) { return; }

        // Header
        const nameEl = document.getElementById('rw-room-name');
        const areaEl = document.getElementById('rw-area');
        const envEl  = document.getElementById('rw-env');
        if (nameEl) { nameEl.textContent = room.name || '\u2014'; }
        if (areaEl) { areaEl.textContent = room.area || ''; }
        if (envEl)  { envEl.textContent  = room.environment ? '\u00b7 ' + room.environment : ''; }

        // Detail badges
        const badgesEl = document.getElementById('rw-badges');
        if (badgesEl) {
            badgesEl.innerHTML = '';
            (room.details || []).forEach(function(d) {
                if (!BADGE_LABELS[d]) { return; }
                const badge = document.createElement('span');
                badge.className   = 'rw-badge ' + d;
                badge.textContent = BADGE_LABELS[d];
                badge.style.cursor = 'help';
                badge.addEventListener('click', function() { Client.GMCPRequest('Help ' + d); });
                badgesEl.appendChild(badge);
            });
        }

        // Exits — flat wrapping badges
        const exitsList = document.getElementById('rw-exits-list');
        if (exitsList) {
            exitsList.innerHTML = '';
            const exitsV2 = room.exitsv2 || {};
            const exits   = room.exits   || {};

            Object.keys(exits).forEach(function(dir) {
                const info    = exitsV2[dir] || { details: [] };
                const details = info.details || [];
                const isLocked = details.includes('locked');
                const isSecret = details.includes('secret');

                const badge = document.createElement('span');
                badge.className   = 'rw-exit-badge ' + (isLocked ? 'locked' : isSecret ? 'secret' : 'open');
                badge.textContent = dir;

                if (isLocked) {
                    const hints = [];
                    if (details.includes('player_has_key'))        { hints.push('have key'); }
                    if (details.includes('player_has_pick_combo')) { hints.push('have combo'); }
                    badge.title = hints.length > 0 ? hints.join(', ') : 'locked';
                }

                badge.addEventListener('click', function() { Client.SendInput(dir); });
                exitsList.appendChild(badge);
            });
        }

        // NPCs — look + attack (use id for targeting)
        const npcs = (room.Contents && room.Contents.Npcs) || [];
        setSection('npcs', npcs.map(function(c) {
            const menuItems = [
                { label: 'look '   + c.name, cmd: 'look '   + c.id },
                { label: 'attack ' + c.name, cmd: 'attack ' + c.id },
            ];
            if (c.adjectives && c.adjectives.includes('shop')) {
                menuItems.push({ label: 'list ' + c.name, cmd: 'list ' + c.id });
            }
            return makeRow(c.name, {
                aggro: c.aggro,
                quest: c.quest_flag,
                adj:   c.adjectives,
                menuItems: menuItems,
            });
        }));

        // Players — look + attack (use id for targeting)
        const players = (room.Contents && room.Contents.Players) || [];
        setSection('players', players.map(function(c) {
            const menuItems = [
                { label: 'look '   + c.name, cmd: 'look '   + c.id },
                { label: 'attack ' + c.name, cmd: 'attack ' + c.id },
            ];
            if (c.adjectives && c.adjectives.includes('shop')) {
                menuItems.push({ label: 'list ' + c.name, cmd: 'list ' + c.id });
            }
            return makeRow(c.name, {
                aggro: c.aggro,
                adj:   c.adjectives,
                menuItems: menuItems,
            });
        }));

        // Items — get only (use id for targeting)
        const items = (room.Contents && room.Contents.Items) || [];
        setSection('items', items.map(function(itm) {
            return makeRow(itm.name, {
                quest:     itm.quest_flag,
                menuItems: [{ label: 'get ' + itm.name, cmd: 'get ' + itm.id }],
            });
        }));

        // Containers — look only
        const containers = (room.Contents && room.Contents.Containers) || [];
        setSection('containers', containers.map(function(c) {
            return makeRow(c.name, {
                locked:    c.locked,
                hasKey:    c.haskey,
                hasCombo:  c.haspickcombo,
                usable:    c.usable,
                menuItems: [{ label: 'look ' + c.name, cmd: 'look ' + c.name }],
            });
        }));
    }

    // -----------------------------------------------------------------------
    // Registration
    // -----------------------------------------------------------------------
    VirtualWindows.register({
        window:       win,
        gmcpHandlers: ['Room.Info'],
        onGMCP() { update(); },
    });

})();
