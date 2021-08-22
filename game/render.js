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
  const t = time * 0.001;
  ctx.fillStyle = `rgb(${[
    128 + 128 * Math.cos(t),
    128 + 128 * Math.cos(t + (Math.PI * 2) / 3),
    128 + 128 * Math.cos(t - (Math.PI * 2) / 3),
  ]})`;
  console.log(`Size: ${[ctx.canvas.clientWidth, ctx.canvas.clientHeight]}`);
  ctx.fillRect(0, 0, ctx.canvas.clientWidth, ctx.canvas.clientHeight);
}
