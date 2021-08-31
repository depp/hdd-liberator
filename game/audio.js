import { COMPO, NUM_VALUES } from './common.js';
import { Iterate } from './util.js';

/**
 * @typedef {{
 *   values: Array<number>!,
 *   durations: Array<number>!,
 * }}
 */
var Track;

/**
 * @typedef {{
 *   tickDuration: number,
 *   tracks: Array<Track>!,
 * }}
 */
var Song;

/**
 * @type {Array<Song>}
 */
let Songs;

/**
 * @type {AudioContext?}
 */
let Ctx;

/**
 * Play a sound with the given buffer.
 * @param {AudioBuffer} buffer
 */
function PlayBuffer(buffer) {
  if (!COMPO && !Ctx) {
    throw new Error('Ctx is null');
  }
  const source = Ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(Ctx.destination);
  source.start();
}

/**
 * @param {!Array<number>} program
 * @param {!AudioNode} out
 * @param {number} t0 The program start time, seconds since start
 * @param {number} tgate The length of the note, in seconds
 * @param {number} note The MIDI note value to play
 */
function RunProgram(program, out, t0, tgate, note) {
  /**
   * Duration of the sound, in seconds.
   * @type {number}
   */
  let duration = tgate;

  /**
   * All audio sources.
   * @type {!Array<!OscillatorNode>}
   */
  const sources = [];

  /**
   * Exponent for calculating parameter values. Numbers encoded as N are decoded
   * as exponent**N, multiplied by a scale factor. With a scale factor of 1.0,
   * the range is 0.00057 - 1.0, or 66 dB.
   * @const {number}
   */
  const exponent = 0.94;

  /**
   * Scale applied to frequency parameters, in Hertz. A frequency encoded as N
   * is decoded as frequencyScale * exponent**N. Range: 9.3 Hz - 20 kHz.
   * @const {number}
   */
  const frequencyScale = 20e3;

  /**
   * Scale applied to time parameters, in seconds. A time encoded as N is
   * decoded as timeScale * exponent**N. Range: 9.3 ms - 20 s.
   */
  const timeScale = 20;

  /**
   * Position in the program.
   * @type number
   */
  let pos = 0;

  /**
   * Set an audio parameter to follow an ADSR envelope.
   * @param {!AudioParam} param
   * @param {number} x0
   * @param {number} x1
   */
  function ADSR(param, x0, x1) {
    if (!COMPO && pos + 4 > program.length) {
      throw new Error('program overrun');
    }
    // Envelope shapes
    // x0 = minimum value
    // xs = sustain level
    // x1 = maximum value
    // ta = attack time (time to rise from x0 to x1)
    // td = decay time (time to decay from x1 to x0)
    // tr = release time (time to release from x1 to x0)
    //
    // For long notes, tg > ta + td, the envelope is:
    // (0, e) -> (ta, 1) -> (ta + td, xs) -> (tg, xs) -> (tg + tr, e)
    let [a, d, s, r] = program.slice(pos, (pos += 4));
    let ta = timeScale * exponent ** a;
    let tr = timeScale * exponent ** r;
    param.setValueAtTime(x0, t0);
    param.exponentialRampToValueAtTime(x1, t0 + ta);
    let tdgate = tgate - ta;
    if (tdgate > 0) {
      // Gate is released after envelope attack, so the delay stage will
      // happen.
      let tk = timeScale * exponent ** d;
      let xs = (x1 / x0) ** (s / (NUM_VALUES - 1));
      param.setTargetAtTime(xs, t0 + ta, tk);
      param.setValueAtTime(xs + (x1 - xs) / Math.exp(tdgate / tk), t0 + tgate);
      param.exponentialRampToValueAtTime(x0, t0 + tgate + tr);
      duration = Math.max(duration, tgate + tr);
    } else {
      // Gate is released before envelope attack, so it releases
      // immediately.
      param.exponentialRampToValueAtTime(x0, t0 + ta + tr);
      duration = Math.max(duration, ta + tr);
    }
  }

  /** @type {!Array<!function(!AudioParam)>} */
  const paramOpcodes = [
    (_param) => {},
    // Constant.
    ...[1, timeScale, frequencyScale].map((scale) => (param) => {
      if (!COMPO && pos + 1 > program.length) {
        throw new Error('program overrun');
      }
      param.value = scale * exponent ** program[pos++];
    }),
    // Gain ADSR.
    (param) => ADSR(param, exponent ** (NUM_VALUES - 1), 1),
    // Frequency ADSR.
    (param) => {
      if (!COMPO && pos + 2 > program.length) {
        throw new Error('program overrun');
      }
      ADSR(
        param,
        frequencyScale * exponent ** program[pos++],
        frequencyScale * exponent ** program[pos++],
      );
    },
    // Note value.
    (param) => {
      param.value = 440 * 2 ** ((note - 69) / 12);
    },
  ];

  /**
   * @param {!AudioNode} node
   * @param {...!AudioParam} params
   */
  function AddNode(node, ...params) {
    for (const param of params) {
      if (!COMPO && pos + 1 > program.length) {
        throw new Error('program overrun');
      }
      /** @type {number} */
      const opcode = program[pos++];
      /** @type {function(AudioParam!)?} */
      const f = paramOpcodes[opcode];
      if (!COMPO && f == null) {
        throw new Error(`invalid param opcode: ${opcode}`);
      }
      f(param);
    }
    node.connect(out);
    out = node;
  }

  /** @type {Array<function()!>} */
  const opcodes = [
    () => {
      const node = Ctx.createGain();
      AddNode(node, node.gain);
    },
    ...['lowpass', 'highpass', 'bandpass'].map((type) => () => {
      const node = Ctx.createBiquadFilter();
      node.type = type;
      AddNode(node, node.frequency, node.detune, node.Q);
    }),
    ...['square', 'sawtooth', 'triangle'].map((type) => () => {
      const node = Ctx.createOscillator();
      node.type = type;
      AddNode(node, node.frequency, node.detune);
      sources.push(node);
    }),
  ];

  while (pos < program.length) {
    const opcode = program[pos++];
    const f = opcodes[opcode];
    if (!COMPO && f == null) {
      throw new Error(`invalid opcode: ${opcode}`);
    }
    f();
  }

  for (const source of sources) {
    source.start(t0);
    source.stop(t0 + duration);
  }
}

