/**
 * @type {WebGLRenderingContext?}
 */
export let gl;

/**
 * @param {WebGLRenderingContext?} ctx
 */
export function SetGLContext(ctx) {
  gl = ctx;
}

/**
 * @param {number} time
 */
export function Render(time) {
  const t = time * 0.001;
  gl.clearColor(
    0.5 + 0.5 * Math.cos(t),
    0.5 + 0.5 * Math.cos(t + (Math.PI * 2) / 3),
    0.5 + 0.5 * Math.cos(t - (Math.PI * 2) / 3),
    1.0,
  );
  gl.clear(gl.COLOR_BUFFER_BIT);
}
