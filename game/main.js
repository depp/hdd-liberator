/**
 * The requestAnimationFrame handle.
 *
 * @type {number?}
 */
let RAFHandle;

/**
 * @type {WebGLRenderingContext}
 */
let gl;

/**
 * Show an error message.
 *
 * @param {string} msg
 */
function PutErrorMessage(msg) {
  const div = document.createElement('div');
  const h = document.createElement('h2');
  div.appendChild(h);
  h.appendChild(document.createTextNode('Error'));
  const p = document.createElement('p');
  div.appendChild(p);
  p.appendChild(document.createTextNode(msg));
  document.body.appendChild(div);
}

/**
 * Callback for requestAnimationFrame.
 * @param {number!} time
 */
function Frame(time) {
  const t = time * 0.001;
  gl.clearColor(
    0.5 + 0.5 * Math.cos(t),
    0.5 + 0.5 * Math.cos(t + (Math.PI * 2) / 3),
    0.5 + 0.5 * Math.cos(t - (Math.PI * 2) / 3),
    1.0,
  );
  gl.clear(gl.COLOR_BUFFER_BIT);
  requestAnimationFrame(Frame);
}

/**
 * Start the game. Called once, when the script is run.
 */
function Start() {
  const canvas = document.createElement('canvas');
  gl = canvas.getContext('webgl', {
    alpha: false,
  });
  if (gl == null) {
    PutErrorMessage('Could not create WebGL context.');
    return;
  }
  document.body.appendChild(canvas);
  Frame(0);
}

Start();
