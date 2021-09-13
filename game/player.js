import * as input from './input.js';
import * as grid from './grid.js';
import * as time from './time.js';
import * as mover from './mover.js';
import * as entityBox from './entity.box.js';
import * as entityDevice from './entity.device.js';
import { AngleDelta, Clamp } from './util.js';

/**
 * Player collision radius.
 */
export const Radius = 0.375;

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
 * @type {!input.Controller}
 */
let Controller = input.Keyboard;

/**
 * @type {{
 *   X0: number,
 *   Y0: number,
 *   Angle0: number,
 *   X: number,
 *   Y: number,
 *   Angle: number,
 *   Update: function(),
 *   Radius: number,
 * }}
 */
export const Player = {
  X0: 0.5,
  Y0: 0.5,
  Angle0: 0,
  X: 0.5,
  Y: 0.5,
  Angle: 0,
  Update: Walk,
  Radius,
};

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
  var absx = Math.abs(Controller.X);
  var absy = Math.abs(Controller.Y);
  var dx = 0;
  var dy = 0;
  if (absx + absy > 0.5) {
    if (absx > absy) {
      dx = Controller.X > 0 ? 1 : -1;
    } else {
      dy = Controller.Y > 0 ? 1 : -1;
    }
  }
  return [dx, dy];
}

/**
 * Try to grab the box in front of the player.
 */
function TryGrab() {
  var angle = Math.round((Player.Angle * 2) / Math.PI);

  // Direction of push (dx, dy);
  var dx = ICos(angle);
  var dy = ICos(angle - 1);

  // Tile coordinate of box being pushed (tx, ty).
  var tx = Math.floor(Player.X + dx * (Radius + GrabDistance));
  var ty = Math.floor(Player.Y + dy * (Radius + GrabDistance));

  /** @type {!entityBox.Box} */
  var box = /** @type {!entityBox.Box} */ (entityBox.GetIdle(tx, ty));
  if (!box) {
    return;
  }

  // Target position for grabbing (tx, ty), and target angle.
  tx = dx
    ? tx - (0.5 + Radius) * dx + 0.5
    : Clamp(Player.X, box.X + 0.5, box.X + box.W - 0.5);
  ty = dy
    ? ty - (0.5 + Radius) * dy + 0.5
    : Clamp(Player.Y, box.Y + 0.5, box.Y + box.H - 0.5);
  angle *= Math.PI / 2;

  // Bounding rectangle for the player. To avoid interference with other
  // objects, this will be marked as temporarily in use, and must be clear
  // before movement starts.
  var playerBounds = grid.BoundsRect(tx, ty, Radius);
  if (!grid.IsRectClear(playerBounds)) {
    return;
  }

  var boxRect = grid.CopyRect(box);
  var relx = tx - boxRect.X;
  var rely = ty - boxRect.Y;

  /** @type {number} */
  var moveamt;

  // Mark the box as "busy" so nothing else will use it.
  box.Idle = false;

  // Mark the player bounds as in use.
  grid.SetRect(playerBounds, grid.TileTemporary);

  // Update: grabbed, waiting for push.
  function Grabbed() {
    if (!Controller.State[input.Action]) {
      Done();
      return;
    }
    [dx, dy] = CardinalMoveDirection();
    if (dx + dy) {
      // To check if the box can move:
      // - Remove the box from the grid.
      // - Test whether the new positions for the box and player are clear.
      // - Add the box back to the grid.
      grid.SetRect(playerBounds, 0);
      grid.SetRect(box, 0);
      var playerClear = grid.IsRectClear(playerBounds, 0, dx, dy);
      var boxClear = grid.IsRectClear(box, grid.TileDevice, dx, dy);
      grid.SetRect(playerBounds, grid.TileTemporary);
      grid.SetRect(box, grid.TileBox);
      if (playerClear & boxClear) {
        Player.Update = Pushing;
        grid.SetRect(box, grid.TileTemporary);
        grid.SetRect(box, grid.TileTemporary, dx, dy);
        grid.SetRect(playerBounds, grid.TileTemporary, dx, dy);
        moveamt = 0;
      }
    }
  }

  // Update: grabbed and pushing a box
  function Pushing() {
    var vel = Speed;
    if (moveamt < PushAbortTime) {
      var [curdx, curdy] = CardinalMoveDirection();
      if ((curdx - dx) | (curdy - dy)) {
        vel = -Speed;
      }
    }
    moveamt += (vel * 4) / (4 + box.W * box.H);
    if (moveamt > 1 || moveamt < 0) {
      if (moveamt > 1) {
        grid.SetRect(boxRect, 0);
        grid.SetRect(playerBounds, 0);
        grid.MoveRect(boxRect, dx, dy);
        grid.MoveRect(playerBounds, dx, dy);
      } else {
        grid.SetRect(playerBounds, 0, dx, dy);
        grid.SetRect(boxRect, 0, dx, dy);
      }
      grid.SetRect(playerBounds, grid.TileTemporary);
      grid.SetRect(boxRect, grid.TileBox);
      box.X = boxRect.X;
      box.Y = boxRect.Y;
      Player.X = box.X + relx;
      Player.Y = box.Y + rely;

      if (entityDevice.CheckBox(box)) {
        // Device is now using the box, so don't mark the box as idle.
        Done(false);
      } else {
        Player.Update = Grabbed;
      }
      return;
    }
    box.X = boxRect.X + moveamt * dx;
    box.Y = boxRect.Y + moveamt * dy;
    Player.X = box.X + relx;
    Player.Y = box.Y + rely;
  }

  // Grab update function.
  Player.Update = function Grab() {
    if (!Controller.State[input.Action]) {
      Done();
      return;
    }
    var isMoving = FaceTowards(angle);
    var dx = tx - Player.X;
    var dy = ty - Player.Y;
    var dr = Math.hypot(dx, dy);
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

  /**
   * @param {boolean=} boxIsIdle
   */
  function Done(boxIsIdle = true) {
    Player.Update = Walk;
    grid.SetRect(playerBounds, 0);
    if (boxIsIdle) {
      box.Idle = true;
    }
  }
}

function Walk() {
  if (Controller.X || Controller.Y) {
    let absDeltaAngle = FaceTowards(Math.atan2(Controller.Y, Controller.X));
    if (absDeltaAngle < MaxDeltaAngle) {
      mover.Move(Player, Radius, Controller.X * Speed, Controller.Y * Speed);
    }
  }
  if (input.DidPress(Controller, input.Action)) {
    TryGrab();
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
  // If the player's controller is not active, but some other controller is
  // active, switch to that one.
  if (!input.IsActive(Controller)) {
    input.ForEachController(
      (/** !input.Controller */ controller) =>
        input.IsActive(controller) && (Controller = controller),
    );
  }
  Player.Update();
}
