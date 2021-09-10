/**
 * @externs
 */

// Missing externs: GamepadEvent.

/**
 * @constructor
 * @extends {Event}
 * @param {string} type
 * @param {{gamepad: Gamepad}} options
 */
function GamepadEvent(type, options) {}

/**
 * @type {Gamepad}
 */
GamepadEvent.prototype.gamepad;

// These externs are for websocket.js. The websocket and other modules are very
// lightly coupled, since either the websocket module or other modules should be
// usable without loading the other modules. For example, the main module will
// be used without the websocket module in all release builds, and the websocket
// module should be usable by itself because it is still useful even if other
// modules contain errors.

/** @const */
var JS13K = {};

/**
 * A devserver build status.
 * @typedef {{
 *   state: ?string,
 *   error: ?string,
 * }}
 */
JS13K.BuildStatus;

/**
 * A devserver music status.
 * @typedef {{
 *   data: ?string,
 *   error: ?string,
 * }}
 */
JS13K.MusicStatus;

/**
 * A devserver build event.
 * @typedef {{
 *   build: ?JS13K.BuildStatus,
 *   music: ?JS13K.MusicStatus,
 * }}
 */
JS13K.DevEvent;

/**
 * Add a listener for devserver events.
 * @param {function(JS13K.DevEvent)} callback
 */
JS13K.AddDevListener = function (callback) {};

// These externs are for the Closure library. We don't actually use the Closure
// library, but we do want to be able to use goog.define(), which is necessary
// until the Closure compiler supports using @define in ECMAScript modules.
//
// See: https://github.com/google/closure-compiler/issues/1601

/** @const */
var goog = {};

/**
 * @param {string} name
 * @param {T} value
 * @return {T}
 * @template T
 */
goog.define = function (name, value) {};
