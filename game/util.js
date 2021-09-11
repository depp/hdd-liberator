/**
 * @param {number} n
 * @param {function(number): T} f
 * @return {Array<T>!}
 * @template T
 */
export function Iterate(n, f) {
  return [...Array(n).keys()].map(f);
}

/**
 * Return the angle with the smallest magnitude that, added to src, is equal to
 * target. The result never has a larger magnitude than pi.
 * @param {number} src
 * @param {number} target
 * @return {number}
 */
export function AngleDelta(src, target) {
  let tau = 2 * Math.PI;
  let delta = (target - src) % tau;
  if (delta > tau / 2) {
    return delta - tau;
  }
  if (delta < -tau / 2) {
    return delta + tau;
  }
  return delta;
}

/**
 * Return the dot product of the normalized version of the input vectors.
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @return {number}
 */
export function NormalizedDot(x1, y1, x2, y2) {
  let r =
    (x1 * x2 + y1 * y2) / Math.sqrt((x1 * x1 + y1 * y1) * (x2 * x2 + y2 * y2));
  return isFinite(r) ? r : 0;
}

/**
 * Clamp a number to a range.
 * @param {number} x
 * @param {number} minval
 * @param {number} maxval
 * @return {number}
 */
export function Clamp(x, minval, maxval) {
  return x < minval ? minval : x > maxval ? maxval : x;
}
