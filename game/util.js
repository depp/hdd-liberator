/**
 * @param {number} n
 * @param {function(number): T} f
 * @return {Array<T>!}
 * @template T
 */
export function Iterate(n, f) {
  return [...Array(n).keys()].map(f);
}
