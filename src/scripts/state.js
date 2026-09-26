// Central frame-loop state, shared between motion + WebGL modules.
export const state = {
  t: 0,
  dt: 0,
  scroll: 0,
  scrollTarget: 0,
  pointer: { x: 0, y: 0 }, // normalised -1..1
  px: 0, // pointer pixel x
  py: 0,
  vel: 0, // pointer velocity 0..1.5
  hooks: [],
  onFrame(cb) {
    this.hooks.push(cb);
    return () => {
      this.hooks = this.hooks.filter((h) => h !== cb);
    };
  },
};

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

export const reduced =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function onReady(fn) {
  if (typeof document === 'undefined') return;
  if (document.readyState !== 'loading') fn();
  else document.addEventListener('DOMContentLoaded', fn, { once: true });
}