import * as render2D from './render2d.js';
import * as game from './game.js';

/**
 * The requestAnimationFrame handle.
 *
 * @type {number?}
 */
let RAFHandle;

/**
 * Show an error message.
 *
 * @param {string} msg
 */
function PutErrorMessage(msg) {
  const div = document.createElement('div');
  const h = document.createElement('h2');
  div.appendChild(h);
  h.appendChild(document.createTextNode('Error'));
  const p = document.createElement('p');
  div.appendChild(p);
  p.appendChild(document.createTextNode(msg));
  document.body.appendChild(div);
}

/**
 * Callback for requestAnimationFrame.
 * @param {number} timestamp Timestamp, in milliseconds.
 */
function Frame(timestamp) {
  game.Update(timestamp);
  game.Render2D();
  RAFHandle = requestAnimationFrame(Frame);
}

/**
 * Start the game. Called once, when the script is run.
 */
function Start() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', {
    alpha: false,
  });
  if (ctx == null) {
    PutErrorMessage('Could not create 2D context.');
    return;
  }
  document.body.appendChild(canvas);
  render2D.SetContext(ctx);
  game.Start();
  Frame(0);
}

Start();
