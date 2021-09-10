/**
 * Input handling module. Reads input from the keyboard and translates it into
 * more abstract buttons like "left" and "right".
 */

export const Left = 'l';
export const Right = 'r';
export const Backward = 'b';
export const Forward = 'f';
export const Action = 'a';

/**
 * Map from events to buttons.
 *
 * These are taken from KeyboardEvent.code, and correspond to physical locations
 * on the keyboard. WASD will be ZQSD on a French layout keyboard, etc.
 *
 * @const {!Object<string, string>}
 */
const ButtonBindings = {
  // WASD
  'KeyW': Forward,
  'KeyA': Left,
  'KeyS': Backward,
  'KeyD': Right,

  // Arrow keys
  'ArrowUp': Forward,
  'ArrowLeft': Left,
  'ArrowDown': Backward,
  'ArrowRight': Right,

  // Action / attack
  'Space': Action,
  'ControlLeft': Action,
  'ControlRight': Action,
};

/**
 * Map from
 * @const {!Object<string, number>}
 */
const ButtonState = {};

/**
 * Set all buttons in the record to zero.
 * @param {Object<string, number>} record
 */
function ZeroButtons(record) {
  for (const c of 'lrbfa') {
    record[c] = 0;
  }
}

/**
 * @param {KeyboardEvent} evt
 */
function HandleKeyDown(evt) {
  const binding = ButtonBindings[evt.code];
  if (binding) {
    ButtonState[binding] = 1;
    evt.preventDefault();
  }
}

/**
 * @param {KeyboardEvent} evt
 */
function HandleKeyUp(evt) {
  const binding = ButtonBindings[evt.code];
  if (binding) {
    ButtonState[binding] = 0;
    evt.preventDefault();
  }
}

/**
 * @type {!Array<number>}
 */
const Gamepads = [];

/**
 * First initialization, before the game starts.
 */
export function Init() {
  window.addEventListener(
    'gamepadconnected',
    /** @type{function(Event)} */ (
      (/** !GamepadEvent */ event) => {
        if (event.gamepad.mapping == 'standard') {
          Gamepads.push(event.gamepad.index);
        }
      }
    ),
  );
  window.addEventListener(
    'gamepaddisconnected',
    /** @type{function(Event)} */ (
      (/** !GamepadEvent */ event) => {
        const index = Gamepads.indexOf(event.gamepad.index);
        if (index >= 0) {
          Gamepads.splice(index, 1);
        }
      }
    ),
  );
}

/**
 * Start listening for player input.
 */
export function Start() {
  document.onkeydown = /** @type {function(Event)} */ (HandleKeyDown);
  document.onkeyup = /** @type {function(Event)} */ (HandleKeyUp);
  ZeroButtons(ButtonState);
}

/** @type {number} */
export let MoveX;

/** @type {number} */
export let MoveY;

/**
 * The range of joysticks. Joysticx values are scaled so that input values with
 * this magnitude get magnitude 1.0.
 * @const
 */
const JoystickRange = 0.8;

/**
 * The size of the joystick dead zone. Joystick values with magnitude smaller
 * than this are flushed to zero.
 * @const
 */
const JoystickDeadZone = 0.2;

/**
 * Process the beginning of a frame.
 */
export function BeginFrame() {
  MoveX = ButtonAxis(Left, Right);
  MoveY = ButtonAxis(Forward, Backward);
  if (Gamepads.length) {
    const data = navigator.getGamepads();
    for (const index of Gamepads) {
      const gamepad = data[index];
      MoveX += gamepad.axes[0] / JoystickRange;
      MoveY += gamepad.axes[1] / JoystickRange;
    }
  }
  const magnitude = Math.hypot(MoveX, MoveY);
  const scale =
    magnitude > 1
      ? 1 / magnitude
      : magnitude > JoystickDeadZone
      ? magnitude
      : 0;
  MoveX *= scale;
  MoveY *= scale;
}

/**
 * Get the value of an axis controlled by button precess.
 *
 * @param {string} negative The button which adds -1 to the axis.
 * @param {string} positive The button which adds +1 to the axis.
 * @returns {number} -1, 0, or +1.
 */
export function ButtonAxis(negative, positive) {
  return ButtonState[positive] - ButtonState[negative];
}
