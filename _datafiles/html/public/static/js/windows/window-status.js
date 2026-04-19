/* global Client, VirtualWindow, VirtualWindows, injectStyles */

/**
 * window-status.js
 *
 * Virtual window: Worth — left dock.
 *
 * Displays XP progress bar, gold (carried + bank).
 *
 * Responds to GMCP namespaces:
 *   Char.Worth  — XP, gold
 *   Char        — full character update
 *
 * Reads:
 *   Client.GMCPStructs.Char.Worth
 */

'use strict';

(function() {

    injectStyles(`
        #status-window {
            height: 100%;
            display: flex;
            flex-direction: column;
            background: #1e1e1e;
            padding: 8px 10px;
            gap: 8px;
            justify-content: flex-start;
            overflow-y: auto;
            box-sizing: border-box;
        }

        #status-window::-webkit-scrollbar       { width: 4px; }
        #status-window::-webkit-scrollbar-track  { background: #111; }
        #status-window::-webkit-scrollbar-thumb  { background: #1c6b60; border-radius: 2px; }

        .sw-xp-section {
            display: flex;
            flex-direction: column;
            gap: 3px;
        }

        .sw-xp-label-row {
            display: flex;
            justify-content: space-between;
            font-size: 0.7em;
            color: #7ab8a0;
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }

        .sw-xp-track {
            width: 100%;
            height: 10px;
            background: #1a1a1a;
            border-radius: 5px;
            overflow: hidden;
            border: 1px solid #222;
        }

        .sw-xp-fill {
            height: 100%;
            border-radius: 5px;
            background: linear-gradient(to right, #1c6b60, #3ad4b8);
            transition: width 0.4s ease-out;
        }

        .sw-worth-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px 10px;
        }

        .sw-worth-cell {
            display: flex;
            flex-direction: column;
            gap: 1px;
        }

        .sw-worth-cell-label {
            font-size: 0.66em;
            color: #7ab8a0;
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }

        .sw-worth-cell-value {
            font-size: 0.85em;
            color: #dffbd1;
        }
    `);

    // -----------------------------------------------------------------------
    // DOM factory
    // -----------------------------------------------------------------------
    function createDOM() {
        const el = document.createElement('div');
        el.id = 'status-window';
        el.innerHTML =
            '<div class="sw-xp-section">' +
                '<div class="sw-xp-label-row"><span>Experience</span><span id="sw-xp-text">\u2014 / \u2014</span></div>' +
                '<div class="sw-xp-track"><div class="sw-xp-fill" id="sw-xp-fill" style="width:0%"></div></div>' +
            '</div>' +
            '<div class="sw-worth-grid">' +
                '<div class="sw-worth-cell"><span class="sw-worth-cell-label">Gold (on hand)</span><span class="sw-worth-cell-value" id="sw-gold">\u2014</span></div>' +
                '<div class="sw-worth-cell"><span class="sw-worth-cell-label">Gold (bank)</span><span class="sw-worth-cell-value" id="sw-bank">\u2014</span></div>' +
            '</div>';

        document.body.appendChild(el);
        return el;
    }

    // -----------------------------------------------------------------------
    // VirtualWindow
    // -----------------------------------------------------------------------
    const win = new VirtualWindow('Worth', {
        dock:          'left',
        defaultDocked: true,
        dockedHeight:  100,
        factory() {
            const el = createDOM();
            return {
                title:      'Worth',
                mount:      el,
                background: '#1e1e1e',
                border:     1,
                x:          0,
                y:          0,
                width:      363,
                height:     140,
                header:     20,
                bottom:     60,
            };
        },
    });

    // -----------------------------------------------------------------------
    // Worth update
    // -----------------------------------------------------------------------
    function fmt(n) {
        if (n === undefined || n === null) { return '\u2014'; }
        return Number(n).toLocaleString();
    }

    function updateWorth() {
        const worth = Client.GMCPStructs.Char && Client.GMCPStructs.Char.Worth;
        if (!worth) { return; }

        const xp  = worth.xp  || 0;
        const tnl = worth.tnl || 0;
        const pct = tnl > 0 ? Math.min(100, Math.round((xp / tnl) * 100)) : 0;

        document.getElementById('sw-xp-fill').style.width = pct + '%';
        document.getElementById('sw-xp-text').textContent = fmt(xp) + ' / ' + fmt(tnl);
        document.getElementById('sw-gold').textContent    = fmt(worth.gold_carry);
        document.getElementById('sw-bank').textContent    = fmt(worth.gold_bank);
    }

    // -----------------------------------------------------------------------
    // Update
    // -----------------------------------------------------------------------
    function update() {
        win.open();
        if (!win.isOpen()) { return; }
        updateWorth();
    }

    // -----------------------------------------------------------------------
    // Registration
    // -----------------------------------------------------------------------
    VirtualWindows.register({
        window:       win,
        gmcpHandlers: ['Char.Worth', 'Char'],
        onGMCP() { update(); },
    });

})();
