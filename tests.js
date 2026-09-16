/*
 * ClearTen - lightweight automated tests for the pure game-logic functions.
 *
 * Run with:  node tests.js
 *
 * No test framework -- just plain assertions with clear pass/fail output.
 * This is a prototype; the goal is confidence, not coverage percentage.
 */

var assert = require('assert');
var Logic = require('./gamelogic.js');
var Config = require('./config.js');

var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok - ' + name);
  } catch (err) {
    failed++;
    console.log('  FAIL - ' + name);
    console.log('    ' + err.message);
  }
}

function makeLineBoard(length) {
  // A single straight column, useful for isolated connectivity tests.
  var layout = [];
  for (var s = 0; s < length; s++) layout.push({ col: 0, slot: s });
  return Logic.createBoard(layout);
}

var level = Config.LEVELS[0];

console.log('ClearTen game logic tests\n');

// ===========================================================================
// GENERIC ENGINE TESTS -- these exercise gamelogic.js directly and are
// independent of any specific level's board shape.
// ===========================================================================

// 1. A layered piece can contain 2-4 colors.
test('a layered piece can be constructed with 2, 3, or 4 layers', function () {
  [2, 3, 4].forEach(function (n) {
    var layers = ['red', 'purple', 'orange', 'red'].slice(0, n);
    var board = Logic.withInitialTokens(Logic.createBoard([{ col: 0, slot: 0 }]), [
      { col: 0, slot: 0, layers: layers }
    ]);
    assert.deepStrictEqual(Logic.getLayers(board, 0, 0), layers);
  });
});

// 2. Only the top color counts toward connectivity.
test('only the active (top) layer counts for connectivity, not buried colors', function () {
  var board = makeLineBoard(2);
  board = Logic.withInitialTokens(board, [
    { col: 0, slot: 0, layers: ['red', 'purple'] },
    { col: 0, slot: 1, layers: ['purple', 'red'] } // buried red should NOT connect to the active red above
  ]);
  var redGroup = Logic.findConnectedGroup(board, 0, 0);
  assert.strictEqual(redGroup.length, 1, 'active red at slot0 should not connect through slot1 (active purple there)');
});

// 3 & 4. Threshold behavior (9 doesn't clear, 10 does). LOCKED at exactly
// 10 for V0.6 -- every level is built around this number, never more.
test('9 connected active colors do not clear', function () {
  var board = makeLineBoard(9);
  var tokens = [];
  for (var s = 0; s < 9; s++) tokens.push({ col: 0, slot: s, layers: ['red', 'purple'] });
  board = Logic.withInitialTokens(board, tokens);
  var groups = Logic.findAllQualifyingGroups(board, Config.CLEAR_THRESHOLD);
  assert.strictEqual(groups.length, 0);
});

test('10 connected active colors clear', function () {
  var board = makeLineBoard(10);
  var tokens = [];
  for (var s = 0; s < 10; s++) tokens.push({ col: 0, slot: s, layers: ['red', 'purple'] });
  board = Logic.withInitialTokens(board, tokens);
  var groups = Logic.findAllQualifyingGroups(board, Config.CLEAR_THRESHOLD);
  assert.strictEqual(groups.length, 1);
  assert.strictEqual(groups[0].cells.length, 10);
  assert.strictEqual(groups[0].color, 'red');
});

test('Config.CLEAR_THRESHOLD is locked at exactly 10 for V0.6', function () {
  assert.strictEqual(Config.CLEAR_THRESHOLD, 10);
});

// 5 & 6. Clearing removes ONLY the top layer; the next layer becomes active.
test('clearing a qualifying group peels only the top layer, revealing the next color', function () {
  var board = makeLineBoard(10);
  var tokens = [];
  for (var s = 0; s < 10; s++) tokens.push({ col: 0, slot: s, layers: ['red', 'purple', 'orange'] });
  board = Logic.withInitialTokens(board, tokens);
  var groups = Logic.findAllQualifyingGroups(board, Config.CLEAR_THRESHOLD);
  var result = Logic.clearGroups(board, groups);
  assert.strictEqual(result.clearedCount, 10);
  for (var s2 = 0; s2 < 10; s2++) {
    assert.deepStrictEqual(Logic.getLayers(result.board, 0, s2), ['purple', 'orange'], 'slot ' + s2 + ' should keep its remaining layers');
  }
  assert.ok(result.revealed.every(function (r) { return r.newActiveColor === 'purple'; }));
});

