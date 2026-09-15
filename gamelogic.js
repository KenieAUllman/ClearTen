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
 * just means "compact each column's tokens down toward slot 0."
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
 * We use axial coordinates internally for PIECE SHAPES ONLY, because axial
 * offsets are translation-invariant (a shape defined in axial space looks
 * the same no matter where you place it), which offset coordinates are not
 * (the even/odd column rule above means the same "shape" would skew
 * depending which column it starts on if you used raw col/slot deltas).
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

  // Fills in the starting tokens on an otherwise-empty board.
  function withInitialTokens(board, tokens) {
    var next = cloneBoard(board);
    tokens.forEach(function (t) {
      setColor(next, t.col, t.slot, t.color);
    });
    return next;
  }

  function cloneBoard(board) {
    // columnSlots never changes after creation, so it's safe to share it.
    return { cells: Object.assign({}, board.cells), columnSlots: board.columnSlots };
  }

  function isValidCell(board, col, slot) {
    return Object.prototype.hasOwnProperty.call(board.cells, cellKey(col, slot));
  }

  function getColor(board, col, slot) {
    return board.cells[cellKey(col, slot)];
  }

  function setColor(board, col, slot, color) {
    board.cells[cellKey(col, slot)] = color;
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

  // A piece is { cells: [{dq, dr, color}, ...] }. `anchorCol`/`anchorSlot`
  // is where the piece's (dq:0, dr:0) cell is being placed; every other
  // cell's target position is derived from the axial offset, which is why
  // piece shapes stay identical no matter where on the board you place them.
  function getPieceTargetCells(piece, anchorCol, anchorSlot) {
    var anchorAxial = offsetToAxial(anchorCol, anchorSlot);
    return piece.cells.map(function (c) {
      var off = axialToOffset(anchorAxial.q + c.dq, anchorAxial.r + c.dr);
      return { col: off.col, slot: off.slot, color: c.color };
    });
  }

  function canPlacePiece(board, piece, anchorCol, anchorSlot) {
    var targets = getPieceTargetCells(piece, anchorCol, anchorSlot);
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      if (!isValidCell(board, t.col, t.slot)) return false;
      if (getColor(board, t.col, t.slot) !== null) return false;
    }
    return true;
  }

  // Returns a NEW board with the piece placed. Caller should check
  // canPlacePiece first; this does not re-validate.
  function placePiece(board, piece, anchorCol, anchorSlot) {
    var next = cloneBoard(board);
    var targets = getPieceTargetCells(piece, anchorCol, anchorSlot);
    targets.forEach(function (t) {
      setColor(next, t.col, t.slot, t.color);
    });
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

  function findConnectedGroup(board, startCol, startSlot) {
    var color = getColor(board, startCol, startSlot);
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
        if (!visited[k] && getColor(board, n.col, n.slot) === color) {
          visited[k] = true;
          stack.push(n);
        }
      }
    }
    return group;
  }

  // Scans the whole board and returns every connected same-color group that
  // meets or exceeds `threshold`. Multiple qualifying groups (even of
  // different colors) are all returned so they can clear simultaneously.
  function findAllQualifyingGroups(board, threshold) {
    var visited = {};
    var groups = [];
    Object.keys(board.cells).forEach(function (k) {
      if (visited[k]) return;
      var color = board.cells[k];
      if (color === null) {
        visited[k] = true;
        return;
      }
      var parts = k.split('_');
      var col = Number(parts[0]);
      var slot = Number(parts[1]);
      var group = findConnectedGroup(board, col, slot);
      group.forEach(function (c) { visited[cellKey(c.col, c.slot)] = true; });
      if (group.length >= threshold) {
        groups.push({ color: color, cells: group });
      }
    });
    return groups;
  }

  function clearGroups(board, groups) {
    var next = cloneBoard(board);
    var clearedCount = 0;
    groups.forEach(function (g) {
      g.cells.forEach(function (c) {
        setColor(next, c.col, c.slot, null);
        clearedCount++;
      });
    });
    return { board: next, clearedCount: clearedCount };
  }

  // Gravity: within each column independently, compact all tokens toward
  // slot 0 (the bottom), preserving their relative top-to-bottom order.
  // Columns never interact with each other -- this is the "consistent,
  // predictable, deterministic" definition of down for this prototype.
  function applyGravity(board) {
    var next = cloneBoard(board);
    Object.keys(board.columnSlots).forEach(function (colStr) {
      var col = Number(colStr);
      var slots = board.columnSlots[col];
      var colorsInOrder = slots
        .map(function (s) { return getColor(board, col, s); })
        .filter(function (c) { return c !== null; });
      slots.forEach(function (s, idx) {
        setColor(next, col, s, idx < colorsInOrder.length ? colorsInOrder[idx] : null);
      });
    });
    return next;
  }

  // Settles a board after a placement: gravity ALWAYS runs first (any
  // newly placed token, or any previously-supported token left dangling by
  // an earlier change, drops to the bottom of its column), and only then do
  // we check for qualifying groups. This must happen even when nothing
  // ends up clearing -- gravity is not conditional on a clear occurring.
  //
  // After that initial settle, this repeats clear -> gravity -> clear -> ...
  // until no more groups qualify. `events` records each clear step (plus
  // the initial settle, as a clear-less event) so the UI can animate each
  // stage in turn instead of jumping straight to the final board.
  function resolveCascade(board, threshold) {
    var events = [];

    var settled = applyGravity(board);
    if (!boardsEqual(board, settled)) {
      events.push({
        groups: [],
        clearedCount: 0,
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
  // tokens actually moved: [{col, fromSlot, toSlot, color}, ...]. Gravity
  // only ever compacts a column's occupied slots toward 0 while preserving
  // their relative order, so the i-th occupied slot (bottom-to-top) before
  // always corresponds to the i-th occupied slot after -- this just reads
  // off that pairing per column. Used by the UI to animate falls without
  // the engine needing to track per-token identity.
  function computeGravityMoves(beforeBoard, afterBoard) {
    var moves = [];
    Object.keys(beforeBoard.columnSlots).forEach(function (colStr) {
      var col = Number(colStr);
      var slots = beforeBoard.columnSlots[col];
      var before = slots.filter(function (s) { return getColor(beforeBoard, col, s) !== null; });
      var after = slots.filter(function (s) { return getColor(afterBoard, col, s) !== null; });
      for (var i = 0; i < before.length; i++) {
        var fromSlot = before[i];
        var toSlot = after[i];
        if (fromSlot !== toSlot) {
          moves.push({ col: col, fromSlot: fromSlot, toSlot: toSlot, color: getColor(beforeBoard, col, fromSlot) });
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
    getColor: getColor,
    setColor: setColor,
    getNeighbors: getNeighbors,
    getPieceTargetCells: getPieceTargetCells,
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
