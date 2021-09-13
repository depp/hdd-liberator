/**
 * Random number generator. This is used instead of Math.random() so we can get
 * consistent output across different runs.
 */

// "MINSTD" random number generator.
const Modulus = 0x7fffffff;
const A = 48271;

/**
 * A random number generator.
 * @typedef {{
 *   NextInt: function(number): number,
 * }}
 */
export var Random;

/**
 * @param {number=} state
 * @returns {Random}
 */
export function NewRandom(state) {
  if (state == null) {
    if (window.crypto) {
      let data = new Uint32Array(4);
      window.crypto.getRandomValues(data);
      state = data[0];
    } else {
      state = +new Date();
    }
    state >>>= 1;
  }
  state = state || 1;

  /**
   * @returns {number}
   */
  function Next() {
    return (state = (state * A) % Modulus);
  }

  return {
    /**
     * @param {number} maxValue
     * @returns {number}
     */
    NextInt(maxValue) {
      if (maxValue <= 1) {
        return 0;
      }
      // Technically, this is wrong, because the result 0 from Next() is not
      // possible.
      let divisor = (Modulus / maxValue) | 0;
      let result;
      do {
        result = (Next() / divisor) | 0;
      } while (result >= maxValue);
      return result;
    },
  };
}

/**
 * Global random number generator, used when determinism is not necessary.
 * @type {Random}
 */
export var Rand;

/**
 * Initialize the global random number generator. This is not done at module
 * level, in case we want to use this module from Node (e.g. Jest).
 */
export function InitRandom() {
  Rand = NewRandom();
}
