/*
 * ClearTen - pure game logic.
 *
 * Everything in this file is UI-free and side-effect-free (functions return
 * new state rather than mutating their inputs, except where noted). That
 * makes it easy to unit test and to run the exact same code in Node
 * (tests.js) and in the browser (game.js).
 *
 * HEX COORDINATES
 * ----------------
 * The board is stored using "offset" coordinates: every cell is a
 * (col, slot) pair. `col` is the column index (0 = leftmost). `slot` is the
 * vertical position *within that column*, where slot 0 is the bottom of the
 * column and increasing slot goes up. This makes gravity trivial: falling
 * just means "compact each column's occupied cells down toward slot 0."
 *
 * The board uses flat-topped hexagons, so each column sits directly above
 * the same column below it, and neighboring columns are offset vertically
 * by half a hex. Because the vertical offset alternates with column parity,
 * the neighbor relationship in (col, slot) space is different for even and
 * odd columns:
 *
 *   same column:      (col, slot - 1) and (col, slot + 1)
 *   even column (col%2==0): neighbors in col-1 and col+1 are at
 *                             slot - 1 and slot
 *   odd column  (col%2==1): neighbors in col-1 and col+1 are at
 *                             slot and slot + 1
 *
 * That offset-space rule is exactly equivalent to a standard axial hex
 * coordinate system under the mapping:
 *   q = col
 *   r = slot - floor(col / 2)
 * with the 6 axial neighbor directions (1,0) (1,-1) (0,-1) (-1,0) (-1,1) (0,1).
 *
 * LAYERED PIECES (V0.4 data model)
 * ---------------------------------
 * Every piece occupies exactly ONE board cell. A board cell is either:
 *   null                         -- empty
 *   { layers: [color, ...] }     -- occupied; layers[0] is the ACTIVE color
 *
 * `layers` holds 1-4 colors, ordered top (index 0, active) to bottom
 * (deepest, buried). Only the active color counts for connectivity/
 * clearing. Clearing a qualifying region removes just layers[0] from each
 * of its cells ("peels" the top layer); the next color becomes active. A
 * cell only becomes null once its very last layer is peeled.
 *
 * Every function that changes a cell's contents (peeling a layer, placing
 * a piece, moving it via gravity) replaces the cell with a BRAND NEW
 * object/array rather than mutating the existing one in place. That
 * invariant is what makes cloneBoard's shallow copy of the `cells` map
 * safe -- an older snapshot's cell objects are never touched by later
 * mutations, so Undo doesn't need a deep clone.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ClearTenLogic = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // The six axial neighbor directions, shared by every hex cell.
  var AXIAL_DIRECTIONS = [
    { dq: 1, dr: 0 },
    { dq: 1, dr: -1 },
    { dq: 0, dr: -1 },
    { dq: -1, dr: 0 },
    { dq: -1, dr: 1 },
    { dq: 0, dr: 1 }
  ];

  function cellKey(col, slot) {
    return col + '_' + slot;
  }

  function offsetToAxial(col, slot) {
    return { q: col, r: slot - Math.floor(col / 2) };
  }

  function axialToOffset(q, r) {
    return { col: q, slot: r + Math.floor(q / 2) };
  }

  // --- Board construction -------------------------------------------------

  // `layout` is an array of {col, slot} describing every legal cell on the
  // board (this is what gives the board its irregular outer shape).
  function createBoard(layout) {
    var cells = {};
    var columnSlots = {};
    layout.forEach(function (cell) {
      cells[cellKey(cell.col, cell.slot)] = null;
      if (!columnSlots[cell.col]) columnSlots[cell.col] = [];
      columnSlots[cell.col].push(cell.slot);
    });
    Object.keys(columnSlots).forEach(function (col) {
      columnSlots[col].sort(function (a, b) { return a - b; });
    });
    return { cells: cells, columnSlots: columnSlots };
  }

  // Fills in the starting layered pieces on an otherwise-empty board.
  // `tokens` is [{col, slot, layers: [color, ...]}, ...].
  function withInitialTokens(board, tokens) {
    var next = cloneBoard(board);
    tokens.forEach(function (t) {
      setCell(next, t.col, t.slot, { layers: t.layers.slice() });
    });
    return next;
  }

  function cloneBoard(board) {
    // columnSlots never changes after creation, so it's safe to share it.
    // Cell values are only ever replaced wholesale (see the file header
    // note), never mutated, so a shallow copy of the map is sufficient.
    return { cells: Object.assign({}, board.cells), columnSlots: board.columnSlots };
  }

  function isValidCell(board, col, slot) {
    return Object.prototype.hasOwnProperty.call(board.cells, cellKey(col, slot));
  }

  function getCell(board, col, slot) {
    return board.cells[cellKey(col, slot)];
  }

  function setCell(board, col, slot, cellValue) {
    board.cells[cellKey(col, slot)] = cellValue;
  }

  function isOccupied(board, col, slot) {
    return getCell(board, col, slot) !== null;
  }

  // The color currently counting toward connectivity/clearing, or null if
  // the cell is empty.
  function getActiveColor(board, col, slot) {
    var cell = getCell(board, col, slot);
    return cell ? cell.layers[0] : null;
  }

  // Full remaining layer stack (active first), or null if empty. Returns a
  // copy so callers can't accidentally mutate board state.
  function getLayers(board, col, slot) {
    var cell = getCell(board, col, slot);
    return cell ? cell.layers.slice() : null;
  }

  function getNeighbors(board, col, slot) {
    var axial = offsetToAxial(col, slot);
    var result = [];
    for (var i = 0; i < AXIAL_DIRECTIONS.length; i++) {
      var dir = AXIAL_DIRECTIONS[i];
      var off = axialToOffset(axial.q + dir.dq, axial.r + dir.dr);
      if (isValidCell(board, off.col, off.slot)) {
        result.push({ col: off.col, slot: off.slot });
      }
    }
    return result;
  }

  // --- Pieces ---------------------------------------------------------------
  // A piece is { id, layers: [color, ...] } (1-4 colors, top first). Every
  // piece occupies exactly one cell -- there is no shape/anchor concept
  // anymore, unlike the multi-cell geometric pieces of earlier prototypes.

  function canPlacePiece(board, piece, col, slot) {
    return isValidCell(board, col, slot) && !isOccupied(board, col, slot);
  }

  // Returns a NEW board with the piece placed. Caller should check
  // canPlacePiece first; this does not re-validate.
  function placePiece(board, piece, col, slot) {
    var next = cloneBoard(board);
    setCell(next, col, slot, { layers: piece.layers.slice() });
    return next;
  }

  function hasAnyLegalMove(board, pieces) {
    var allCells = Object.keys(board.cells).map(function (k) {
      var parts = k.split('_');
      return { col: Number(parts[0]), slot: Number(parts[1]) };
    });
    for (var p = 0; p < pieces.length; p++) {
      var piece = pieces[p];
      if (!piece) continue;
      for (var c = 0; c < allCells.length; c++) {
        if (canPlacePiece(board, piece, allCells[c].col, allCells[c].slot)) {
          return true;
        }
      }
    }
    return false;
  }

  // --- Connectivity / clearing ----------------------------------------------
  // Connectivity is based ENTIRELY on each cell's active (top) color.
  // Buried colors never participate until they become active.

  function findConnectedGroup(board, startCol, startSlot) {
    var color = getActiveColor(board, startCol, startSlot);
    if (color === null) return [];
    var visited = {};
    var startKey = cellKey(startCol, startSlot);
    visited[startKey] = true;
    var stack = [{ col: startCol, slot: startSlot }];
    var group = [];
    while (stack.length) {
      var cur = stack.pop();
      group.push(cur);
      var neighbors = getNeighbors(board, cur.col, cur.slot);
      for (var i = 0; i < neighbors.length; i++) {
        var n = neighbors[i];
        var k = cellKey(n.col, n.slot);
        if (!visited[k] && getActiveColor(board, n.col, n.slot) === color) {
          visited[k] = true;
          stack.push(n);
        }
      }
    }
    return group;
  }

  // Scans the whole board and returns every connected same-active-color
  // group that meets or exceeds `threshold`. Multiple qualifying groups
  // (even of different colors) are all returned so they can clear
  // simultaneously.
  function findAllQualifyingGroups(board, threshold) {
    var visited = {};
    var groups = [];
    Object.keys(board.cells).forEach(function (k) {
      if (visited[k]) return;
      var cell = board.cells[k];
      if (cell === null) {
        visited[k] = true;
        return;
      }
      var parts = k.split('_');
      var col = Number(parts[0]);
      var slot = Number(parts[1]);
      var group = findConnectedGroup(board, col, slot);
      group.forEach(function (c) { visited[cellKey(c.col, c.slot)] = true; });
      if (group.length >= threshold) {
        groups.push({ color: cell.layers[0], cells: group });
      }
    });
    return groups;
  }

  // Peels the top (active) layer off every cell in every qualifying group.
  // A cell with more layers left behind becomes occupied by the REST of its
  // stack (its next color is now active); a cell with only one layer
  // becomes null. The whole piece is only ever removed once its last layer
  // is gone -- clearing never deletes a piece that still has buried colors.
  //
  // Returns the new board, how many top layers were peeled, and a
  // `revealed` list describing what's now on top of each affected cell (or
  // null if that piece is gone) -- the UI uses this to show "I cleared
  // pink, and purple was underneath."
  function clearGroups(board, groups) {
    var next = cloneBoard(board);
    var clearedCount = 0;
    var revealed = [];
    groups.forEach(function (g) {
      g.cells.forEach(function (c) {
        var layers = getLayers(board, c.col, c.slot);
        var remaining = layers.slice(1);
        setCell(next, c.col, c.slot, remaining.length > 0 ? { layers: remaining } : null);
        clearedCount++;
        revealed.push({
          col: c.col,
          slot: c.slot,
          newActiveColor: remaining.length > 0 ? remaining[0] : null
        });
      });
    });
    return { board: next, clearedCount: clearedCount, revealed: revealed };
  }

  // Gravity: within each column independently, compact all occupied cells
  // toward slot 0 (the bottom), preserving their relative top-to-bottom
  // order. A layered piece moves as a single indivisible unit -- gravity
  // relocates the whole { layers } object, so its buried colors can never
  // separate from it. Columns never interact with each other -- this is
  // the "consistent, predictable, deterministic" definition of down for
  // this prototype.
  function applyGravity(board) {
    var next = cloneBoard(board);
    Object.keys(board.columnSlots).forEach(function (colStr) {
      var col = Number(colStr);
      var slots = board.columnSlots[col];
      var occupiedInOrder = slots
        .map(function (s) { return getCell(board, col, s); })
        .filter(function (c) { return c !== null; });
      slots.forEach(function (s, idx) {
        setCell(next, col, s, idx < occupiedInOrder.length ? occupiedInOrder[idx] : null);
      });
    });
    return next;
  }

  // Settles a board after a placement: gravity ALWAYS runs first (any
  // newly placed piece, or any previously-supported piece left dangling by
  // an earlier change, drops to the bottom of its column), and only then do
  // we check for qualifying groups. This must happen even when nothing
  // ends up clearing -- gravity is not conditional on a clear occurring.
  //
  // After that initial settle, this repeats peel -> gravity -> peel -> ...
  // until no more groups qualify. `events` records each step (plus the
  // initial settle, as a clear-less event) so the UI can animate each
  // stage in turn instead of jumping straight to the final board.
  function resolveCascade(board, threshold) {
    var events = [];

    var settled = applyGravity(board);
    if (!boardsEqual(board, settled)) {
      events.push({
        groups: [],
        clearedCount: 0,
        revealed: [],
        boardBeforeGravity: board,
        boardAfterClear: board,
        boardAfterGravity: settled
      });
    }
    var current = settled;

    while (true) {
      var groups = findAllQualifyingGroups(current, threshold);
      if (groups.length === 0) break;
      var clearResult = clearGroups(current, groups);
      var afterGravity = applyGravity(clearResult.board);
      events.push({
        groups: groups,
        clearedCount: clearResult.clearedCount,
        revealed: clearResult.revealed,
        boardBeforeGravity: clearResult.board,
        boardAfterClear: clearResult.board,
        boardAfterGravity: afterGravity
      });
      current = afterGravity;
    }
    return { board: current, events: events };
  }

  function boardsEqual(a, b) {
    var keys = Object.keys(a.cells);
    for (var i = 0; i < keys.length; i++) {
      if (a.cells[keys[i]] !== b.cells[keys[i]]) return false;
    }
    return true;
  }

  // Given a board and the result of applyGravity(board), returns which
  // pieces actually moved: [{col, fromSlot, toSlot}, ...]. Gravity only
  // ever compacts a column's occupied slots toward 0 while preserving
  // their relative order, so the i-th occupied slot (bottom-to-top) before
  // always corresponds to the i-th occupied slot after -- this just reads
  // off that pairing per column. A piece's layers never change during a
  // pure gravity move, so the UI only needs the position change to animate
  // the whole layered token falling as one unit.
  function computeGravityMoves(beforeBoard, afterBoard) {
    var moves = [];
    Object.keys(beforeBoard.columnSlots).forEach(function (colStr) {
      var col = Number(colStr);
      var slots = beforeBoard.columnSlots[col];
      var before = slots.filter(function (s) { return isOccupied(beforeBoard, col, s); });
      var after = slots.filter(function (s) { return isOccupied(afterBoard, col, s); });
      for (var i = 0; i < before.length; i++) {
        var fromSlot = before[i];
        var toSlot = after[i];
        if (fromSlot !== toSlot) {
          moves.push({ col: col, fromSlot: fromSlot, toSlot: toSlot });
        }
      }
    });
    return moves;
  }

  function boardIsEmpty(board) {
    return Object.keys(board.cells).every(function (k) {
      return board.cells[k] === null;
    });
  }

  function occupiedCellCount(board) {
    return Object.keys(board.cells).filter(function (k) {
      return board.cells[k] !== null;
    }).length;
  }

  return {
    cellKey: cellKey,
    offsetToAxial: offsetToAxial,
    axialToOffset: axialToOffset,
    createBoard: createBoard,
    withInitialTokens: withInitialTokens,
    cloneBoard: cloneBoard,
    isValidCell: isValidCell,
    getCell: getCell,
    setCell: setCell,
    isOccupied: isOccupied,
    getActiveColor: getActiveColor,
    getLayers: getLayers,
    getNeighbors: getNeighbors,
    canPlacePiece: canPlacePiece,
    placePiece: placePiece,
    hasAnyLegalMove: hasAnyLegalMove,
    findConnectedGroup: findConnectedGroup,
    findAllQualifyingGroups: findAllQualifyingGroups,
    clearGroups: clearGroups,
    applyGravity: applyGravity,
    resolveCascade: resolveCascade,
    computeGravityMoves: computeGravityMoves,
    boardIsEmpty: boardIsEmpty,
    occupiedCellCount: occupiedCellCount
  };
});
