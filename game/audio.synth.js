import { COMPO, NUM_VALUES } from './common.js';

/**
 * Play a synthesized note.
 * @param {!Array<number>} program Synthesizer bytecode
 * @param {!BaseAudioContext} ctx Audio context
 * @param {!AudioNode} out Destination audio node
 * @param {number} t0 The program start time, seconds since start
 * @param {number} tgate The length of the note, in seconds
 * @param {number} note The MIDI note value to play
 * @return {number} The ending timestamp of the note
 */
export function PlaySynth(program, ctx, out, t0, tgate, note) {
  /**
   * Duration of the sound, in seconds.
   * @type {number}
   */
  let duration = tgate;

  /**
   * All audio sources.
   * @type {!Array<!OscillatorNode>}
   */
  let sources = [];

  /**
   * Stack of all destinations.
   * @type {!Array<!AudioNode>}
   */
  let stack = [];

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
   * @const {number}
   */
  const timeScale = 20;

  /**
   * Position in the program.
   * @type {number}
   */
  let pos = 0;

  // Variables saved from the beginning of a loop.

  /** @type {?number} */
  let repeatCount;
  /** @type {?number} */
  let repeatPos;
  /** @type {AudioNode} */
  let repeatOut;
  /** @type {Array<!AudioNode>} */
  let repeatStack;

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
      let xs = x1 * (x0 / x1) ** (s / (NUM_VALUES - 1));
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
    (/** !AudioParam */ _param) => {},
    // Constant.
    ...[1, timeScale, frequencyScale].map(
      (/** number */ scale) => (/** !AudioParam */ param) => {
        if (!COMPO && pos + 1 > program.length) {
          throw new Error('program overrun');
        }
        param.value = scale * exponent ** program[pos++];
      },
    ),
    // Constant integer.
    (/** !AudioParam */ param) => {
      param.value = program[pos++] - ((NUM_VALUES - 1) >> 1);
    },
    // Constant pan value.
    (/** !AudioParam */ param) => {
      param.value = (program[pos++] - ((NUM_VALUES - 1) >> 1)) / 60;
    },
    // Gain ADSR.
    (/** !AudioParam */ param) => ADSR(param, exponent ** (NUM_VALUES - 1), 1),
    // Frequency ADSR.
    (/** !AudioParam */ param) => {
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
    (/** !AudioParam */ param) => {
      param.value =
        440 *
        2 ** ((note + program[pos++] - 69 - ((NUM_VALUES - 1) >> 1)) / 12);
    },
    // Random bipolar value.
    (/** !AudioParam */ param) => {
      param.value = (Math.random() - 0.5) * 99 * exponent ** program[pos++];
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
    if (node.numberOfInputs) {
      stack.push(out);
      out = node;
    }
  }

  /** @type {Array<function()!>} */
  const opcodes = [
    // Repeat.
    () => {
      repeatCount = program[pos++];
      repeatPos = pos;
      repeatOut = out;
      repeatStack = [...stack];
    },
    // End repeat.
    () => {
      if (!COMPO) {
        if (repeatCount == null || repeatPos == null || repeatOut == null) {
          throw new Error('unexpected end repeat');
        }
        if (repeatCount < 0) {
          throw new Error('negative repeat count');
        }
      }
      out = /** @type {!AudioNode} */ (repeatOut);
      stack = [.../** @type {!Array<AudioNode>} */ (repeatStack)];
      if (repeatCount--) {
        pos = /** @type {number} */ (repeatPos);
      }
    },
    // Pop destination stack.
    () => {
      if (!COMPO) {
        if (stack.length == 0) {
          throw new Error('cannot pop node');
        }
      }
      out = stack.pop();
    },
    // Create gain node.
    () => {
      const node = ctx.createGain();
      AddNode(node, node.gain);
    },
    // Create stereo panner node.
    () => {
      const node = ctx.createStereoPanner();
      AddNode(node, node.pan);
    },
    // Create filter node.
    ...['lowpass', 'highpass', 'bandpass'].map((/** string */ type) => () => {
      const node = ctx.createBiquadFilter();
      node.type = type;
      AddNode(node, node.frequency, node.detune, node.Q);
    }),
    // Create oscillator node.
    ...['square', 'sawtooth', 'triangle'].map((/** string */ type) => () => {
      const node = ctx.createOscillator();
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

  return t0 + duration;
}
