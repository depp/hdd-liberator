import { Left, Right, Backward, Forward, ButtonAxis } from './input.js';
import { ctx } from './render2d.js';
import * as time from './time.js';

/**
 * @const {{
 *  x: number,
 *  y: number,
 * }}
 */
const Player = { x: 0, y: 0 };

/** @const {number} */
const Speed = 100 / 1000;

/**
 * Update the player state.
 */
export function Update() {
  const x = ButtonAxis(Left, Right);
  const y = ButtonAxis(Backward, Forward);
  Player.x += Speed * time.Delta * x;
  Player.y += Speed * time.Delta * y;
}

/**
 * Render the player.
 */
export function Render2D() {
  const { x, y } = Player;
  ctx.save();
  ctx.translate(x + 16, -y + 16);
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(-10, 5);
  ctx.lineTo(-10, -5);
  ctx.fill();
  ctx.restore();
}
