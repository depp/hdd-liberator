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

function DevStart() {
  if (!('JS13K' in window)) {
    throw new Error('no JS13K object');
  }

  /**
   * @param {JS13K.MusicStatus} music
   */
  function HandleMusicEvent(music) {
    if (typeof music != 'object' || Array.isArray(music)) {
      throw new Error('invalid music event');
    }
    const { data } = music;
    if (data != null) {
      if (typeof data != 'string') {
        throw new Error('invalid music data');
      }
      const str = atob(data);
      const arr = new Uint8Array(str.length);
      for (let i = 0; i < str.length; i++) {
        arr[i] = str.charCodeAt(i);
      }
      console.log('Received music data');
      audio.LoadMusic(arr);
    }
  }

  /**
   * @param {JS13K.DevEvent} event
   */
  function HandleBuildEvent(event) {
    const { music } = event;
    if (music != null) {
      try {
        HandleMusicEvent(music);
      } catch (e) {
        console.error(e);
      }
    }
  }

  JS13K.AddDevListener(HandleBuildEvent);
}

/**
 * Start the game. Called once, when the script is run.
 */
function Start() {
  if (!RELEASE) {
    DevStart();
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

function StartCheck() {
  try {
    Start();
  } catch (e) {
    console.error(e);
    PutErrorMessage('' + e);
  }
}

StartCheck();
