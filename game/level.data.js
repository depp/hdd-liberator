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
import { Random, NewRandom } from './random.js';

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
 * Spawn a box at a random location.
 * @param {!Random} rand
 * @param {number} size
 * @param {number} count
 */
function RBoxes(rand, size, count) {
  while (count--) {
    var ok = entityBox.Spawn(entityBox.NewRandom(size, rand));
    if (!COMPO && !ok) {
      throw new Error(`box spawn failed: RBox(rand, ${size})`);
    }
  }
}

/**
 * Amount, per tick, that the spawn accumulator increases.
 * @const
 */
const DownloadSpawnRate = 0.25 / TickRate;

/**
 * Amount, per tick, that download progress accumulates.
 * @const
 */
const DownloadSpeed = 0.5 / TickRate;

/**
 * Next level to play.
 * @type {number}
 */
let PendingLevel = 0;

/**
 * True if the level is currently running.
 * @type {boolean}
 */
let IsPlaying = false;

/** @type {number} */
let Timer = 0;

/**
 * When to end.
 * @type {number}
 */
export let BoxDestroyLimit;

/**
 * @type {!Array<!Level>}
 */
export let Levels = [
  {
    // File -> Recycling
    Help: '\u{1F4C4}\u{2794}\u{267B}',
    Create() {
      audio.PlayTrack(audio.MusicAfterDark);
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
      BoxDestroyLimit = entityBox.TotalBoxArea;
    },
    DownloadSpawnRate: 0,
    DownloadSpeed: 0,
  },
  {
    // Globe -> File
    Help: '\u{1F30D}\u{2794}\u{1F4C4}',
    Create() {
      audio.PlayTrack(audio.MusicLightOfCreation);
      grid.Reset(14, 10, grid.TileWall);
      Clear(0, 0, 3, 8);
      Clear(3, 4, 2, 3);
      Clear(5, 1, 4, 8);
      Clear(9, 3, 2, 3);
      Clear(11, 2, 3, 8);
      entityDevice.Spawn(0, 0, 3);
      entityDevice.Spawn(11, 8, 3);
      grid.SetStatic();
      player.Reset(6, 2, 1);
      var r = NewRandom(2);
      RBoxes(r, 2, 4);
      RBoxes(r, 1, 4);
      BoxDestroyLimit = entityBox.TotalBoxArea + 10;
    },
    DownloadSpawnRate: DownloadSpawnRate / 2,
    DownloadSpeed: DownloadSpeed / 2,
  },
];

/**
 * Start the given level.
 * @param {!Level} level
 */
function StartLevel(level) {
  SetLevel(level);
  ui.SetText(ui.Header, level.Help);
  ui.SetText(ui.Center, '');
  entityGeneric.Clear();
  entityBox.Clear();
  entityDevice.Clear();
  entityDownload.Clear();
  level.Create();
  IsPlaying = true;
}

export function Start() {
  StartLevel(Levels[0]);
}

export function Update() {
  var level;
  if (IsPlaying) {
    if (entityBox.TotalBoxesDestroyed >= BoxDestroyLimit) {
      IsPlaying = false;
      ui.SetText(ui.Center, 'Complete');
      PendingLevel++;
      Timer = 3 * TickRate;
      return;
    }
    entityGeneric.Update();
    entityDownload.Update();
    player.Update();
  } else {
    Timer--;
    if (Timer < 0) {
      level = Levels[PendingLevel];
      if (!level) {
        Timer = Infinity;
        ui.SetText(ui.Center, 'Game Ends Here');
        return;
      }
      if (!COMPO && !level) {
        throw new Error(`invalid pending level: ${PendingLevel}`);
      }
      StartLevel(level);
    }
  }
}
