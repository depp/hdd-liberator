// Note about goog.define: We are not using the Closure library, which defines
// goog.define.
//
// When building with the Closure compiler, the call to goog.define will get
// replaced, given the right optimization level. However, the goog variable must
// be defined somewhere in an extern. This is done in CompilerDaemon.java, which
// creates an extern containing "var goog;".
//
// When serving for development, we define "var goog" in a script block, with a
// definition for goog.define that returns its second argument. This is done by
// index.gohtml.

/**
 * True if this is a JS13K compo build--designed to fit within 13 KiB.
 * @define {boolean}
 */
export const COMPO = goog.define('COMPO', false);

/**
 * True if this is a relase build--designed to run outside of the devserver.
 * This should be true if COMPO is true.
 * @define {boolean}
 */
export const RELEASE = goog.define('RELEASE', false);

/**
 * Number of different values that can appear in a byte of the embedded data.
 * See embed.go.
 * @const {number}
 */
export const NUM_VALUES = 128 - 3;
