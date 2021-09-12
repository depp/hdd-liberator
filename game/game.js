import * as audio from './audio.game.js';
import * as input from './input.js';
import * as player from './player.js';
import * as time from './time.js';
import * as grid from './grid.js';
import * as entityGeneric from './entity.generic.js';
import * as entityBox from './entity.box.js';
import * as entityDevice from './entity.device.js';
import { NewRandom } from './random.js';

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
  let r = NewRandom(1);
  input.Start();
  audio.Start();
  grid.Reset(12, 8);
  entityDevice.Spawn(10, 0);
  entityDevice.Spawn(0, 6);
  entityDevice.Spawn(10, 6);
  grid.SetStatic();
  grid.Set(0, 0, 1);
  entityBox.Spawn(r);
  grid.Set(0, 0, 0);
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
    player.Update();
    input.EndFrame();
  }
}
