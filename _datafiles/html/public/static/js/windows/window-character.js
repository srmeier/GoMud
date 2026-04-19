/* global Client, VirtualWindow, VirtualWindows, injectStyles */

/**
 * window-character.js
 *
 * Virtual window: Character — left dock, tabbed.
 *
 * Tabs:
 *   Overview — name, race/class, level, alignment, stats grid, point badges
 *   Quests   — in-progress quest log, click to expand
 *   Skills   — learned skills with levels and max indicator
 *   Jobs     — profession completion and proficiency
 *   Effects  — active buffs/debuffs with duration bars
 *
 * Responds to GMCP namespaces:
 *   Char         — full character update
 *   Char.Info    — name, race, class, level, alignment, skill/training points
 *   Char.Stats   — six core stats
 *   Char.Quests  — quest progress
 *   Char.Skills  — skill names, levels, max flag
 *   Char.Jobs    — profession completion and proficiency
 *   Char.Affects — active buffs/debuffs
 *
 * Reads:
 *   Client.GMCPStructs.Char.Info
 *   Client.GMCPStructs.Char.Stats
 *   Client.GMCPStructs.Char.Quests
 *   Client.GMCPStructs.Char.Skills
 *   Client.GMCPStructs.Char.Jobs
 *   Client.GMCPStructs.Char.Affects
 */

'use strict';

