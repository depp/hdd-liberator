import './common.js';
import { ctx, SetContext } from './render2d.js';
import * as game from './game.js';
import * as audioData from './audio.data.js';

/**
 * Callback for requestAnimationFrame.
 * @param {number} timestamp
 */
function Frame(timestamp) {
  game.Update(timestamp);
  game.Render2D();
  requestAnimationFrame(Frame);
}

function Init() {
  audioData.Load(
    [...window.d.text].map(
      (/** string */ x) => x.charCodeAt(0) - 1 - (x > '<') - (x > '\r'),
    ),
  );
  game.Init();
  window.b.onclick = Start;
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

Init();
