/** @type {?WebGLRenderingContext} */
let gl;

/**
 * @param {HTMLCanvasElement} canvas
 * @return {boolean}
 */
export function Start3D(canvas) {
  gl = canvas.getContext('webgl', { alpha: false });
  if (!gl) {
    return false;
  }
  return true;
}

export function Stop3D() {
  gl = null;
}

export function Render3D() {
  console.log('RENDER 3d');
  // gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.clearColor(0.2, 0.3, 0.4, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
}
