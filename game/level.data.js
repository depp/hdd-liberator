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

/** @const */
const StartAtLevel = 0;

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
let PendingLevel;

/**
 * True if the level is currently running.
 * @type {boolean}
 */
let IsPlaying = false;

/** @type {number} */
let Timer = 0;

/**
 * When to win.
 * @type {number}
 */
export let BoxDestroyLimit;

/**
 * When to lose.
 * @type {number}
 */
export let BoxSpawnLimit;

/**
 * @type {!Array<!Level>}
 */
export let Levels = [
  {
    Track: audio.MusicLightOfCreation,
    // File -> Recycling
    Help: '\u{1F4C4}\u{2794}\u{267B}',
    Create() {
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
      BoxSpawnLimit = entityBox.TotalBoxArea + 5;
    },
    DownloadSpawnRate: 0,
    DownloadSpeed: 0,
  },
  {
    Track: audio.MusicAfterDark,
    // Globe -> File
    Help: '\u{1F30D}\u{2794}\u{1F4C4}',
    Create() {
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
      BoxDestroyLimit = entityBox.TotalBoxArea + 8;
      BoxSpawnLimit = entityBox.TotalBoxArea + 10;
    },
    DownloadSpawnRate: DownloadSpawnRate / 2,
    DownloadSpeed: DownloadSpeed / 2,
  },
  {
    Track: audio.MusicLightOfCreation,
    // Food
    Help: '\u{1F344}\u{1F9C5}\u{1FAD1}',
    Create() {
      grid.Reset(16, 12, grid.TileWall);
      Clear(0, 5, 11, 7);
      Clear(1, 1, 14, 10);
      Clear(5, 0, 11, 7);
      Wall(0, 10, 2, 2);
      Wall(14, 0, 2, 2);
      Wall(3, 3, 4, 4);
      Wall(9, 5, 4, 4);
      entityDevice.Spawn(7, 5);
      grid.SetStatic();
      player.Reset(2, 2, 1);
      var r = NewRandom(3);
      RBoxes(r, 2, 4);
      RBoxes(r, 1, 6);
      BoxDestroyLimit = 20;
      BoxSpawnLimit = 35;
    },
    DownloadSpawnRate: DownloadSpawnRate / 1.5,
    DownloadSpeed: DownloadSpeed / 1.5,
  },
];

/**
 * Start the given level.
 * @param {!Level} level
 */
function StartLevel(level) {
  audio.PlayTrack(level.Track);
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
  PendingLevel = StartAtLevel;
  StartLevel(Levels[StartAtLevel]);
}

export function Update() {
  var level;
  if (IsPlaying) {
    if (entityBox.TotalBoxesDestroyed >= BoxDestroyLimit) {
      IsPlaying = false;
      ui.SetText(ui.Center, '\u{2B50} Complete \u{2B50}');
      PendingLevel++;
      Timer = 3 * TickRate;
      return;
    }
    if (entityBox.TotalBoxArea >= BoxSpawnLimit) {
      IsPlaying = false;
      ui.SetText(ui.Center, '\u{1F525} Try Again \u{1F525}');
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
        ui.SetText(ui.Center, '\u{1F308} You Win \u{1F308}');
        return;
      }
      if (!COMPO && !level) {
        throw new Error(`invalid pending level: ${PendingLevel}`);
      }
      StartLevel(level);
    }
  }
}
