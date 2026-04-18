/* global Client, VirtualWindow, VirtualWindows, injectStyles */

/**
 * window-online.js
 *
 * Virtual window: Online Players
 *
 * Responds to GMCP namespace:
 *   Game  - player join/leave events
 *
 * Reads: Client.GMCPStructs.Game.Who.Players
 *
 * Disabled by default (offOnLoad: true). Enable via Settings > Windows.
 */

'use strict';

(function() {

    injectStyles(`
        #online-content {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            background: #161e1d;
            overflow: hidden;
        }

        #online-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 6px 10px 5px;
            background: #0d2e28;
            border-bottom: 1px solid #0f3333;
            flex-shrink: 0;
        }

        #online-header-label {
            color: #7ab8a0;
            font-family: Arial, sans-serif;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
        }

        #online-count-badge {
            background: #1c6b60;
            color: #dffbd1;
            font-family: Arial, sans-serif;
            font-size: 10px;
            font-weight: bold;
            border-radius: 10px;
            padding: 1px 7px;
            min-width: 20px;
            text-align: center;
            letter-spacing: 0.02em;
        }

        #online-col-headers {
            display: flex;
            align-items: center;
            padding: 4px 10px 3px;
            background: #111a19;
            border-bottom: 1px solid #0f3333;
            flex-shrink: 0;
        }

        .online-col-lvl {
            width: 32px;
            flex-shrink: 0;
            text-align: right;
        }

        .online-col-name {
            width: 100px;
            flex-shrink: 0;
            padding-left: 10px;
        }

        .online-col-title {
            flex: 1;
            padding-left: 10px;
            overflow: hidden;
        }

        .online-col-header-text {
            color: #3a6e5e;
            font-family: Arial, sans-serif;
            font-size: 9px;
            text-transform: uppercase;
            letter-spacing: 0.09em;
        }

        #online-list {
            flex: 1;
            overflow-y: auto;
        }

        #online-list::-webkit-scrollbar       { width: 4px; }
        #online-list::-webkit-scrollbar-track  { background: #111; }
        #online-list::-webkit-scrollbar-thumb  { background: #1c6b60; border-radius: 2px; }

        .online-player-row {
            display: flex;
            align-items: baseline;
            padding: 5px 10px;
            border-bottom: 1px solid #1a2a27;
            transition: background 0.1s;
        }

        .online-player-row:last-child {
            border-bottom: none;
        }

        .online-player-row:hover {
            background: #0d2e28;
        }

        .online-player-level {
            color: #3ad4b8;
            font-family: monospace;
            font-size: 0.75em;
            width: 32px;
            text-align: right;
            flex-shrink: 0;
        }

        .online-player-name {
            color: #dffbd1;
            font-family: monospace;
            font-size: 0.82em;
            font-weight: bold;
            width: 100px;
            flex-shrink: 0;
            padding-left: 10px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .online-player-title {
            color: #7ab8a0;
            font-family: Arial, sans-serif;
            font-size: 0.75em;
            flex: 1;
            padding-left: 10px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        #online-empty {
            padding: 14px 10px;
            color: #3a5a50;
            font-family: Arial, sans-serif;
            font-size: 0.75em;
            text-align: center;
            font-style: italic;
        }
    `);

    // -----------------------------------------------------------------------
    // DOM factory
    // -----------------------------------------------------------------------
    function createDOM() {
        const root = document.createElement('div');
        root.id = 'online-content';

        const header = document.createElement('div');
        header.id = 'online-header';

        const label = document.createElement('span');
        label.id = 'online-header-label';
        label.textContent = 'Online';

        const badge = document.createElement('span');
        badge.id = 'online-count-badge';
        badge.textContent = '0';

        header.appendChild(label);
        header.appendChild(badge);

        const colHeaders = document.createElement('div');
        colHeaders.id = 'online-col-headers';

        [['online-col-lvl', 'Lvl'], ['online-col-name', 'Name'], ['online-col-title', 'Title']].forEach(function(col) {
            const cell = document.createElement('div');
            cell.className = col[0];
            const text = document.createElement('span');
            text.className = 'online-col-header-text';
            text.textContent = col[1];
            cell.appendChild(text);
            colHeaders.appendChild(cell);
        });

        const list = document.createElement('div');
        list.id = 'online-list';

        root.appendChild(header);
        root.appendChild(colHeaders);
        root.appendChild(list);
        document.body.appendChild(root);

        return root;
    }

    // -----------------------------------------------------------------------
    // VirtualWindow instance
    // -----------------------------------------------------------------------
    const win = new VirtualWindow('Online', {
        dock:          'right',
        defaultDocked: true,
        dockedHeight:  200,
        offOnLoad:     true,
        factory() {
            const el = createDOM();
            // Request a fresh payload from the server. The response will
            // arrive as a normal GMCP message and flow through update().
            Client.GMCPRequest('Game');
            // Populate from already-stored data after the dock has settled.
            requestAnimationFrame(function() { update(); });
            return {
                title:      'Online',
                mount:      el,
                background: '#161e1d',
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

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------
    function render(players) {
        const list  = document.getElementById('online-list');
        const badge = document.getElementById('online-count-badge');
        if (!list || !badge) { return; }

        list.innerHTML = '';
        badge.textContent = String(players.length);

        if (players.length === 0) {
            const empty = document.createElement('div');
            empty.id = 'online-empty';
            empty.textContent = 'No players online.';
            list.appendChild(empty);
            return;
        }

        players.forEach(function(p) {
            const row = document.createElement('div');
            row.className = 'online-player-row';

            const lvl = document.createElement('span');
            lvl.className = 'online-player-level';
            lvl.textContent = p.level !== undefined ? p.level : '';

            const name = document.createElement('span');
            name.className = 'online-player-name';
            name.textContent = p.name || '';

            const title = document.createElement('span');
            title.className = 'online-player-title';
            title.textContent = p.title || '';

            row.appendChild(lvl);
            row.appendChild(name);
            row.appendChild(title);
            list.appendChild(row);
        });
    }

    // -----------------------------------------------------------------------
    // Update logic
    // -----------------------------------------------------------------------
    function update() {
        const game = Client.GMCPStructs.Game;
        if (!game || !game.Who || !Array.isArray(game.Who.Players)) { return; }
        if (!win.isOpen()) { return; }
        render(game.Who.Players);
    }

    // -----------------------------------------------------------------------
    // Registration
    // -----------------------------------------------------------------------
    VirtualWindows.register({
        window:       win,
        gmcpHandlers: ['Game'],
        onGMCP() { update(); },
    });

    // Second registration with no window so the handler always fires,
    // keeping the DOM current even while the window is hidden.
    VirtualWindows.register({
        window:       null,
        gmcpHandlers: ['Game'],
        onGMCP() { update(); },
    });

})();
