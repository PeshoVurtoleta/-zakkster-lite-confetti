/**
 * @zakkster/lite-confetti — Deterministic Confetti Engine
 *
 * The confetti library that canvas-confetti wishes it was.
 * Deterministic (seeded), zero-GC hot path, OKLCH colors,
 * reduced-motion aware, composable with lite-timeline.
 *
 * Depends on:
 *   @zakkster/lite-random  (deterministic RNG)
 *   @zakkster/lite-color   (OKLCH colors)
 *   lite-ticker            (shared RAF loop)
 *
 * Does NOT depend on lite-vec, lite-steer, lite-fx, or lite-particles.
 * Confetti is simple physics — gravity, drag, spin. No steering needed.
 * If you want confetti that flocks or swirls into a vortex, compose this
 * with lite-steer in a recipe. Don't bloat the core.
 *
 * REDUCED MOTION:
 *   Automatically detects `prefers-reduced-motion: reduce`.
 *   When active: particles appear instantly at their final spread positions
 *   with no animation, hold for 1.5s, then fade. Users see the celebration
 *   without the motion sickness trigger.
 */

import { Random } from '@zakkster/lite-random';
import { toCssOklch } from '@zakkster/lite-color';
import { Ticker } from 'lite-ticker';


// ─────────────────────────────────────────────────────────
//  SHARED TICKER (ref-counted)
// ─────────────────────────────────────────────────────────

let _ticker = null;
let _tickerRefs = 0;

function acquireTicker() {
    if (!_ticker) { _ticker = new Ticker(); _ticker.start(); }
    _tickerRefs++;
    return _ticker;
}

function releaseTicker() {
    _tickerRefs--;
    if (_tickerRefs <= 0 && _ticker) { _ticker.destroy(); _ticker = null; _tickerRefs = 0; }
}


// ─────────────────────────────────────────────────────────
//  REDUCED MOTION DETECTION
// ─────────────────────────────────────────────────────────

let _prefersReducedMotion = false;
if (typeof window !== 'undefined' && window.matchMedia) {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    _prefersReducedMotion = mq.matches;
    mq.addEventListener?.('change', (e) => { _prefersReducedMotion = e.matches; });
}


// ─────────────────────────────────────────────────────────
//  DEFAULT OKLCH CONFETTI COLORS
//  Perceptually uniform — every piece looks equally vibrant.
// ─────────────────────────────────────────────────────────

const DEFAULT_COLORS = [
    { l: 0.70, c: 0.25, h: 30 },   // orange
    { l: 0.65, c: 0.28, h: 330 },  // pink
    { l: 0.72, c: 0.22, h: 60 },   // gold
    { l: 0.60, c: 0.25, h: 270 },  // purple
    { l: 0.68, c: 0.22, h: 150 },  // green
    { l: 0.62, c: 0.20, h: 210 },  // blue
    { l: 0.75, c: 0.20, h: 0 },    // red
];


// ─────────────────────────────────────────────────────────
//  SHAPE RENDERERS
//  Each draws a single particle at (0,0). The canvas is
//  pre-translated and rotated by the caller.
// ─────────────────────────────────────────────────────────