export function PlaySound() {
  if (!COMPO && !Ctx) {
    throw new Error('Ctx is null');
  }

  if (!Songs) {
    return;
  }
  /** @type {Array<number>!} */
  const program = [
    // gain, adsr
    0, 4, 112, 85, 11, 40,
    // lowpass, adsr, skip, skip, skip
    1, 5, 85, 11, 85, 85, 11, 40, 0, 0,
    // oscillator
    5, 6, 0,
  ];
  const song = Songs[0];
  if (!song) {
    return;
  }
  const ticksize = song.tickDuration;
  const t0 = Ctx.currentTime;
  const gain = Ctx.createGain();
  gain.gain.value = 0.2;
  gain.connect(Ctx.destination);
  for (const track of song.tracks) {
    const { values, durations } = track;
    let t = t0;
    for (let i = 0; i < values.length; i++) {
      const value = values[i];
      const duration = durations[i];

      if (value > 0) {
        RunProgram(program, gain, t, duration * ticksize, value);
      }

      t += duration * ticksize;
    }
  }
}

/**
 * Start the audio system. This must be called while handling a UI event.
 */
export function Start() {
  const constructor = window.AudioContext ?? window.webkitAudioContext;
  if (!constructor) {
    if (!COMPO) {
      console.error('No audio context constructor');
    }
    return;
  }
  Ctx = new constructor();
  const silence = Ctx.createBuffer(1, 1000, Ctx.sampleRate);
  PlayBuffer(silence);
  PlaySound();
}

/**
 * Load music tracks from the given raw binary data.
 * @param {Array<number>} data
 */
export function LoadMusic(data) {
  const initialValue = 60;
  let pos = 1;
  /** @type {Array<Song>!} */
  let songs = [];
  /** @type {Array<Track!>!} */
  let allTracks = [];
  let nsongs = data[0];
  while (nsongs--) {
    if (!COMPO && pos + 4 > data.length) {
      throw new Error('music parsing failed');
    }
    /** @type {Array<Track!>!} */
    const tracks = Iterate(data[pos], () => /** @type {Track} */ ({}));
    allTracks.push(...tracks);
    songs.push({
      tickDuration: data[pos + 1] / 500,
      tracks,
    });
    pos += 4;
  }
  for (const track of allTracks) {
    let value = initialValue;
    /** @type {Array<number>!} */
    let values = [];
    track.values = values;
    loop: while (1) {
      if (!COMPO && pos >= data.length) {
        throw new Error('music parsing failed');
      }
      const byte = data[pos++];
      switch (byte) {
        case NUM_VALUES - 2:
          // rest
          values.push(-1);
          break;
        case NUM_VALUES - 1:
          // track end
          break loop;
        default:
          value = (value + byte) % (NUM_VALUES - 2);
          values.push(value);
          break;
      }
    }
  }
  for (const track of allTracks) {
    track.durations = data.slice(pos, (pos += track.values.length));
  }
  Songs = songs;
}
