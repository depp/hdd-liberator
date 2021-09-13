/**
 * Factor for calculating the game UI font size.
 * @const
 */
export const FontScale = 0.45;

/**
 * Header at the top of the screen, for level help text.
 * @type {HTMLElement}
 */
export let Header;

/**
 * Centered announcement.
 * @type {HTMLElement}
 */
export let Center;

/**
 * @param {HTMLElement} header
 * @param {HTMLElement} center
 */
export function Init(header, center) {
  Header = header;
  Center = center;
}

/**
 * Set the contents of an element to the given text.
 * @param {HTMLElement} node
 * @param {string} text
 */
export function SetText(node, text) {
  node.style.visibility = text ? '' : 'hidden';
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
  node.appendChild(document.createTextNode(text));
}