// 7. A piece disappears only when all layers are gone.
test('a piece is removed from the board only once its last layer clears', function () {
  var board = makeLineBoard(10);
  var tokens = [];
  for (var s = 0; s < 10; s++) tokens.push({ col: 0, slot: s, layers: ['red', 'purple'] });
  board = Logic.withInitialTokens(board, tokens);

  // Clear red -> purple remains (piece still present).
  var afterRed = Logic.clearGroups(board, Logic.findAllQualifyingGroups(board, Config.CLEAR_THRESHOLD));
  assert.ok(Logic.isOccupied(afterRed.board, 0, 0), 'piece should still be present with purple remaining');

  // Clear purple -> it was the last layer, so the piece is gone.
  var afterPurple = Logic.clearGroups(afterRed.board, Logic.findAllQualifyingGroups(afterRed.board, Config.CLEAR_THRESHOLD));
  assert.strictEqual(Logic.isOccupied(afterPurple.board, 0, 0), false, 'piece should be gone after its last layer clears');
  assert.strictEqual(afterPurple.revealed[0].newActiveColor, null);
});

// 8. Gravity moves the entire layered piece together.
test('gravity moves a whole layered piece as one unit -- layers never separate', function () {
  var board = makeLineBoard(5);
  board = Logic.withInitialTokens(board, [{ col: 0, slot: 4, layers: ['red', 'purple', 'orange'] }]);
  var settled = Logic.applyGravity(board);
  assert.deepStrictEqual(Logic.getLayers(settled, 0, 0), ['red', 'purple', 'orange']);
  assert.strictEqual(Logic.getCell(settled, 0, 4), null);
});

// 9. Gravity runs after placement (even with no clear).
test('resolveCascade settles a floating piece even when nothing clears', function () {
  var board = makeLineBoard(5);
  board = Logic.withInitialTokens(board, [{ col: 0, slot: 4, layers: ['red', 'purple'] }]);
  var result = Logic.resolveCascade(board, Config.CLEAR_THRESHOLD);
  assert.deepStrictEqual(Logic.getLayers(result.board, 0, 0), ['red', 'purple']);
  assert.strictEqual(Logic.getCell(result.board, 0, 4), null);
  assert.strictEqual(result.events.length, 1);
  assert.strictEqual(result.events[0].groups.length, 0);
});

// 10 & 11. Gravity runs after clears, and cascades detect newly exposed
// colors -- here specifically via a GRAVITY MOVE, not just a same-cell
// reveal. This is the exact mechanism level 5's "future color" trap relies
// on, isolated down to a minimal two-column repro.
test('cascade: clearing a piece fully away lets gravity drop another piece into a brand new connection', function () {
  var layout = [];
  for (var s = 0; s < 11; s++) layout.push({ col: 0, slot: s });
  for (s = 0; s < 9; s++) layout.push({ col: 1, slot: s });
  var board = Logic.createBoard(layout);
  var tokens = [];
  for (s = 0; s < 10; s++) tokens.push({ col: 0, slot: s, layers: ['red'] });
  tokens.push({ col: 0, slot: 10, layers: ['purple'] });
  for (s = 0; s < 9; s++) tokens.push({ col: 1, slot: s, layers: ['purple'] });
  board = Logic.withInitialTokens(board, tokens);

  var preCheck = Logic.findAllQualifyingGroups(board, Config.CLEAR_THRESHOLD);
  assert.strictEqual(preCheck.length, 1, 'only the red group should qualify before any clearing');

  var result = Logic.resolveCascade(board, Config.CLEAR_THRESHOLD);
  assert.strictEqual(result.events.length, 2, 'expected a red-clear event, then a purple-clear event once gravity connects it');
  assert.strictEqual(result.events[0].groups[0].color, 'red');
  assert.strictEqual(result.events[1].groups[0].color, 'purple');
  assert.strictEqual(result.events[1].groups[0].cells.length, 10);
  assert.ok(Logic.boardIsEmpty(result.board));
});

