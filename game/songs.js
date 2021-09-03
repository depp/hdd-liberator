/**
 * Song player.
 */

import { GetMain, PutErrorMessage, NewErrorMessage } from './ui.standard.js';
import * as audiodata from './audio.data.js';
import { RenderedSong, RenderSong } from './audio.music.js';
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

    /** @type {HTMLElement} */
    this.div = div;
    /** @type {boolean} */
    this.isPlaying = false;

    /** @type {RenderedSong} */
    this.rendered = null;
    /** @type {boolean} */
    this.isRendering = false;
    /** @type {number} */
    this.position = 0;
    /** @type {AudioBufferSourceNode} */
    this.node = null;
    /**
     * Audio context time for t=0.
     * @type {number}
     */
    this.playbackOffset = 0;
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
    if (this.rendered != null) {
      this.startPlayback(Ctx.currentTime, this.position);
    } else {
      this.startRendering();
    }
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
      this.position = Ctx.currentTime - this.playbackOffset;
    }
  }

  /**
   * @param {number} when
   * @param {number} offset
   */
  startPlayback(when, offset) {
    try {
      const { buffer, duration } = this.rendered;
      const source = Ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(Ctx.destination);
      source.start(when, offset);
      this.node = source;
      this.playbackOffset = when - offset;
    } catch (e) {
      console.error(e);
      this.pause();
    }
  }

  startRendering() {
    if (this.isRendering) {
      return;
    }
    this.isRendering = true;
    (async () => {
      try {
        try {
          while (this.isPlaying) {
            const { song, version } = this;
            const result = await RenderSong(song, Ctx.sampleRate);
            if (version == this.version) {
              this.rendered = result;
              break;
            }
            console.log('AGAIN');
          }
        } finally {
          this.isRendering = false;
        }
      } catch (e) {
        console.error(e);
        SetError(`Render: ${e}`);
        return;
      }
      if (this.rendered != null) {
        this.startPlayback(Ctx.currentTime, this.position);
      }
    })();
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