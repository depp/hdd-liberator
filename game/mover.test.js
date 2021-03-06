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

function RunCase(c) {
  const { origin, delta, result } = c;
  const obj = { X0: -100, Y0: -100, X: origin[0], Y: origin[1] };
  mover.Move(obj, 0.25, delta[0], delta[1]);
  if (result[0] != obj.X || result[1] != obj.Y) {
    throw new Error(
      `origin: (${origin})\n` +
        `delta: (${delta})\n` +
        `output: (${obj.X}, ${obj.Y}); expect: (${result})`,
    );
  }
}

// Free movement - no obstacles.
describe('free', () => {
  [
    { origin: [0.5, 0.5], delta: [0.5, 0.5], result: [1.0, 1.0] },
    { origin: [1.5, 0.5], delta: [-0.5, 0.5], result: [1.0, 1.0] },
    { origin: [0.5, 1.5], delta: [0.5, -0.5], result: [1.0, 1.0] },
    { origin: [1.5, 1.5], delta: [-0.5, -0.5], result: [1.0, 1.0] },
  ].forEach((c) =>
    test(directionName(c.delta[0], c.delta[1]), () => RunCase(c)),
  );
});

function directionName(dx, dy) {
  if (dx && dy) {
    return `${dx > 0 ? 'P' : 'M'}X${dy > 0 ? 'P' : 'M'}Y`;
  }
  if (dx) {
    return dx > 0 ? 'PX' : 'MX';
  }
  if (dy) {
    return dy > 0 ? 'PY' : 'MY';
  }
  return '0';
}

// Moving against an outside corner.
describe('corner outside', () => {
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
      test(`${basename}_Y${j}`, () =>
        RunCase({
          origin: [cx - dx, y],
          delta,
          result: [cx - dx * 0.75, y + 0.5 * dy],
        }));
      // Slide in X direction:
      const x = cx - dx * d;
      test(`${basename}_X${j}`, () =>
        RunCase({
          origin: [x, cy - dy],
          delta,
          result: [x + 0.5 * dx, cy - dy * 0.75],
        }));
    }
    let cases = [
      { lateral: 6 / 16, move: 8 / 32, name: 'ClipInside' },
      { lateral: 9 / 16, move: 9 / 32, name: 'ClipOutside' },
      { lateral: 12 / 16, move: 9 / 32, name: 'NoTouch' },
    ];
    for (const { lateral, move, name } of cases) {
      // Move in Y direction.
      test(`${basename}_${name}_Y`, () =>
        RunCase({
          origin: [cx - lateral * dx, cy - dy],
          delta: [0, (dy * 9) / 32],
          result: [cx - lateral * dx, cy - (1 - move) * dy],
        }));
      // Move in X direction.
      test(`${basename}_${name}_X`, () =>
        RunCase({
          origin: [cx - dx, cy - lateral * dy],
          delta: [(dx * 9) / 32, 0],
          result: [cx - (1 - move) * dx, cy - lateral * dy],
        }));
    }
  }
});

// Moving towards a wall.
describe('wall', () => {
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
  ].forEach((c, i) =>
    test(`${directionName(c.delta[0], c.delta[1])}_${i}`, () => RunCase(c)),
  );
});

// Moving towards an inside corner.
// Free movement - no obstacles.
describe('corner inside', () => {
  const cx = 5.5;
  const cy = 2.5;
  for (let i = 0; i < 4; i++) {
    const dx = i & 1 ? -1 : 1;
    const dy = i & 2 ? -1 : 1;
    const name = directionName(dx, dy);
    test(`${name}_XY`, () =>
      RunCase({
        origin: [cx - dx * 0.875, cy - dy * 0.875],
        delta: [dx * 0.5, dy * 0.5],
        result: [cx - dx * 0.75, cy - dy * 0.75],
      }));
    test(`${name}_X`, () =>
      RunCase({
        origin: [cx - dx, cy - dy * 0.875],
        delta: [dx * 0.125, dy * 0.5],
        result: [cx - dx * 0.875, cy - dy * 0.75],
      }));
    test(`${name}_Y`, () =>
      RunCase({
        origin: [cx - dx * 0.875, cy - dy],
        delta: [dx * 0.5, dy * 0.125],
        result: [cx - dx * 0.75, cy - dy * 0.875],
      }));
  }
});

// Move away from inside corner.
describe('corner away', () => {
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
    ].forEach((c) =>
      test(
        directionName(dx, dy) + '_' + directionName(c.delta[0], c.delta[1]),
        () => RunCase(c),
      ),
    );
  });
});
