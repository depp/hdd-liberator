import './common.js';
import { ctx, SetCanvasContext, Render } from './render.js';

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
function Start() {
  /** @type {HTMLCanvasElement!} */
  const canvas = window['g'];
  SetCanvasContext(
    /** @type {CanvasRenderingContext2D?} */ (
      canvas.getContext('2d', {
        alpha: false,
      })
    ),
  );
  if (!ctx) {
    document.body.innerHTML = 'Error :(';
    return;
  }
  Frame(0);
}

Start();
