const FX = {

    // -----------------------------------------------------------------------
    // Confetti — coloured squares fall from above.
    // duration: seconds the animation runs.
    // -----------------------------------------------------------------------
    Confetti(duration = 1.5) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        document.body.appendChild(canvas);
        canvas.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:99999;';

        function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
        resize();
        window.addEventListener('resize', resize);

        const colors = ['#ff0', '#f0f', '#0ff', '#0f0', '#f00', '#00f'];
        const pieces = Array.from({ length: 400 }, () => ({
            x:             Math.random() * canvas.width,
            y:             Math.random() * -canvas.height,
            size:          Math.random() * 8 + 4,
            color:         colors[Math.floor(Math.random() * colors.length)],
            velocityX:     (Math.random() - 0.5) * 4,
            velocityY:     Math.random() * 3 + 2,
            rotation:      Math.random() * 360,
            rotationSpeed: (Math.random() - 0.5) * 10,
        }));

        const start = performance.now();
        const durationMs = duration * 1000;

        (function animate(now) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            pieces.forEach(p => {
                p.velocityY += 0.15;
                p.velocityX += (Math.random() - 0.5) * 0.05;
                p.x += p.velocityX;
                p.y += p.velocityY;
                p.rotation += p.rotationSpeed;
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation * Math.PI / 180);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
                ctx.restore();
            });
            if (now - start < durationMs) {
                requestAnimationFrame(animate);
            } else {
                window.removeEventListener('resize', resize);
                document.body.removeChild(canvas);
            }
        })(performance.now());
    },

    // -----------------------------------------------------------------------
    // Flash — a brief full-screen colour overlay that fades out.
    // color:    CSS colour string, e.g. 'rgba(255,0,0,0.45)' for damage,
    //           'rgba(80,255,80,0.35)' for healing, 'rgba(255,220,0,0.4)' for
    //           level-up.
    // duration: fade-out time in seconds.
    // -----------------------------------------------------------------------
    Flash(color = '#ff0000', duration = 0.5) {
        const el = document.createElement('div');
        el.style.cssText = [
            'position:fixed', 'inset:0', 'pointer-events:none', 'z-index:99999',
            'background:' + color,
            'transition:opacity ' + duration + 's ease-out',
            'opacity:1',
        ].join(';');
        document.body.appendChild(el);
        requestAnimationFrame(() => requestAnimationFrame(() => { el.style.opacity = '0'; }));
        setTimeout(() => { if (el.parentNode) { el.parentNode.removeChild(el); } }, duration * 1000 + 50);
    },

    // -----------------------------------------------------------------------
    // Shake — briefly shakes the #main-container (or the whole body).
    // intensity: max pixel offset.
    // duration:  total shake time in seconds.
    // -----------------------------------------------------------------------
    Shake(intensity = 8, duration = 0.4) {
        const target = document.getElementById('main-container') || document.body;
        const start  = performance.now();
        const durationMs = duration * 1000;
        const original   = target.style.transform;

        (function animate(now) {
            const elapsed  = now - start;
            const progress = elapsed / durationMs;
            if (progress >= 1) {
                target.style.transform = original;
                return;
            }
            const decay = 1 - progress;
            const dx = (Math.random() - 0.5) * 2 * intensity * decay;
            const dy = (Math.random() - 0.5) * 2 * intensity * decay;
            target.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
            requestAnimationFrame(animate);
        })(performance.now());
    },

    // -----------------------------------------------------------------------
    // Sparks — golden particles burst upward from the bottom of the screen.
    // Useful for kill blows, treasure, or level-up moments.
    // count:    number of spark particles.
    // duration: seconds before the canvas is removed.
    // -----------------------------------------------------------------------
    Sparks(count = 120, duration = 1.2) {
        const canvas = document.createElement('canvas');
        const ctx    = canvas.getContext('2d', { willReadFrequently: true });
        document.body.appendChild(canvas);
        canvas.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:99999;';

        function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
        resize();
        window.addEventListener('resize', resize);

        const colors = ['#ffe066', '#ffd700', '#ffaa00', '#fff4a0', '#ff8800'];
        const sparks = Array.from({ length: count }, () => {
            const angle = (Math.random() * 120 - 60) * Math.PI / 180; // -60..+60 deg from straight up
            const speed = Math.random() * 10 + 4;
            return {
                x:     Math.random() * canvas.width,
                y:     canvas.height + Math.random() * 20,
                vx:    Math.sin(angle) * speed,
                vy:    -Math.cos(angle) * speed,
                size:  Math.random() * 3 + 1,
                color: colors[Math.floor(Math.random() * colors.length)],
                life:  Math.random() * 0.5 + 0.5,
            };
        });

        const start      = performance.now();
        const durationMs = duration * 1000;

        (function animate(now) {
            const elapsed = now - start;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const t = elapsed / durationMs;
            sparks.forEach(s => {
                s.vy += 0.3;
                s.x  += s.vx;
                s.y  += s.vy;
                const alpha = Math.max(0, s.life - t) / s.life;
                ctx.globalAlpha = alpha;
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
                ctx.fillStyle = s.color;
                ctx.fill();
            });
            ctx.globalAlpha = 1;
            if (elapsed < durationMs) {
                requestAnimationFrame(animate);
            } else {
                window.removeEventListener('resize', resize);
                document.body.removeChild(canvas);
            }
        })(performance.now());
    },

    // -----------------------------------------------------------------------
    // Rain — streaks fall from the top of the screen.
    // color:    streak colour, e.g. '#66aaff' for rain, '#aaffaa' for acid.
    // duration: seconds the effect runs.
    // -----------------------------------------------------------------------
    Rain(color = '#66aaff', duration = 2.0) {
        const canvas = document.createElement('canvas');
        const ctx    = canvas.getContext('2d', { willReadFrequently: true });
        document.body.appendChild(canvas);
        canvas.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:99999;';

        function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
        resize();
        window.addEventListener('resize', resize);

        const drops = Array.from({ length: 200 }, () => ({
            x:      Math.random() * window.innerWidth,
            y:      Math.random() * -window.innerHeight,
            length: Math.random() * 20 + 10,
            speed:  Math.random() * 8 + 6,
            alpha:  Math.random() * 0.5 + 0.3,
        }));

        const start      = performance.now();
        const durationMs = duration * 1000;

        (function animate(now) {
            const elapsed = now - start;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drops.forEach(d => {
                d.y += d.speed;
                if (d.y > canvas.height) {
                    d.y = -d.length;
                    d.x = Math.random() * canvas.width;
                }
                ctx.beginPath();
                ctx.moveTo(d.x, d.y);
                ctx.lineTo(d.x - 1, d.y + d.length);
                ctx.strokeStyle = color;
                ctx.globalAlpha = d.alpha;
                ctx.lineWidth   = 1;
                ctx.stroke();
            });
            ctx.globalAlpha = 1;
            if (elapsed < durationMs) {
                requestAnimationFrame(animate);
            } else {
                window.removeEventListener('resize', resize);
                document.body.removeChild(canvas);
            }
        })(performance.now());
    },

    // -----------------------------------------------------------------------
    // Ripple — concentric rings expand outward from the center of the screen.
    // Useful for magic casts, area-of-effect spells, or tremors.
    // color:    ring colour.
    // rings:    how many rings to emit.
    // duration: seconds for each ring to fully expand and fade.
    // -----------------------------------------------------------------------
    Ripple(color = '#3ad4b8', rings = 4, duration = 1.0) {
        const canvas = document.createElement('canvas');
        const ctx    = canvas.getContext('2d', { willReadFrequently: true });
        document.body.appendChild(canvas);
        canvas.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:99999;';

        function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
        resize();
        window.addEventListener('resize', resize);

        const cx = canvas.width  / 2;
        const cy = canvas.height / 2;
        const maxRadius = Math.sqrt(cx * cx + cy * cy);
        const durationMs = duration * 1000;
        const stagger    = durationMs / rings;

        const ripples = Array.from({ length: rings }, (_, i) => ({
            startTime: performance.now() + i * stagger,
        }));

        let allDone = false;

        (function animate(now) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            allDone = true;
            ripples.forEach(r => {
                if (now < r.startTime) { allDone = false; return; }
                const t = (now - r.startTime) / durationMs;
                if (t >= 1) { return; }
                allDone = false;
                const radius = t * maxRadius;
                const alpha  = 1 - t;
                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                ctx.strokeStyle = color;
                ctx.globalAlpha = alpha;
                ctx.lineWidth   = 2 + (1 - t) * 3;
                ctx.stroke();
            });
            ctx.globalAlpha = 1;
            if (!allDone) {
                requestAnimationFrame(animate);
            } else {
                window.removeEventListener('resize', resize);
                document.body.removeChild(canvas);
            }
        })(performance.now());
    },

    // -----------------------------------------------------------------------
    // Snow — white flakes drift down with gentle sideways sway.
    // count:    number of flakes.
    // duration: seconds the effect runs.
    // -----------------------------------------------------------------------
    Snow(count = 150, duration = 4.0) {
        const canvas = document.createElement('canvas');
        const ctx    = canvas.getContext('2d', { willReadFrequently: true });
        document.body.appendChild(canvas);
        canvas.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:99999;';

        function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
        resize();
        window.addEventListener('resize', resize);

        const flakes = Array.from({ length: count }, () => ({
            x:      Math.random() * canvas.width,
            y:      Math.random() * -canvas.height,
            size:   Math.random() * 3 + 1,
            speed:  Math.random() * 1.5 + 0.5,
            sway:   Math.random() * Math.PI * 2,
            swaySpeed: Math.random() * 0.02 + 0.005,
            alpha:  Math.random() * 0.5 + 0.5,
        }));

        const start      = performance.now();
        const durationMs = duration * 1000;

        (function animate(now) {
            const elapsed = now - start;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            flakes.forEach(f => {
                f.sway += f.swaySpeed;
                f.x    += Math.sin(f.sway) * 0.8;
                f.y    += f.speed;
                if (f.y > canvas.height) { f.y = -f.size; f.x = Math.random() * canvas.width; }
                ctx.globalAlpha = f.alpha;
                ctx.beginPath();
                ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.fill();
            });
            ctx.globalAlpha = 1;
            if (elapsed < durationMs) {
                requestAnimationFrame(animate);
            } else {
                window.removeEventListener('resize', resize);
                document.body.removeChild(canvas);
            }
        })(performance.now());
    },

    // -----------------------------------------------------------------------
    // Embers — slow-rising glowing particles, good for fire rooms or forges.
    // count:    number of ember particles.
    // duration: seconds the effect runs.
    // -----------------------------------------------------------------------
    Embers(count = 80, duration = 3.0) {
        const canvas = document.createElement('canvas');
        const ctx    = canvas.getContext('2d', { willReadFrequently: true });
        document.body.appendChild(canvas);
        canvas.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:99999;';

        function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
        resize();
        window.addEventListener('resize', resize);

        const colors = ['#ff6600', '#ff4400', '#ff9900', '#ffcc00', '#ff2200'];
        const embers = Array.from({ length: count }, () => ({
            x:     Math.random() * canvas.width,
            y:     canvas.height + Math.random() * 40,
            size:  Math.random() * 2.5 + 0.5,
            speed: Math.random() * 1.2 + 0.4,
            sway:  Math.random() * Math.PI * 2,
            swaySpeed: Math.random() * 0.03 + 0.01,
            color: colors[Math.floor(Math.random() * colors.length)],
            life:  Math.random() * 0.6 + 0.4,
        }));

        const start      = performance.now();
        const durationMs = duration * 1000;

        (function animate(now) {
            const elapsed = now - start;
            const t       = elapsed / durationMs;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            embers.forEach(e => {
                e.sway += e.swaySpeed;
                e.x    += Math.sin(e.sway) * 1.2;
                e.y    -= e.speed;
                if (e.y < -10) { e.y = canvas.height + 10; e.x = Math.random() * canvas.width; }
                const alpha = Math.max(0, e.life - t) / e.life;
                ctx.globalAlpha = alpha;
                ctx.beginPath();
                ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
                ctx.fillStyle = e.color;
                ctx.fill();
            });
            ctx.globalAlpha = 1;
            if (elapsed < durationMs) {
                requestAnimationFrame(animate);
            } else {
                window.removeEventListener('resize', resize);
                document.body.removeChild(canvas);
            }
        })(performance.now());
    },

    // -----------------------------------------------------------------------
    // Fireflies — soft glowing dots that drift and pulse, good for forests.
    // count:    number of fireflies.
    // duration: seconds the effect runs.
    // -----------------------------------------------------------------------
    Fireflies(count = 40, duration = 4.0) {
        const canvas = document.createElement('canvas');
        const ctx    = canvas.getContext('2d', { willReadFrequently: true });
        document.body.appendChild(canvas);
        canvas.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:99999;';

        function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
        resize();
        window.addEventListener('resize', resize);

        const flies = Array.from({ length: count }, () => ({
            x:         Math.random() * canvas.width,
            y:         Math.random() * canvas.height,
            vx:        (Math.random() - 0.5) * 0.8,
            vy:        (Math.random() - 0.5) * 0.5,
            phase:     Math.random() * Math.PI * 2,
            phaseSpeed: Math.random() * 0.04 + 0.02,
            size:      Math.random() * 3 + 2,
        }));

        const start      = performance.now();
        const durationMs = duration * 1000;

        (function animate(now) {
            const elapsed = now - start;
            const t       = elapsed / durationMs;
            const fade    = t < 0.15 ? t / 0.15 : t > 0.85 ? (1 - t) / 0.15 : 1;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            flies.forEach(f => {
                f.phase += f.phaseSpeed;
                f.x     += f.vx + Math.sin(f.phase * 0.7) * 0.4;
                f.y     += f.vy + Math.cos(f.phase * 0.5) * 0.3;
                if (f.x < 0) { f.x = canvas.width; }
                if (f.x > canvas.width) { f.x = 0; }
                if (f.y < 0) { f.y = canvas.height; }
                if (f.y > canvas.height) { f.y = 0; }
                const pulse = (Math.sin(f.phase) + 1) / 2;
                const alpha = pulse * 0.8 * fade;
                const grad  = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.size * 3);
                grad.addColorStop(0, 'rgba(180,255,120,' + alpha + ')');
                grad.addColorStop(1, 'rgba(180,255,120,0)');
                ctx.beginPath();
                ctx.arc(f.x, f.y, f.size * 3, 0, Math.PI * 2);
                ctx.fillStyle = grad;
                ctx.fill();
            });
            if (elapsed < durationMs) {
                requestAnimationFrame(animate);
            } else {
                window.removeEventListener('resize', resize);
                document.body.removeChild(canvas);
            }
        })(performance.now());
    },

    // -----------------------------------------------------------------------
    // Bubbles — slow-rising translucent circles, good for underwater rooms.
    // count:    number of bubbles.
    // duration: seconds the effect runs.
    // -----------------------------------------------------------------------
    Bubbles(count = 60, duration = 3.5) {
        const canvas = document.createElement('canvas');
        const ctx    = canvas.getContext('2d', { willReadFrequently: true });
        document.body.appendChild(canvas);
        canvas.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:99999;';

        function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
        resize();
        window.addEventListener('resize', resize);

        const bubbles = Array.from({ length: count }, () => ({
            x:     Math.random() * canvas.width,
            y:     canvas.height + Math.random() * canvas.height,
            size:  Math.random() * 10 + 3,
            speed: Math.random() * 1.5 + 0.5,
            sway:  Math.random() * Math.PI * 2,
            swaySpeed: Math.random() * 0.02 + 0.005,
            alpha: Math.random() * 0.3 + 0.1,
        }));

        const start      = performance.now();
        const durationMs = duration * 1000;

        (function animate(now) {
            const elapsed = now - start;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            bubbles.forEach(b => {
                b.sway += b.swaySpeed;
                b.x    += Math.sin(b.sway) * 0.6;
                b.y    -= b.speed;
                if (b.y < -b.size) { b.y = canvas.height + b.size; b.x = Math.random() * canvas.width; }
                ctx.globalAlpha = b.alpha;
                ctx.beginPath();
                ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
                ctx.strokeStyle = '#88ccff';
                ctx.lineWidth   = 1.5;
                ctx.stroke();
                ctx.fillStyle   = 'rgba(136,204,255,0.06)';
                ctx.fill();
            });
            ctx.globalAlpha = 1;
            if (elapsed < durationMs) {
                requestAnimationFrame(animate);
            } else {
                window.removeEventListener('resize', resize);
                document.body.removeChild(canvas);
            }
        })(performance.now());
    },

    // -----------------------------------------------------------------------
    // Shockwave — a single fast-expanding ring bursts from the screen center.
    // color:    ring colour.
    // duration: seconds for the ring to expand and fade.
    // -----------------------------------------------------------------------
    Shockwave(color = '#ffffff', duration = 0.5) {
        const canvas = document.createElement('canvas');
        const ctx    = canvas.getContext('2d', { willReadFrequently: true });
        document.body.appendChild(canvas);
        canvas.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:99999;';

        function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
        resize();
        window.addEventListener('resize', resize);

        const cx        = canvas.width  / 2;
        const cy        = canvas.height / 2;
        const maxRadius = Math.sqrt(cx * cx + cy * cy);
        const start      = performance.now();
        const durationMs = duration * 1000;

        (function animate(now) {
            const elapsed = now - start;
            const t       = Math.min(elapsed / durationMs, 1);
            // Ease out: fast start, slow end
            const ease    = 1 - Math.pow(1 - t, 3);
            const radius  = ease * maxRadius;
            const alpha   = 1 - t;
            const width   = (1 - t) * 18 + 2;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.strokeStyle = color;
            ctx.globalAlpha = alpha;
            ctx.lineWidth   = width;
            ctx.stroke();
            ctx.globalAlpha = 1;
            if (elapsed < durationMs) {
                requestAnimationFrame(animate);
            } else {
                window.removeEventListener('resize', resize);
                document.body.removeChild(canvas);
            }
        })(performance.now());
    },

    // -----------------------------------------------------------------------
    // Pulse — #main-container breathes out and back once, like a heartbeat.
    // scale:    peak scale factor.
    // duration: total animation time in seconds.
    // -----------------------------------------------------------------------
    Pulse(scale = 1.02, duration = 0.5) {
        const target     = document.getElementById('main-container') || document.body;
        const original   = target.style.transform;
        const start      = performance.now();
        const durationMs = duration * 1000;

        (function animate(now) {
            const elapsed = now - start;
            const t       = Math.min(elapsed / durationMs, 1);
            // Smooth sine pulse
            const ease    = Math.sin(t * Math.PI);
            const s       = 1 + (scale - 1) * ease;
            target.style.transform = 'scale(' + s + ')';
            if (t < 1) {
                requestAnimationFrame(animate);
            } else {
                target.style.transform = original;
            }
        })(performance.now());
    },

};

window.FX = FX;
