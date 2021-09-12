import './common.js';
import { ctx, SetContext, Render2D } from './render2d.js';
import * as game from './game.js';
import * as audioData from './audio.data.js';

/**
 * Callback for requestAnimationFrame.
 * @param {number} timestamp
 */
function Frame(timestamp) {
  game.Update(timestamp);
  Render2D();
  requestAnimationFrame(Frame);
}

function HandleResize() {
  const c = window.g;
  c.width = c.clientWidth;
  c.height = c.clientHeight;
}

function Init() {
  audioData.Load(
    [...window.d.text].map(
      (/** string */ x) => x.charCodeAt(0) - 1 - (x > '<') - (x > '\r'),
    ),
  );
  game.Init();
  window.b.onclick = Start;
  window.onresize = HandleResize;
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
  HandleResize();
  game.Start();
  Frame(0);
}

Init();
