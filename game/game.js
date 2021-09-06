import * as audio from './audio.game.js';
import * as input from './input.js';
import * as player from './player.js';
import * as time from './time.js';
import { ctx } from './render2d.js';
import { Grid, NewGrid } from './grid.js';

/**
 * @type {Grid}
 */
let LevelGrid;

/**
 * Initialize the game.
 */
export function Start() {
  input.Start();
  audio.Start();
  LevelGrid = NewGrid(12, 8);
  for (let i = 0; i < 10; i++) {
    let x = (Math.random() * LevelGrid.Width) | 0;
    let y = (Math.random() * LevelGrid.Height) | 0;
    LevelGrid.Set(x, y, 1);
  }
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
  let x, y;
  const gs = 32;
  const { Width, Height } = LevelGrid;

  ctx.save();
  for (x = 0; x < Width; x++) {
    for (y = 0; y < Height; y++) {
      const value = LevelGrid.Get(x, y);
      ctx.fillStyle = value ? '#c00' : '#ccc';
      ctx.fillRect(x * gs, y * gs, gs, gs);
    }
  }
  let pos;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (pos = 0; pos <= Width; pos++) {
    ctx.moveTo(pos * gs, 0);
    ctx.lineTo(pos * gs, Height * gs);
  }
  for (pos = 0; pos <= Height; pos++) {
    ctx.moveTo(0, pos * gs);
    ctx.lineTo(Width * gs, pos * gs);
  }
  ctx.stroke();
  ctx.restore();

  player.Render2D();
}
