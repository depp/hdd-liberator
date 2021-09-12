/**
 * Song player.
 */

import { GetMain, PutErrorMessage, NewErrorMessage } from './ui.standard.js';
import * as audiodata from './audio.data.js';
import { PlaySong } from './audio.music.js';
import * as icons from './icons.js';

/** @type {HTMLElement} */
let Main;

/** @type {HTMLElement} */
let ErrorBox;

function SetError(error) {
  const msg = NewErrorMessage(error);
  if (ErrorBox != null) {
    ErrorBox.remove();
  }
  ErrorBox = msg;
  Main.insertBefore(msg, Main.firstChild);
}

/** @type {AudioContext} */
let Ctx;

/**
 * Create an audio context for playback.
 */
function StartAudio() {
  if (Ctx != null) {
    return;
  }
  const constructor = window.AudioContext ?? window.webkitAudioContext;
  if (!constructor) {
    throw new Error('no audio context constructor');
  }
  Ctx = new constructor();
  const source = Ctx.createBufferSource();
  source.buffer = Ctx.createBuffer(1, 1000, Ctx.sampleRate);
  source.connect(Ctx.destination);
  source.start();
}

const SVG = 'http://www.w3.org/2000/svg';

/**
 * @param {...string} paths
 * @returns {{
 *   svg: SVGSVGElement,
 *   icons: !Array<SVGElement>,
 * }}
 */
function MakeIcon(...paths) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '32');
  svg.setAttribute('height', '32');
  let icons = [];
  for (const data of paths) {
    const path = document.createElementNS(SVG, 'path');
    svg.appendChild(path);
    path.setAttribute('d', data);
    icons.push(path);
  }
  return { svg, icons };
}

function makeWave(sampleRate, channels) {
  const headersize = 44;
  const datasize = 4 * channels.length * channels[0].length;
  const filesize = headersize + datasize;
  const buffer = new Uint8Array(filesize).buffer;
  const d = new DataView(buffer);
  let pos = 0;

  function u16(n) {
    d.setUint16(pos, n, true);
    pos += 2;
  }

  function u32(n) {
    d.setUint32(pos, n, true);
    pos += 4;
  }

  function string(s) {
    for (let i = 0; i < s.length; i++) {
      d.setUint8(pos + i, s.charCodeAt(i));
    }
    pos += s.length;
  }

  string('RIFF');
  u32(filesize - 8);
  string('WAVE');

  string('fmt ');
  u32(16);
  u16(3); // float
  u16(channels.length);
  u32(sampleRate);
  u32(sampleRate * channels.length * 4); // bytes per second
  u16(channels.length * 4); // bytes per frame
  u16(32); // bits per sample

  string('data');
  u32(datasize);

  const floats = new Float32Array(buffer, headersize);

  let n = channels.length;
  for (let i = 0; i < n; i++) {
    const channel = channels[i];
    for (let j = 0; j < channel.length; j++) {
      floats[i + n * j] = channel[j];
    }
  }

  return buffer;
}

class IconButton {
  constructor(...paths) {
    const { svg, icons } = MakeIcon(...paths);
    const button = document.createElement('button');
    button.appendChild(svg);
    for (let i = 1; i < icons.length; i++) {
      icons[i].style.visibility = 'hidden';
    }
    /** @type {HTMLButtonElement} */
    this.button = button;
    /** @type {!Array<SVGElement>} */
    this.icons = icons;
    /** @type {number} */
    this.selected = 0;
  }

  /**
   * @param {number} index
   */
  show(index) {
    if (this.selected == index) {
      return;
    }
    const { icons } = this;
    for (let i = 0; i < icons.length; i++) {
      icons[i].style.visibility = i == index ? null : 'hidden';
    }
    this.selected = index;
  }
}

class Song {
  /**
   * @param {string} name
   * @param {!Song} song
   */
  constructor(name, song) {
    /** @type {string} */
    this.name = name;
    /** @type {!Song} */
    this.song = song;
    /** @type {number} */
    this.version = 0;
    /** @type {number} */
    this.index = -1;
    /** @type {number} */
    this.newIndex = -1;

    const div = document.createElement('div');
    div.className = 'song';

    const hname = document.createElement('h2');
    div.appendChild(hname);
    hname.appendChild(document.createTextNode(name));

    const controls = document.createElement('div');
    div.appendChild(controls);
    controls.className = 'song-controls';

    const playPause = new IconButton(icons.PlayArrow, icons.Pause);
    controls.append(playPause.button);
    playPause.button.addEventListener('click', () => this.handlePlayPause());
    /** @type {IconButton} */
    this.playPause = playPause;

    const stop = new IconButton(icons.Stop);
    controls.append(stop.button);
    stop.button.addEventListener('click', () => this.handleStop());

    const progress = document.createElement('progress');
    progress.value = 0;
    controls.appendChild(progress);

    const download = new IconButton(icons.Download);
    controls.append(download.button);
    download.button.addEventListener('click', () => this.handleDownload());

    /** @type {HTMLElement} */
    this.div = div;
    /** @type {boolean} */
    this.isPlaying = false;

    /** @type {number} */
    this.position = 0;
    /** @type {GainNode} */
    this.node = null;
    /**
     * Audio context time for t=0.
     * @type {number}
     */
    this.startTime = 0;
  }

