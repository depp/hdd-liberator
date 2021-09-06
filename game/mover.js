import { COMPO } from './common.js';
import * as grid from './grid.js';

/**
 * @typedef {{
 *   X0: number,
 *   Y0: number,
 *   X: number,
 *   Y: number,
 * }}
 */
export var Mover;

/**
 * Update a mover which can collide with objects in the game.
 * @param {!Mover} obj The object to update.
 * @param {number} radius Radius of collision box (square, not circle).
 * @param {number} deltax Delta X movement.
 * @param {number} deltay Delta Y movement.
 */
export function Move(obj, radius, deltax, deltay) {
  if (!COMPO) {
    if (
      typeof deltax != 'number' ||
      !isFinite(deltax) ||
      typeof deltay != 'number' ||
      !isFinite(deltay)
    ) {
      throw new Error(`invalid movement: (${deltax}, ${deltay})`);
    }
    if (Math.abs(deltax) > 0.99 - radius || Math.abs(deltay) > 0.99 - radius) {
      throw new Error(`movement too large: (${deltax}, ${deltay})`);
    }
  }
  let x = (obj.X0 = obj.X);
  let y = (obj.Y0 = obj.Y);
  let newx = x + deltax;
  let newy = y + deltay;

  // Check collisions with surrounding tiles.
  // Sign of movement, in X and Y direction. Nonzero.
  let dirx = deltax > 0 ? 1 : -1;
  let diry = deltay > 0 ? 1 : -1;

  // Tile position of corner of mover in the opposite direction of movement.
  let tx = Math.floor(x - dirx * radius);
  let ty = Math.floor(y - diry * radius);

  // Adjacent tiles in the direction of movement.
  let tilex = grid.Get(tx + dirx, ty);
  let tiley = grid.Get(tx, ty + diry);
  let tilexy = grid.Get(tx + dirx, ty + diry);

  // Limit: where movement may stop.
  let limitx = tx + (deltax > 0) - radius * dirx;
  let limity = ty + (deltay > 0) - radius * diry;

  // Push: how much the object may be pushed, in each direction, to avoid
  // contact with walls.
  let pushx = dirx * (newx - limitx);
  let pushy = diry * (newy - limity);

  // If true, check for collision with the single tile at (tx, ty).
  let doCheckSingleTile = false;
  if (tilex && tiley) {
    // @|X
    // -+-
    // X|?
    //
    // Object is moving towards an inside corner, and can be blocked in both X
    // and Y directions.
    if (
      tilexy ||
      (dirx * (x - tx - 0.5) < 0.5 && diry * (y - ty - 0.5) < 0.5)
    ) {
      // We are not already through, on the other side.
      if (pushx > 0) {
        newx = limitx;
      }
      if (pushy > 0) {
        newy = limity;
      }
    }
  } else if (tilexy) {
    if (tilex) {
      // @|X
      // -+-
      //  |X
      //
      // There is vertical wall next to the object, with no nearby corners.
      if (pushx > 0) {
        newx = limitx;
      }
    } else if (tiley) {
      // @|
      // -+-
      // X|X
      //
      // There is a horizontal wall next to the object, with no nearby corners.
      if (pushy > 0) {
        newy = limity;
      }
    } else {
      // @|
      // -+-
      //  |X
      doCheckSingleTile = true;
      tx += dirx;
      ty += diry;
    }
  } else if (tilex) {
    // @|X
    // -+-
    //  |
    doCheckSingleTile = true;
    tx += dirx;
  } else if (tiley) {
    // @|
    // -+-
    //  |X
    doCheckSingleTile = true;
    ty += diry;
  }

  // Simple case: there is only one tile occupied nearby. Ignore the direction
  // that the object is moving, and just move the object the smallest distance
  // so it doesn't overlap.
  if (doCheckSingleTile) {
    // Direction of the mover, relative to the tile.
    dirx = newx > tx + 0.5 ? 1 : -1;
    diry = newy > ty + 0.5 ? 1 : -1;

    // Position where the mover may be moved, to avoid overlap with the tile.
    limitx = tx + 0.5 + dirx * (0.5 + radius);
    limity = ty + 0.5 + diry * (0.5 + radius);

    // How much the object will be pushed, in the dirx and diry directions, to
    // avoid overlap with the tile.
    pushx = Math.max(0, dirx * (limitx - newx));
    pushy = Math.max(0, diry * (limity - newy));

    if (pushx < pushy) {
      if (pushx > 0) {
        newx = limitx;
      }
    } else if (pushy > 0) {
      newy = limity;
    }
  }

  obj.X = newx;
  obj.Y = newy;
}
