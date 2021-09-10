import * as input from './input.js';
import { ctx } from './render2d.js';
import * as time from './time.js';
import * as mover from './mover.js';
import * as entityBox from './entity.box.js';

const Radius = 0.375;

const PushMargin = Radius - 0.25;

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

/** @type {entityBox.Box|null} */
let CollideBox;

let CanPush;

/**
 * Update the player state.
 */
export function Update() {
  const flags = mover.Move(
    Player,
    Radius,
    input.MoveX * Speed,
    input.MoveY * Speed,
  );

  // Check to see if the player is pushing anything. The player can only push in
  // cardinal directions, so we check that the movement vector points in a
  // cardinal direction, and not diagonally. There's also a minimum movement
  // threshold for moving.
  const pushThreshold = 0.5;
  let absx = Math.abs(input.MoveX);
  let absy = Math.abs(input.MoveY);
  let tx = Player.X | 0;
  let ty = Player.Y | 0;
  let dx = 0;
  let dy = 0;
  if (flags & mover.FlagCollideX && absx > 2 * absy && absx > pushThreshold) {
    dx = input.MoveX > 0 ? 1 : -1;
  } else if (
    flags & mover.FlagCollideY &&
    absy > 2 * absx &&
    absy > pushThreshold
  ) {
    dy = input.MoveY > 0 ? 1 : -1;
  }
  tx += dx;
  ty += dy;
  CollideBox = null;
  if (dx + dy) {
    CollideBox = entityBox.Get(tx, ty);
    if (CollideBox) {
      if (dy) {
        CanPush =
          Player.X > CollideBox.X + PushMargin &&
          Player.X < CollideBox.X + CollideBox.W - PushMargin;
      } else {
        CanPush =
          Player.Y > CollideBox.Y + PushMargin &&
          Player.Y < CollideBox.Y + CollideBox.H - PushMargin;
      }
    }
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
  if (CollideBox) {
    ctx.fillStyle = CanPush ? '#cc3' : '#333';
    ctx.fillRect(
      CollideBox.X * 32 + 6,
      CollideBox.Y * 32 + 6,
      CollideBox.W * 32 - 12,
      CollideBox.H * 32 - 12,
    );
  }
}
