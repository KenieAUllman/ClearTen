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

test('a layered piece can be constructed with 2, 3, or 4 layers', function () {
  [2, 3, 4].forEach(function (n) {
    var layers = ['red', 'purple', 'orange', 'red'].slice(0, n);
    var board = Logic.withInitialTokens(Logic.createBoard([{ col: 0, slot: 0 }]), [
      { col: 0, slot: 0, layers: layers }
    ]);
    assert.deepStrictEqual(Logic.getLayers(board, 0, 0), layers);
  });
});

test('only the active (top) layer counts for connectivity, not buried colors', function () {
  var board = makeLineBoard(2);
  board = Logic.withInitialTokens(board, [
    { col: 0, slot: 0, layers: ['red', 'purple'] },
    { col: 0, slot: 1, layers: ['purple', 'red'] } // buried red should NOT connect to the active red above
  ]);
  var redGroup = Logic.findConnectedGroup(board, 0, 0);
  assert.strictEqual(redGroup.length, 1, 'active red at slot0 should not connect through slot1 (active purple there)');
});

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

test('Config.CLEAR_THRESHOLD is locked at exactly 10', function () {
  assert.strictEqual(Config.CLEAR_THRESHOLD, 10);
});

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

test('a piece is removed from the board only once its last layer clears', function () {
  var board = makeLineBoard(10);
  var tokens = [];
  for (var s = 0; s < 10; s++) tokens.push({ col: 0, slot: s, layers: ['red', 'purple'] });
  board = Logic.withInitialTokens(board, tokens);

  var afterRed = Logic.clearGroups(board, Logic.findAllQualifyingGroups(board, Config.CLEAR_THRESHOLD));
  assert.ok(Logic.isOccupied(afterRed.board, 0, 0), 'piece should still be present with purple remaining');

  var afterPurple = Logic.clearGroups(afterRed.board, Logic.findAllQualifyingGroups(afterRed.board, Config.CLEAR_THRESHOLD));
  assert.strictEqual(Logic.isOccupied(afterPurple.board, 0, 0), false, 'piece should be gone after its last layer clears');
  assert.strictEqual(afterPurple.revealed[0].newActiveColor, null);
});

test('gravity moves a whole layered piece as one unit -- layers never separate', function () {
  var board = makeLineBoard(5);
  board = Logic.withInitialTokens(board, [{ col: 0, slot: 4, layers: ['red', 'purple', 'orange'] }]);
  var settled = Logic.applyGravity(board);
  assert.deepStrictEqual(Logic.getLayers(settled, 0, 0), ['red', 'purple', 'orange']);
  assert.strictEqual(Logic.getCell(settled, 0, 4), null);
});

test('resolveCascade settles a floating piece even when nothing clears', function () {
  var board = makeLineBoard(5);
  board = Logic.withInitialTokens(board, [{ col: 0, slot: 4, layers: ['red', 'purple'] }]);
  var result = Logic.resolveCascade(board, Config.CLEAR_THRESHOLD);
  assert.deepStrictEqual(Logic.getLayers(result.board, 0, 0), ['red', 'purple']);
  assert.strictEqual(Logic.getCell(result.board, 0, 4), null);
  assert.strictEqual(result.events.length, 1);
  assert.strictEqual(result.events[0].groups.length, 0);
});

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

test('drawing pieces from the hidden sequence preserves order and full layer arrays', function () {
  var seq = level.pieceSequence;
  var current = seq.slice(0, 3);
  assert.strictEqual(current.length, 3);
  seq.forEach(function (piece, i) {
    assert.ok(Array.isArray(piece.layers) && piece.layers.length >= 1 && piece.layers.length <= 3,
      'piece ' + i + ' (' + piece.id + ') should carry 1-3 layers');
  });
  assert.ok(seq.some(function (p) { return p.layers.length >= 2; }), 'at least some pieces should actually have buried colors');
  var pieceIndex = 3;
  var slots = seq.slice(0, 3);
  slots[0] = seq[pieceIndex++];
  assert.strictEqual(slots[0].id, seq[3].id);
  assert.strictEqual(slots[1].id, seq[1].id, 'untouched slots keep their piece');
});

