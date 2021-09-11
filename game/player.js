import * as input from './input.js';
import { ctx } from './render2d.js';
import * as time from './time.js';
import * as mover from './mover.js';
import * as entityBox from './entity.box.js';
import { AngleDelta, Clamp } from './util.js';

/**
 * Player collision radius.
 */
const Radius = 0.375;

/**
 * Distance at which the player can grab something, measured from the edge of
 * the player.
 */
const GrabDistance = 0.25;

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

// =============================================================================

/**
 * @type {{
 *   X0: number,
 *   Y0: number,
 *   Angle0: number,
 *   X: number,
 *   Y: number,
 *   Angle: number,
 *   Update: function(),
 * }}
 */
const Player = {
  X0: 0.5,
  Y0: 0.5,
  Angle0: 0,
  X: 0.5,
  Y: 0.5,
  Angle: 0,
  Update: Walk,
};

/** @type {entityBox.Box|null} */
let CollideBox;

/**
 * Turn the player towards a specific angle.
 * @param {number} angle
 * @return {number} Absolute value of delta angle
 */
function FaceTowards(angle) {
  let deltaAngle = AngleDelta(Player.Angle, angle);
  let absDeltaAngle = Math.abs(deltaAngle);
  if (absDeltaAngle < TurnSpeed) {
    Player.Angle = angle;
  } else {
    Player.Angle =
      (Player.Angle + (deltaAngle > 0 ? TurnSpeed : -TurnSpeed)) %
      (2 * Math.PI);
  }
  return absDeltaAngle;
}

function Walk() {
  if (input.MoveX || input.MoveY) {
    let absDeltaAngle = FaceTowards(Math.atan2(input.MoveY, input.MoveX));
    if (absDeltaAngle < MaxDeltaAngle) {
      mover.Move(Player, Radius, input.MoveX * Speed, input.MoveY * Speed);
    }
  }
  if (input.DidPress(input.Action)) {
    let angle = Math.round((Player.Angle * 2) / Math.PI);
    // Direction of push (dx, dy);
    let dx = ICos(angle);
    let dy = ICos(angle - 1);
    // Tile coordinate of box being pushed (tx, ty).
    let tx = Math.floor(Player.X + dx * (Radius + GrabDistance));
    let ty = Math.floor(Player.Y + dy * (Radius + GrabDistance));
    let box = entityBox.Get(tx, ty);
    if (box) {
      CollideBox = box;
      // Target position for grabbing (tx, ty), and target angle.
      tx = dx
        ? tx - (0.5 + Radius) * dx + 0.5
        : Clamp(Player.X, box.X + 0.5, box.X + box.W - 0.5);
      ty = dy
        ? ty - (0.5 + Radius) * dy + 0.5
        : Clamp(Player.Y, box.Y + 0.5, box.Y + box.H - 0.5);
      angle *= Math.PI / 2;
      Player.Update = () => {
        FaceTowards(angle);
        let dx = tx - Player.X;
        let dy = ty - Player.Y;
        let dr = Math.hypot(dx, dy);
        if (dr < Speed) {
          Player.X = tx;
          Player.Y = ty;
        } else {
          Player.X += (Speed / dr) * dx;
          Player.Y += (Speed / dr) * dy;
        }
        if (!input.ButtonState[input.Action]) {
          Player.Update = Walk;
          CollideBox = null;
        }
      };
    }
  }
}

/**
 * @param {number} x
 * @return {number}
 */
function ICos(x) {
  return x & 1 ? 0 : 1 - (x & 2);
}

/**
 * Update the player state.
 */
export function Update() {
  Player.X0 = Player.X;
  Player.Y0 = Player.Y;
  Player.Angle0 = Player.Angle;
  Player.Update();
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
    ctx.fillStyle = '#cc3';
    ctx.fillRect(
      CollideBox.X * 32 + 6,
      CollideBox.Y * 32 + 6,
      CollideBox.W * 32 - 12,
      CollideBox.H * 32 - 12,
    );
  }
}
