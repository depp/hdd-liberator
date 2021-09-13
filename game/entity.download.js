import * as entityBox from './entity.box.js';
import { TickRate } from './time.js';
import { Rand } from './random.js';

/**
 * Amount, per tick, that the spawn accumulator increases.
 * @const
 */
const SpawnSpeed = 0.5 / TickRate;

/**
 * Amount, per tick, that download progress accumulates.
 * @const
 */
const DownloadSpeed = 1.5 / TickRate;

/**
 * @typedef {{
 *   Progress: number,
 *   Box: !entityBox.Box,
 * }}
 */
var Download;

/**
 * Value that increases over time, and triggers a download to spawn when it
 * crosses a threshold.
 * @type {number}
 */
let SpawnAccumulator = 0;

/**
 * @type {!Array<!Download>}
 */
export let Downloads = [];

export function Update() {
  var i, j, obj, Box;

  // Check for finished downloads.
  i = j = 0;
  while (i < Downloads.length) {
    obj = Downloads[i++];
    obj.Progress += DownloadSpeed;
    if (obj.Progress < 1) {
      Downloads[j++] = obj;
    } else {
      entityBox.Spawn(obj.Box);
    }
  }
  Downloads.length = j;

  // Check if a new download should start.
  SpawnAccumulator += SpawnSpeed;
  if (SpawnAccumulator > 1) {
    SpawnAccumulator = 0;
    Box = entityBox.NewRandom(2, Rand);
    if (Box) {
      Downloads.push({ Progress: 0, Box });
    }
  }
}
