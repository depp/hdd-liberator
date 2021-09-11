/**
 * Input handling module. Reads input from the keyboard and translates it into
 * more abstract buttons like "left" and "right".
 */

// Zero is unused so that falsy values in the button bindings can be treated as
// unbound.

export const Action = 1;
export const Left = 2;
export const Right = 3;
export const Backward = 4;
export const Forward = 5;

const NumButtons = 6;

/**
 * Map from events to buttons.
 *
 * These are taken from KeyboardEvent.code, and correspond to physical locations
 * on the keyboard. WASD will be ZQSD on a French layout keyboard, etc.
 *
 * @const {!Object<string, number>}
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
};

/**
 * Map from button to whether the button is currently pressed.
 * @const {!Array<boolean>}
 */
export const ButtonState = Array(NumButtons).fill(false);

/**
 * Map from button to whether the button was pressed this tick.
 * @const {!Array<boolean>}
 */
export const ButtonPress = Array(NumButtons).fill(false);

/**
 * @param {KeyboardEvent} evt
 */
function HandleKeyDown(evt) {
  const binding = ButtonBindings[evt.code];
  if (binding) {
    ButtonState[binding] = true;
    ButtonPress[binding] = true;
    evt.preventDefault();
  }
}

/**
 * @param {KeyboardEvent} evt
 */
function HandleKeyUp(evt) {
  const binding = ButtonBindings[evt.code];
  if (binding) {
    ButtonState[binding] = false;
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
 * Update the input state.
 */
export function UpdateState() {
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
 * Process the end of a frame.
 */
export function EndFrame() {
  ButtonPress.fill(false);
}

/**
 * Get the value of an axis controlled by button precess.
 *
 * @param {number} negative The button which adds -1 to the axis.
 * @param {number} positive The button which adds +1 to the axis.
 * @returns {number} -1, 0, or +1.
 */
export function ButtonAxis(negative, positive) {
  return ButtonState[positive] - ButtonState[negative];
}
