import {gl, SetGLContext, Render} from './render.js';

/**
 * Callback for requestAnimationFrame.
 * @param {number} time
 */
function Frame(time) {
  Render(time);
  requestAnimationFrame(Frame);
}

/**
 * Start the game. Called once, when the script is run.
 */
export function Start() {
  /** @type {HTMLCanvasElement!} */
  const canvas = window['g'];
  SetGLContext(/** @type {WebGLRenderingContext?} */ (canvas.getContext('webgl', {
    alpha: 0,
  })));
  if (!gl) {
    document.body.innerHTML = 'Error :(';
    return;
  }
  Frame(0);
}
