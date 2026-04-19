/* global Client, VirtualWindow, VirtualWindows, injectStyles */

/**
 * window-comm.js
 *
 * Virtual window: Communications (tabbed chat channels).
 *
 * Responds to GMCP namespace:
 *   Comm  - incoming channel message
 *
 * Reads: Client.GMCPStructs.Comm.Channel
 *
 * Channels are defined in the CHANNELS constant below. Add entries there
 * to expose additional tabs without touching any other file.
 */

'use strict';

(function() {

    injectStyles(`
        #comm-output {
            width: 100%;
            display: flex;
            flex-direction: column;
            height: 100%;
            background: #1e1e1e;
        }

        #comm-output .tab-buttons {
            display: flex;
            flex-shrink: 0;
            border-bottom: 1px solid #0f3333;
        }

        #comm-output .tab-button {
            flex: 1;
            padding: 5px 4px;
            background: #0d2e28;
            border: none;
            cursor: pointer;
            font: inherit;
            font-size: 0.7em;
            color: #7ab8a0;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            transition: background 0.15s, color 0.15s;
            border-right: 1px solid #0f3333;
        }

        #comm-output .tab-button:last-child {
            border-right: none;
        }

        #comm-output .tab-button:hover {
            background: #0f3333;
            color: #dffbd1;
        }

        #comm-output .tab-button.active {
            background: #1e1e1e;
            color: #dffbd1;
            border-bottom: 2px solid #3ad4b8;
        }

        @keyframes comm-tab-glow {
            0%   { background: #0d2e28; color: #7ab8a0; }
            50%  { background: #3ad4b8; color: #3ad4b8; }
            100% { background: #0d2e28; color: #7ab8a0; }
        }

        #comm-output .tab-button.pending {
            animation: comm-tab-glow 2s ease-in-out infinite;
        }

        #comm-output .tab-contents {
            flex: 1;
            overflow: hidden;
            background: #1e1e1e;
        }

        #comm-output .tab-content {
            display: none;
            height: 100%;
        }

        #comm-output .tab-content.active {
            display: block;
        }

        .chat-window {
            overflow: scroll;
            background-color: #1e1e1e;
            color: #fff;
            font-size: 12px;
            padding: 2px;
        }

        .chat-window p {
            margin-bottom: 2px;
        }
        
        .chat-window.broadcast { color: #d700d7; }
        .chat-window.whisper   { color: #737670; }

        .text-name.mob    { color: #00ffff; }
        .text-name.player { color: #fce94f; }
    `);

    // -----------------------------------------------------------------------
    // Channel configuration
    // Add or remove entries here to change which tabs appear.
    // -----------------------------------------------------------------------
    const CHANNELS = [
        { id: 'say',       label: 'Say',        cssClass: 'say',       active: true  },
        { id: 'whisper',   label: 'Whisper',     cssClass: 'whisper',   active: false },
        { id: 'party',     label: 'Party',       cssClass: 'party',     active: false },
        { id: 'broadcast', label: 'Broadcasts',  cssClass: 'broadcast', active: false },
    ];

    // -----------------------------------------------------------------------
    // DOM factory
    // Builds the full tabbed comm UI and appends it to document.body.
    // Returns the root element for WinBox to mount.
    // -----------------------------------------------------------------------
    function createDOM() {
        const root = document.createElement('div');
        root.id        = 'comm-output';
        root.style.height = '100%';

        // Tab button row
        const buttonRow = document.createElement('div');
        buttonRow.className = 'tab-buttons';

        // Tab panel container
        const panelContainer = document.createElement('div');
        panelContainer.className = 'tab-contents';

        CHANNELS.forEach(ch => {
            // Button
            const btn = document.createElement('button');
            btn.id               = 'comm-tab-' + ch.id;
            btn.className        = 'tab-button' + (ch.active ? ' active' : '');
            btn.dataset.tab      = 'comm-' + ch.id;
            btn.dataset.label    = ch.label;
            btn.dataset.unread   = '0';
            btn.textContent      = ch.label;
            buttonRow.appendChild(btn);

            // Panel
            const panel = document.createElement('div');
            panel.id        = 'comm-' + ch.id;
            panel.className = 'chat-window ' + ch.cssClass + ' tab-content' + (ch.active ? ' active' : '');
            panelContainer.appendChild(panel);
        });

        root.appendChild(buttonRow);
        root.appendChild(panelContainer);
        document.body.appendChild(root);

        // Wire up tab switching within this window's root element
        const buttons = buttonRow.querySelectorAll('.tab-button');
        const panels  = panelContainer.querySelectorAll('.tab-content');

        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                const target = btn.dataset.tab;

                buttons.forEach(b => b.classList.remove('active'));
                panels.forEach(p => p.classList.remove('active'));

                btn.classList.add('active');
                btn.classList.remove('pending');
                btn.dataset.unread = '0';
                btn.textContent    = btn.dataset.label;
                document.getElementById(target).classList.add('active');
            });
        });

        return root;
    }

    // -----------------------------------------------------------------------
    // VirtualWindow instance
    // -----------------------------------------------------------------------
    const win = new VirtualWindow('Communications', {
        dock:          'right',
        defaultDocked: true,
        dockedHeight:  290,
        factory() {
            const el = createDOM();
            return {
                title:      'Communications',
                mount:      el,
                background: '#1e1e1e',
                border:     1,
                x:          'right',
                y:          450,
                width:      363,
                height:     20 + 290,
                header:     20,
                bottom:     60,
            };
        },
    });

    // -----------------------------------------------------------------------
    // Message rendering
    // -----------------------------------------------------------------------
    function postMessage(channelName, fromName, fromSource, message) {
        const tab   = document.getElementById('comm-tab-' + channelName);
        const panel = document.getElementById('comm-' + channelName);

        if (!tab || !panel) {
            return;
        }

        // Update unread badge on inactive tabs
        if (tab.classList.contains('active')) {
            tab.dataset.unread = '0';
            tab.textContent    = tab.dataset.label;
        } else {
            tab.dataset.unread = String(parseInt(tab.dataset.unread) + 1);
            tab.textContent    = tab.dataset.label + '(' + tab.dataset.unread + ')';
            tab.classList.add('pending');
        }

        const p = document.createElement('p');
        p.innerHTML =
            '<span class="text-name ' + fromSource + '">' + fromName + '</span>: ' +
            '<span class="text-body ' + fromSource + '">' + message + '</span>';
        panel.appendChild(p);

        // Trim overflow: remove oldest messages when content exceeds window height
        const winBox = win.get();
        if (winBox) {
            const winContainer = winBox.window;
            while (panel.scrollHeight > winContainer.clientHeight - 58) {
                if (panel.childElementCount < 1) {
                    break;
                }
                panel.removeChild(panel.firstElementChild);
            }
        }
    }

    // -----------------------------------------------------------------------
    // Update logic
    // -----------------------------------------------------------------------
    function updateComm() {
        const obj = Client.GMCPStructs.Comm;
        if (!obj || !obj.Channel) {
            return;
        }

        win.open();
        if (!win.isOpen()) {
            return;
        }

        const ch = obj.Channel;
        postMessage(ch.channel, ch.sender, ch.source, ch.text);
    }

    // -----------------------------------------------------------------------
    // Registration
    // -----------------------------------------------------------------------
    VirtualWindows.register({
        window:       win,
        gmcpHandlers: ['Comm'],
        onGMCP(namespace, body) {
            updateComm();
        },
    });

})();
