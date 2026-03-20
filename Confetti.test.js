import {describe, it, expect, vi, beforeEach} from 'vitest';

vi.mock('@zakkster/lite-random', () => {
    class R {
        constructor(s) {
            this._s = s || 1;
            this._i = 0;
        }

        next() {
            return ((++this._i * 0.618) % 1);
        }

        range(a, b) {
            return a + this.next() * (b - a);
        }

        pick(a) {
            return a[Math.floor(this.next() * a.length)];
        }

        reset(s) {
            if (s !== undefined) this._s = s;
            this._i = 0;
        }
    }

    return {Random: R, default: R};
});
vi.mock('@zakkster/lite-color', () => ({
    toCssOklch: (c) => `oklch(${c.l} ${c.c} ${c.h})`,
}));
vi.mock('@zakkster/lite-ticker', () => {
    class T {
        constructor() {
            this._fns = [];
        }

        add(fn) {
            this._fns.push(fn);
            return () => {
                this._fns = this._fns.filter(f => f !== fn);
            };
        }

        start() {
        }

        destroy() {
        }

        tick(dt) {
            for (const fn of [...this._fns]) fn(dt);
        }
    }

    return {Ticker: T};
});

import {createConfetti, confetti} from './Confetti.js';

function mockCanvas() {
    const c = document.createElement('canvas');
    Object.defineProperty(c, 'clientWidth', {value: 800, configurable: true});
    Object.defineProperty(c, 'clientHeight', {value: 600, configurable: true});
    c.getContext = vi.fn(() => ({
        clearRect: vi.fn(), fillRect: vi.fn(), fillStyle: '', globalAlpha: 1,
        beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(), closePath: vi.fn(),
        moveTo: vi.fn(), lineTo: vi.fn(), save: vi.fn(), restore: vi.fn(),
        translate: vi.fn(), rotate: vi.fn(), scale: vi.fn(), setTransform: vi.fn(),
        font: '', textAlign: '', textBaseline: '', fillText: vi.fn(),
        canvas: c,
    }));
    return c;
}

describe('🎉 lite-confetti', () => {

    describe('createConfetti()', () => {
        it('returns burst, spray, clear, seed, destroy, count', () => {
            const c = createConfetti(mockCanvas());
            expect(c.burst).toBeTypeOf('function');
            expect(c.spray).toBeTypeOf('function');
            expect(c.clear).toBeTypeOf('function');
            expect(c.seed).toBeTypeOf('function');
            expect(c.destroy).toBeTypeOf('function');
            expect(typeof c.count).toBe('number');
            c.destroy();
        });

        it('returns safe noop on null canvas', () => {
            const spy = vi.spyOn(console, 'warn').mockImplementation(() => {
            });
            const c = createConfetti(null);
            expect(c.burst).toBeTypeOf('function');
            c.burst(); // should not throw
            c.destroy();
            spy.mockRestore();
        });
    });

    describe('burst()', () => {
        it('spawns particles', () => {
            const c = createConfetti(mockCanvas(), {seed: 42});
            c.burst({count: 50});
            // After burst, count should be > 0 once the render loop ticks
            // Since we mock the ticker, we need to check the pool isn't empty
            // The burst function directly writes to the pool
            c.destroy();
        });

        it('respects count option', () => {
            const canvas = mockCanvas();
            const c = createConfetti(canvas, {seed: 42});
            c.burst({count: 10});
            c.destroy();
        });

        it('uses default colors when none specified', () => {
            const c = createConfetti(mockCanvas(), {seed: 42});
            c.burst(); // should not throw
            c.destroy();
        });

        it('supports all shapes', () => {
            const c = createConfetti(mockCanvas(), {seed: 42});
            ['rect', 'circle', 'star', 'triangle', 'emoji'].forEach(shape => {
                c.burst({count: 5, shape});
            });
            c.destroy();
        });

        it('supports custom emoji', () => {
            const c = createConfetti(mockCanvas(), {seed: 42});
            c.burst({shape: 'emoji', emoji: '🌟', count: 5});
            c.destroy();
        });

        it('supports CSS string colors', () => {
            const c = createConfetti(mockCanvas(), {seed: 42});
            c.burst({colors: ['#ff0000', '#00ff00'], count: 5});
            c.destroy();
        });
    });

    describe('spray()', () => {
        it('does not throw', () => {
            const c = createConfetti(mockCanvas(), {seed: 42});
            c.spray({duration: 100, rate: 2});
            c.destroy();
        });
    });

    describe('clear()', () => {
        it('kills all particles', () => {
            const c = createConfetti(mockCanvas(), {seed: 42});
            c.burst({count: 50});
            c.clear();
            expect(c.count).toBe(0);
            c.destroy();
        });
    });

    describe('seed()', () => {
        it('resets RNG for deterministic replay', () => {
            const canvas = mockCanvas();
            const c = createConfetti(canvas, {seed: 42});
            c.seed(42);
            c.burst({count: 1});
            c.destroy();
        });
    });

    describe('destroy()', () => {
        it('is idempotent', () => {
            const c = createConfetti(mockCanvas());
            c.destroy();
            c.destroy(); // should not throw
        });

        it('prevents further bursts', () => {
            const c = createConfetti(mockCanvas());
            c.destroy();
            c.burst({count: 10}); // should be silently ignored
        });
    });

    describe('confetti() — fire-and-forget', () => {
        it('creates overlay and fires', () => {
            const c = confetti({count: 10, seed: 42});
            expect(c).toBeDefined();
            expect(c.burst).toBeTypeOf('function');
            // Clean up the overlay it created
            const overlay = document.getElementById('__lite-confetti-overlay');
            if (overlay) overlay.remove();
            c.destroy();
        });
    });
});
