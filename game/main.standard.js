import { RELEASE } from './common.js';
import * as audio from './audio.js';
import * as render2D from './render2d.js';
import * as game from './game.js';

/**
 * The div containing the game canvas.
 * @type {HTMLElement}
 */
let CanvasContainer;

/**
 * The game canvas.
 * @type {HTMLCanvasElement}
 */
let Canvas;

/**
 * The requestAnimationFrame handle.
 *
 * @type {number?}
 */
let RAFHandle;

/**
 * Handle a window resize event.
 */
function HandleResize() {
  const xmargin = 32;
  const ymargin = 100;
  const minsize = 8;
  const ww = window.innerWidth;
  const wh = window.innerHeight;
  const s = Math.max(
    minsize,
    Math.floor(Math.min((ww - xmargin) / 16, (wh - ymargin) / 9)),
  );
  const cw = s * 16;
  const ch = s * 9;
  CanvasContainer.style.width = `${cw}px`;
  CanvasContainer.style.height = `${ch}px`;
  Canvas.width = cw;
  Canvas.height = ch;
}

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
 * Handle a click on the "start" overlay.
 * @param {Event} evt
 */
function HandleClickStart(evt) {
  /** @type {HTMLElement} */ (evt.target).remove();
  game.Start();
  Frame(0);
}

/**
 * Load the audio on the devserver.
 */
async function DevserverLoadAudio() {
  try {
    const resp = await fetch('/music');
    if (!resp.ok) {
      console.error('LoadAudio failed');
      return;
    }
    const buf = await resp.arrayBuffer();
    console.log('Loaded audio');
    audio.LoadMusic(new Uint8Array(buf));
  } catch (e) {
    console.error(e);
  }
}

/**
 * Start the game. Called once, when the script is run.
 */
function Start() {
  if (!RELEASE) {
    DevserverLoadAudio();
  }

  Canvas = document.createElement('canvas');
  const ctx = Canvas.getContext('2d', {
    alpha: false,
  });
  if (ctx == null) {
    PutErrorMessage('Could not create 2D context.');
    return;
  }

  const overlay = document.createElement('button');
  overlay.appendChild(document.createTextNode('\u25b6\ufe0f'));

  const par = document.createElement('div');
  par.setAttribute('id', 'game');
  par.appendChild(Canvas);
  par.appendChild(overlay);
  window.addEventListener('resize', HandleResize);
  CanvasContainer = par;
  HandleResize();
  document.body.appendChild(par);

  render2D.SetContext(ctx);
  overlay.addEventListener('click', HandleClickStart);
}

Start();