// 12. Used current pieces are replaced from the hidden predetermined
// sequence. With no Upcoming preview, this is the only visible future
// information.
test('drawing pieces from the hidden sequence preserves order and full layer arrays', function () {
  var seq = level.pieceSequence;
  var current = seq.slice(0, 3);
  assert.strictEqual(current.length, 3);
  seq.forEach(function (piece, i) {
    assert.ok(Array.isArray(piece.layers) && piece.layers.length >= 1 && piece.layers.length <= 3,
      'piece ' + i + ' (' + piece.id + ') should carry 1-3 layers');
  });
  assert.ok(seq.some(function (p) { return p.layers.length >= 2; }), 'at least some pieces should actually have buried colors');
  // Simulate game.js's draw-on-use behavior: using slot 0 pulls seq[3] in,
  // slot 1 still holds seq[1], etc. -- each slot independently refills.
  var pieceIndex = 3;
  var slots = seq.slice(0, 3);
  slots[0] = seq[pieceIndex++];
  assert.strictEqual(slots[0].id, seq[3].id);
  assert.strictEqual(slots[1].id, seq[1].id, 'untouched slots keep their piece');
});

// 13. Undo restores complete layered state -- tested at the snapshot level
// game.js relies on: cloning a board with layered cells and confirming a
// later mutation doesn't affect the earlier snapshot.
test('cloneBoard produces an independent snapshot of layered cells for undo', function () {
  var board = Logic.withInitialTokens(Logic.createBoard(level.layout), level.initialTokens);
  var snapshot = Logic.cloneBoard(board);
  var mutated = Logic.placePiece(board, level.pieceSequence[0], 0, 2);
  assert.deepStrictEqual(Logic.getLayers(snapshot, 1, 0), ['purple', 'red']);
  assert.strictEqual(Logic.getCell(snapshot, 0, 2), null, 'snapshot should not see the later placement');
  assert.notStrictEqual(Logic.getCell(mutated, 0, 2), null);

  // Peeling a layer on `mutated` must not retroactively change the
  // snapshot's (or the original board's) layer arrays.
  Logic.resolveCascade(mutated, 1); // threshold 1 forces an immediate "clear" for this check
  assert.deepStrictEqual(Logic.getLayers(board, 1, 0), ['purple', 'red'], 'original board must be untouched');
  assert.deepStrictEqual(Logic.getLayers(snapshot, 1, 0), ['purple', 'red'], 'snapshot must be untouched');
});

// 14. Restart restores the original layered state -- confirms building the
// initial board twice from the same config gives identical layered cells.
test('building the initial layered board is deterministic', function () {
  var boardA = Logic.withInitialTokens(Logic.createBoard(level.layout), level.initialTokens);
  var boardB = Logic.withInitialTokens(Logic.createBoard(level.layout), level.initialTokens);
  assert.deepStrictEqual(boardA.cells, boardB.cells);
});

// 15. Full board clearance triggers victory.
test('an empty board is the win condition', function () {
  var board = Logic.createBoard(level.layout);
  assert.ok(Logic.boardIsEmpty(board));
});

// 16. Remaining buried layers prevent victory (a piece with layers left,
// even after its active color cleared, must NOT read as an empty board).
test('a piece with buried layers remaining is not an empty board', function () {
  var board = makeLineBoard(1);
  board = Logic.withInitialTokens(board, [{ col: 0, slot: 0, layers: ['red', 'purple'] }]);
  var afterClear = Logic.clearGroups(board, [{ color: 'red', cells: [{ col: 0, slot: 0 }] }]);
  assert.strictEqual(Logic.boardIsEmpty(afterClear.board), false, 'purple is still buried underneath -- board must not read as empty');
});

