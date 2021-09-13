import { RELEASE } from './common.js';
import { SetElementText, PutErrorMessage, GetMain } from './ui.standard.js';
import * as audiodata from './audio.data.js';
import * as render2D from './render2d.js';
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
 * Callback for requestAnimationFrame.
 * @param {number} timestamp Timestamp, in milliseconds.
 */
function Frame(timestamp) {
  game.Update(timestamp);
  render2D.Render2D();
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

/**
 * Start the game. Called once, when the script is run.
 */
function Start() {
  if (!RELEASE) {
    DevStart();
  }

  game.Init();
  game.Start();
  Canvas = document.createElement('canvas');
  const ctx = Canvas.getContext('2d', {
    alpha: false,
  });
  if (ctx == null) {
    PutErrorMessage('Could not create 2D context.');
    return;
  }

  const main = GetMain();
  if (!main) {
    return;
  }

  const par = document.createElement('div');
  par.setAttribute('id', 'game');
  par.appendChild(Canvas);
  window.addEventListener('resize', HandleResize);
  CanvasContainer = par;
  main.append(par);

  const togglesound = document.createElement('button');
  SetElementText(togglesound, MutedSpeaker);
  togglesound.onclick = ToggleSound;
  main.append(togglesound);

  HandleResize();
  render2D.SetContext(ctx);
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
