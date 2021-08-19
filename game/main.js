function Fail(msg) {
  const div = document.createElement('div');
  const h = document.createElement('h2');
  div.appendChild(h);
  h.appendChild(document.createTextNode('Error'));
  const p = document.createElement('p');
  div.appendChild(p);
  p.appendChild(document.createTextNode(msg));
  document.body.appendChild(div);
}

function Start() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', {
    alpha: false,
  });
  if (gl == null) {
    Fail('Could not create WebGL 2 context.');
    return;
  }
  document.body.appendChild(canvas);
  gl.clearColor(0.3, 0.5, 0.7, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

Start();
