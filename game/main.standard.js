import { SetCanvasContext, Render } from './render.js';

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
 * @param {number} time
 */
function Frame(time) {
  Render(time);
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
  SetCanvasContext(ctx);
  Frame(0);
}

Start();
