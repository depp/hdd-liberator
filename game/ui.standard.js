/**
 * @type {HTMLElement}
 */
let MainElement;

/**
 * @returns {HTMLElement}
 */
export function GetMain() {
  if (MainElement != null) {
    return MainElement;
  }
  const mains = document.getElementsByTagName('main');
  if (mains.length == 0) {
    console.error('no <main> element');
    return null;
  }
  if (mains.length > 1) {
    console.error('too many <main> elements');
    return null;
  }
  const main = mains[0];
  MainElement = main;
  return main;
}

/**
 * @param {!HTMLElement} node
 */
export function RemoveChildren(node) {
  while (node.firstChild != null) {
    node.removeChild(node.firstChild);
  }
}

/**
 * @param {!HTMLElement} node
 * @param {string} text
 */
export function SetElementText(node, text) {
  RemoveChildren(node);
  node.appendChild(document.createTextNode(text));
}

/**
 * @param {HTMLElement} element
 */
export function PutMain(element) {
  const main = GetMain();
  if (main != null) {
    RemoveChildren(main);
    main.appendChild(element);
  }
}

/**
 * @param {string} msg
 * @returns {HTMLDivElement}
 */
export function NewErrorMessage(msg) {
  const div = document.createElement('div');
  div.className = 'error';
  const h = document.createElement('h2');
  div.appendChild(h);
  h.appendChild(document.createTextNode('Error'));
  const p = document.createElement('p');
  div.appendChild(p);
  p.appendChild(document.createTextNode(msg));
  return div;
}

/**
 * Show an error message.
 *
 * @param {string} msg
 */
export function PutErrorMessage(msg) {
  PutMain(NewErrorMessage(msg));
}
