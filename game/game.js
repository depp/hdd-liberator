import * as audio from './audio.game.js';
import * as input from './input.js';
import * as player from './player.js';
import * as time from './time.js';
import * as grid from './grid.js';
import { ctx } from './render2d.js';
import { NewRandom } from './random.js';

/**
 * Initialize the game.
 */
export function Start() {
  let r = NewRandom(1);
  input.Start();
  audio.Start();
  grid.Reset(12, 8);
  for (let i = 0; i < 10; i++) {
    let x, y;
    do {
      x = r.NextInt(grid.Width);
      y = r.NextInt(grid.Height);
    } while ((!x && !y) || grid.Get(x, y));
    grid.Set(x, y, 1);
  }
}

/**
 * Advance the game state.
 * @param {number} timestamp Current timestamp, in milliseconds.
 */
export function Update(timestamp) {
  for (let ticks = time.UpdateForTimestamp(timestamp); ticks--; ) {
    time.Advance();
    player.Update();
  }
}

/**
 * Render the game to a 2D canvas.
 */
export function Render2D() {
  let x, y;
  const gs = 32;

  ctx.save();
  for (x = 0; x < grid.Width; x++) {
    for (y = 0; y < grid.Height; y++) {
      const value = grid.Get(x, y);
      ctx.fillStyle = value ? '#c00' : '#ccc';
      ctx.fillRect(x * gs, y * gs, gs, gs);
    }
  }
  let pos;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (pos = 0; pos <= grid.Width; pos++) {
    ctx.moveTo(pos * gs, 0);
    ctx.lineTo(pos * gs, grid.Height * gs);
  }
  for (pos = 0; pos <= grid.Height; pos++) {
    ctx.moveTo(0, pos * gs);
    ctx.lineTo(grid.Width * gs, pos * gs);
  }
  ctx.stroke();
  ctx.restore();

  player.Render2D();
}
