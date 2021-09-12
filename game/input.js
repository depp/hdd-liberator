/**
 * Input handling module. Reads input from the keyboard and translates it into
 * more abstract buttons like "left" and "right".
 */

import { COMPO } from './common.js';

// =============================================================================
// Constants

// Virtual button definitions. Zero is unused so that falsy values in the button
// bindings can be treated as unbound.

export const Action = 1;
export const Up = 2;
export const Down = 3;
export const Left = 4;
export const Right = 5;

const ButtonCount = 6;

/**
 * Map from events to virtual buttons.
 *
 * These are taken from KeyboardEvent.code, and correspond to physical locations
 * on the keyboard. WASD will be ZQSD on a French layout keyboard, etc.
 *
 * @const {!Object<string, number>}
 */
const KeyBindings = {
  // WASD
  'KeyW': Up,
  'KeyA': Left,
  'KeyS': Down,
  'KeyD': Right,

  // Arrow keys
  'ArrowUp': Up,
  'ArrowLeft': Left,
  'ArrowDown': Down,
  'ArrowRight': Right,

  // Action / attack
  'Space': Action,
};

/**
 * Map from gamepad buttons (in the standard mapping) to virtual buttons.
 * @const {!Array<number>}
 */
const GamepadBindings = [Action, , , , , , , , , , , , Up, Down, Left, Right];

// =============================================================================

/**
 * IsActive is true if the controller has buttons that were pressed this frame.
 *
 * @typedef {{
 *   State: !Array<boolean>,
 *   PrevState: !Array<boolean>,
 *   X: number,
 *   Y: number,
 * }}
 */
export var Controller;

/**
 * Returns true if the given button was unpressed last frame, but pressed this
 * frame.
 * @param {!Controller} controller
 * @param {number} button
 * @return {boolean}
 */
export function DidPress({ State, PrevState }, button) {
  if (!COMPO && (button < 1 || ButtonCount <= button)) {
    throw new Error(`invalid button: ${button}`);
  }
  return State[button] && !PrevState[button];
}

/**
 * @return {!Controller}
 */
function NewController() {
  return {
    State: Array(ButtonCount).fill(false),
    PrevState: Array(ButtonCount).fill(false),
    X: 0,
    Y: 0,
  };
}

/**
 * @type {!Controller}
 */
export let Keyboard = NewController();

/**
 * @type {!Array<Controller|null>}
 */
export let Gamepads = [];

/**
 * First initialization, before the game starts.
 */
export function Init() {
  window.addEventListener(
    'gamepadconnected',
    /** @type{function(Event)} */ (
      (/** !GamepadEvent */ event) => {
        if (event.gamepad.mapping == 'standard') {
          Gamepads[event.gamepad.index] = NewController();
        }
      }
    ),
  );
  window.addEventListener(
    'gamepaddisconnected',
    /** @type{function(Event)} */ (
      (/** !GamepadEvent */ event) => (Gamepads[event.gamepad.index] = null)
    ),
  );
}

/**
 * Start listening for player input.
 */
export function Start() {
  document.onkeydown = /** @type {function(Event)} */ (
    function HandleKeyDown(/** KeyboardEvent */ evt) {
      const binding = KeyBindings[evt.code];
      if (binding) {
        Keyboard.IsActive = true;
        Keyboard.State[binding] = true;
        evt.preventDefault();
      }
    }
  );
  document.onkeyup = /** @type {function(Event)} */ (
    function HandleKeyUp(/** KeyboardEvent */ evt) {
      const binding = KeyBindings[evt.code];
      if (binding) {
        Keyboard.State[binding] = false;
        evt.preventDefault();
      }
    }
  );
}

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
 * Set the X and Y values of a controller.
 * @param {!Controller} controller
 * @param {number} x Joystick X position
 * @param {number} y Joystick Y position
 */
function SetControllerXY(controller, x, y) {
  var r;
  // If any button is down, override the joystick.
  if (
    controller.State[Up] |
    controller.State[Down] |
    controller.State[Left] |
    controller.State[Right]
  ) {
    y = controller.State[Down] - controller.State[Up];
    x = controller.State[Right] - controller.State[Left];
  }
  r = Math.hypot(x, y);
  if (r > 1) {
    x *= 1 / r;
    y *= 1 / r;
  }
  controller.X = x;
  controller.Y = y;
}

/**
 * Update the input state.
 */
export function UpdateState() {
  var i, j, controller, states, state, x, y, button;
  if (Gamepads.length) {
    states = navigator.getGamepads();
    for (i = 0; i < Gamepads.length; i++) {
      controller = Gamepads[i];
      state = states[i];

      if (controller) {
        // Read the buttons.
        controller.State.fill(false);
        for (j = 0; j < GamepadBindings.length; j++) {
          button = GamepadBindings[j];
          if (button && state.buttons[j].pressed) {
            controller.State[button] = true;
          }
        }

        // Read the joystick.
        x = state.axes[0];
        y = state.axes[1];
        if (x * x + y * y < JoystickDeadZone) {
          x = 0;
          y = 0;
        }
        SetControllerXY(controller, x / JoystickRange, y / JoystickRange);
      }
    }
  }
  SetControllerXY(Keyboard, 0, 0);
}

/**
 * Invoke a function for each controller.
 * @param {function(!Controller)} callback
 */
export function ForEachController(callback) {
  var i, controller;
  for (i = -1; i < Gamepads.length; i++) {
    controller = i < 0 ? Keyboard : Gamepads[i];
    if (controller) {
      callback(controller);
    }
  }
}

/**
 * Process the end of a frame.
 */
export function EndFrame() {
  ForEachController((controller) => {
    var j;
    for (j = 0; j < ButtonCount; j++) {
      controller.PrevState[j] = controller.State[j];
    }
  });
}

/**
 * Test if the controller has any buttons pressed this frame.
 * @param {!Controller} controller
 * @return {boolean}
 */
export function IsActive(controller) {
  var i;
  for (i = 0; i < ButtonCount; i++) {
    if (controller.State[i] && !controller.PrevState[i]) {
      return true;
    }
  }
  return false;
}
