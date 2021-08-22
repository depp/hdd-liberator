/**
 * @type {CanvasRenderingContext2D?}
 */
export let ctx;

/**
 * @param {CanvasRenderingContext2D?} c
 */
export function SetCanvasContext(c) {
  ctx = c;
}

/**
 * @param {number} time
 */
export function Render(time) {
  const w = ctx.canvas.clientWidth;
  const h = ctx.canvas.clientHeight;
  const t = time * 0.001;
  ctx.fillStyle = `rgb(${[
    128 + 128 * Math.cos(t),
    128 + 128 * Math.cos(t + (Math.PI * 2) / 3),
    128 + 128 * Math.cos(t - (Math.PI * 2) / 3),
  ]})`;
  ctx.fillRect(0, 0, w, h);
}
