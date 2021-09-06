import { Left, Right, Backward, Forward, ButtonAxis } from './input.js';
import { ctx } from './render2d.js';
import * as time from './time.js';

const Size = 24;

/**
 * @type {{
 *  X0: number,
 *  Y0: number,
 *  X: number,
 *  Y: number,
 * }}
 */
const Player = { X0: 16, Y0: 16, X: 16, Y: 16 };

/** @const {number} */
const Speed = 100 / time.TickRate;

/**
 * Update the player state.
 */
export function Update() {
  Player.X0 = Player.X;
  Player.Y0 = Player.Y;
  const x = ButtonAxis(Left, Right);
  const y = ButtonAxis(Forward, Backward);
  Player.X += Speed * x;
  Player.Y += Speed * y;
}

/**
 * Render the player.
 */
export function Render2D() {
  const x = Player.X0 + (Player.X - Player.X0) * time.Fraction;
  const y = Player.Y0 + (Player.Y - Player.Y0) * time.Fraction;
  ctx.fillStyle = '#00c';
  ctx.fillRect(x - Size / 2, y - Size / 2, Size, Size);
}
