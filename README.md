# @zakkster/lite-confetti

[![npm version](https://img.shields.io/npm/v/@zakkster/lite-confetti.svg?style=for-the-badge&color=latest)](https://www.npmjs.com/package/@zakkster/lite-confetti)
[![npm bundle size](https://img.shields.io/bundlephobia/minzip/@zakkster/lite-confetti?style=for-the-badge)](https://bundlephobia.com/result?p=@zakkster/lite-confetti)
[![npm downloads](https://img.shields.io/npm/dm/@zakkster/lite-confetti?style=for-the-badge&color=blue)](https://www.npmjs.com/package/@zakkster/lite-confetti)
[![npm total downloads](https://img.shields.io/npm/dt/@zakkster/lite-confetti?style=for-the-badge&color=blue)](https://www.npmjs.com/package/@zakkster/lite-confetti)
![TypeScript](https://img.shields.io/badge/TypeScript-Types-informational)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

Deterministic confetti engine with OKLCH colors, 5 shapes, and reduced-motion support.

**The confetti library that canvas-confetti wishes it was.**

**[→ Live Recipes Gallery Demo](https://codepen.io/Zahari-Shinikchiev/debug/emdRVxz)**

## Why lite-confetti?

| Feature | lite-confetti | canvas-confetti | react-confetti | party.js |
|---|---|---|---|---|
| **Deterministic (seeded)** | **Yes** | No | No | No |
| **OKLCH colors** | **Yes** | No | No | No |
| **Reduced motion** | **Yes (auto)** | No | No | No |
| **Shapes** | **5 (rect, circle, star, triangle, emoji)** | 2 | 2 | 3 |
| **Spray mode** | **Yes** | No | No | No |
| **Shared ticker** | **Yes** | Own RAF | Own RAF | Own RAF |
| **SoA flat arrays** | **Yes** | No | No | No |
| **Timeline composable** | **Yes** | No | No | No |
| **Zero-GC hot path** | **Yes** | No | No | No |
| **ResizeObserver** | **Yes** | window.resize | No | No |
| **Bundle size** | **< 4KB** | ~6KB | ~5KB | ~8KB |

## Installation

```bash
npm install @zakkster/lite-confetti
```

## Quick Start

### One-Liner (Fire and Forget)

```javascript
import { confetti } from '@zakkster/lite-confetti';

// Creates overlay canvas, fires burst, cleans up automatically
confetti();
```

### Full Control

```javascript
import { createConfetti } from '@zakkster/lite-confetti';

const c = createConfetti(overlayCanvas, { seed: 42 });

c.burst({ count: 80, spread: 1.2, shape: 'star' });
c.burst({ x: 200, y: 100, shape: 'emoji', emoji: '🎊', count: 30 });

// Later
c.seed(42);  // reset for deterministic replay
c.destroy();
```

## Recipes

<details>
<summary><strong>Checkout Success</strong></summary>

```javascript
import { confetti } from '@zakkster/lite-confetti';

submitBtn.addEventListener('click', () => {
    confetti({
        count: 100,
        spread: 1.5,
        colors: [
            { l: 0.7, c: 0.25, h: 130 }, // green
            { l: 0.8, c: 0.2, h: 60 },   // gold
        ],
    });
});
```

</details>

<details>
<summary><strong>Emoji Rain</strong></summary>

```javascript
const c = createConfetti(canvas);
c.spray({
    shape: 'emoji',
    emoji: '🌟',
    duration: 2000,
    rate: 4,
    gravity: 300,
    speed: 100,
});
```

</details>

<details>
<summary><strong>Timeline Integration</strong></summary>

```javascript
import { createTimeline } from '@zakkster/lite-timeline';
import { confetti } from '@zakkster/lite-confetti';
import { easeOut } from '@zakkster/lite-lerp';

const tl = createTimeline();

tl.add({ duration: 400, ease: easeOut, onUpdate: t => {
    modal.style.opacity = t;
}})
.add({ duration: 0, onComplete: () => confetti({ y: 200, shape: 'star' }) })
.play();
```

</details>

<details>
<summary><strong>Deterministic Replay</strong></summary>

```javascript
const c = createConfetti(canvas, { seed: 42 });

// These two bursts produce identical particles:
c.burst({ count: 50 });

c.seed(42); // reset
c.burst({ count: 50 }); // exact same output
```

</details>

<details>
<summary><strong>Brand-Colored Confetti with lite-theme-gen</strong></summary>

```javascript
import { generateTheme } from '@zakkster/lite-theme-gen';
import { confetti } from '@zakkster/lite-confetti';

const theme = generateTheme({ l: 0.6, c: 0.25, h: 280 });

confetti({
    colors: [theme.accent, theme['accent-300'], theme['accent-700']],
    shape: 'circle',
    count: 60,
});
```

</details>

## Reduced Motion

lite-confetti automatically detects `prefers-reduced-motion: reduce`. When active:

- Particles appear **instantly** at their spread positions (no flight animation)
- Hold for **1.5 seconds** so users see the celebration
- **Fade out** gracefully via CSS opacity transition
- `onComplete` still fires

Zero developer effort required. Just call `confetti()` and it works for everyone.

## Shapes

| Shape | Description |
|---|---|
| `'rect'` | Classic confetti rectangle (default) |
| `'circle'` | Round confetti dots |
| `'star'` | 5-pointed star |
| `'triangle'` | Triangle piece |
| `'emoji'` | Any emoji character (set via `emoji` option) |

## API

### `confetti(options?)` — Fire and forget

Creates a temporary overlay canvas, fires a burst, cleans up.

### `createConfetti(canvas, options?)` — Full control

| Method | Description |
|---|---|
| `.burst(options?)` | Classic burst. Options: `x, y, count, spread, speed, gravity, drag, shape, emoji, colors, angle, lifeMin, lifeMax, sizeMin, sizeMax, onComplete` |
| `.spray(options?)` | Continuous stream. Extra: `duration, rate` |
| `.clear()` | Kill all particles |
| `.count` | Number of alive particles |
| `.seed(n)` | Reset RNG for deterministic replay |
| `.destroy()` | Clean up everything. Disconnects ResizeObserver. |

## License

MIT
