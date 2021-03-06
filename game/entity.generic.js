/**
 * @typedef {{
 *   X: number,
 *   Y: number,
 *   Radius: number,
 * }}
 */
var Actor;

/**
 * @type {!Array<!Actor>}
 */
export let Actors;

/**
 * Array of update functions. A function which returns false is considered
 * finished, will be dropped from the array and not called again.
 *
 * @type {!Array<function(): boolean>}
 */
export let Functions;

/**
 * Remove all generic entities from the level.
 */
export function Clear() {
  Actors = [];
  Functions = [];
}

/**
 * Call all update functions, removing the functions which return false.
 */
export function Update() {
  let i = 0;
  let j = 0;
  let n = Functions.length;
  let f;
  for (; i < n; ) {
    f = Functions[i++];
    if (f()) {
      Functions[j++] = f;
    }
  }
  Functions.length = j;
}
