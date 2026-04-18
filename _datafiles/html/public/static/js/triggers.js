/* jshint evil: true */
const Triggers = (() => {

    const STORAGE_KEY = 'triggers';

    // -----------------------------------------------------------------------
    // FX catalogue — drives both execution and the editor UI.
    // params: array of { key, label, type, default }
    //   type: 'number' | 'color'
    // -----------------------------------------------------------------------
    const FX_DEFS = [
        // Particles
        {
            name: 'Confetti', group: 'Particles',
            params: [
                { key: 'duration', label: 'Duration (s)', type: 'number', default: 1.5 },
            ],
        },
        {
            name: 'Sparks', group: 'Particles',
            params: [
                { key: 'count',    label: 'Count',        type: 'number', default: 120 },
                { key: 'duration', label: 'Duration (s)', type: 'number', default: 1.2 },
            ],
        },
        {
            name: 'Snow', group: 'Particles',
            params: [
                { key: 'count',    label: 'Count',        type: 'number', default: 150 },
                { key: 'duration', label: 'Duration (s)', type: 'number', default: 4.0 },
            ],
        },
        {
            name: 'Embers', group: 'Particles',
            params: [
                { key: 'count',    label: 'Count',        type: 'number', default: 80 },
                { key: 'duration', label: 'Duration (s)', type: 'number', default: 3.0 },
            ],
        },
        {
            name: 'Fireflies', group: 'Particles',
            params: [
                { key: 'count',    label: 'Count',        type: 'number', default: 40 },
                { key: 'duration', label: 'Duration (s)', type: 'number', default: 4.0 },
            ],
        },
        {
            name: 'Bubbles', group: 'Particles',
            params: [
                { key: 'count',    label: 'Count',        type: 'number', default: 60 },
                { key: 'duration', label: 'Duration (s)', type: 'number', default: 3.5 },
            ],
        },
        // Overlays
        {
            name: 'Flash', group: 'Overlays',
            params: [
                { key: 'color',    label: 'Color',        type: 'color',  default: '#ff0000' },
                { key: 'duration', label: 'Duration (s)', type: 'number', default: 0.5 },
            ],
        },
        {
            name: 'Rain', group: 'Overlays',
            params: [
                { key: 'color',    label: 'Color',        type: 'color',  default: '#66aaff' },
                { key: 'duration', label: 'Duration (s)', type: 'number', default: 2.0 },
            ],
        },
        // Motion
        {
            name: 'Shake', group: 'Motion',
            params: [
                { key: 'intensity', label: 'Intensity',    type: 'number', default: 8 },
                { key: 'duration',  label: 'Duration (s)', type: 'number', default: 0.4 },
            ],
        },
        {
            name: 'Ripple', group: 'Motion',
            params: [
                { key: 'color',    label: 'Color',        type: 'color',  default: '#3ad4b8' },
                { key: 'rings',    label: 'Rings',        type: 'number', default: 4 },
                { key: 'duration', label: 'Duration (s)', type: 'number', default: 1.0 },
            ],
        },
        {
            name: 'Shockwave', group: 'Motion',
            params: [
                { key: 'color',    label: 'Color',        type: 'color',  default: '#ffffff' },
                { key: 'duration', label: 'Duration (s)', type: 'number', default: 0.5 },
            ],
        },
        {
            name: 'Pulse', group: 'Motion',
            params: [
                { key: 'scale',    label: 'Scale',        type: 'number', default: 1.02 },
                { key: 'duration', label: 'Duration (s)', type: 'number', default: 0.5 },
            ],
        },
    ];

    // -----------------------------------------------------------------------
    // Built-in (default) triggers.
    // These are merged into storage on first load, starting disabled.
    // -----------------------------------------------------------------------
    const _defaults = [
        {
            pattern: 'On the Ground: {number} gold',
            body: [
                'Client.SendInput("get gold");',
            ].join('\n'),
            fx: null,
        },
    ];

    // -----------------------------------------------------------------------
    // Storage
    // Each record: { pattern, body, enabled, isDefault, fx }
    //   fx: null | { name: string, params: { [key]: value } }
    // -----------------------------------------------------------------------
    function _load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) { return null; }
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : null;
        } catch (e) {
            return null;
        }
    }

    function _save(list) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        } catch (e) {
            console.warn('Triggers: could not save to localStorage', e);
        }
    }

    function _mergeDefaults(list) {
        _defaults.forEach(def => {
            const exists = list.some(t => t.pattern === def.pattern && t.isDefault);
            if (!exists) {
                list.push({ pattern: def.pattern, body: def.body, enabled: false, isDefault: true, fx: def.fx || null });
            }
        });
        return list;
    }

    let _triggers = _mergeDefaults(_load() || []);
    _save(_triggers);

    // -----------------------------------------------------------------------
    // Utilities
    // -----------------------------------------------------------------------
    function ParseNumber(value, locales = navigator.languages) {
        const example = Intl.NumberFormat(locales).format('1.1');
        const cleanPattern = new RegExp(`[^-+0-9${ example.charAt(1) }]`, 'g');
        const cleaned = value.replace(cleanPattern, '');
        const normalized = cleaned.replace(example.charAt(1), '.');
        return parseFloat(normalized);
    }

    function matchPattern(pattern, str) {
        const escapeRegex = s => s.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&');
        let groupTypes = [];
        let regexPattern = escapeRegex(pattern);

        regexPattern = regexPattern.replace(/\\\{text\\\}/g, () => {
            groupTypes.push('text');
            return '(.+?)';
        });
        regexPattern = regexPattern.replace(/\\\{number\\\}/g, () => {
            groupTypes.push('number');
            return '([-+]?\\d[\\d,]*(?:\\.\\d+)?)';
        });

        const match = str.match(new RegExp(regexPattern));
        if (!match) { return null; }

        return match.slice(1).map((value, i) => {
            if (groupTypes[i] === 'number') { return ParseNumber(value); }
            return value;
        });
    }

    function stripAnsi(str) {
        return str.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
    }

    function validateBody(body) {
        try {
            // eslint-disable-next-line no-new-func
            new Function('matches', body);
            return null;
        } catch (e) {
            return e.message;
        }
    }

    // Fire all enabled FX for a trigger.
    // fx: { [name]: { [key]: value } } — only keys present in the object are fired.
    function _fireFX(fx) {
        if (!fx || typeof window.FX !== 'object') { return; }
        FX_DEFS.forEach(def => {
            if (!fx[def.name]) { return; }
            if (typeof window.FX[def.name] !== 'function') { return; }
            const params = fx[def.name];
            const args = def.params.map(p => {
                const v = params[p.key] !== undefined ? params[p.key] : p.default;
                return p.type === 'number' ? Number(v) : v;
            });
            window.FX[def.name](...args);
        });
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    function Try(str) {
        str = stripAnsi(str);
        _triggers.forEach(trigger => {
            if (!trigger.enabled) { return; }
            const matches = matchPattern(trigger.pattern, str);
            if (!matches) { return; }
            if (trigger.body && trigger.body.trim()) {
                try {
                    // eslint-disable-next-line no-new-func
                    const fn = new Function('matches', trigger.body);
                    fn(matches);
                } catch (e) {
                    console.warn('Trigger error [' + trigger.pattern + ']:', e);
                }
            }
            if (trigger.fx) {
                _fireFX(trigger.fx);
            }
        });
    }

    function getTriggers() {
        return _triggers.map(t => Object.assign({}, t));
    }

    // Returns null on success, error string on failure.
    // fx: null | { [fxName]: { [paramKey]: value } }
    function saveTrigger(idx, pattern, body, fx) {
        if (body && body.trim()) {
            const err = validateBody(body);
            if (err) { return err; }
        }
        if (idx < 0 || idx >= _triggers.length) { return 'Invalid trigger index.'; }
        _triggers[idx].pattern = pattern;
        _triggers[idx].body    = body;
        _triggers[idx].fx      = fx || null;
        _save(_triggers);
        return null;
    }

    function addTrigger(pattern, body, fx) {
        if (body && body.trim()) {
            const err = validateBody(body);
            if (err) { return err; }
        }
        if (!pattern.trim()) { return 'Pattern cannot be empty.'; }
        _triggers.push({ pattern, body, enabled: true, isDefault: false, fx: fx || null });
        _save(_triggers);
        return null;
    }

    function removeTrigger(idx) {
        if (idx < 0 || idx >= _triggers.length) { return; }
        _triggers.splice(idx, 1);
        _save(_triggers);
    }

    function setEnabled(idx, enabled) {
        if (idx < 0 || idx >= _triggers.length) { return; }
        _triggers[idx].enabled = !!enabled;
        _save(_triggers);
    }

    function setAllEnabled(enabled) {
        _triggers.forEach(t => { t.enabled = !!enabled; });
        _save(_triggers);
    }

    // Returns a JSON string of all non-default triggers suitable for sharing.
    function exportTriggers() {
        const exportable = _triggers
            .filter(t => !t.isDefault)
            .map(t => ({ pattern: t.pattern, body: t.body, enabled: t.enabled, fx: t.fx || null }));
        return JSON.stringify(exportable, null, 2);
    }

    // Imports triggers from a JSON string.
    // Returns null on success, an error string on failure.
    // Duplicate patterns (matching an existing non-default trigger) are skipped.
    function importTriggers(jsonStr) {
        let parsed;
        try {
            parsed = JSON.parse(jsonStr);
        } catch (e) {
            return 'Invalid JSON: ' + e.message;
        }
        if (!Array.isArray(parsed)) { return 'Expected a JSON array of triggers.'; }
        let added = 0;
        for (const item of parsed) {
            if (typeof item.pattern !== 'string' || !item.pattern.trim()) { continue; }
            if (item.body && item.body.trim()) {
                const err = validateBody(item.body);
                if (err) { return 'Trigger "' + item.pattern + '": ' + err; }
            }
            const duplicate = _triggers.some(t => t.pattern === item.pattern && !t.isDefault);
            if (duplicate) { continue; }
            _triggers.push({
                pattern:   item.pattern,
                body:      item.body  || '',
                enabled:   item.enabled !== false,
                isDefault: false,
                fx:        item.fx    || null,
            });
            added++;
        }
        _save(_triggers);
        return null;
    }

    return {
        Try,
        getTriggers,
        saveTrigger,
        addTrigger,
        removeTrigger,
        setEnabled,
        setAllEnabled,
        exportTriggers,
        importTriggers,
        validateBody,
        matchPattern,
        stripAnsi,
        ParseNumber,
        FX_DEFS,
    };

})();