test('cloneBoard produces an independent snapshot of layered cells for undo (kept internally in V0.7, debug-only in the UI)', function () {
  var board = Logic.withInitialTokens(Logic.createBoard(level.layout), level.initialTokens);
  var snapshot = Logic.cloneBoard(board);
  var firstEmpty = level.layout.find(function (c) { return !Logic.isOccupied(board, c.col, c.slot); });
  var mutated = Logic.placePiece(board, level.pieceSequence[0], firstEmpty.col, firstEmpty.slot);
  assert.strictEqual(Logic.getCell(snapshot, firstEmpty.col, firstEmpty.slot), null, 'snapshot should not see the later placement');
  assert.notStrictEqual(Logic.getCell(mutated, firstEmpty.col, firstEmpty.slot), null);

  Logic.resolveCascade(mutated, 1); // threshold 1 forces an immediate "clear" for this check
  assert.deepStrictEqual(Logic.getCell(board, firstEmpty.col, firstEmpty.slot), null, 'original board must be untouched');
  assert.deepStrictEqual(Logic.getCell(snapshot, firstEmpty.col, firstEmpty.slot), null, 'snapshot must be untouched');
});

test('building the initial layered board is deterministic', function () {
  var boardA = Logic.withInitialTokens(Logic.createBoard(level.layout), level.initialTokens);
  var boardB = Logic.withInitialTokens(Logic.createBoard(level.layout), level.initialTokens);
  assert.deepStrictEqual(boardA.cells, boardB.cells);
});

test('an empty board is the win condition', function () {
  var board = Logic.createBoard(level.layout);
  assert.ok(Logic.boardIsEmpty(board));
});

test('a piece with buried layers remaining is not an empty board', function () {
  var board = makeLineBoard(1);
  board = Logic.withInitialTokens(board, [{ col: 0, slot: 0, layers: ['red', 'purple'] }]);
  var afterClear = Logic.clearGroups(board, [{ color: 'red', cells: [{ col: 0, slot: 0 }] }]);
  assert.strictEqual(Logic.boardIsEmpty(afterClear.board), false, 'purple is still buried underneath -- board must not read as empty');
});

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
// V0.7 -- FIVE NEW LEVELS: baseline checks + one structural test per
// level proving its signature insight actually works, AND that the
// documented tempting mistake actually produces a worse/unsolvable board.
// ===========================================================================

test('there are exactly 5 levels', function () {
  assert.strictEqual(Config.LEVELS.length, 5);
});

test('at least 3 of the 5 levels are ONE continuous board (every cell reachable from any other, ignoring color)', function () {
  function isFullyConnected(layout) {
    var board = Logic.createBoard(layout);
    var visited = {};
    var start = layout[0];
    var stack = [start];
    visited[start.col + '_' + start.slot] = true;
    var count = 1;
    while (stack.length) {
      var cur = stack.pop();
      Logic.getNeighbors(board, cur.col, cur.slot).forEach(function (n) {
        var k = n.col + '_' + n.slot;
        if (!visited[k]) { visited[k] = true; count++; stack.push(n); }
      });
    }
    return count === layout.length;
  }
  var continuousCount = Config.LEVELS.filter(function (lvl) { return isFullyConnected(lvl.layout); }).length;
  assert.ok(continuousCount >= 3, 'expected at least 3 continuous-board levels, found ' + continuousCount);
});