// A full board with no empty cell has no legal move for a single-cell piece.
test('a completely full board has no legal move', function () {
  var layout = [{ col: 0, slot: 0 }, { col: 0, slot: 1 }];
  var board = Logic.createBoard(layout);
  board = Logic.withInitialTokens(board, [
    { col: 0, slot: 0, layers: ['red'] },
    { col: 0, slot: 1, layers: ['purple'] }
  ]);
  var pieces = [{ id: 'x', layers: ['orange'] }];
  assert.strictEqual(Logic.hasAnyLegalMove(board, pieces), false);
});

test('a board with any empty cell reports a legal move', function () {
  var board = Logic.createBoard(level.layout);
  var pieces = [level.pieceSequence[0]];
  assert.strictEqual(Logic.hasAnyLegalMove(board, pieces), true);
});

test('hex adjacency is symmetric across the whole board (unchanged by the layered data model)', function () {
  var board = Logic.createBoard(level.layout);
  Object.keys(board.cells).forEach(function (k) {
    var parts = k.split('_');
    var col = Number(parts[0]), slot = Number(parts[1]);
    Logic.getNeighbors(board, col, slot).forEach(function (n) {
      var back = Logic.getNeighbors(board, n.col, n.slot);
      var found = back.some(function (b) { return b.col === col && b.slot === slot; });
      assert.ok(found, 'neighbor relation not symmetric for ' + k + ' <-> ' + n.col + '_' + n.slot);
    });
  });
});

// ===========================================================================
// V0.6 -- MULTI-LEVEL TESTS
// ===========================================================================
// Five levels, same locked mechanics. Every level gets the same baseline
// checks (solvable via its documented solution, no premature empty board,
// no 3-consecutive-same-active-color window), plus one test targeting the
// SPECIFIC structural trick that level's design relies on.

test('there are exactly 5 levels', function () {
  assert.strictEqual(Config.LEVELS.length, 5);
});

test('every level has a visibly distinct board silhouette (no two share the same shape)', function () {
  var signatures = Config.LEVELS.map(function (lvl) {
    var heights = {};
    lvl.layout.forEach(function (c) { heights[c.col] = (heights[c.col] || 0) + 1; });
    var cols = Object.keys(heights).map(Number).sort(function (a, b) { return a - b; });
    return cols.map(function (c) { return heights[c]; }).join(',');
  });
  var unique = signatures.filter(function (sig, i) { return signatures.indexOf(sig) === i; });
  assert.strictEqual(unique.length, signatures.length, 'two levels share the same column-height signature: ' + signatures.join(' | '));
});

function replaySolution(lvl) {
  var board = Logic.withInitialTokens(Logic.createBoard(lvl.layout), lvl.initialTokens);
  assert.strictEqual(lvl.solution.length, lvl.pieceSequence.length,
    lvl.id + ': solution should place every piece in the sequence');

  lvl.solution.forEach(function (step, i) {
    var piece = lvl.pieceSequence[i];
    assert.strictEqual(piece.id, step.pieceId,
      lvl.id + ' solution step ' + i + ' expected piece ' + step.pieceId + ' but sequence has ' + piece.id);
    assert.ok(
      Logic.canPlacePiece(board, piece, step.target.col, step.target.slot),
      lvl.id + ' solution step ' + i + ' (' + piece.id + ') is not a legal placement'
    );
    board = Logic.placePiece(board, piece, step.target.col, step.target.slot);
    var cascade = Logic.resolveCascade(board, Config.CLEAR_THRESHOLD);
    board = cascade.board;

    var isLastStep = i === lvl.solution.length - 1;
    if (!isLastStep) {
      assert.ok(!Logic.boardIsEmpty(board),
        lvl.id + ': board must not be empty after step ' + i + ' (' + piece.id + ') -- that would be a premature win');
    }
  });

  assert.ok(Logic.boardIsEmpty(board), lvl.id + ': board should be completely empty after the full solution');
  return board;
}

