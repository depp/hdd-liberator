import { Left, Right, Backward, Forward, ButtonAxis } from './input.js';
import { ctx } from './render2d.js';
import * as time from './time.js';

const Size = 24;

/**
 * @const {{
 *  x: number,
 *  y: number,
 * }}
 */
const Player = { x: 16, y: 16 };

/** @const {number} */
const Speed = 100 / 1000;

/**
 * Update the player state.
 */
export function Update() {
  const x = ButtonAxis(Left, Right);
  const y = ButtonAxis(Forward, Backward);
  Player.x += Speed * time.Delta * x;
  Player.y += Speed * time.Delta * y;
}

/**
 * Render the player.
 */
export function Render2D() {
  const { x, y } = Player;
  ctx.fillStyle = '#00c';
  ctx.fillRect(x - Size / 2, y - Size / 2, Size, Size);
}
