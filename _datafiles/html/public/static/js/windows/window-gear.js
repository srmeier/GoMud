/**
 * window-gear.js
 *
 * Virtual window: Gear — left dock, tabbed.
 *
 * Tabs:
 *   Worn     — equipped items by slot, hover tooltips, click menu
 *   Backpack — carried items with carry capacity, hover tooltips, click menu
 *
 * Responds to GMCP namespaces:
 *   Char.Inventory          — worn equipment + backpack
 *   Char.Inventory.Backpack — backpack items only
 *   Char                    — full character update
 *
 * Reads:
 *   Client.GMCPStructs.Char.Inventory.Worn
 *   Client.GMCPStructs.Char.Inventory.Backpack
 */

'use strict';

(function() {

    injectStyles(`
        /* ---- shell ---- */
        #gear-window {
            height: 100%;
            display: flex;
            flex-direction: column;
            background: var(--t-bg);
        }

        /* ---- tab chrome ---- */
        #gear-window .gw-tab-bar {
            display: flex;
            flex-shrink: 0;
            border-bottom: 1px solid var(--t-border);
        }

        #gear-window .gw-tab-btn {
            flex: 1;
            padding: 5px 4px;
            background: var(--t-bg-surface);
            border: none;
            cursor: pointer;
            font: inherit;
            font-size: 0.7em;
            color: var(--t-text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.04em;
            transition: background 0.15s, color 0.15s;
            border-right: 1px solid var(--t-border);
        }

        #gear-window .gw-tab-btn:last-child { border-right: none; }

        #gear-window .gw-tab-btn:hover {
            background: var(--t-border);
            color: var(--t-text);
        }

        #gear-window .gw-tab-btn.active {
            background: var(--t-bg);
            color: var(--t-text);
            border-bottom: 2px solid var(--t-accent);
        }

        #gear-window .gw-tab-panel {
            display: none;
            flex: 1;
            overflow-y: auto;
        }

        #gear-window .gw-tab-panel::-webkit-scrollbar       { width: 4px; }
        #gear-window .gw-tab-panel::-webkit-scrollbar-track  { background: var(--t-scrollbar-track); }
        #gear-window .gw-tab-panel::-webkit-scrollbar-thumb  { background: var(--t-accent-dim); border-radius: 2px; }

        #gear-window .gw-tab-panel.active {
            display: flex;
            flex-direction: column;
        }

        /* ---- Worn tab ---- */
        #gw-worn {
            padding: 4px 6px;
            gap: 2px;
        }

        .gw-equip-row {
            display: flex;
            align-items: center;
            gap: 6px;
            min-height: 18px;
            border-bottom: 1px solid var(--t-border-faint);
            padding-bottom: 2px;
            cursor: pointer;
        }

        .gw-equip-row:last-child { border-bottom: none; }

        .gw-equip-row:hover { background: var(--t-bg-surface-alt); }

        .gw-equip-slot {
            width: 54px;
            font-size: 0.66em;
            color: var(--t-text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.03em;
            flex-shrink: 0;
        }

        .gw-equip-name {
            flex: 1;
            font-size: 0.76em;
            color: var(--t-text);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .gw-equip-name.empty  { color: var(--t-text-dim); font-style: italic; }
        .gw-equip-row.empty  { cursor: default; }
        .gw-equip-row.empty:hover { background: transparent; }
        .gw-equip-name.cursed { color: var(--t-cursed-text); }
        .gw-equip-name.quest  { color: var(--t-quest-text); }

        .gw-equip-badge {
            font-size: 0.58em;
            padding: 1px 3px;
            border-radius: 3px;
            flex-shrink: 0;
        }

        .gw-equip-badge.cursed { background:var(--t-cursed-badge-bg); color:var(--t-cursed-text); border:1px solid var(--t-cursed-badge-border); }
        .gw-equip-badge.quest  { background:var(--t-quest-badge-bg); color:var(--t-quest-text); border:1px solid var(--t-quest-badge-border); }
        .gw-equip-badge.uses   { background:var(--t-uses-badge-bg); color:var(--t-uses-badge-text); border:1px solid var(--t-uses-badge-border); }

        /* ---- Backpack tab ---- */
        #gw-backpack {
            padding: 4px 6px;
            gap: 3px;
        }

        #gw-bp-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 3px 2px 5px;
            border-bottom: 1px solid var(--t-border);
            margin-bottom: 2px;
            flex-shrink: 0;
        }

        #gw-bp-title {
            font-size: 0.68em;
            color: var(--t-text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }

        #gw-bp-count {
            font-size: 0.68em;
            color: var(--t-text-muted);
        }

        #gw-bp-count .gw-bp-count-num {
            color: var(--t-text);
        }

        #gw-bp-count .gw-bp-count-num.full {
            color: var(--t-cursed-text);
        }

        #gw-bp-list {
            display: flex;
            flex-direction: column;
            gap: 2px;
            flex: 1;
        }

        .gw-bp-empty {
            color: var(--t-text-dim);
            font-size: 0.78em;
            font-style: italic;
            text-align: center;
            padding: 12px 0;
        }

        .gw-bp-row {
            display: flex;
            align-items: center;
            gap: 6px;
            min-height: 18px;
            border-bottom: 1px solid var(--t-border-faint);
            padding-bottom: 2px;
            cursor: pointer;
            flex-shrink: 0;
        }

        .gw-bp-row:last-child { border-bottom: none; }

        .gw-bp-row:hover { background: var(--t-bg-surface-alt); }

        .gw-bp-type {
            width: 54px;
            font-size: 0.66em;
            color: var(--t-text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.03em;
            flex-shrink: 0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .gw-bp-name {
            flex: 1;
            font-size: 0.76em;
            color: var(--t-text);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .gw-bp-name.cursed { color: var(--t-cursed-text); }
        .gw-bp-name.quest  { color: var(--t-quest-text); }

        .gw-bp-badge {
            font-size: 0.58em;
            padding: 1px 3px;
            border-radius: 3px;
            flex-shrink: 0;
        }

        .gw-bp-badge.cursed { background:var(--t-cursed-badge-bg); color:var(--t-cursed-text); border:1px solid var(--t-cursed-badge-border); }
        .gw-bp-badge.quest  { background:var(--t-quest-badge-bg); color:var(--t-quest-text); border:1px solid var(--t-quest-badge-border); }
        .gw-bp-badge.uses   { background:var(--t-uses-badge-bg); color:var(--t-uses-badge-text); border:1px solid var(--t-uses-badge-border); }

        /* ---- Tooltip ---- */
        #gw-item-tooltip {
            position: fixed;
            z-index: 99999;
            pointer-events: none;
            background: var(--t-bg-surface);
            border: 1px solid var(--t-border-accent);
            border-radius: 6px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.7);
            padding: 8px 10px;
            min-width: 160px;
            max-width: 260px;
            display: none;
        }

        .gw-tt-name {
            font-size: 0.85em;
            font-weight: bold;
            color: var(--t-text);
            margin-bottom: 4px;
            line-height: 1.3;
        }

        .gw-tt-details {
            font-weight: normal;
            font-style: italic;
            color: var(--t-text-secondary);
        }

        .gw-tt-details.cursed { color: var(--t-cursed-text); }
        .gw-tt-details.quest  { color: var(--t-quest-text); }

        .gw-tt-divider {
            border: none;
            border-top: 1px solid var(--t-border-accent);
            margin: 5px 0;
        }

        .gw-tt-row {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            gap: 8px;
            font-size: 0.75em;
            line-height: 1.6;
        }

        .gw-tt-row-label {
            color: var(--t-text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.04em;
            font-size: 0.88em;
            flex-shrink: 0;
        }

        .gw-tt-row-value {
            color: var(--t-text);
            text-align: right;
        }

        .gw-tt-hint {
            font-size: 0.73em;
            color: var(--t-text-secondary);
            line-height: 1.4;
            font-style: italic;
        }

        .gw-tt-hint .gw-tt-cmd {
            font-style: normal;
            color: var(--t-accent);
            font-weight: bold;
        }
    `);

    // -----------------------------------------------------------------------
    // Data
    // -----------------------------------------------------------------------
    const EQUIP_SLOTS = [
        { key: 'head',    label: 'Head'    },
        { key: 'neck',    label: 'Neck'    },
        { key: 'body',    label: 'Body'    },
        { key: 'weapon',  label: 'Weapon'  },
        { key: 'offhand', label: 'Offhand' },
        { key: 'gloves',  label: 'Gloves'  },
        { key: 'belt',    label: 'Belt'    },
        { key: 'ring',    label: 'Ring'    },
        { key: 'legs',    label: 'Legs'    },
        { key: 'feet',    label: 'Feet'    },
    ];

    // -----------------------------------------------------------------------
    // Tooltip
    // -----------------------------------------------------------------------
    let tooltip   = null;
    let hideTimer = null;
    const rowItemData = new Map();

    function _itemHint(item) {
        const type    = (item.type    || '').toLowerCase();
        const subtype = (item.subtype || '').toLowerCase();
        const details = item.details || [];

        function cmd(name) {
            return '<span class="gw-tt-cmd">' + name + '</span>';
        }

        if (details.includes('quest'))    { return 'This is a quest item.'; }
        if (type === 'readable')          { return 'You should probably ' + cmd('read') + ' this.'; }
        if (subtype === 'drinkable')      { return 'You could probably ' + cmd('drink') + ' this.'; }
        if (subtype === 'edible')         { return 'You could probably ' + cmd('eat') + ' this.'; }
        if (type === 'lockpicks')         { return 'These are used with the ' + cmd('picklock') + ' command.'; }
        if (type === 'key')               { return 'When you find the right door, keys are added to your ' + cmd('keyring') + ' automatically.'; }
        if (subtype === 'wearable')       { return 'It looks like wearable ' + type + ' equipment.'; }
        if (type === 'weapon') {
            const handsDetail = details.find(d => d.endsWith('-handed'));
            const handsText   = handsDetail || '1-handed';
            if (subtype === 'shooting') { return 'A ' + handsText + ' ranged weapon. Can be fired into adjacent areas. (' + cmd('help shoot') + ')'; }
            if (subtype === 'claws')    { return 'A ' + handsText + ' claws weapon. Can be dual wielded without training.'; }
            return 'A ' + handsText + ' weapon.';
        }
        if (subtype === 'usable') { return 'You could probably ' + cmd('use') + ' this.'; }
        return null;
    }

    function ensureTooltip() {
        if (tooltip) { return; }
        tooltip = document.createElement('div');
        tooltip.id = 'gw-item-tooltip';
        document.body.appendChild(tooltip);
    }

    function showTooltip(rowEl, item) {
        ensureTooltip();
        clearTimeout(hideTimer);

        const details     = (item.details && item.details.length > 0) ? item.details.join(', ') : null;
        const detailClass = item.details && item.details.includes('cursed') ? 'cursed'
                          : item.details && item.details.includes('quest')  ? 'quest' : '';

        let html = '<div class="gw-tt-name">' + item.name;
        if (details) {
            html += ' <span class="gw-tt-details ' + detailClass + '">(' + details + ')</span>';
        }
        html += '</div>';

        const rows = [];
        if (item.type)     { rows.push({ label: 'Type',    value: item.type    }); }
        if (item.subtype)  { rows.push({ label: 'Subtype', value: item.subtype }); }
        if (item.uses > 0) { rows.push({ label: 'Uses',    value: item.uses    }); }

        if (rows.length > 0) {
            html += '<hr class="gw-tt-divider">';
            rows.forEach(r => {
                html += '<div class="gw-tt-row">' +
                    '<span class="gw-tt-row-label">' + r.label + '</span>' +
                    '<span class="gw-tt-row-value">' + r.value + '</span>' +
                '</div>';
            });
        }

        const hint = _itemHint(item);
        if (hint) {
            html += '<hr class="gw-tt-divider"><div class="gw-tt-hint">' + hint + '</div>';
        }

        tooltip.innerHTML = html;
        tooltip.style.display = 'block';
        positionTooltip(rowEl);
    }

    function positionTooltip(rowEl) {
        if (!tooltip) { return; }
        const rect = rowEl.getBoundingClientRect();
        const ttW  = tooltip.offsetWidth;
        const ttH  = tooltip.offsetHeight;
        const vw   = window.innerWidth;
        const vh   = window.innerHeight;
        let left = rect.right + 8;
        if (left + ttW > vw - 8) { left = rect.left - ttW - 8; }
        left = Math.max(8, left);
        let top = rect.top;
        if (top + ttH > vh - 8) { top = vh - ttH - 8; }
        tooltip.style.left = left + 'px';
        tooltip.style.top  = Math.max(8, top) + 'px';
    }

    function hideTooltip() {
        if (!tooltip) { return; }
        hideTimer = setTimeout(() => { tooltip.style.display = 'none'; }, 80);
    }

    function attachTooltip(rowEl) {
        rowEl.addEventListener('mouseenter', () => {
            const item = rowItemData.get(rowEl);
            if (item) { showTooltip(rowEl, item); }
        });
        rowEl.addEventListener('mouseleave', hideTooltip);
        rowEl.addEventListener('mousemove', () => {
            if (tooltip && tooltip.style.display === 'block') { positionTooltip(rowEl); }
        });
    }

    // -----------------------------------------------------------------------
    // Context menu helpers
    // -----------------------------------------------------------------------
    function _equipMenuItems(item) {
        if (!item || !item.name) { return null; }
        return [
            { label: 'look '   + item.name, cmd: 'look '   + item.name },
            { label: 'remove ' + item.name, cmd: 'remove ' + item.name },
        ];
    }

    function _backpackMenuItems(item) {
        if (!item || !item.name) { return null; }
        const type    = (item.type    || '').toLowerCase();
        const subtype = (item.subtype || '').toLowerCase();
        const cmds = [{ label: 'look ' + item.name, cmd: 'look ' + item.name }];
        if (type === 'weapon' || subtype === 'wearable') {
            cmds.push({ label: 'equip ' + item.name, cmd: 'equip ' + item.name });
        } else if (subtype === 'edible') {
            cmds.push({ label: 'eat '   + item.name, cmd: 'eat '   + item.name });
        } else if (subtype === 'drinkable') {
            cmds.push({ label: 'drink ' + item.name, cmd: 'drink ' + item.name });
        } else if (subtype === 'usable') {
            cmds.push({ label: 'use '   + item.name, cmd: 'use '   + item.name });
        } else if (subtype === 'throwable') {
            cmds.push({ label: 'throw ' + item.name, cmd: 'throw ' + item.name });
        } else if (type === 'readable') {
            cmds.push({ label: 'read '  + item.name, cmd: 'read '  + item.name });
        }
        return cmds;
    }

    // -----------------------------------------------------------------------
    // Tab switching
    // -----------------------------------------------------------------------
    function makeTabSwitcher(root) {
        const btns   = root.querySelectorAll('.gw-tab-btn');
        const panels = root.querySelectorAll('.gw-tab-panel');
        btns.forEach(btn => {
            btn.addEventListener('click', () => {
                btns.forEach(b   => b.classList.remove('active'));
                panels.forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                root.querySelector('#' + btn.dataset.panel).classList.add('active');
            });
        });
    }

    // -----------------------------------------------------------------------
    // DOM factory
    // -----------------------------------------------------------------------
    function buildEquipRows() {
        return EQUIP_SLOTS.map(s =>
            '<div class="gw-equip-row" id="gw-eqrow-' + s.key + '">' +
                '<span class="gw-equip-slot">' + s.label + '</span>' +
                '<span class="gw-equip-name empty" id="gw-eq-' + s.key + '">empty</span>' +
                '<span class="gw-equip-badge" id="gw-eqb-' + s.key + '" style="display:none"></span>' +
            '</div>'
        ).join('');
    }

    function createDOM() {
        const el = document.createElement('div');
        el.id = 'gear-window';
        el.innerHTML =
            '<div class="gw-tab-bar">' +
                '<button class="gw-tab-btn active" data-panel="gw-worn">Worn</button>' +
                '<button class="gw-tab-btn"        data-panel="gw-backpack">Backpack</button>' +
            '</div>' +

            '<div class="gw-tab-panel active" id="gw-worn">' +
                buildEquipRows() +
            '</div>' +

            '<div class="gw-tab-panel" id="gw-backpack">' +
                '<div id="gw-bp-header">' +
                    '<span id="gw-bp-title">Carried Items</span>' +
                    '<span id="gw-bp-count"><span class="gw-bp-count-num" id="gw-bp-num">0</span> / <span id="gw-bp-max">\u2014</span></span>' +
                '</div>' +
                '<div id="gw-bp-list"><div class="gw-bp-empty">Empty</div></div>' +
            '</div>';

        document.body.appendChild(el);
        makeTabSwitcher(el);

        EQUIP_SLOTS.forEach(s => {
            const rowEl = el.querySelector('#gw-eqrow-' + s.key);
            if (!rowEl) { return; }
            attachTooltip(rowEl);
            rowEl.addEventListener('click', function(e) {
                const menuItems = _equipMenuItems(rowItemData.get(rowEl));
                if (menuItems) { uiMenu(e, menuItems); }
            });
        });

        return el;
    }

    // -----------------------------------------------------------------------
    // VirtualWindow
    // -----------------------------------------------------------------------
    const win = new VirtualWindow('Gear', {
        dock:          'left',
        defaultDocked: true,
        dockedHeight:  270,
        factory() {
            const el = createDOM();
            return {
                title:      'Gear',
                mount:      el,
                background: 'var(--t-bg)',
                border:     1,
                x:          0,
                y:          0,
                width:      300,
                height:     280,
                header:     20,
                bottom:     60,
            };
        },
    });

    // -----------------------------------------------------------------------
    // Update functions
    // -----------------------------------------------------------------------
    function updateWorn() {
        const inv = Client.GMCPStructs.Char && Client.GMCPStructs.Char.Inventory;
        if (!inv || !inv.Worn) { return; }

        const worn = inv.Worn;
        EQUIP_SLOTS.forEach(slot => {
            const item    = worn[slot.key];
            const rowEl   = document.getElementById('gw-eqrow-' + slot.key);
            const nameEl  = document.getElementById('gw-eq-'    + slot.key);
            const badgeEl = document.getElementById('gw-eqb-'   + slot.key);
            if (!rowEl || !nameEl || !badgeEl) { return; }

            if (!item || !item.name || item.name === '-nothing-') {
                nameEl.textContent = item && item.name === '-nothing-' ? '-nothing-' : 'empty';
                nameEl.className   = 'gw-equip-name empty';
                badgeEl.style.display = 'none';
                rowEl.classList.add('empty');
                rowItemData.delete(rowEl);
                return;
            }

            rowEl.classList.remove('empty');
            rowItemData.set(rowEl, item);

            const isCursed = item.details && item.details.includes('cursed');
            const isQuest  = item.details && item.details.includes('quest');

            nameEl.textContent = item.name;
            nameEl.className   = 'gw-equip-name' + (isCursed ? ' cursed' : isQuest ? ' quest' : '');

            if (isCursed) {
                badgeEl.textContent = 'cursed'; badgeEl.className = 'gw-equip-badge cursed'; badgeEl.style.display = '';
            } else if (isQuest) {
                badgeEl.textContent = 'quest';  badgeEl.className = 'gw-equip-badge quest';  badgeEl.style.display = '';
            } else if (item.uses > 0) {
                badgeEl.textContent = item.uses + 'x'; badgeEl.className = 'gw-equip-badge uses'; badgeEl.style.display = '';
            } else {
                badgeEl.style.display = 'none';
            }
        });
    }

    function updateBackpack() {
        const inv = Client.GMCPStructs.Char && Client.GMCPStructs.Char.Inventory;
        if (!inv || !inv.Backpack) { return; }

        const bp      = inv.Backpack;
        const items   = bp.items   || [];
        const summary = bp.Summary || {};
        const count   = summary.count !== undefined ? summary.count : items.length;
        const max     = summary.max   || 0;

        const numEl = document.getElementById('gw-bp-num');
        const maxEl = document.getElementById('gw-bp-max');
        if (numEl) {
            numEl.textContent = count;
            numEl.classList.toggle('full', max > 0 && count >= max);
        }
        if (maxEl) { maxEl.textContent = max || '\u2014'; }

        const list = document.getElementById('gw-bp-list');
        if (!list) { return; }

        list.querySelectorAll('.gw-bp-row').forEach(r => rowItemData.delete(r));
        list.innerHTML = '';

        if (items.length === 0) {
            list.innerHTML = '<div class="gw-bp-empty">Empty</div>';
            return;
        }

        const sorted = [...items].sort((a, b) => {
            const aq = a.details && a.details.includes('quest');
            const bq = b.details && b.details.includes('quest');
            if (aq !== bq) { return aq ? -1 : 1; }
            const ac = a.details && a.details.includes('cursed');
            const bc = b.details && b.details.includes('cursed');
            if (ac !== bc) { return ac ? -1 : 1; }
            return (a.name || '').localeCompare(b.name || '');
        });

        sorted.forEach(item => {
            const isCursed = item.details && item.details.includes('cursed');
            const isQuest  = item.details && item.details.includes('quest');

            const row = document.createElement('div');
            row.className = 'gw-bp-row';

            const typeEl = document.createElement('span');
            typeEl.className   = 'gw-bp-type';
            typeEl.textContent = item.type || '';

            const nameEl = document.createElement('span');
            nameEl.className   = 'gw-bp-name' + (isCursed ? ' cursed' : isQuest ? ' quest' : '');
            nameEl.textContent = item.name || '';

            const badgeEl = document.createElement('span');
            badgeEl.className = 'gw-bp-badge';
            if (isCursed) {
                badgeEl.textContent = 'cursed'; badgeEl.classList.add('cursed');
            } else if (isQuest) {
                badgeEl.textContent = 'quest';  badgeEl.classList.add('quest');
            } else if (item.uses > 0) {
                badgeEl.textContent = item.uses + 'x'; badgeEl.classList.add('uses');
            } else {
                badgeEl.style.display = 'none';
            }

            row.appendChild(typeEl);
            row.appendChild(nameEl);
            row.appendChild(badgeEl);
            list.appendChild(row);

            rowItemData.set(row, item);
            attachTooltip(row);
            row.addEventListener('click', function(e) {
                const menuItems = _backpackMenuItems(rowItemData.get(row));
                if (menuItems) { uiMenu(e, menuItems); }
            });
        });
    }

    function update() {
        win.open();
        if (!win.isOpen()) { return; }
        updateWorn();
        updateBackpack();
    }

    // -----------------------------------------------------------------------
    // Registration
    // -----------------------------------------------------------------------
    VirtualWindows.register({
        window:       win,
        gmcpHandlers: ['Char.Inventory', 'Char.Inventory.Backpack', 'Char'],
        onGMCP() { update(); },
    });

})();
