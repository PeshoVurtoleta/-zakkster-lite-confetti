import type { OklchColor } from '@zakkster/lite-color';

export interface BurstOptions {
    x?: number; y?: number; count?: number; spread?: number;
    speed?: number; speedVariance?: number; gravity?: number; drag?: number;
    sizeMin?: number; sizeMax?: number; lifeMin?: number; lifeMax?: number;
    shape?: 'rect' | 'circle' | 'star' | 'triangle' | 'emoji';
    emoji?: string; colors?: Array<OklchColor | string>;
    angle?: number; onComplete?: () => void;
}
export interface SprayOptions extends Omit<BurstOptions, 'onComplete'> {
    duration?: number; rate?: number;
}
export interface ConfettiInstance {
    burst(options?: BurstOptions): void;
    spray(options?: SprayOptions): void;
    clear(): void;
    readonly count: number;
    seed(s: number): void;
    destroy(): void;
}
export function createConfetti(canvas: HTMLCanvasElement, options?: { seed?: number; maxParticles?: number; respectReducedMotion?: boolean }): ConfettiInstance;
export function confetti(options?: BurstOptions & { seed?: number }): ConfettiInstance;
export default confetti;