(function() {

    injectStyles(`
        /* ---- shared tab chrome ---- */
        #character-window {
            height: 100%;
            display: flex;
            flex-direction: column;
            background: #1e1e1e;
        }

        #character-window .cw-tab-bar {
            display: flex;
            flex-shrink: 0;
            border-bottom: 1px solid #0f3333;
        }

        #character-window .cw-tab-btn {
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

        #character-window .cw-tab-btn:last-child {
            border-right: none;
        }

        #character-window .cw-tab-btn:hover {
            background: #0f3333;
            color: #dffbd1;
        }

        #character-window .cw-tab-btn.active {
            background: #1e1e1e;
            color: #dffbd1;
            border-bottom: 2px solid #3ad4b8;
        }

        #character-window .cw-tab-panel {
            display: none;
            flex: 1;
            overflow-y: auto;
        }

        #character-window .cw-tab-panel::-webkit-scrollbar       { width: 4px; }
        #character-window .cw-tab-panel::-webkit-scrollbar-track  { background: #111; }
        #character-window .cw-tab-panel::-webkit-scrollbar-thumb  { background: #1c6b60; border-radius: 2px; }

        #character-window .cw-tab-panel.active {
            display: flex;
            flex-direction: column;
        }

        /* ---- Overview tab ---- */
        #cw-overview {
            padding: 8px 10px;
            gap: 5px;
        }

        #cw-char-name {
            font-size: 0.88em;
            color: #dffbd1;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        #cw-char-name .cw-char-race {
            cursor: help;
        }

        #cw-char-name .cw-char-race:hover {
            color: #3ad4b8;
        }

        #cw-char-level {
            font-size: 0.74em;
            color: #aaa;
        }

        #cw-char-alignment {
            font-size: 0.7em;
            font-style: italic;
            margin-bottom: 2px;
        }

        .cw-align-good    { color: #7ecfff; }
        .cw-align-neutral { color: #666;    }
        .cw-align-evil    { color: #e06060; }

        /* ---- Stats grid (inside Overview) ---- */
        #cw-stats-grid {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 3px 6px;
            padding: 4px 0 2px;
            border-top: 1px solid #0f3333;
            border-bottom: 1px solid #0f3333;
        }

        /* ---- Points row (below stats grid) ---- */
        #cw-points-row {
            display: flex;
            gap: 6px;
            padding: 4px 0 2px;
            border-bottom: 1px solid #0f3333;
        }

        .cw-point-badge {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 2px 6px;
            background: #0d2e28;
            border: 1px solid #1c6b60;
            border-radius: 3px;
            cursor: help;
            gap: 4px;
        }

        .cw-point-badge:hover {
            background: #0f3333;
        }

        .cw-point-badge-label {
            font-size: 0.62em;
            color: #7ab8a0;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            white-space: nowrap;
        }

        .cw-point-badge-value {
            font-size: 0.8em;
            color: #dffbd1;
            font-weight: bold;
        }

        .cw-point-badge.has-points {
            border-color: #3ad4b8;
            background: #0d3d35;
        }

        .cw-point-badge.has-points .cw-point-badge-value {
            color: #3ad4b8;
        }

        .cw-stat-cell {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            gap: 3px;
            cursor: help;
        }

        .cw-stat-cell:hover .cw-stat-abbr,
        .cw-stat-cell:hover .cw-stat-num {
            color: #3ad4b8;
        }

        .cw-stat-abbr {
            font-size: 0.64em;
            color: #7ab8a0;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            flex-shrink: 0;
        }

        .cw-stat-num {
            font-size: 0.78em;
            color: #dffbd1;
            font-weight: bold;
        }

        .cw-stat-mod {
            font-size: 0.68em;
            color: #7ab8a0;
            font-weight: normal;
            cursor: help;
        }

        #cw-stat-tooltip {
            position: fixed;
            z-index: 99999;
            pointer-events: none;
            background: #0d2e28;
            border: 1px solid #1c6b60;
            border-radius: 6px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.7);
            padding: 6px 9px;
            font-size: 0.75em;
            color: #7ab8a0;
            font-style: italic;
            max-width: 200px;
            display: none;
        }

        /* ---- Quests tab ---- */
        #cw-quests {
            padding: 4px 6px;
            gap: 5px;
        }

        #cw-quests .cq-empty {
            color: #444;
            font-size: 0.78em;
            font-style: italic;
            text-align: center;
            padding: 12px 0;
        }

        #cw-quests .cq-item {
            background: #0a1e1a;
            border: 1px solid #1c6b60;
            border-radius: 4px;
            padding: 5px 7px;
            display: flex;
            flex-direction: column;
            gap: 4px;
            cursor: pointer;
            transition: background 0.15s;
            flex-shrink: 0;
        }

        #cw-quests .cq-item:hover,
        #cw-quests .cq-item.expanded {
            background: #0d2e28;
        }

        #cw-quests .cq-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 6px;
        }

        #cw-quests .cq-name {
            font-size: 0.82em;
            color: #dffbd1;
            font-weight: bold;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        #cw-quests .cq-pct {
            font-size: 0.7em;
            color: #7ab8a0;
            flex-shrink: 0;
        }

        #cw-quests .cq-bar-track {
            width: 100%;
            height: 5px;
            background: #1a1a1a;
            border-radius: 3px;
            overflow: hidden;
            border: 1px solid #1a2e28;
        }

        #cw-quests .cq-bar-fill {
            height: 100%;
            border-radius: 3px;
            background: linear-gradient(to right, #1c6b60, #3ad4b8);
            transition: width 0.4s ease-out;
        }

        #cw-quests .cq-item.complete {
            background: #060e0c;
            border-color: #1a3a30;
            opacity: 0.6;
        }

        #cw-quests .cq-item.complete:hover,
        #cw-quests .cq-item.complete.expanded {
            opacity: 1;
            background: #0a1e1a;
        }

        #cw-quests .cq-item.complete .cq-name {
            color: #7ab8a0;
            text-decoration: line-through;
        }

        #cw-quests .cq-item.complete .cq-pct {
            color: #3ad4b8;
            font-weight: bold;
        }

        #cw-quests .cq-bar-fill.complete {
            background: #3ad4b8;
        }

        #cw-quests .cq-desc {
            font-size: 0.73em;
            color: #7ab8a0;
            line-height: 1.4;
            display: none;
            padding-top: 2px;
            border-top: 1px solid #0f3333;
        }

        #cw-quests .cq-item.expanded .cq-desc {
            display: block;
        }

        /* ---- Skills tab ---- */
        #cw-skills {
            padding: 4px 6px;
            gap: 3px;
        }

        #cw-skills .csk-empty {
            color: #444;
            font-size: 0.78em;
            font-style: italic;
            text-align: center;
            padding: 12px 0;
        }

        .csk-row {
            display: flex;
            align-items: center;
            gap: 6px;
            min-height: 20px;
            border-bottom: 1px solid #0a1a16;
            padding: 3px 2px;
            flex-shrink: 0;
        }

        .csk-row:last-child { border-bottom: none; }

        .csk-name {
            flex: 1;
            font-size: 0.78em;
            color: #dffbd1;
            text-transform: capitalize;
        }

        .csk-pips {
            display: flex;
            gap: 3px;
            flex-shrink: 0;
        }

        .csk-pip {
            width: 9px;
            height: 9px;
            border-radius: 2px;
            border: 1px solid #1c6b60;
            background: #0a1e1a;
        }

        .csk-pip.filled {
            background: #3ad4b8;
            border-color: #3ad4b8;
        }

        .csk-pip.filled.max {
            background: #d4a843;
            border-color: #d4a843;
        }

        .csk-badge {
            font-size: 0.58em;
            padding: 1px 4px;
            border-radius: 3px;
            flex-shrink: 0;
            background: #2e2000;
            color: #d4a843;
            border: 1px solid #6b5010;
        }

        /* ---- Jobs tab ---- */
        #cw-jobs {
            padding: 4px 6px;
            gap: 5px;
        }

        #cw-jobs .cjb-empty {
            color: #444;
            font-size: 0.78em;
            font-style: italic;
            text-align: center;
            padding: 12px 0;
        }

        .cjb-item {
            background: #0a1e1a;
            border: 1px solid #1c6b60;
            border-radius: 4px;
            padding: 5px 7px;
            display: flex;
            flex-direction: column;
            gap: 4px;
            flex-shrink: 0;
        }

        .cjb-header {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            gap: 6px;
        }

        .cjb-name {
            font-size: 0.82em;
            color: #dffbd1;
            font-weight: bold;
            text-transform: capitalize;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .cjb-meta {
            display: flex;
            align-items: center;
            gap: 5px;
            flex-shrink: 0;
        }

        .cjb-proficiency {
            font-size: 0.68em;
            color: #7ab8a0;
            text-transform: capitalize;
        }

        .cjb-pct {
            font-size: 0.7em;
            color: #7ab8a0;
        }

        .cjb-bar-track {
            width: 100%;
            height: 5px;
            background: #1a1a1a;
            border-radius: 3px;
            overflow: hidden;
            border: 1px solid #1a2e28;
        }

        .cjb-bar-fill {
            height: 100%;
            border-radius: 3px;
            background: linear-gradient(to right, #1c6b60, #3ad4b8);
            transition: width 0.4s ease-out;
        }

        .cjb-item.complete .cjb-name {
            color: #d4a843;
        }

        .cjb-item.complete .cjb-pct {
            color: #d4a843;
            font-weight: bold;
        }

        .cjb-bar-fill.complete {
            background: #d4a843;
        }

        /* ---- Effects tab ---- */
        #cw-effects {
            padding: 4px 6px;
            gap: 4px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            align-content: flex-start;
        }

        .cw-affect-empty {
            grid-column: 1 / -1;
            color: #444;
            font-size: 0.76em;
            font-style: italic;
            text-align: center;
            padding: 14px 0;
        }

        .cw-affect-item {
            background: #0a1e1a;
            border: 1px solid #1c6b60;
            border-radius: 4px;
            padding: 4px 6px;
            display: flex;
            flex-direction: column;
            gap: 3px;
            min-width: 0;
            box-sizing: border-box;
        }

        .cw-affect-item.debuff {
            border-color: #6b1c1c;
            background: #1e0a0a;
        }

        .cw-affect-header {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            gap: 4px;
        }

        .cw-affect-name {
            font-size: 0.5em;
            color: #dffbd1;
            font-weight: bold;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .cw-affect-item.debuff .cw-affect-name { color: #f4a0a0; }

        .cw-affect-source {
            font-size: 0.63em;
            color: #7ab8a0;
            white-space: nowrap;
            flex-shrink: 0;
        }

        .cw-affect-item.debuff .cw-affect-source { color: #b87a7a; }

        .cw-affect-mods {
            font-size: 0.66em;
            color: #7ab8a0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .cw-affect-item.debuff .cw-affect-mods { color: #b87a7a; }

        .cw-affect-dur-track {
            width: 100%;
            height: 4px;
            background: #1a1a1a;
            border-radius: 2px;
            overflow: hidden;
        }

        .cw-affect-dur-fill {
            height: 100%;
            border-radius: 2px;
            background: #1c6b60;
            transition: width 1s linear;
        }

        .cw-affect-item.debuff .cw-affect-dur-fill { background: #6b1c1c; }

        .cw-affect-dur-fill.permanent {
            background: #3ad4b8;
            width: 100% !important;
        }

        .cw-affect-item.debuff .cw-affect-dur-fill.permanent { background: #d43a3a; }
    `);

    // -----------------------------------------------------------------------
    // Stat tooltip
    // -----------------------------------------------------------------------
    let statTooltip   = null;
    let statHideTimer = null;

    function ensureStatTooltip() {
        if (statTooltip) { return; }
        statTooltip = document.createElement('div');
        statTooltip.id = 'cw-stat-tooltip';
        document.body.appendChild(statTooltip);
    }

    function showStatTooltip(el, text) {
        ensureStatTooltip();
        clearTimeout(statHideTimer);
        statTooltip.textContent = text;
        statTooltip.style.display = 'block';
        const rect = el.getBoundingClientRect();
        const ttW  = statTooltip.offsetWidth;
        const ttH  = statTooltip.offsetHeight;
        const vw   = window.innerWidth;
        const vh   = window.innerHeight;
        let left = rect.right + 8;
        if (left + ttW > vw - 8) { left = rect.left - ttW - 8; }
        left = Math.max(8, left);
        let top = rect.top;
        if (top + ttH > vh - 8) { top = vh - ttH - 8; }
        statTooltip.style.left = Math.max(8, top) + 'px';
        statTooltip.style.left = left + 'px';
        statTooltip.style.top  = Math.max(8, top) + 'px';
    }

    function hideStatTooltip() {
        if (!statTooltip) { return; }
        statHideTimer = setTimeout(() => { statTooltip.style.display = 'none'; }, 80);
    }

    // -----------------------------------------------------------------------
    // Tab switching
    // -----------------------------------------------------------------------
    function makeTabSwitcher(root) {
        const btns   = root.querySelectorAll('.cw-tab-btn');
        const panels = root.querySelectorAll('.cw-tab-panel');
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
    // Data definitions
    // -----------------------------------------------------------------------
    const STAT_DEFS = [
        { key: 'strength',   abbr: 'STR' },
        { key: 'speed',      abbr: 'SPD' },
        { key: 'smarts',     abbr: 'SMT' },
        { key: 'vitality',   abbr: 'VIT' },
        { key: 'mysticism',  abbr: 'MYS' },
        { key: 'perception', abbr: 'PER' },
    ];

    // -----------------------------------------------------------------------
    // DOM factory
    // -----------------------------------------------------------------------
    function buildStatsGrid() {
        const cells = STAT_DEFS.map(d =>
            '<div class="cw-stat-cell">' +
                '<span class="cw-stat-abbr">' + d.abbr + '</span>' +
                '<span class="cw-stat-num" id="cw-stat-' + d.key + '">\u2014</span>' +
                '<span class="cw-stat-mod" id="cw-stat-mod-' + d.key + '" style="display:none"></span>' +
            '</div>'
        ).join('');
        const pointsRow =
            '<div id="cw-points-row">' +
                '<div class="cw-point-badge" id="cw-badge-sp">' +
                    '<span class="cw-point-badge-label">Skill Pts</span>' +
                    '<span class="cw-point-badge-value" id="cw-sp">\u2014</span>' +
                '</div>' +
                '<div class="cw-point-badge" id="cw-badge-tp">' +
                    '<span class="cw-point-badge-label">Train Pts</span>' +
                    '<span class="cw-point-badge-value" id="cw-tp">\u2014</span>' +
                '</div>' +
            '</div>';
        return '<div id="cw-stats-grid">' + cells + '</div>' + pointsRow;
    }

    function createDOM() {
        const el = document.createElement('div');
        el.id = 'character-window';
        el.innerHTML =
            '<div class="cw-tab-bar">' +
                '<button class="cw-tab-btn active" data-panel="cw-overview">Overview</button>' +
                '<button class="cw-tab-btn"        data-panel="cw-quests">Quests</button>' +
                '<button class="cw-tab-btn"        data-panel="cw-skills">Skills</button>' +
                '<button class="cw-tab-btn"        data-panel="cw-jobs">Jobs</button>' +
                '<button class="cw-tab-btn"        data-panel="cw-effects">Effects</button>' +
            '</div>' +

            '<div class="cw-tab-panel active" id="cw-overview">' +
                '<div id="cw-char-name">\u2014</div>' +
                '<div id="cw-char-level">Level \u2014</div>' +
                '<div id="cw-char-alignment"></div>' +
                buildStatsGrid() +
            '</div>' +

            '<div class="cw-tab-panel" id="cw-quests">' +
                '<div class="cq-empty">No active quests</div>' +
            '</div>' +

            '<div class="cw-tab-panel" id="cw-skills">' +
                '<div class="csk-empty">No skills learned</div>' +
            '</div>' +

            '<div class="cw-tab-panel" id="cw-jobs">' +
                '<div class="cjb-empty">No job progress</div>' +
            '</div>' +

            '<div class="cw-tab-panel" id="cw-effects">' +
                '<div class="cw-affect-empty">No active effects</div>' +
            '</div>';

        document.body.appendChild(el);
        makeTabSwitcher(el);

        STAT_DEFS.forEach(d => {
            const cell  = el.querySelector('.cw-stat-cell:has(#cw-stat-' + d.key + ')');
            if (cell) {
                cell.addEventListener('click', () => Client.GMCPRequest('Help ' + d.key));
            }
            const modEl = el.querySelector('#cw-stat-mod-' + d.key);
            if (modEl) {
                modEl.addEventListener('mouseenter', () => showStatTooltip(modEl, 'How much of this stat is due to equipment, buffs and pets.'));
                modEl.addEventListener('mouseleave', hideStatTooltip);
            }
        });

        const spBadge = el.querySelector('#cw-badge-sp');
        if (spBadge) { spBadge.addEventListener('click', () => Client.GMCPRequest('Help stat-train')); }
        const tpBadge = el.querySelector('#cw-badge-tp');
        if (tpBadge) { tpBadge.addEventListener('click', () => Client.GMCPRequest('Help train')); }

        return el;
    }

    // -----------------------------------------------------------------------
    // VirtualWindow
    // -----------------------------------------------------------------------
    const win = new VirtualWindow('Character', {
        dock:          'left',
        defaultDocked: true,
        dockedHeight:  200,
        factory() {
            const el = createDOM();
            return {
                title:      'Character',
                mount:      el,
                background: '#1e1e1e',
                border:     1,
                x:          0,
                y:          0,
                width:      300,
                height:     180,
                header:     20,
                bottom:     60,
            };
        },
    });

    // -----------------------------------------------------------------------
    // Update functions
    // -----------------------------------------------------------------------
    function updateOverview() {
        const info = Client.GMCPStructs.Char && Client.GMCPStructs.Char.Info;
        if (!info) { return; }

        const nameEl = document.getElementById('cw-char-name');
        nameEl.innerHTML = '';

        const parts = [info.name, info.class].filter(Boolean);
        if (parts.length) {
            nameEl.appendChild(document.createTextNode(parts.join(' \u00b7 ')));
        }

        if (info.race) {
            if (parts.length) {
                nameEl.appendChild(document.createTextNode(' \u00b7 '));
            }
            const raceSpan = document.createElement('span');
            raceSpan.className   = 'cw-char-race';
            raceSpan.textContent = info.race;
            raceSpan.addEventListener('click', () => {
                Client.GMCPRequest('Help race ' + info.race.toLowerCase());
            });
            nameEl.appendChild(raceSpan);
        }

        if (!nameEl.textContent) {
            nameEl.textContent = '\u2014';
        }

        document.getElementById('cw-char-level').textContent = info.level ? 'Level ' + info.level : 'Level \u2014';

        const alignEl = document.getElementById('cw-char-alignment');
        alignEl.textContent = info.alignment || '';
        const a = (info.alignment || '').toLowerCase();
        alignEl.className = 'cw-char-alignment ' +
            (a.includes('good') ? 'cw-align-good' : a.includes('evil') ? 'cw-align-evil' : 'cw-align-neutral');

        const sp      = info.skillpoints    || 0;
        const tp      = info.trainingpoints || 0;
        const spEl    = document.getElementById('cw-sp');
        const tpEl    = document.getElementById('cw-tp');
        const spBadge = document.getElementById('cw-badge-sp');
        const tpBadge = document.getElementById('cw-badge-tp');
        if (spEl)    { spEl.textContent = sp; }
        if (tpEl)    { tpEl.textContent = tp; }
        if (spBadge) { spBadge.classList.toggle('has-points', sp > 0); }
        if (tpBadge) { tpBadge.classList.toggle('has-points', tp > 0); }
    }

    function updateStats() {
        const stats = Client.GMCPStructs.Char && Client.GMCPStructs.Char.Stats;
        if (!stats) { return; }

        STAT_DEFS.forEach(def => {
            const el = document.getElementById('cw-stat-' + def.key);
            if (el) { el.textContent = stats[def.key] || '\u2014'; }

            const mod   = stats[def.key + 'mod'];
            const modEl = document.getElementById('cw-stat-mod-' + def.key);
            if (modEl) {
                if (mod) {
                    modEl.textContent   = '(' + mod + ')';
                    modEl.style.display = '';
                } else {
                    modEl.style.display = 'none';
                }
            }
        });
    }

    function updateSkills() {
        const skillList = Client.GMCPStructs.Char && Client.GMCPStructs.Char.Skills;
        const panel = document.getElementById('cw-skills');
        if (!panel) { return; }

        if (!Array.isArray(skillList) || skillList.length === 0) {
            panel.innerHTML = '<div class="csk-empty">No skills learned</div>';
            return;
        }

        const sorted = [...skillList].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        panel.innerHTML = '';

        sorted.forEach(function(skill) {
            const level   = skill.level   || 0;
            const isMax   = skill.maximum || false;
            const MAX_LVL = 4;

            const row = document.createElement('div');
            row.className = 'csk-row';
            row.style.cursor = 'help';

            const nameEl = document.createElement('span');
            nameEl.className   = 'csk-name';
            nameEl.textContent = skill.name || '';

            const pipsEl = document.createElement('span');
            pipsEl.className = 'csk-pips';
            for (var i = 1; i <= MAX_LVL; i++) {
                const pip = document.createElement('span');
                pip.className = 'csk-pip' + (i <= level ? ' filled' + (isMax ? ' max' : '') : '');
                pipsEl.appendChild(pip);
            }

            row.appendChild(nameEl);
            row.appendChild(pipsEl);

            if (isMax) {
                const badge = document.createElement('span');
                badge.className   = 'csk-badge';
                badge.textContent = 'MAX';
                row.appendChild(badge);
            }

            row.addEventListener('click', function() {
                Client.GMCPRequest('Help ' + (skill.name || '').toLowerCase().replace(/\s+/g, '-'));
            });
            panel.appendChild(row);
        });
    }

    function updateJobs() {
        const jobs  = Client.GMCPStructs.Char && Client.GMCPStructs.Char.Jobs;
        const panel = document.getElementById('cw-jobs');
        if (!panel) { return; }

        if (!Array.isArray(jobs) || jobs.length === 0) {
            panel.innerHTML = '<div class="cjb-empty">No job progress</div>';
            return;
        }

        const sorted = [...jobs].sort(function(a, b) {
            if (b.completion !== a.completion) { return b.completion - a.completion; }
            return (a.name || '').localeCompare(b.name || '');
        });

        panel.innerHTML = '';

        sorted.forEach(function(job) {
            const pct      = Math.max(0, Math.min(100, job.completion || 0));
            const complete = pct >= 100;

            const item = document.createElement('div');
            item.className    = 'cjb-item' + (complete ? ' complete' : '');
            item.style.cursor = 'help';
            item.innerHTML =
                '<div class="cjb-header">' +
                    '<span class="cjb-name">' + (job.name || '') + '</span>' +
                    '<div class="cjb-meta">' +
                        '<span class="cjb-proficiency">' + (job.proficiency || '') + '</span>' +
                        '<span class="cjb-pct">' + pct + '%</span>' +
                    '</div>' +
                '</div>' +
                '<div class="cjb-bar-track">' +
                    '<div class="cjb-bar-fill' + (complete ? ' complete' : '') + '" style="width:' + pct + '%"></div>' +
                '</div>';

            item.addEventListener('click', function() {
                Client.GMCPRequest('Help ' + (job.name || '').toLowerCase().replace(/\s+/g, '-'));
            });
            panel.appendChild(item);
        });
    }

    function updateQuests() {
        const quests = Client.GMCPStructs.Char && Client.GMCPStructs.Char.Quests;
        const panel  = document.getElementById('cw-quests');
        if (!panel) { return; }

        const expanded = new Set();
        panel.querySelectorAll('.cq-item.expanded').forEach(el => {
            expanded.add(el.dataset.questName);
        });

        panel.innerHTML = '';

        if (!Array.isArray(quests) || quests.length === 0) {
            panel.innerHTML = '<div class="cq-empty">No active quests</div>';
            return;
        }

        const sorted = [...quests].sort((a, b) => {
            const ac = (a.completion || 0) >= 100;
            const bc = (b.completion || 0) >= 100;
            if (ac !== bc) { return ac ? 1 : -1; }
            if (a.completion !== b.completion) { return a.completion - b.completion; }
            return (a.name || '').localeCompare(b.name || '');
        });

        sorted.forEach(q => {
            const pct        = Math.max(0, Math.min(100, q.completion || 0));
            const complete   = pct >= 100;
            const isExpanded = expanded.has(q.name);

            const item = document.createElement('div');
            item.className       = 'cq-item' + (complete ? ' complete' : '') + (isExpanded ? ' expanded' : '');
            item.dataset.questName = q.name || '';
            item.innerHTML =
                '<div class="cq-header">' +
                    '<span class="cq-name">' + (q.name || 'Unknown Quest') + '</span>' +
                    '<span class="cq-pct">' + (complete ? 'Complete' : pct + '%') + '</span>' +
                '</div>' +
                '<div class="cq-bar-track">' +
                    '<div class="cq-bar-fill' + (complete ? ' complete' : '') + '" style="width:' + pct + '%"></div>' +
                '</div>' +
                '<div class="cq-desc">' + (q.description || '') + '</div>';

            item.addEventListener('click', () => item.classList.toggle('expanded'));
            panel.appendChild(item);
        });
    }

    function _isDebuff(mods) {
        if (!mods) { return false; }
        return Object.values(mods).some(v => v < 0);
    }

    function _formatMods(mods) {
        if (!mods || Object.keys(mods).length === 0) { return ''; }
        return Object.entries(mods)
            .map(([k, v]) => (v >= 0 ? '+' : '') + v + ' ' + k)
            .join('  ');
    }

    function updateEffects() {
        const affects = Client.GMCPStructs.Char && Client.GMCPStructs.Char.Affects;
        const panel   = document.getElementById('cw-effects');
        if (!panel || !affects) { return; }

        panel.innerHTML = '';

        const keys = Object.keys(affects);
        if (keys.length === 0) {
            panel.innerHTML = '<div class="cw-affect-empty">No active effects</div>';
            return;
        }

        keys.sort((a, b) => {
            const da = _isDebuff(affects[a].affects);
            const db = _isDebuff(affects[b].affects);
            if (da !== db) { return da ? 1 : -1; }
            const pa = affects[a].duration_max === -1;
            const pb = affects[b].duration_max === -1;
            if (pa !== pb) { return pa ? 1 : -1; }
            return a.localeCompare(b);
        });

        keys.forEach(key => {
            const aff     = affects[key];
            const debuff  = _isDebuff(aff.affects);
            const perma   = aff.duration_max === -1;
            const modText = _formatMods(aff.affects);

            let durPct = 100;
            if (!perma && aff.duration_max > 0) {
                durPct = Math.max(0, Math.min(100, Math.round((aff.duration_cur / aff.duration_max) * 100)));
            }

            const item = document.createElement('div');
            item.className = 'cw-affect-item' + (debuff ? ' debuff' : '');
            item.innerHTML =
                '<div class="cw-affect-header">' +
                    '<span class="cw-affect-name">' + (aff.name || key) + '</span>' +
                    '<span class="cw-affect-source">' + (aff.type || '') + '</span>' +
                '</div>' +
                (modText ? '<div class="cw-affect-mods">' + modText + '</div>' : '') +
                '<div class="cw-affect-dur-track">' +
                    '<div class="cw-affect-dur-fill' + (perma ? ' permanent' : '') + '" style="width:' + durPct + '%"></div>' +
                '</div>';

            panel.appendChild(item);
        });
    }

    function update() {
        win.open();
        if (!win.isOpen()) { return; }
        updateOverview();
        updateStats();
        updateQuests();
        updateSkills();
        updateJobs();
        updateEffects();
    }

    // -----------------------------------------------------------------------
    // Registration
    // -----------------------------------------------------------------------
    VirtualWindows.register({
        window:       win,
        gmcpHandlers: ['Char.Info', 'Char.Stats', 'Char.Quests', 'Char.Skills', 'Char.Jobs', 'Char.Affects', 'Char'],
        onGMCP() { update(); },
    });

})();
