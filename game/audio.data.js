import { COMPO, NUM_VALUES } from './common.js';
import { Iterate } from './util.js';

/** @type {Array<!Array<number>>} */
export let Sounds;

/**
 * @typedef {{
 *   values: Array<number>!,
 *   durations: Array<number>!,
 *   instrument: number,
 * }}
 */
export var Track;

/**
 * @typedef {{
 *   tickDuration: number,
 *   duration: number,
 *   tracks: Array<Track>!,
 * }}
 */
export var Song;

/**
 * @type {Array<Song>}
 */
export let Songs;

/**
 * Load all audio data from the raw binary data.
 * @param {!Array<number>} data
 */
export function Load(data) {
  const initialValue = 60;
  /** @type {number} */
  let pos = 2;
  /** @type {Array<Track!>!} */
  let allTracks = [];
  let [nsounds, nsongs] = data;
  Sounds = [];
  Songs = [];
  while (nsounds--) {
    if (!COMPO && pos + 1 > data.length) {
      throw new Error('music parsing failed');
    }
    const length = data[pos++];
    if (!COMPO && pos + length > data.length) {
      throw new Error('music parsing failed');
    }
    Sounds.push(data.slice(pos, (pos += length)));
  }
  while (nsongs--) {
    if (
      !COMPO &&
      (pos + 4 > data.length || pos + 4 + data[pos] > data.length)
    ) {
      throw new Error('music parsing failed');
    }
    /** @type {!Array<!Track>} */
    const tracks = Iterate(
      data[pos],
      (i) =>
        /** @type {Track} */ ({
          instrument: data[pos + 4 + i],
        }),
    );
    allTracks.push(...tracks);
    Songs.push({
      tickDuration: data[pos + 1] / 500,
      duration: NUM_VALUES * data[pos + 2] + data[pos + 3],
      tracks,
    });
    pos += 4 + data[pos];
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
}
