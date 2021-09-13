import * as grid from './grid.js';
import * as time from './time.js';
import { Player, Radius } from './player.js';
import { Boxes, TotalBoxArea } from './entity.box.js';
import { Devices } from './entity.device.js';
import { Downloads } from './entity.download.js';

/**
 * Size of one grid square, in pixels.
 * @const
 */
const GridSize = 32;

/**
 * @type {?CanvasRenderingContext2D}
 */
let ctx;

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
 * @param {HTMLCanvasElement} canvas
 * @return {boolean}
 */
export function Start2D(canvas) {
  ctx = /** @type {!CanvasRenderingContext2D} */ (
    canvas.getContext('2d', { alpha: false })
  );
  if (!ctx) {
    return false;
  }
  ctx.save();
  ctx.font = '100px ' + EmojiFont;
  const m = ctx.measureText('\u{1F600}');
  EmojiOffset = (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 200;
  ctx.restore();
  return true;
}

export function Stop2D() {
  ctx = null;
}

/**
 * @param {
 *   {X: number, Y: number, X0: number, Y0: number, W: number, H: number}|
 *   {X: number, Y: number, X0: number, Y0: number}|
 *   {X:number, Y:number}
 * } obj
 */
function Translate({ X, Y, X0, Y0, W = 0, H = 0 }) {
  ctx.save();
  if (X0 != null && Y0 != null) {
    ctx.translate(
      GridSize * (X0 + (X - X0) * time.Fraction + W / 2),
      GridSize * (Y0 + (Y - Y0) * time.Fraction + H / 2),
    );
  } else {
    ctx.translate(GridSize * (X + W / 2), GridSize * (Y + W / 2));
  }
}

/**
 * Draw an icon in the center of a box.
 * @param {{W: number, H: number}} box
 * @param {string} str
 */
function DrawIcon({ W, H }, str) {
  let size = Math.min(W, H) * ((GridSize * 0.8) | 0);
  ctx.font = `${size}px ${EmojiFont}`;
  ctx.fillText(str, 0, (size * EmojiOffset) | 0);
}

export function Render2D() {
  var x, y, pos;

  const Width = 640;
  const Height = 360;

  const Amber = '#fc2';
  const Red = '#f44';
  const Black = '#111';
  const Blue = '#25f';
  const TranslucentWhite = 'rgba(255,255,255,.5)';

  ctx.textAlign = 'center';

  /** @type {HTMLCanvasElement} */
  const c = ctx.canvas;

  ctx.fillStyle = Black;
  ctx.fillRect(0, 0, c.width, c.height);

  const xsize = GridSize * grid.Width;
  const ysize = GridSize * grid.Height;
  ctx.save(); // <----- game world
  ctx.translate(c.width / 2, c.height / 2);
  var scale = 0.8 * Math.min(c.width / xsize, c.height / ysize);
  ctx.scale(scale, scale);
  ctx.translate(-xsize / 2, -0.45 * ysize);

  /** @const {!Array<string>} */
  const colors = ['#ccc', '#444', '#6c6'];
  for (x = 0; x < grid.Width; x++) {
    for (y = 0; y < grid.Height; y++) {
      const value = grid.StaticCells[y * grid.Width + x];
      ctx.fillStyle = colors[value] ?? '#ccc';
      ctx.fillRect(x * GridSize, y * GridSize, GridSize, GridSize);
    }
  }
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#222';
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

  for (let obj of Devices) {
    Translate(obj);
    DrawIcon(obj, '\u{fe0f}\u{267b}');
    ctx.restore();
  }

  // ===========================================================================
  // Render boxes.

  ctx.fillStyle = '#cc3';
  for (let obj of Boxes) {
    Translate(obj);
    ctx.scale(obj.Scale, obj.Scale);
    ctx.beginPath();
    ctx.rect(
      2 - (GridSize / 2) * obj.W,
      2 - (GridSize / 2) * obj.H,
      GridSize * obj.W - 4,
      GridSize * obj.H - 4,
    );
    ctx.fillStyle = '#660';
    ctx.strokeStyle = Amber;
    ctx.fill();
    ctx.stroke();
    DrawIcon(obj, '\u{1F4C4}');
    ctx.restore();
  }

  // ===========================================================================
  // Render downloads.

  for (let { Box, Progress } of Downloads) {
    let r = GridSize * 0.3 * Math.min(Box.W, Box.H);
    Translate(Box);
    ctx.beginPath();
    ctx.rect(
      6 - (GridSize / 2) * Box.W,
      6 - (GridSize / 2) * Box.H,
      GridSize * Box.W - 12,
      GridSize * Box.H - 12,
    );
    ctx.fillStyle = TranslucentWhite;
    ctx.fill();
    ctx.fillStyle = Blue;
    ctx.strokeStyle = Blue;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, 0, 2 * Math.PI * Progress);
    ctx.fill();
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
  // Draw UI.

  ctx.restore(); // <---- done with world

  // Scale to a virtual 640x360 canvas size.
  ctx.save(); // <--- start UI
  ctx.scale(c.width / 640, c.width / 640);

  {
    const barheight = Height - 60;
    const ratio = TotalBoxArea / grid.StaticFreeArea;
    const bary = Math.min(
      barheight - 2,
      Math.round((barheight - 2) * (1 - ratio)),
    );
    ctx.save();
    ctx.translate(32, 20);
    ctx.font = '16px monospace';
    ctx.fillStyle = Red;
    ctx.fillText('%full', 0, barheight + 20);
    ctx.fillRect(-8, 0, 16, barheight);
    ctx.fillStyle = Black;
    if (bary > 0) {
      ctx.fillRect(-7, 1, 14, bary);
    }
    ctx.restore();
  }

  ctx.restore(); // <----- done with UI
}
