/**
 * @type {HTMLElement}
 */
let StatusIcon;

/**
 * @type {HTMLElement}
 */
let StatusText;

const IconBuilding = '\u22ef';
const IconOK = '\u2705';
const IconError = '\u26d4';

/**
 * @param {HTMLElement?} node
 * @param {string} text
 */
function SetNodeText(node, text) {
  if (node == null) {
    return;
  }
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
  if (text != '') {
    node.appendChild(document.createTextNode(text));
  }
}

/**
 * Set the build state info.
 * @param {string} icon Icon to display (emoji or text)
 * @param {string} text Text message to display
 */
function SetState(icon, text) {
  SetNodeText(StatusIcon, icon);
  SetNodeText(StatusText, text);
}

/**
 * @type {Map<string, {
 *   icon: string,
 *   text: string,
 * }>}
 */
const States = new Map([
  ['building', { icon: IconBuilding, text: 'Building' }],
  ['ok', { icon: IconOK, text: 'Success' }],
  ['fail', { icon: IconError, text: 'Fail' }],
]);

/**
 * Handle a new build state in response to websocket events.
 * @param {JS13K.DevEvent} event
 */
function UpdateState(event) {
  const { build } = event;
  if (build == null) {
    return;
  }
  const { state } = build;
  if (state == null) {
    return;
  }
  if (typeof state != 'string') {
    throw new Error('invalid state');
  }
  const info = States.get(state);
  if (info == null) {
    throw new Error(`unknown state: ${JSON.stringify(state)}`);
  }
  const { icon, text } = info;
  SetState(icon, text);
}

// =============================================================================

/**
 * @type {!Array<Function(JS13K.DevEvent)>}
 */
const DevListeners = [UpdateState];

/**
 * @type {!JS13K.DevEvent}
 */
let CurrentData = {};

/**
 * Add a listener for devserver events.
 * @param {function(JS13K.DevEvent)} callback
 */
function AddDevListener(callback) {
  callback(CurrentData);
  DevListeners.push(callback);
}

/**
 * @type {WebSocket}
 */
let Socket;

/**
 * Handle a websocket error.
 * @param {Event} ev
 */
function HandleError(ev) {
  console.error('WebSocket error:', ev);
  SetState(IconError, 'Error');
}

/**
 * Handle the websocket opening.
 */
function HandleOpen() {
  console.log('WebSocket open');
  SetState(IconBuilding, 'Connected');
}

/**
 * Handle the websocket closing.
 */
function HandleClose() {
  console.log('WebSocket closed');
  Socket = null;
  SetState(IconError, 'Disconnected');
}

/**
 * Handle a message from the websacket.
 * @param {MessageEvent} evt
 */
function HandleMessage(evt) {
  try {
    const { data } = evt;
    if (typeof data != 'string') {
      throw new Error('data is not a string');
    }
    const obj = JSON.parse(data);
    if (typeof obj != 'object' || Array.isArray(obj)) {
      throw new Error('invalid JSON');
    }
    Object.assign(CurrentData, obj);
    for (const listener of DevListeners) {
      try {
        listener(obj);
      } catch (e) {
        console.error(e);
      }
    }
  } catch (e) {
    console.error(e);
  }
}

/**
 * Get the element with the given id, or throw an error.
 * @param {string} name
 * @return HTMLElement
 */
function GetElement(name) {
  const elt = document.getElementById(name);
  if (elt == null) {
    throw new Error(`missing element: id="${elt}"`);
  }
  if (!(elt instanceof HTMLElement)) {
    throw new Error(`element has wrong type: id="${elt}"`);
  }
  return elt;
}

/**
 * Initialize the build status UI.
 */
function Init() {
  StatusIcon = GetElement('status-icon');
  StatusText = GetElement('status-text');
}

/**
 * Connect to the build status websocket.
 */
function Connect() {
  SetState('?', 'Connecting');
  Socket = new WebSocket(`ws://${window.location.host}/socket`);
  Socket.addEventListener('error', HandleError);
  Socket.addEventListener('open', HandleOpen);
  Socket.addEventListener('close', HandleClose);
  Socket.addEventListener(
    'message',
    /** @type EventListener */ (HandleMessage),
  );
}

function Start() {
  try {
    Init();
    Connect();
  } catch (e) {
    console.error(e);
    SetState(IconError, '' + e);
  }
}

window.JS13K = { AddDevListener };
Start();
