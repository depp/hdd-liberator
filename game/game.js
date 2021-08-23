import * as input from './input.js';
import * as player from './player.js';
import * as time from './time.js';
import { ctx } from './render2d.js';

/**
 * Initialize the game.
 */
export function Start() {
  input.Start();
}

/**
 * Advance the game state.
 * @param {number} timestamp Current timestamp, in milliseconds.
 */
export function Update(timestamp) {
  time.Update(timestamp);
  player.Update();
}

/**
 * Render the game to a 2D canvas.
 */
export function Render2D() {
  const w = ctx.canvas.clientWidth;
  const h = ctx.canvas.clientHeight;

  ctx.save();
  ctx.fillStyle = '#ccc';
  ctx.fillRect(0, 0, w, h);
  const gs = 32;
  let pos;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (pos = 0; pos <= w; pos += gs) {
    ctx.moveTo(pos, 0);
    ctx.lineTo(pos, h);
  }
  for (pos = 0; pos <= h; pos += gs) {
    ctx.moveTo(0, pos);
    ctx.lineTo(w, pos);
  }
  ctx.stroke();
  ctx.restore();

  player.Render2D();
}
