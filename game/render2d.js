import * as grid from './grid.js';
import * as time from './time.js';
import { Player, Radius } from './player.js';
import { Boxes } from './entity.box.js';
import { Devices } from './entity.device.js';

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
 * Vertical offset for centering emoji, relative to font size.
 *
 * To center emoji vertically, textBaseline does not appear to be sufficient...
 * it was observed to be off-center on different systems by different amounts.
 * Instead, we pick an emoji with a very circular shape (U+1F600 grinning face)
 * and measure the actual center of the glyph.
 *
 * @type {number}
 */
let EmojiOffset;

/**
 * Font for rendering emjoi.
 * @const
 */
const EmojiFont = '"Noto Color Emoji"';

/**
 * @param {CanvasRenderingContext2D?} c
 */
export function SetContext(c) {
  ctx = c;
  c.font = '100px ' + EmojiFont;
  const m = c.measureText('\u{1F600}');
  EmojiOffset = (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 200;
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

/**
 * Draw an icon in the center of a box.
 * @param {{W: number, H: number}} box
 * @param {string} str
 */
function DrawIcon({ W, H }, str) {
  let size = Math.min(W, H) * ((GridSize * 0.9) | 0);
  ctx.font = `${size}px ${EmojiFont}`;
  ctx.fillText(
    str,
    (GridSize / 2) * W,
    (GridSize / 2) * H + ((size * EmojiOffset) | 0),
  );
}

export function Render2D() {
  let x, y;

  ctx.save();
  ctx.textAlign = 'center';

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

  for (let obj of Devices) {
    ctx.save();
    ctx.translate(obj.X * GridSize, obj.Y * GridSize);
    DrawIcon(obj, '\u{fe0f}\u{267b}');
    ctx.restore();
  }

  // ===========================================================================
  // Render boxes.

  ctx.fillStyle = '#cc3';
  for (let obj of Boxes) {
    Translate(obj);
    DrawIcon(obj, '\u{1F4C4}');
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

  // ===========================================================================
  // Done.

  ctx.restore();
}
