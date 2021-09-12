import * as grid from './grid.js';
import * as time from './time.js';
import { Player, Radius } from './player.js';
import { Boxes } from './entity.box.js';

/**
 * Size of one grid square, in pixels.
 * @const
 */
const GridSize = 32;

/**
 * @type {CanvasRenderingContext2D?}
 */
export let ctx;

/**
 * @param {CanvasRenderingContext2D?} c
 */
export function SetContext(c) {
  ctx = c;
}

/**
 * @param {{X: number, Y: number, X0: number, Y0: number}} obj
 */
function Translate({ X, Y, X0, Y0 }) {
  ctx.save();
  ctx.translate(
    GridSize * (X0 + (X - X0) * time.Fraction),
    GridSize * (Y0 + (Y - Y0) * time.Fraction),
  );
}

export function Render2D() {
  let x, y;

  ctx.save();

  /** @type {HTMLCanvasElement} */
  const c = ctx.canvas;
  ctx.fillStyle = '#666';
  ctx.fillRect(0, 0, c.width, c.height);

  ctx.translate(
    (c.width - GridSize * grid.Width) >> 1,
    (c.height - GridSize * grid.Height) >> 1,
  );

  ctx.save();
  /** @const {!Array<string>} */
  const colors = ['#ccc', '#c00', '#6c6', '#999'];
  for (x = 0; x < grid.Width; x++) {
    for (y = 0; y < grid.Height; y++) {
      const value = grid.Get(x, y);
      ctx.fillStyle = colors[value] ?? '#0ff';
      ctx.fillRect(x * GridSize, y * GridSize, GridSize, GridSize);
    }
  }
  let pos;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (pos = 0; pos <= grid.Width; pos++) {
    ctx.moveTo(pos * GridSize, 0);
    ctx.lineTo(pos * GridSize, grid.Height * GridSize);
  }
  for (pos = 0; pos <= grid.Height; pos++) {
    ctx.moveTo(0, pos * GridSize);
    ctx.lineTo(grid.Width * GridSize, pos * GridSize);
  }
  ctx.stroke();
  ctx.restore();

  // ===========================================================================
  // Render player.

  ctx.fillStyle = '#cc3';
  for (let box of Boxes) {
    Translate(box);
    ctx.fillRect(6, 6, box.W * GridSize - 12, box.H * GridSize - 12);
    ctx.restore();
  }

  // ===========================================================================
  // Render player.
  Translate(Player);

  ctx.fillStyle = '#00c';
  ctx.fillRect(-32 * Radius, -32 * Radius, 32 * 2 * Radius, 32 * 2 * Radius);
  ctx.strokeStyle = '#000;';
  ctx.fillStyle = '#fff';
  ctx.rotate(Player.Angle);
  ctx.beginPath();
  ctx.moveTo(15, 0);
  ctx.lineTo(-15, 7);
  ctx.lineTo(-15, -7);
  ctx.closePath();
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Draw an emoji, centered on a grid square. To center it vertically,
  // textBaseline does not appear to be sufficient... it was observed to be
  // off-center on different systems by different amounts. Instead, we pick an
  // emoji with a very circular shape (U+1F600 grinning face) and measure the
  // actual center of the glyph.
  ctx.save();
  ctx.font = '32px serif';
  const m = ctx.measureText('\u{1F600}');
  const off = (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) >> 1;
  ctx.textAlign = 'center';
  const str = '\u{1F923}';
  ctx.fillText(str, GridSize * 2.5, GridSize * 0.5 + off);
  ctx.fillRect(GridSize * 2.5 - 1, GridSize * 0.5 - 1, 2, 2);
  ctx.restore();

  ctx.restore();
}
