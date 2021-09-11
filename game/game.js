import * as audio from './audio.game.js';
import * as input from './input.js';
import * as player from './player.js';
import * as time from './time.js';
import * as grid from './grid.js';
import * as entityBox from './entity.box.js';
import { ctx } from './render2d.js';
import { NewRandom } from './random.js';

/**
 * First initialization, before the game starts.
 */
export function Init() {
  input.Init();
}

/**
 * Initialize the game.
 */
export function Start() {
  let r = NewRandom(1);
  input.Start();
  audio.Start();
  grid.Reset(12, 8);
  grid.Set(0, 0, 1);
  entityBox.Spawn(r);
  grid.Set(0, 0, 0);
}

/**
 * Advance the game state.
 * @param {number} timestamp Current timestamp, in milliseconds.
 */
export function Update(timestamp) {
  input.UpdateState();
  for (let ticks = time.UpdateForTimestamp(timestamp); ticks--; ) {
    time.Advance();
    player.Update();
    input.EndFrame();
  }
}

/**
 * Render the game to a 2D canvas.
 */
export function Render2D() {
  let x, y;
  const gs = 32;

  ctx.save();

  /** @type {HTMLCanvasElement} */
  const c = ctx.canvas;
  ctx.fillStyle = '#666';
  ctx.fillRect(0, 0, c.width, c.height);

  ctx.translate(
    (c.width - gs * grid.Width) >> 1,
    (c.height - gs * grid.Height) >> 1,
  );

  ctx.save();
  /** @const {!Array<string>} */
  const colors = ['#ccc', '#c00', '#999'];
  for (x = 0; x < grid.Width; x++) {
    for (y = 0; y < grid.Height; y++) {
      const value = grid.Get(x, y);
      ctx.fillStyle = colors[value] ?? '#0ff';
      ctx.fillRect(x * gs, y * gs, gs, gs);
    }
  }
  let pos;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (pos = 0; pos <= grid.Width; pos++) {
    ctx.moveTo(pos * gs, 0);
    ctx.lineTo(pos * gs, grid.Height * gs);
  }
  for (pos = 0; pos <= grid.Height; pos++) {
    ctx.moveTo(0, pos * gs);
    ctx.lineTo(grid.Width * gs, pos * gs);
  }
  ctx.stroke();
  ctx.restore();

  player.Render2D();

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
  ctx.fillText(str, gs * 2.5, gs * 0.5 + off);
  ctx.fillRect(gs * 2.5 - 1, gs * 0.5 - 1, 2, 2);
  ctx.restore();

  ctx.restore();
}
