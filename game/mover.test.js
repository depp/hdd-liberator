import * as grid from './grid.js';
import * as mover from './mover.js';

const griddata = `
........
.....X..
.X..XXX.
.....X..
.XX.....
.XX..X.X
......X.
`;

beforeAll(() => {
  const lines = griddata.split('\n').filter((s) => s.length);
  let width = 0;
  for (const line of lines) {
    width = Math.max(width, line.length);
  }
  grid.Reset(width, lines[0].length);
  for (let y = 0; y < lines.length; y++) {
    const line = lines[y];
    for (let x = 0; x < line.length; x++) {
      switch (line[x]) {
        case '.':
          break;
        case 'X':
          grid.Set(x, y, 1);
          break;
        default:
          throw new Error(`invalid grid cell: ${JSON.stringify(line[x])}`);
      }
    }
  }
});

function RunCase(c, name) {
  const { origin, delta, result } = c;
  const obj = { X0: -100, Y0: -100, X: origin[0], Y: origin[1] };
  mover.Move(obj, 0.25, delta[0], delta[1]);
  if (result[0] != obj.X || result[1] != obj.Y) {
    console.log('Case failed:', name, c, [obj.X, obj.Y]);
    throw new Error(
      `case ${name}: ` +
        `got (${obj.X}, ${obj.Y}), expect (${result[0]}, ${result[1]})`,
    );
  }
}

// Free movement - no obstacles.
test('free', () => {
  [
    { origin: [0.5, 0.5], delta: [0.5, 0.5], result: [1.0, 1.0] },
    { origin: [1.5, 0.5], delta: [-0.5, 0.5], result: [1.0, 1.0] },
    { origin: [0.5, 1.5], delta: [0.5, -0.5], result: [1.0, 1.0] },
    { origin: [1.5, 1.5], delta: [-0.5, -0.5], result: [1.0, 1.0] },
  ].forEach(RunCase);
});

function directionName(dx, dy) {
  if (dx && dy) {
    return `${dx > 0 ? '+' : '-'}X${dy > 0 ? '+' : '-'}Y`;
  }
  if (dx) {
    return dx > 0 ? '+X' : '-X';
  }
  if (dy) {
    return dy > 0 ? '+Y' : '-Y';
  }
  return '0';
}

// Moving against an outside corner.
test('corner outside', () => {
  const cx = 1.5;
  const cy = 2.5;
  for (let i = 0; i < 4; i++) {
    const dx = i & 1 ? -1 : 1;
    const dy = i & 2 ? -1 : 1;
    const basename = directionName(dx, dy);
    const delta = [dx * 0.5, dy * 0.5];
    for (let j = 0; j < 2; j++) {
      const d = 0.125 + 0.75 * j;
      // Slide in Y direction:
      const y = cy - dy * d;
      RunCase(
        {
          origin: [cx - dx, y],
          delta,
          result: [cx - dx * 0.75, y + 0.5 * dy],
        },
        `${i}.Y.${j}`,
      );
      // Slide in X direction:
      const x = cx - dx * d;
      RunCase(
        {
          origin: [x, cy - dy],
          delta,
          result: [x + 0.5 * dx, cy - dy * 0.75],
        },
        `${basename}.X.${j}`,
      );
    }
    let cases = [
      { lateral: 6 / 16, move: 0.25, name: 'ClipInside' },
      { lateral: 9 / 16, move: 0.25, name: 'ClipOutside' },
      { lateral: 12 / 16, move: 0.5, name: 'NoTouch' },
    ];
    for (const { lateral, move, name } of cases) {
      // Move in Y direction.
      RunCase(
        {
          origin: [cx - lateral * dx, cy - dy],
          delta: [0, dy * 0.5],
          result: [cx - lateral * dx, cy - (1 - move) * dy],
        },
        `${basename}.${name}.Y`,
      );
      // Move in X direction.
      RunCase(
        {
          origin: [cx - dx, cy - lateral * dy],
          delta: [dx * 0.5, 0],
          result: [cx - (1 - move) * dx, cy - lateral * dy],
        },
        `${basename}.${name}.X`,
      );
    }
  }
});

// Moving towards a wall.
test('wall', () => {
  [
    // Move +Y
    { origin: [1.5, 3.5], delta: [0.5, 0.5], result: [2, 3.75] },
    { origin: [2.5, 3.5], delta: [-0.5, 0.5], result: [2, 3.75] },
    // Move -Y
    { origin: [1.5, 6.5], delta: [0.5, -0.5], result: [2, 6.25] },
    { origin: [2.5, 6.5], delta: [-0.5, -0.5], result: [2, 6.25] },
    // Move +X
    { origin: [0.5, 4.5], delta: [0.5, 0.5], result: [0.75, 5] },
    { origin: [0.5, 5.5], delta: [0.5, -0.5], result: [0.75, 5] },
    // Move -X
    { origin: [3.5, 4.5], delta: [-0.5, 0.5], result: [3.25, 5] },
    { origin: [3.5, 5.5], delta: [-0.5, -0.5], result: [3.25, 5] },
  ].forEach(RunCase);
});

// Moving towards an inside corner.
// Free movement - no obstacles.
test('corner inside', () => {
  const cx = 5.5;
  const cy = 2.5;
  for (let i = 0; i < 4; i++) {
    const dx = i & 1 ? -1 : 1;
    const dy = i & 2 ? -1 : 1;
    RunCase(
      {
        origin: [cx - dx * 0.875, cy - dy * 0.875],
        delta: [dx * 0.5, dy * 0.5],
        result: [cx - dx * 0.75, cy - dy * 0.75],
      },
      `${i}.XY`,
    );
    RunCase(
      {
        origin: [cx - dx, cy - dy * 0.875],
        delta: [dx * 0.125, dy * 0.5],
        result: [cx - dx * 0.875, cy - dy * 0.75],
      },
      `${i}.X`,
    );
    RunCase(
      {
        origin: [cx - dx * 0.875, cy - dy],
        delta: [dx * 0.5, dy * 0.125],
        result: [cx - dx * 0.75, cy - dy * 0.875],
      },
      `${i}.Y`,
    );
  }
});

// Move away from inside corner.
test('corner away', () => {
  [
    { origin: [5.75, 6.25], delta: [0.25, -0.25] },
    { origin: [6.25, 5.75], delta: [-0.25, 0.25] },
    { origin: [6.75, 5.75], delta: [0.25, 0.25] },
    { origin: [7.25, 6.25], delta: [-0.25, -0.25] },
  ].forEach(({ origin, delta: [dx, dy] }, i) => {
    const [ox, oy] = origin;
    [
      { origin, delta: [dx, dy], result: origin },
      { origin, delta: [-dx, dy], result: [ox - dx, oy] },
      { origin, delta: [dx, -dy], result: [ox, oy - dy] },
      { origin, delta: [-dx, -dy], result: [ox - dx, oy - dy] },
      //
    ].forEach((c, j) => {
      RunCase(c, `${i}.${j}`);
    });
  });
});
