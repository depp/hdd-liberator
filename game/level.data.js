import { Level, SetLevel } from './level.js';
import { TickRate } from './time.js';
import * as grid from './grid.js';
import * as entityDevice from './entity.device.js';
import * as entityGeneric from './entity.generic.js';
import * as entityBox from './entity.box.js';
import * as entityDownload from './entity.download.js';
import * as player from './player.js';
import * as ui from './ui.game.js';
import * as audio from './audio.game.js';
import { COMPO } from './common.js';

/**
 * Create a wall with the given rectangle.
 * @param {number} X
 * @param {number} Y
 * @param {number} W
 * @param {number} H
 */
function Wall(X, Y, W, H) {
  grid.SetRect({ X, Y, W, H }, grid.TileWall);
}

/**
 * Clear the given rectangle.
 * @param {number} X
 * @param {number} Y
 * @param {number} W
 * @param {number} H
 */
function Clear(X, Y, W, H) {
  grid.SetRect({ X, Y, W, H }, 0);
}

/**
 * Spawn a box at the given location.
 */
function Box(x, y, size) {
  var ok = entityBox.Spawn(entityBox.New(x, y, size));
  if (!COMPO && !ok) {
    throw new Error(`box spawn failed: Box(${x}, ${y}, ${size})`);
  }
}

/**
 * Amount, per tick, that the spawn accumulator increases.
 * @const
 */
const DownloadSpawnRate = 0.5 / TickRate;

/**
 * Amount, per tick, that download progress accumulates.
 * @const
 */
const DownloadSpeed = 1.5 / TickRate;

/**
 * @type {!Array<!Level>}
 */
export let Levels = [
  {
    // File -> Recycling
    Help: '\u{1F4C4}\u{2794}\u{267B}',
    Create() {
      audio.PlayTrack(audio.MusicLightOfCreation);
      // Teach the player to push. Force the player to pull at least one box.
      grid.Reset(12, 8, grid.TileWall);
      Clear(4, 0, 6, 6);
      Clear(0, 2, 12, 2);
      Clear(6, 6, 2, 2);
      player.Reset(1, 3, 0);
      entityDevice.Spawn(10, 2);
      grid.SetStatic();
      Box(3, 2, 2);
      Box(7, 0, 1);
      Box(5, 4, 1);
      Box(6, 6, 2);
    },
    DownloadSpawnRate: 0.5 / TickRate,
    DownloadSpeed: 0.5 / TickRate,
  },
];

/**
 * Start the given level.
 * @param {!Level} level
 */
export function StartLevel(level) {
  SetLevel(level);
  ui.SetText(ui.Header, level.Help);
  entityGeneric.Clear();
  entityBox.Clear();
  entityDevice.Clear();
  entityDownload.Clear();
  level.Create();
}