const Shapes = {
    rect(ctx, w, h) {
        ctx.fillRect(-w / 2, -h / 2, w, h);
    },

    circle(ctx, w) {
        ctx.beginPath();
        ctx.arc(0, 0, w / 2, 0, Math.PI * 2);
        ctx.fill();
    },

    star(ctx, w) {
        const r = w / 2;
        const ir = r * 0.4;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
            const a = (i * Math.PI) / 5 - Math.PI / 2;
            const rad = i % 2 === 0 ? r : ir;
            if (i === 0) ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
            else ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
        }
        ctx.closePath();
        ctx.fill();
    },

    triangle(ctx, w) {
        const h = w * 0.866;
        ctx.beginPath();
        ctx.moveTo(0, -h / 2);
        ctx.lineTo(-w / 2, h / 2);
        ctx.lineTo(w / 2, h / 2);
        ctx.closePath();
        ctx.fill();
    },

    emoji(ctx, w, char) {
        ctx.font = `${w}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(char, 0, 0);
    },
};


// ─────────────────────────────────────────────────────────
//  CONFETTI CANVAS
// ─────────────────────────────────────────────────────────

/**
 * Create a confetti instance bound to a canvas.
 *
 * @param {HTMLCanvasElement} canvas  Overlay canvas (position: fixed, pointer-events: none)
 * @param {Object} [options]
 * @param {number} [options.seed]            RNG seed for deterministic output
 * @param {number} [options.maxParticles=500] Pool size
 * @param {boolean} [options.respectReducedMotion=true]  Honor prefers-reduced-motion
 */
export function createConfetti(canvas, {
    seed,
    maxParticles = 500,
    respectReducedMotion = true,
} = {}) {
    if (!canvas) {
        console.warn('@zakkster/lite-confetti: canvas required');
        return { burst() {}, spray() {}, clear() {}, destroy() {} };
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.warn('@zakkster/lite-confetti: canvas 2d context unavailable');
        return { burst() {}, spray() {}, clear() {}, get count() { return 0; }, seed() {}, destroy() {} };
    }
    const rng = new Random(seed ?? Date.now());
    const ticker = acquireTicker();
    let removeFn = null;
    let destroyed = false;

    // ── Cached dimensions (never read clientWidth in the hot loop) ──
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    let cw = 0;
    let ch = 0;

    function updateSize() {
        cw = canvas.clientWidth || canvas.width;
        ch = canvas.clientHeight || canvas.height;
        canvas.width = cw * dpr;
        canvas.height = ch * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    updateSize(); // Initial sizing

    // ── ResizeObserver (same pattern as lite-viewport) ──
    // Observes parent element, RAF-deduped to prevent double-fire.
    // Responds to CSS flex/grid reflow, not just window resize.
    let _ro = null;
    let _resizeScheduled = false;

    if (typeof ResizeObserver !== 'undefined') {
        _ro = new ResizeObserver(() => {
            if (!_resizeScheduled && !destroyed) {
                _resizeScheduled = true;
                requestAnimationFrame(() => {
                    _resizeScheduled = false;
                    if (!destroyed) updateSize();
                });
            }
        });
        _ro.observe(canvas.parentElement || canvas);
    }

    // ── Particle Pool (flat arrays for cache-friendliness) ──
    const pool = {
        x:     new Float32Array(maxParticles),
        y:     new Float32Array(maxParticles),
        vx:    new Float32Array(maxParticles),
        vy:    new Float32Array(maxParticles),
        spin:  new Float32Array(maxParticles),   // current rotation (radians)
        spinV: new Float32Array(maxParticles),   // spin velocity
        tilt:  new Float32Array(maxParticles),   // wobble phase
        tiltV: new Float32Array(maxParticles),   // wobble speed
        w:     new Float32Array(maxParticles),   // width
        h:     new Float32Array(maxParticles),   // height
        life:  new Float32Array(maxParticles),
        maxL:  new Float32Array(maxParticles),
        grav:  new Float32Array(maxParticles),   // per-particle gravity
        drag:  new Float32Array(maxParticles),
        shape: new Uint8Array(maxParticles),     // 0=rect, 1=circle, 2=star, 3=triangle, 4=emoji
    };

    // Color and emoji stored as arrays (can't go in TypedArrays)
    const colors = new Array(maxParticles);
    const emojis = new Array(maxParticles);

    let head = 0;
    let aliveCount = 0;

    // ── Shape ID mapping ──
    const SHAPE_MAP = { rect: 0, circle: 1, star: 2, triangle: 3, emoji: 4 };

    // ── Spawn a single particle ──
    function spawn(x, y, vx, vy, config) {
        const i = head;
        head = (head + 1) % maxParticles;

        pool.x[i] = x;
        pool.y[i] = y;
        pool.vx[i] = vx;
        pool.vy[i] = vy;
        pool.spin[i] = rng.next() * Math.PI * 2;
        pool.spinV[i] = (rng.next() - 0.5) * 10;
        pool.tilt[i] = rng.next() * Math.PI * 2;
        pool.tiltV[i] = 1 + rng.next() * 4;
        pool.w[i] = config.sizeMin + rng.next() * (config.sizeMax - config.sizeMin);
        pool.h[i] = pool.w[i] * (0.4 + rng.next() * 0.6); // slight height variation
        pool.life[i] = config.lifeMin + rng.next() * (config.lifeMax - config.lifeMin);
        pool.maxL[i] = pool.life[i];
        pool.grav[i] = config.gravity;
        pool.drag[i] = config.drag;
        pool.shape[i] = config.shapeId;
        colors[i] = config.colorPick();
        emojis[i] = config.emoji || '🎉';
    }

    // ── Render loop ──
    function update(dt) {
        const dtSec = dt / 1000;
        const W = canvas.width;
        const H = canvas.height;

        ctx.clearRect(0, 0, W, H);

        let alive = 0;

        for (let i = 0; i < maxParticles; i++) {
            if (pool.life[i] <= 0) continue;

            pool.life[i] -= dtSec;
            if (pool.life[i] <= 0) { pool.life[i] = 0; continue; }

            alive++;

            // Physics
            pool.vy[i] += pool.grav[i] * dtSec;
            pool.vx[i] *= pool.drag[i];
            pool.vy[i] *= pool.drag[i];
            pool.x[i] += pool.vx[i] * dtSec;
            pool.y[i] += pool.vy[i] * dtSec;

            // Spin + wobble
            pool.spin[i] += pool.spinV[i] * dtSec;
            pool.tilt[i] += pool.tiltV[i] * dtSec;

            // Opacity fade in last 30% of life
            const lifeT = pool.life[i] / pool.maxL[i];
            const alpha = lifeT < 0.3 ? lifeT / 0.3 : 1;

            // 3D-ish wobble via X-scale oscillation
            const wobbleScale = 0.5 + Math.abs(Math.cos(pool.tilt[i])) * 0.5;

            // Render
            ctx.save();
            ctx.translate(pool.x[i], pool.y[i]);
            ctx.rotate(pool.spin[i]);
            ctx.scale(wobbleScale, 1);
            ctx.globalAlpha = alpha;

            const c = colors[i];
            if (pool.shape[i] !== 4) {
                ctx.fillStyle = typeof c === 'string' ? c : toCssOklch(c);
            }

            switch (pool.shape[i]) {
                case 0: Shapes.rect(ctx, pool.w[i], pool.h[i]); break;
                case 1: Shapes.circle(ctx, pool.w[i]); break;
                case 2: Shapes.star(ctx, pool.w[i]); break;
                case 3: Shapes.triangle(ctx, pool.w[i]); break;
                case 4: Shapes.emoji(ctx, pool.w[i], emojis[i]); break;
            }

            ctx.restore();
        }

        aliveCount = alive;

        // Auto-detach when all particles are dead
        if (alive === 0 && removeFn) {
            removeFn();
            removeFn = null;
        }
    }

    function ensureRunning() {
        if (!removeFn && !destroyed) {
            removeFn = ticker.add(update);
        }
    }

    // ═══════════════════════════════════════════════════════
    //  PUBLIC API
    // ═══════════════════════════════════════════════════════

    const api = {
        /**
         * Classic confetti burst.
         *
         * @param {Object} [options]
         * @param {number} [options.x]           Burst center X (default: canvas center)
         * @param {number} [options.y]           Burst center Y (default: top third)
         * @param {number} [options.count=80]    Number of particles
         * @param {number} [options.spread=1.2]  Emission cone width (radians, centered upward)
         * @param {number} [options.speed=400]   Initial speed range center
         * @param {number} [options.speedVariance=200] Speed randomness
         * @param {number} [options.gravity=600] Downward acceleration
         * @param {number} [options.drag=0.98]   Per-frame velocity retention
         * @param {number} [options.sizeMin=5]
         * @param {number} [options.sizeMax=12]
         * @param {number} [options.lifeMin=1.5]
         * @param {number} [options.lifeMax=3.0]
         * @param {string} [options.shape='rect'] 'rect','circle','star','triangle','emoji'
         * @param {string} [options.emoji='🎉']  Emoji character (shape must be 'emoji')
         * @param {Array}  [options.colors]      Array of OKLCH objects or CSS strings
         * @param {number} [options.angle=-Math.PI/2] Center angle of emission cone
         * @param {Function} [options.onComplete] Called when all burst particles die
         */
        burst({
            x, y,
            count = 80,
            spread = 1.2,
            speed = 400,
            speedVariance = 200,
            gravity = 600,
            drag = 0.98,
            sizeMin = 5,
            sizeMax = 12,
            lifeMin = 1.5,
            lifeMax = 3.0,
            shape = 'rect',
            emoji = '🎉',
            colors = DEFAULT_COLORS,
            angle = -Math.PI / 2,
            onComplete,
        } = {}) {
            if (destroyed) return;

            const cx = x ?? cw / 2;
            const cy = y ?? ch * 0.33;
            const shapeId = SHAPE_MAP[shape] ?? 0;

            // Reduced motion: show static confetti, no animation
            if (respectReducedMotion && _prefersReducedMotion) {
                _renderStaticBurst(ctx, cx, cy, count, colors, shapeId, sizeMin, sizeMax, spread, emoji, rng);
                if (onComplete) setTimeout(onComplete, 1500);
                return;
            }

            const colorPick = () => rng.pick(colors);
            const config = { sizeMin, sizeMax, lifeMin, lifeMax, gravity, drag, shapeId, emoji, colorPick };

            for (let i = 0; i < count; i++) {
                const a = angle + (rng.next() - 0.5) * spread;
                const s = speed + (rng.next() - 0.5) * speedVariance * 2;
                spawn(cx, cy, Math.cos(a) * s, Math.sin(a) * s, config);
            }

            if (onComplete) {
                const checkDone = () => {
                    if (aliveCount === 0) onComplete();
                    else setTimeout(checkDone, 100);
                };
                setTimeout(checkDone, (lifeMin * 1000) | 0);
            }

            ensureRunning();
        },

        /**
         * Continuous confetti spray over a duration.
         *
         * @param {Object} [options]    Same as burst, plus:
         * @param {number} [options.duration=1000]  Spray duration in ms
         * @param {number} [options.rate=5]         Particles per frame
         */
        spray({
            duration = 1000,
            rate = 5,
            x, y,
            spread = 0.8,
            speed = 300,
            speedVariance = 150,
            gravity = 500,
            drag = 0.98,
            sizeMin = 4,
            sizeMax = 10,
            lifeMin = 1.2,
            lifeMax = 2.5,
            shape = 'rect',
            emoji = '🎉',
            colors = DEFAULT_COLORS,
            angle = -Math.PI / 2,
        } = {}) {
            if (destroyed) return;

            const cx = x ?? cw / 2;
            const cy = y ?? ch * 0.33;
            const shapeId = SHAPE_MAP[shape] ?? 0;

            if (respectReducedMotion && _prefersReducedMotion) {
                _renderStaticBurst(ctx, cx, cy, 30, colors, shapeId, sizeMin, sizeMax, spread, emoji, rng);
                return;
            }

            const colorPick = () => rng.pick(colors);
            const config = { sizeMin, sizeMax, lifeMin, lifeMax, gravity, drag, shapeId, emoji, colorPick };

            let elapsed = 0;
            const sprayFn = (dt) => {
                elapsed += dt;
                if (elapsed >= duration) {
                    return; // spray fn stays registered, ticker cleans up when all dead
                }
                const cx2 = x ?? cw / 2;
                const cy2 = y ?? ch * 0.33;
                for (let i = 0; i < rate; i++) {
                    const a = angle + (rng.next() - 0.5) * spread;
                    const s = speed + (rng.next() - 0.5) * speedVariance * 2;
                    spawn(cx2, cy2, Math.cos(a) * s, Math.sin(a) * s, config);
                }
            };

            // Piggyback on the render loop — spray spawns, render draws
            const origUpdate = update;
            const wrappedUpdate = (dt) => {
                sprayFn(dt);
                origUpdate(dt);
            };

            if (removeFn) removeFn();
            removeFn = ticker.add(wrappedUpdate);
        },

        /** Kill all particles immediately. */
        clear() {
            pool.life.fill(0);
            aliveCount = 0;
            if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        },

        /** Number of alive particles. */
        get count() { return aliveCount; },

        /** Re-seed the RNG for deterministic replay. */
        seed(s) { rng.reset(s); },

        /** Destroy everything. Idempotent. */
        destroy() {
            if (destroyed) return;
            destroyed = true;
            if (removeFn) { removeFn(); removeFn = null; }
            if (_ro) { _ro.disconnect(); _ro = null; }
            releaseTicker();
            pool.life.fill(0);
        },
    };

    return api;
}


// ─────────────────────────────────────────────────────────
//  REDUCED MOTION: Static Confetti Render
//  Shows confetti pieces in their spread positions with no
//  animation. Fades out after 1.5s via CSS opacity transition.
//  Users see the celebration without motion sickness.
// ─────────────────────────────────────────────────────────

function _renderStaticBurst(ctx, cx, cy, count, colors, shapeId, sizeMin, sizeMax, spread, emoji, rng) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    for (let i = 0; i < Math.min(count, 40); i++) {
        const angle = -Math.PI / 2 + (rng.next() - 0.5) * spread;
        const dist = 30 + rng.next() * 120;
        const x = cx + Math.cos(angle) * dist;
        const y = cy + Math.sin(angle) * dist;
        const size = sizeMin + rng.next() * (sizeMax - sizeMin);
        const color = colors[Math.floor(rng.next() * colors.length)];
        const rotation = rng.next() * Math.PI * 2;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rotation);
        ctx.globalAlpha = 0.85;

        if (shapeId !== 4) {
            ctx.fillStyle = typeof color === 'string' ? color : toCssOklch(color);
        }

        switch (shapeId) {
            case 0: Shapes.rect(ctx, size, size * 0.6); break;
            case 1: Shapes.circle(ctx, size); break;
            case 2: Shapes.star(ctx, size); break;
            case 3: Shapes.triangle(ctx, size); break;
            case 4: Shapes.emoji(ctx, size, emoji); break;
        }
        ctx.restore();
    }

    // Fade out after 1.5s
    const canvasEl = ctx.canvas;
    canvasEl.style.transition = 'opacity 0.5s ease-out';
    setTimeout(() => { canvasEl.style.opacity = '0'; }, 1500);
    setTimeout(() => {
        ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        canvasEl.style.opacity = '';
        canvasEl.style.transition = '';
    }, 2100);
}


// ─────────────────────────────────────────────────────────
//  CONVENIENCE: One-Shot Global Confetti
//  Creates a temporary full-screen overlay, fires, cleans up.
// ─────────────────────────────────────────────────────────

/**
 * Fire-and-forget confetti. Creates a temporary canvas overlay,
 * fires a burst, and cleans up automatically.
 *
 * @param {Object} [options]  Same as burst options
 */
export function confetti(options = {}) {

    const existing = /** @type {HTMLCanvasElement} */ document.getElementById('__lite-confetti-overlay');
    if (existing) {
        const c = createConfetti(existing, { seed: options.seed });
        c.burst(options);
        return c;
    }

    const overlay = document.createElement('canvas');
    overlay.id = '__lite-confetti-overlay';
    Object.assign(overlay.style, {
        position: 'fixed', top: '0', left: '0',
        width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: '99999',
    });
    document.body.appendChild(overlay);

    const c = createConfetti(overlay, { seed: options.seed });

    c.burst({
        ...options,
        onComplete: () => {
            c.destroy();
            overlay.remove();
            if (options.onComplete) options.onComplete();
        },
    });

    return c;
}


export default confetti;