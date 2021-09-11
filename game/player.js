import * as input from './input.js';
import { ctx } from './render2d.js';
import * as grid from './grid.js';
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
const Speed = 6 / time.TickRate;

/**
 * How far a player can push a block and change their mind.
 */
const PushAbortTime = 0.2;

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
    return 0;
  }
  Player.Angle =
    (Player.Angle + (deltaAngle > 0 ? TurnSpeed : -TurnSpeed)) % (2 * Math.PI);
  return absDeltaAngle - TurnSpeed;
}

/**
 * Get the cardinal direction that the player is moving. Returns the zero vector
 * if the player is not moving in a cardinal direction.
 * @return {!Array<number>}
 */
function CardinalMoveDirection() {
  let absx = Math.abs(input.MoveX);
  let absy = Math.abs(input.MoveY);
  let dx = 0;
  let dy = 0;
  if (absx > 2 * absy) {
    dx = input.MoveX > 0 ? 1 : -1;
  } else if (absy > 2 * absx) {
    dy = input.MoveY > 0 ? 1 : -1;
  }
  return [dx, dy];
}

function Walk() {
  if (input.MoveX || input.MoveY) {
    let absDeltaAngle = FaceTowards(Math.atan2(input.MoveY, input.MoveX));
    if (absDeltaAngle < MaxDeltaAngle) {
      mover.Move(Player, Radius, input.MoveX * Speed, input.MoveY * Speed);
    }
  }
  if (input.DidPress(input.Action)) {
    // Grab a box.
    let angle = Math.round((Player.Angle * 2) / Math.PI);
    // Direction of push (dx, dy);
    let dx = ICos(angle);
    let dy = ICos(angle - 1);
    // Tile coordinate of box being pushed (tx, ty).
    let tx = Math.floor(Player.X + dx * (Radius + GrabDistance));
    let ty = Math.floor(Player.Y + dy * (Radius + GrabDistance));
    let nbox = entityBox.Get(tx, ty);
    if (nbox) {
      // The "nbox" is nullable box... box and nbox just exist to quiet Closure
      // compiler errors. It will be optimized out.
      /** @type {!grid.Rect} */
      const box = nbox;
      CollideBox = box;
      // Target position for grabbing (tx, ty), and target angle.
      tx = dx
        ? tx - (0.5 + Radius) * dx + 0.5
        : Clamp(Player.X, box.X + 0.5, box.X + box.W - 0.5);
      ty = dy
        ? ty - (0.5 + Radius) * dy + 0.5
        : Clamp(Player.Y, box.Y + 0.5, box.Y + box.H - 0.5);
      angle *= Math.PI / 2;

      let boxRect = grid.CopyRect(box);
      let relx = tx - boxRect.X;
      let rely = ty - boxRect.Y;
      let playerBounds = grid.BoundsRect(tx, ty, Radius);
      /** @type {number} */
      let moveamt;

      // Update: grabbed, waiting for push.
      function Grabbed() {
        if (!input.ButtonState[input.Action]) {
          Player.Update = Walk;
          CollideBox = null;
          return;
        }
        [dx, dy] = CardinalMoveDirection();
        if (dx + dy) {
          // To check if the box can move:
          // - Remove the box from the grid.
          // - Test whether the new positions for the box and player are clear.
          // - Add the box back to the grid.
          grid.SetRect(box, 0);
          let playerClear = grid.IsRectClear(playerBounds, dx, dy);
          let boxClear = grid.IsRectClear(box, dx, dy);
          grid.SetRect(box, grid.TileBox);
          if (playerClear & boxClear) {
            Player.Update = Pushing;
            grid.SetRect(box, grid.TileTemporary);
            grid.SetRect(box, grid.TileTemporary, dx, dy);
            moveamt = 0;
          }
        }
      }

      // Update: grabbed and pushing a box
      function Pushing() {
        let vel = Speed;
        if (moveamt < PushAbortTime) {
          let [curdx, curdy] = CardinalMoveDirection();
          if ((curdx - dx) | (curdy - dy)) {
            vel = -Speed;
          }
        }
        moveamt += (vel * 4) / (4 + box.W * box.H);
        if (moveamt > 1 || moveamt < 0) {
          if (moveamt > 1) {
            grid.SetRect(boxRect, 0);
            grid.MoveRect(playerBounds, dx, dy);
            grid.MoveRect(boxRect, dx, dy);
          } else {
            grid.SetRect(boxRect, 0, dx, dy);
          }
          grid.SetRect(boxRect, grid.TileBox);
          box.X = boxRect.X;
          box.Y = boxRect.Y;
          Player.X = box.X + relx;
          Player.Y = box.Y + rely;
          Player.Update = Grabbed;
          return;
        }
        box.X = boxRect.X + moveamt * dx;
        box.Y = boxRect.Y + moveamt * dy;
        Player.X = box.X + relx;
        Player.Y = box.Y + rely;
      }

      // Grab update function.
      Player.Update = function Grab() {
        if (!input.ButtonState[input.Action]) {
          Player.Update = Walk;
          CollideBox = null;
          return;
        }
        let isMoving = FaceTowards(angle);
        let dx = tx - Player.X;
        let dy = ty - Player.Y;
        let dr = Math.hypot(dx, dy);
        if (dr < Speed) {
          Player.X = tx;
          Player.Y = ty;
        } else {
          Player.X += (Speed / dr) * dx;
          Player.Y += (Speed / dr) * dy;
          isMoving = 1;
        }
        if (!isMoving) {
          Player.Update = Grabbed;
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
