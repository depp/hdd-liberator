import './common.js';
import { ctx, SetContext } from './render2d.js';
import * as game from './game.js';

/**
 * Callback for requestAnimationFrame.
 * @param {number} timestamp
 */
function Frame(timestamp) {
  game.Update(timestamp);
  game.Render2D();
  requestAnimationFrame(Frame);
}

/**
 * Start the game. Called once, when the script is run.
 */
function Start() {
  /** @type {HTMLCanvasElement!} */
  const canvas = window['g'];
  SetContext(
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
  game.Start();
  Frame(0);
}

Start();
