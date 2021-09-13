import { RELEASE } from './common.js';
import { SetElementText, PutErrorMessage, GetMain } from './ui.standard.js';
import * as audiodata from './audio.data.js';
import { Start2D, Stop2D, Render2D } from './render2d.js';
import { Start3D, Stop3D, Render3D } from './render3d.js';
import * as game from './game.js';
import * as audio from './audio.game.js';

const MutedSpeaker = '\u{1F507}';
const SpeakerHighVolume = '\u{1F50A}';

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

/** @type {boolean} */
let IsSoundRunning = false;

/** @type {boolean} */
let Is2D;

/**
 * @return {{
 *   Is2D: boolean;
 * }}
 */
function ParseHash() {
  const { hash } = window.location;
  let Is2D = false;
  if (hash.length > 1) {
    const parts = hash.substring(1).split('&');
    for (const part of parts) {
      let key, value;
      let i = part.indexOf('=');
      if (i >= 0) {
        key = part.substring(0, i);
        value = part.substring();
      } else {
        key = part;
        value = '';
      }
      key = decodeURI(key);
      value = decodeURI(value);
      switch (key) {
        case '2d':
          Is2D = true;
          break;
        default:
          console.error(`unknown hash key: ${encodeURI(key)}`);
          break;
      }
    }
  }
  return { Is2D };
}

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
  if (Canvas != null) {
    Canvas.width = cw;
    Canvas.height = ch;
  }
}

/**
 * Callback for requestAnimationFrame.
 * @param {number} timestamp Timestamp, in milliseconds.
 */
function Frame(timestamp) {
  if (!Canvas) {
    console.log('no canvas, aborting');
    return;
  }
  game.Update(timestamp);
  if (Is2D) {
    Render2D();
  } else {
    Render3D();
  }
  RAFHandle = requestAnimationFrame(Frame);
}

/**
 * Handle a click on the "toggle sound" button.
 * @param {Event} evt
 */
function ToggleSound(evt) {
  /** @type {HTMLElement} */
  const button = evt.target;
  if (IsSoundRunning) {
    audio.Stop();
    IsSoundRunning = false;
    SetElementText(button, MutedSpeaker);
  } else if (audio.Start()) {
    IsSoundRunning = true;
    SetElementText(button, SpeakerHighVolume);
  } else {
    console.error('failed to start sound');
  }
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
      audiodata.Load(arr);
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

function StartRenderer() {
  if (Canvas != null) {
    Canvas.remove();
    Canvas = null;
    Stop2D();
    Stop3D();
  }
  const canvas = document.createElement('canvas');
  const ok = Is2D ? Start2D(canvas) : Start3D(canvas);
  if (!ok) {
    PutErrorMessage('Could not start renderer.');
    return;
  }
  Canvas = canvas;
  CanvasContainer.appendChild(canvas);
}

/**
 * Start the game. Called once, when the script is run.
 */
function Start() {
  const params = ParseHash();
  Is2D = params.Is2D;

  if (!RELEASE) {
    DevStart();
  }

  game.Init();
  game.Start();

  const main = GetMain();
  if (!main) {
    return;
  }

  const par = document.createElement('div');
  par.setAttribute('id', 'game');
  window.addEventListener('resize', HandleResize);
  CanvasContainer = par;
  main.append(par);

  const togglesound = document.createElement('button');
  SetElementText(togglesound, MutedSpeaker);
  togglesound.onclick = ToggleSound;
  main.append(togglesound);

  StartRenderer();
  HandleResize();
  RAFHandle = requestAnimationFrame(Frame);
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