Config.LEVELS.forEach(function (lvl) {
  test(lvl.id + ' (' + lvl.name + ') is solvable via its documented solution, no generated dead resources', function () {
    replaySolution(lvl);
  });

  test(lvl.id + ': no window of 3 consecutive pieces in the sequence shares the same active color', function () {
    var seq = lvl.pieceSequence;
    for (var i = 0; i + 2 < seq.length; i++) {
      var colors = [seq[i], seq[i + 1], seq[i + 2]].map(function (p) { return p.layers[0]; });
      var allSame = colors[0] === colors[1] && colors[1] === colors[2];
      assert.ok(!allSame, lvl.id + ' window at index ' + i + ' (' + seq[i].id + ',' + seq[i + 1].id + ',' + seq[i + 2].id + ') is all ' + colors[0]);
    }
  });

  test(lvl.id + ': every piece carries 1-3 layers (locked mechanic: 2-3 color layers per piece, plus plain 1-layer pieces)', function () {
    lvl.pieceSequence.forEach(function (p) {
      assert.ok(p.layers.length >= 1 && p.layers.length <= 3, lvl.id + ' piece ' + p.id + ' has ' + p.layers.length + ' layers');
    });
  });
});

function pieceById(lvl, id) {
  return lvl.pieceSequence.filter(function (p) { return p.id === id; })[0];
}

function placeSteps(lvl, board, steps) {
  steps.forEach(function (step) {
    var piece = pieceById(lvl, step.pieceId);
    assert.ok(Logic.canPlacePiece(board, piece, step.target.col, step.target.slot),
      step.pieceId + ' -> (' + step.target.col + ',' + step.target.slot + ') is not a legal placement');
    board = Logic.placePiece(board, piece, step.target.col, step.target.slot);
  });
  return board;
}

// ---- Level 1 (SPLIT BASIN): the bridge is the only path, dead ends never reach it ----

test('level 1: column 0 and column 4 (the dead-end pockets) can never reach the bridge or the far basin', function () {
  var lvl = Config.LEVELS[0];
  var board = Logic.createBoard(lvl.layout);
  lvl.layout.filter(function (c) { return c.col === 0; }).forEach(function (c) {
    Logic.getNeighbors(board, c.col, c.slot).forEach(function (n) {
      assert.ok(n.col <= 1, 'level1 column 0 slot ' + c.slot + ' must never neighbor column ' + n.col);
    });
  });
  lvl.layout.filter(function (c) { return c.col === 4; }).forEach(function (c) {
    Logic.getNeighbors(board, c.col, c.slot).forEach(function (n) {
      assert.ok(n.col >= 3, 'level1 column 4 slot ' + c.slot + ' must never neighbor column ' + n.col);
    });
  });
});

test('level 1: the TRAP piece placed in the bridge (not the dead end) is what lets orange connect', function () {
  var lvl = Config.LEVELS[0];
  function playUpToPurpleClear(swapped) {
    var board = Logic.withInitialTokens(Logic.createBoard(lvl.layout), lvl.initialTokens);
    var targets = {};
    lvl.solution.slice(0, 6).forEach(function (step) { targets[step.pieceId] = step.target; }); // through P3
    if (swapped) {
      var t = targets.TRAP;
      targets.TRAP = targets.P1;
      targets.P1 = t;
    }
    var steps = lvl.solution.slice(0, 6).map(function (step) { return { pieceId: step.pieceId, target: targets[step.pieceId] }; });
    board = placeSteps(lvl, board, steps);
    var cascade = Logic.resolveCascade(board, Config.CLEAR_THRESHOLD);
    assert.strictEqual(cascade.events[0].groups[0].color, 'purple', 'purple should still reach 10 either way -- the swap only affects location, not the count');
    return cascade.board;
  }

  var correctBoard = playUpToPurpleClear(false);
  var wrongBoard = playUpToPurpleClear(true);

  // Placed correctly (in the bridge), the revealed orange is sitting right
  // where the right basin's group can reach it.
  var correctOrangeCell = lvl.layout.filter(function (c) { return c.col === 2; })
    .find(function (c) { return Logic.getActiveColor(correctBoard, c.col, c.slot) === 'orange'; });
  assert.ok(correctOrangeCell, 'TRAP placed in the bridge should reveal orange in the bridge');

  // Placed in the dead-end column 0 instead, the revealed orange is
  // stranded there -- never touching column 2 or beyond.
  var strandedCell = lvl.layout.filter(function (c) { return c.col <= 1; })
    .find(function (c) { return Logic.getActiveColor(wrongBoard, c.col, c.slot) === 'orange'; });
  assert.ok(strandedCell, 'TRAP placed in column 0 should reveal an orange piece somewhere in the left basin');
  var strandedGroup = Logic.findConnectedGroup(wrongBoard, strandedCell.col, strandedCell.slot);
  assert.ok(strandedGroup.every(function (c) { return c.col <= 1; }),
    'TRAP placed in column 0 should be stranded there, never reaching the bridge or right basin');
});

