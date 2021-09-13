/**
 * @typedef {{
 *   Help: string,
 *   Create: function(),
 *   DownloadSpawnRate: number,
 *   DownloadSpeed: number,
 * }}
 */
export var Level;

/** @type {!Level} */
export let CurLevel;

/**
 * @param {!Level} level
 */
export function SetLevel(level) {
  CurLevel = level;
}
