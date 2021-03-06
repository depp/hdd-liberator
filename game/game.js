import * as input from './input.js';
import * as player from './player.js';
import * as time from './time.js';
import * as entityBox from './entity.box.js';
import * as level from './level.data.js';
import { InitRandom } from './random.js';

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
  InitRandom();
  input.Start();
  level.Start();
}

/**
 * Advance the game state.
 * @param {number} timestamp Current timestamp, in milliseconds.
 */
export function Update(timestamp) {
  var ticks, box;
  input.UpdateState();
  for (ticks = time.UpdateForTimestamp(timestamp); ticks--; ) {
    // Update interpolation.
    for (box of entityBox.Boxes) {
      box.X0 = box.X;
      box.Y0 = box.Y;
    }
    player.Player.X0 = player.Player.X;
    player.Player.Y0 = player.Player.Y;
    player.Player.Angle0 = player.Player.Angle;

    // Update state.
    time.Advance();
    level.Update();
    input.EndFrame();
  }
}
