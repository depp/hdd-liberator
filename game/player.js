import * as input from './input.js';
import { ctx } from './render2d.js';
import * as time from './time.js';
import * as mover from './mover.js';

const Radius = 0.375;

/**
 * @type {{
 *  X0: number,
 *  Y0: number,
 *  X: number,
 *  Y: number,
 * }}
 */
const Player = { X0: 0.5, Y0: 0.5, X: 0.5, Y: 0.5 };

/** @const {number} */
const Speed = 3 / time.TickRate;

/**
 * Update the player state.
 */
export function Update() {
  mover.Move(Player, Radius, input.MoveX * Speed, input.MoveY * Speed);
}

/**
 * Render the player.
 */
export function Render2D() {
  const x = 32 * (Player.X0 + (Player.X - Player.X0) * time.Fraction);
  const y = 32 * (Player.Y0 + (Player.Y - Player.Y0) * time.Fraction);
  ctx.fillStyle = '#00c';
  ctx.fillRect(
    x - 32 * Radius,
    y - 32 * Radius,
    32 * 2 * Radius,
    32 * 2 * Radius,
  );
  for (let i = 0; i < mover.Collisions.length; ) {
    let tx = mover.Collisions[i++];
    let ty = mover.Collisions[i++];
    ctx.fillStyle = '#cc3';
    ctx.fillRect(tx * 32 + 6, ty * 32 + 6, 20, 20);
  }
}
