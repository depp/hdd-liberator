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
 * @const {Object<string, string>!}
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
 * @const {Object<string, number>!}
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
 * @param {Event} evt
 */
function HandleKeyDown(evt) {
  const binding = ButtonBindings[evt.code];
  if (binding) {
    ButtonState[binding] = 1;
    evt.preventDefault();
  }
}

/**
 * @param {Event} evt
 */
function HandleKeyUp(evt) {
  const binding = ButtonBindings[evt.code];
  if (binding) {
    ButtonState[binding] = 0;
    evt.preventDefault();
  }
}

/**
 * Start listening for player input.
 */
export function Start() {
  window.addEventListener('keydown', HandleKeyDown);
  window.addEventListener('keyup', HandleKeyUp);
  ZeroButtons(ButtonState);
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