// ---- Level 2 (FUNNEL): the shared column is reachable from BOTH sides at every slot ----

test('level 2: the shared middle column is adjacent to BOTH column 1 and column 3 at every slot (a true shared resource, not a gated bridge)', function () {
  var lvl = Config.LEVELS[1];
  var board = Logic.createBoard(lvl.layout);
  lvl.layout.filter(function (c) { return c.col === 2; }).forEach(function (c) {
    var neighborCols = Logic.getNeighbors(board, c.col, c.slot).map(function (n) { return n.col; });
    assert.ok(neighborCols.indexOf(1) !== -1, 'level2 column 2 slot ' + c.slot + ' should border column 1');
    assert.ok(neighborCols.indexOf(3) !== -1, 'level2 column 2 slot ' + c.slot + ' should border column 3');
  });
});

test('level 2: purple and orange clearing reveals a buried red bridge spanning all of column 1/2/3', function () {
  var lvl = Config.LEVELS[1];
  var board = replaySolution(lvl);
  assert.ok(Logic.boardIsEmpty(board), 'the shared-column red bridge should have cleared as part of the documented solution');
});

// ---- Level 3 (CHOKE POINT): the passage is exactly one cell wide ----

test('level 3: the passage column has exactly one cell, bordering only column 1 slot 0 and column 3 slot 0', function () {
  var lvl = Config.LEVELS[2];
  var board = Logic.createBoard(lvl.layout);
  var passageCells = lvl.layout.filter(function (c) { return c.col === 2; });
  assert.strictEqual(passageCells.length, 1, 'level3 column 2 should have exactly 1 cell');
  var neighbors = Logic.getNeighbors(board, passageCells[0].col, passageCells[0].slot);
  assert.deepStrictEqual(neighbors.sort(function (a, b) { return a.col - b.col; }), [
    { col: 1, slot: 0 },
    { col: 3, slot: 0 }
  ]);
});

test('level 3: the CHOKE piece placed at the passage clears both colors in a single cascade', function () {
  var lvl = Config.LEVELS[2];
  var board = Logic.withInitialTokens(Logic.createBoard(lvl.layout), lvl.initialTokens);
  board = placeSteps(lvl, board, lvl.solution.slice(0, -1)); // everything up to CHOKE
  var lastStep = lvl.solution[lvl.solution.length - 1];
  board = Logic.placePiece(board, pieceById(lvl, lastStep.pieceId), lastStep.target.col, lastStep.target.slot);
  var cascade = Logic.resolveCascade(board, Config.CLEAR_THRESHOLD);
  var clearedColors = cascade.events.filter(function (e) { return e.groups.length > 0; })
    .map(function (e) { return e.groups[0].color; });
  assert.deepStrictEqual(clearedColors, ['purple', 'orange'], 'CHOKE should trigger a purple clear immediately followed by an orange clear');
  assert.ok(Logic.boardIsEmpty(cascade.board));
});