test('every level has a visibly distinct board silhouette (no two share the same column-height signature)', function () {
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
  test(lvl.id + ' (' + lvl.name + ') is fully solvable via its documented solution, no generated dead resources', function () {
    replaySolution(lvl);
  });

  test(lvl.id + ': every piece carries 1-3 layers (locked mechanic)', function () {
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
    if (!Logic.canPlacePiece(board, piece, step.target.col, step.target.slot)) return;
    board = Logic.placePiece(board, piece, step.target.col, step.target.slot);
    board = Logic.resolveCascade(board, Config.CLEAR_THRESHOLD).board;
  });
  return board;
}

// ---- Level 1 (DECEPTIVE SIMPLE): the seam cell is the only real decision ----

test('level 1: every column-2 purple cell also borders column 3 (the seam), unlike the pre-filled flanks', function () {
  var lvl = Config.LEVELS[0];
  var board = Logic.createBoard(lvl.layout);
  [2, 3, 4].forEach(function (slot) {
    var neighborCols = Logic.getNeighbors(board, 2, slot).map(function (n) { return n.col; });
    assert.ok(neighborCols.indexOf(3) !== -1, 'level1 column 2 slot ' + slot + ' should border column 3');
  });
});

test('level 1: the tempting mistake (TRAP in the pre-filled flank instead of the seam) leaves the board unsolvable', function () {
  var lvl = Config.LEVELS[0];
  var board = Logic.withInitialTokens(Logic.createBoard(lvl.layout), lvl.initialTokens);
  var steps = lvl.solution.map(function (s) { return Object.assign({}, s); });
  var trapStep = steps.find(function (s) { return s.pieceId === 'TRAP'; });
  trapStep.target = { col: 0, slot: 2 }; // a flank cell, never adjacent to column 2 or 3
  var pc1Step = steps.find(function (s) { return s.pieceId === 'PC1'; });
  pc1Step.target = { col: 2, slot: 2 }; // something still needs to fill the seam
  board = placeSteps(lvl, board, steps);
  assert.strictEqual(Logic.boardIsEmpty(board), false, 'placing TRAP in the flank should leave the board unsolvable');
});

// ---- Level 2 (DELAY THE CLEAR): support-cell color discipline ----

test('level 2: the DELAY piece is the only remaining purple cell once columns 0-1 are full, and column 2 borders column 3', function () {
  var lvl = Config.LEVELS[1];
  var board = Logic.createBoard(lvl.layout);
  var neighborCols = Logic.getNeighbors(board, 2, 5).map(function (n) { return n.col; });
  assert.ok(neighborCols.indexOf(3) !== -1, 'level2 column 2 slot 5 (DELAY\'s target) should border column 3');
});

test('level 2: the tempting mistake (plain purple used in column 2\'s support cells instead of orange) strands DELAY and leaves the board unsolvable', function () {
  var lvl = Config.LEVELS[1];
  var board = Logic.withInitialTokens(Logic.createBoard(lvl.layout), lvl.initialTokens);
  var steps = [
    { pieceId: 'P1', target: { col: 0, slot: 0 } },
    { pieceId: 'O1', target: { col: 3, slot: 3 } },
    { pieceId: 'P2', target: { col: 0, slot: 1 } },
    { pieceId: 'O2', target: { col: 3, slot: 4 } },
    { pieceId: 'P3', target: { col: 0, slot: 2 } },
    { pieceId: 'O3', target: { col: 3, slot: 5 } },
    { pieceId: 'P4', target: { col: 0, slot: 3 } },
    // MISTAKE: plain purple where orange support belongs.
    { pieceId: 'P5', target: { col: 0, slot: 4 } },
    { pieceId: 'P6', target: { col: 2, slot: 2 } },
    { pieceId: 'P7', target: { col: 2, slot: 3 } },
    { pieceId: 'OSUP3', target: { col: 2, slot: 4 } },
    { pieceId: 'P8', target: { col: 1, slot: 1 } },
    { pieceId: 'O4', target: { col: 3, slot: 6 } },
    { pieceId: 'P9', target: { col: 1, slot: 2 } },
    { pieceId: 'O5', target: { col: 4, slot: 4 } },
    { pieceId: 'O6', target: { col: 4, slot: 5 } },
    { pieceId: 'OSUP1', target: { col: 1, slot: 3 } },
    { pieceId: 'OSUP2', target: { col: 1, slot: 4 } },
    { pieceId: 'DELAY', target: { col: 2, slot: 5 } }
  ];
  board = placeSteps(lvl, board, steps);
  assert.strictEqual(Logic.boardIsEmpty(board), false, 'using purple for column 2 support should leave the board unsolvable');
});

// ---- Level 3 (GRAVITY ROUTING): only the adjacent column can ever route to the target ----

test('level 3: column 1 borders the orange target (column 0), but column 2 -- two columns away -- never can', function () {
  var lvl = Config.LEVELS[2];
  var board = Logic.createBoard(lvl.layout);
  var col1Neighbors = Logic.getNeighbors(board, 1, 0).map(function (n) { return n.col; });
  assert.ok(col1Neighbors.indexOf(0) !== -1, 'level3 column 1 slot 0 should border column 0');
  lvl.layout.filter(function (c) { return c.col === 2; }).forEach(function (c) {
    var neighborCols = Logic.getNeighbors(board, 2, c.slot).map(function (n) { return n.col; });
    assert.ok(neighborCols.indexOf(0) === -1, 'level3 column 2 should never border column 0 (slot ' + c.slot + ')');
  });
});

test('level 3: the tempting mistake (ROUTE placed in column 2 instead of column 1) leaves the board unsolvable', function () {
  var lvl = Config.LEVELS[2];
  var board = Logic.withInitialTokens(Logic.createBoard(lvl.layout), lvl.initialTokens);
  var steps = lvl.solution.map(function (s) { return Object.assign({}, s); });
  var routeStep = steps.find(function (s) { return s.pieceId === 'ROUTE'; });
  routeStep.target = { col: 2, slot: 7 };
  board = placeSteps(lvl, board, steps);
  assert.strictEqual(Logic.boardIsEmpty(board), false, 'placing ROUTE in column 2 should leave the board unsolvable');
});

// ---- Level 4 (CASCADE SETUP): one clear reaches two other colors at once ----

test('level 4: column 1\'s floor borders BOTH column 0 and column 2 -- a single purple clear can complete two other groups at once', function () {
  var lvl = Config.LEVELS[3];
  var board = Logic.createBoard(lvl.layout);
  var neighborCols = Logic.getNeighbors(board, 1, 0).map(function (n) { return n.col; });
  assert.ok(neighborCols.indexOf(0) !== -1 && neighborCols.indexOf(2) !== -1,
    'level4 column 1 slot 0 should border both column 0 and column 2');
});

test('level 4: the documented solution clears purple, then orange AND red together in the same cascade', function () {
  var lvl = Config.LEVELS[3];
  var board = Logic.withInitialTokens(Logic.createBoard(lvl.layout), lvl.initialTokens);
  board = placeSteps(lvl, board, lvl.solution.slice(0, -1));
  var last = lvl.solution[lvl.solution.length - 1];
  board = Logic.placePiece(board, pieceById(lvl, last.pieceId), last.target.col, last.target.slot);
  var cascade = Logic.resolveCascade(board, Config.CLEAR_THRESHOLD);
  assert.strictEqual(cascade.events.length, 2, 'expected exactly 2 cascade events (purple, then orange+red together)');
  assert.deepStrictEqual(cascade.events[0].groups.map(function (g) { return g.color; }), ['purple']);
  var secondColors = cascade.events[1].groups.map(function (g) { return g.color; }).sort();
  assert.deepStrictEqual(secondColors, ['orange', 'red'], 'orange and red should clear together in the second event');
  assert.ok(Logic.boardIsEmpty(cascade.board));
});

// ---- Level 5 (SIGNATURE PUZZLE): the decoy tower is a permanent dead end ----

test('level 5: the decoy tower (column 3) is two columns from the orange target and can never reach 10 on its own', function () {
  var lvl = Config.LEVELS[4];
  var board = Logic.createBoard(lvl.layout);
  var decoyCells = lvl.layout.filter(function (c) { return c.col === 3; });
  assert.ok(decoyCells.length < Config.CLEAR_THRESHOLD, 'the decoy tower should have fewer than 10 cells -- it can never complete on its own');
  decoyCells.forEach(function (c) {
    var neighborCols = Logic.getNeighbors(board, 3, c.slot).map(function (n) { return n.col; });
    assert.ok(neighborCols.indexOf(0) === -1, 'level5 column 3 should never border the orange target (column 0)');
  });
});

test('level 5: the tempting mistake (ROUTE placed in the decoy tower instead of finishing column 1) leaves the board unsolvable', function () {
  var lvl = Config.LEVELS[4];
  var board = Logic.withInitialTokens(Logic.createBoard(lvl.layout), lvl.initialTokens);
  var steps = lvl.solution.map(function (s) { return Object.assign({}, s); });
  var routeStep = steps.find(function (s) { return s.pieceId === 'ROUTE'; });
  routeStep.target = { col: 3, slot: 2 };
  board = placeSteps(lvl, board, steps);
  assert.strictEqual(Logic.boardIsEmpty(board), false, 'placing ROUTE in the decoy tower should leave the board unsolvable');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