  handlePlayPause() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  play() {
    if (this.isPlaying) {
      return;
    }
    this.isPlaying = true;
    this.playPause.show(1);
    StartAudio();
    if (this.node == null) {
      this.node = Ctx.createGain();
      this.node.connect(Ctx.destination);
    }
    this.startPlayback(Ctx.currentTime + 0.25);
  }

  pause() {
    if (!this.isPlaying) {
      return;
    }
    this.isPlaying = false;
    this.playPause.show(0);
    if (this.node != null) {
      this.node.disconnect();
      this.node = null;
      this.position = Ctx.currentTime - this.startTime;
    }
  }

  startPlayback(startTime) {
    this.startTime = startTime;
    PlaySong(this.song, Ctx, this.node, startTime);
  }

  handleDownload() {
    console.log('Starting rendering');
    const tailLength = 2;
    const sampleRate = 48000;

    const constructor =
      window.OfflineAudioContext ?? window.webkitOfflineAudioContext;
    if (!constructor) {
      throw new Error('no constructor');
    }
    let end = 0;
    for (const track of this.song.Tracks) {
      let tlen = 0;
      for (const dur of track.Durations) {
        tlen += dur;
      }
      end = Math.max(end, tlen);
    }
    const length = end * this.song.TickDuration + tailLength;
    const ctx = new constructor(2, (sampleRate * length) | 0, sampleRate);
    const t0 = performance.now();
    PlaySong(this.song, ctx, ctx.destination, 0.25);
    ctx.startRendering().then((buffer) => {
      const t1 = performance.now();
      console.log(`Rendering done: time=${(t1 - t0) * 0.001}`);
      let data = [];
      for (let channel = 0; channel < 2; channel++) {
        data.push(buffer.getChannelData(channel));
      }
      let peak = 0;
      for (const cdata of data) {
        for (const s of cdata) {
          const as = Math.abs(s);
          if (as > peak) {
            peak = as;
          }
        }
      }
      console.log(`Peak: ${20 * Math.log10(peak)} dB`);

      const dbuffer = makeWave(sampleRate, data);
      const blob = new Blob([dbuffer, { type: 'audio/wav' }]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = this.name + '.wav';
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
    });
  }
}

/** @type {Map<string,Song>} */
const Songs = new Map();

/**
 * @param {*} data
 */
function SetData(data) {
  if (data == null) {
    throw new Error('null data');
  }
  if (typeof data != 'string') {
    throw new Error('data is not string');
  }
  const str = atob(data);
  const binary = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    binary[i] = str.charCodeAt(i);
  }
  audiodata.Load(binary);
}

/**
 * @param {*} songNames
 */
function SetSongNames(songNames) {
  if (songNames == null) {
    throw new Error('null songNames');
  }
  if (!Array.isArray(songNames)) {
    throw new Error('songNames is not array');
  }
  for (const song of Songs.values()) {
    song.newIndex = -1;
  }
  for (let i = 0; i < songNames.length; i++) {
    const name = songNames[i];
    let song = Songs.get(name);
    if (song == null) {
      song = new Song(name, audiodata.Songs[i]);
      Songs.set(name, song);
    }
    song.newIndex = i;
  }
  let reorder = false;
  for (const song of Songs.values()) {
    if (song.index != song.newIndex) {
      if (song.newIndex == -1) {
        Songs.delete(song.name);
        Main.removeChild(song.div);
      }
      reorder = true;
    }
  }
  if (reorder) {
    /** @type {!Array<Song>} */
    let songlist = new Array(Songs.size);
    for (const song of Songs.values()) {
      songlist[song.newIndex] = song;
      if (song.index != -1) {
        Main.removeChild(song.div);
      }
    }
    const ref = Main.firstChild;
    for (const song of songlist) {
      Main.insertBefore(song.div, ref);
      song.index = song.newIndex;
    }
  }
}

/**
 * @param {JS13K.DevEvent} event
 */
function HandleDevEvent(event) {
  const { music } = event;
  if (music == null) {
    return;
  }
  const { error, data, songNames } = music;
  if (error != null) {
    SetError(error);
    return;
  }
  try {
    SetData(data);
    SetSongNames(songNames);
  } catch (e) {
    console.error(e);
    console.log(e.stack);
    SetError(`Failed to load music: ${e}`);
  }
}

/**
 * Start the song player.
 */
function Start() {
  Main = GetMain();
  if (Main == null) {
    document.body.appendChild(NewErrorMessage('No <main>'));
    return;
  }
  if (!('JS13K' in window)) {
    PutErrorMessage('Websocket not loaded.');
    return;
  }
  JS13K.AddDevListener(HandleDevEvent);
}

Start();
