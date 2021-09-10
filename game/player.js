import * as input from './input.js';
import { ctx } from './render2d.js';
import * as time from './time.js';
import * as mover from './mover.js';
import * as entityBox from './entity.box.js';
import { AngleDelta } from './util.js';

/**
 * Player collision radius.
 */
const Radius = 0.375;

const PushMargin = Radius - 0.25;

/**
 * Player movement speed, in grid squares per tick.
 */
const Speed = 3 / time.TickRate;

/**
 * Player turn speed, in radians per tick.
 */
const TurnSpeed = 12 / time.TickRate;

/**
 * Maximum angle between facing direction and moving direction, in radians.
 * Slightly more than 45 degrees. If the difference is larger, the player will
 * stand in place and turn.
 */
const MaxDeltaAngle = 0.8;

/**
 * @type {{
 *  X0: number,
 *  Y0: number,
 *  Angle0: number,
 *  X: number,
 *  Y: number,
 *  Angle: number,
 * }}
 */
const Player = { X0: 0.5, Y0: 0.5, Angle0: 0, X: 0.5, Y: 0.5, Angle: 0 };

/** @type {entityBox.Box|null} */
let CollideBox;

let CanPush;

/**
 * Update the player state.
 */
export function Update() {
  Player.X0 = Player.X;
  Player.Y0 = Player.Y;
  Player.Angle0 = Player.Angle;
  if (!input.MoveX && !input.MoveY) {
    return;
  }
  let targetAngle = Math.atan2(input.MoveY, input.MoveX);
  let deltaAngle = AngleDelta(Player.Angle, targetAngle);
  let absDeltaAngle = Math.abs(deltaAngle);
  if (absDeltaAngle < TurnSpeed) {
    Player.Angle = targetAngle;
  } else {
    Player.Angle =
      (Player.Angle + (deltaAngle > 0 ? TurnSpeed : -TurnSpeed)) %
      (2 * Math.PI);
  }
  if (absDeltaAngle > MaxDeltaAngle) {
    return;
  }
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
  ctx.save();
  ctx.translate(
    32 * (Player.X0 + (Player.X - Player.X0) * time.Fraction),
    32 * (Player.Y0 + (Player.Y - Player.Y0) * time.Fraction),
  );
  ctx.fillStyle = '#00c';
  ctx.fillRect(-32 * Radius, -32 * Radius, 32 * 2 * Radius, 32 * 2 * Radius);
  ctx.strokeStyle = '#000;';
  ctx.fillStyle = '#fff';
  ctx.rotate(Player.Angle);
  ctx.beginPath();
  ctx.moveTo(15, 0);
  ctx.lineTo(-15, 7);
  ctx.lineTo(-15, -7);
  ctx.closePath();
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();
  ctx.restore();

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
