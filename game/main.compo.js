import './common.js';
import { Start2D, Render2D } from './render2d.js';
import * as game from './game.js';
import * as audioData from './audio.data.js';
import * as audio from './audio.game.js';
import * as ui from './ui.game.js';

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
  var s = window.m.style;
  var c = window.c;
  var size =
    Math.max(
      40,
      Math.min((window.innerWidth - 32) / 16, (window.innerHeight - 32) / 9),
    ) | 0;
  s.width = (c.width = size * 16) + 'px';
  s.height = (c.height = size * 9) + 'px';
  s.font = size * ui.FontScale + 'px monospace';
}

function Init() {
  audioData.Load(
    [...window.d.text].map(
      (/** string */ x) => x.charCodeAt(0) - 1 - (x > '<') - (x > '\r'),
    ),
  );
  ui.Init(window.h);
  game.Init();
  window.p.onclick = Start;
  window.onresize = HandleResize;
  HandleResize();
}

function Start() {
  if (!Start2D(window.c)) {
    document.body.innerHTML = 'Error :(';
    return;
  }
  window.m.className = 's';
  audio.Start();
  audio.Render();
  game.Start();
  Frame(0);
}

Init();
