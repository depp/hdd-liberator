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
 * Array of collision locations. X values interleaved with Y.
 * @type {!Array<number>}
 */
const Collisions = [];

/**
 * Update the player state.
 */
export function Update() {
  Collisions.length = 0;
  const flags = mover.Move(
    Player,
    Radius,
    input.MoveX * Speed,
    input.MoveY * Speed,
  );

  if (flags & mover.FlagCollideX) {
    Collisions.push((Player.X | 0) + (input.MoveX > 0 ? 1.5 : -0.5), Player.Y);
  }
  if (flags & mover.FlagCollideY) {
    Collisions.push(Player.X, (Player.Y | 0) + (input.MoveY > 0 ? 1.5 : -0.5));
  }
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
  for (let i = 0; i < Collisions.length; ) {
    let cx = Collisions[i++];
    let cy = Collisions[i++];
    ctx.fillStyle = '#cc3';
    ctx.fillRect(cx * 32 - 10, cy * 32 - 10, 20, 20);
  }
}
