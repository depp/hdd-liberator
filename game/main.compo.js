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
 * Start the game. Called once, when the play button is clicked.
 */
function Start() {
  window.b.remove();
  SetContext(
    /** @type {CanvasRenderingContext2D} */ (
      window.g.getContext('2d', {
        alpha: false,
      })
    ),
  );
  if (!ctx) {
    document.body.innerHTML = 'Error :(';
    return;
  }
  window.g.style.display = '';
  game.Start();
  Frame(0);
}

window.b.onclick = Start;
