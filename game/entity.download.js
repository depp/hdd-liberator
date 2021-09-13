import * as entityBox from './entity.box.js';
import { CurLevel } from './level.js';
import { Rand } from './random.js';

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
export let Downloads;

export function Clear() {
  Downloads = [];
}

export function Update() {
  var i, j, obj, Box;

  // Check for finished downloads.
  i = j = 0;
  while (i < Downloads.length) {
    obj = Downloads[i++];
    obj.Progress += CurLevel.DownloadSpeed;
    if (obj.Progress < 1) {
      Downloads[j++] = obj;
    } else {
      entityBox.Spawn(obj.Box);
    }
  }
  Downloads.length = j;

  // Check if a new download should start.
  SpawnAccumulator += CurLevel.DownloadSpawnRate;
  if (SpawnAccumulator > 1) {
    SpawnAccumulator = 0;
    Box = entityBox.NewRandom(2, Rand);
    if (Box) {
      Downloads.push({ Progress: 0, Box });
    }
  }
}