// ---- Level 4 (DUAL POCKET): the two pockets are structurally disconnected ----

test('level 4: pocket A (columns 0-1) and pocket B (columns 3-4) can never be adjacent -- column 2 has zero cells', function () {
  var lvl = Config.LEVELS[3];
  assert.strictEqual(lvl.layout.filter(function (c) { return c.col === 2; }).length, 0, 'level4 column 2 should not exist');
  var board = Logic.createBoard(lvl.layout);
  lvl.layout.filter(function (c) { return c.col <= 1; }).forEach(function (c) {
    Logic.getNeighbors(board, c.col, c.slot).forEach(function (n) {
      assert.ok(n.col <= 1, 'level4 pocket A cell (' + c.col + ',' + c.slot + ') must never neighbor pocket B');
    });
  });
});

test('level 4: pocket A and pocket B each independently clear purple/orange then their own buried red', function () {
  var lvl = Config.LEVELS[3];
  var board = replaySolution(lvl);
  assert.ok(Logic.boardIsEmpty(board));
});

// ---- Level 5 (FUTURE-COLOR PUZZLE): the signature gravity-driven reconnection ----

test('level 5: FU1 sits stranded above column 1\'s purple stack until it clears', function () {
  var lvl = Config.LEVELS[4];
  var board = Logic.withInitialTokens(Logic.createBoard(lvl.layout), lvl.initialTokens);
  var upToFU1 = lvl.solution.slice(0, 13); // through FU1 (index 12)
  board = placeSteps(lvl, board, upToFU1);
  board = Logic.resolveCascade(board, Config.CLEAR_THRESHOLD).board;
  assert.strictEqual(Logic.getActiveColor(board, 1, 4), 'orange', 'FU1 should still be resting at column 1 slot 4, not yet fallen');
  var group = Logic.findConnectedGroup(board, 1, 4);
  assert.strictEqual(group.length, 1, 'FU1 should be isolated -- not yet connected to any orange group');
});

test('level 5: clearing purple drops FU1 via gravity into a brand new connection with the revealed bridge orange, forming a second 10-group', function () {
  var lvl = Config.LEVELS[4];
  var board = Logic.withInitialTokens(Logic.createBoard(lvl.layout), lvl.initialTokens);
  board = placeSteps(lvl, board, lvl.solution.slice(0, -1)); // through BR1, everything but the final BR2
  var lastStep = lvl.solution[lvl.solution.length - 1];
  board = Logic.placePiece(board, pieceById(lvl, lastStep.pieceId), lastStep.target.col, lastStep.target.slot);

  var cascade = Logic.resolveCascade(board, Config.CLEAR_THRESHOLD);
  var clearedColors = cascade.events.filter(function (e) { return e.groups.length > 0; }).map(function (e) { return e.groups[0].color; });
  assert.deepStrictEqual(clearedColors, ['purple', 'orange'], 'purple should clear, then the gravity-connected orange group should clear');
  assert.ok(Logic.boardIsEmpty(cascade.board), 'the whole board should be empty -- FU1 successfully reconnected via gravity');

  // Confirm FU1 actually MOVED (not just revealed in place): find the
  // computed gravity move for column 1 in the event where purple clears.
  var purpleEventIndex = cascade.events.findIndex(function (e) { return e.groups.length > 0 && e.groups[0].color === 'purple'; });
  var purpleEvent = cascade.events[purpleEventIndex];
  var moves = Logic.computeGravityMoves(purpleEvent.boardAfterClear, purpleEvent.boardAfterGravity);
  var fu1Move = moves.filter(function (m) { return m.col === 1; })[0];
  assert.ok(fu1Move, 'column 1 should have a piece that gravity actually moves once purple clears underneath it');
  assert.strictEqual(fu1Move.fromSlot, 4);
  assert.strictEqual(fu1Move.toSlot, 0, 'FU1 should fall all the way from slot 4 to slot 0, newly adjacent to the bridge');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
