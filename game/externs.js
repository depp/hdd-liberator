/**
 * @externs
 */

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
