import * as audio from './audio.game.js';
import * as input from './input.js';
import * as player from './player.js';
import * as time from './time.js';
import * as grid from './grid.js';
import * as entityGeneric from './entity.generic.js';
import * as entityBox from './entity.box.js';
import * as entityDevice from './entity.device.js';
import * as entityDownload from './entity.download.js';
import { NewRandom, InitRandom } from './random.js';

/**
 * First initialization, before the game starts.
 */
export function Init() {
  input.Init();
}

/**
 * Initialize the game.
 */
export function Start() {
  var r;

  InitRandom();
  r = NewRandom(1);
  input.Start();
  audio.Start();

  entityGeneric.Actors.push(player.Player);
  grid.Reset(12, 8);
  entityDevice.Spawn(10, 0);
  entityDevice.Spawn(0, 6);
  entityDevice.Spawn(10, 6);
  grid.SetStatic();
  for (let j = 3; --j; ) {
    for (let i = 5; i--; ) {
      entityBox.Spawn(entityBox.NewRandom(j, r));
    }
  }
}

/**
 * Advance the game state.
 * @param {number} timestamp Current timestamp, in milliseconds.
 */
export function Update(timestamp) {
  input.UpdateState();
  for (let ticks = time.UpdateForTimestamp(timestamp); ticks--; ) {
    // Update interpolation.
    for (let box of entityBox.Boxes) {
      box.X0 = box.X;
      box.Y0 = box.Y;
    }
    player.Player.X0 = player.Player.X;
    player.Player.Y0 = player.Player.Y;
    player.Player.Angle0 = player.Player.Angle;

    // Update state.
    time.Advance();
    entityGeneric.Update();
    entityDownload.Update();
    player.Update();
    input.EndFrame();
  }
}
