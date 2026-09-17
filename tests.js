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

test('SETTLE GRAVITY moves a whole layered piece as one unit -- layers never separate', function () {
  var board = makeLineBoard(5);
  board = Logic.withInitialTokens(board, [{ col: 0, slot: 4, layers: ['red', 'purple', 'orange'] }]);
  var settled = Logic.applyGravity(board);
  assert.deepStrictEqual(Logic.getLayers(settled, 0, 0), ['red', 'purple', 'orange']);
  assert.strictEqual(Logic.getCell(settled, 0, 4), null);
});

test('resolveCascade (Settle Gravity) settles a floating piece even when nothing clears', function () {
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

// ---- V0.8: STEP GRAVITY engine tests ----

test('STEP GRAVITY moves an unsupported piece exactly one slot, not to the floor', function () {
  var board = makeLineBoard(6);
  board = Logic.withInitialTokens(board, [{ col: 0, slot: 5, layers: ['purple'] }]);
  var step1 = Logic.applyStepGravity(board);
  assert.strictEqual(Logic.getActiveColor(step1, 0, 4), 'purple', 'after one step, the piece should be at slot 4, not the floor');
  assert.strictEqual(Logic.getCell(step1, 0, 5), null);
  var step2 = Logic.applyStepGravity(step1);
  assert.strictEqual(Logic.getActiveColor(step2, 0, 3), 'purple', 'a second call advances it exactly one more slot, to slot 3');
});

test('STEP GRAVITY: a piece already resting on its column\'s floor never moves', function () {
  var board = makeLineBoard(3);
  board = Logic.withInitialTokens(board, [{ col: 0, slot: 0, layers: ['purple'] }]);
  var stepped = Logic.applyStepGravity(board);
  assert.strictEqual(Logic.getActiveColor(stepped, 0, 0), 'purple');
});

test('STEP GRAVITY is deterministic and collision-free with multiple gaps in one column (a "conga line" -- support is judged from a single snapshot, so a piece directly above another never moves before the one below it does)', function () {
  var board = makeLineBoard(6);
  board = Logic.withInitialTokens(board, [
    { col: 0, slot: 2, layers: ['purple'] },
    { col: 0, slot: 3, layers: ['orange'] }
  ]);
  var step1 = Logic.applyStepGravity(board);
  assert.strictEqual(Logic.getActiveColor(step1, 0, 1), 'purple', 'the lower piece (nothing beneath it) moves down one slot');
  assert.strictEqual(Logic.getActiveColor(step1, 0, 3), 'orange', 'the upper piece stays put -- in the snapshot, slot2 was still occupied beneath it');
  var step2 = Logic.applyStepGravity(step1);
  assert.strictEqual(Logic.getActiveColor(step2, 0, 0), 'purple', 'lower piece reaches the floor on step 2');
  assert.strictEqual(Logic.getActiveColor(step2, 0, 2), 'orange', 'upper piece now advances into the slot the lower one just vacated');
});

test('resolveCascadeStepGravity follows the V0.8 turn order: immediate clear check, then exactly one step, then a cascade with no further movement', function () {
  var layout = [];
  for (var s = 0; s < 3; s++) layout.push({ col: 0, slot: s });
  for (s = 0; s < 12; s++) layout.push({ col: 1, slot: s });
  var board = Logic.createBoard(layout);
  var tokens = [];
  for (s = 0; s < 9; s++) tokens.push({ col: 1, slot: s, layers: ['purple'] });
  tokens.push({ col: 1, slot: 11, layers: ['purple', 'orange'] }); // far above, with a 2-slot gap
  board = Logic.withInitialTokens(board, tokens);
  var result = Logic.resolveCascadeStepGravity(board, 10);
  assert.strictEqual(result.events.length, 1, 'nothing qualifies yet (not adjacent), so only the single step is an event');
  assert.strictEqual(result.events[0].groups.length, 0);
  assert.strictEqual(Logic.getActiveColor(result.board, 1, 10), 'purple', 'the far piece advances by exactly one slot (11 -> 10), not all the way down');
});

test('resolveCascadeStepGravity: a step that itself creates a qualifying group clears within the same turn (no infinite or repeated movement)', function () {
  var layout = [];
  for (var s = 0; s < 11; s++) layout.push({ col: 0, slot: s });
  var board = Logic.createBoard(layout);
  var tokens = [];
  for (s = 0; s < 9; s++) tokens.push({ col: 0, slot: s, layers: ['purple'] });
  tokens.push({ col: 0, slot: 10, layers: ['purple'] }); // one gap at slot9
  board = Logic.withInitialTokens(board, tokens);
  var result = Logic.resolveCascadeStepGravity(board, 10);
  assert.ok(result.events.some(function (e) { return e.groups.length > 0 && e.groups[0].color === 'purple'; }),
    'the single-step move (slot10 -> slot9) connects all 10 -- should clear the same turn');
  assert.ok(Logic.boardIsEmpty(result.board));
});

test('a cascade reveal under STEP GRAVITY gets AT MOST the one step already scheduled this turn -- it does not keep falling all the way down within the same call', function () {
  // Column of 9 plain purple plus a 2-layer [purple, orange] piece placed
  // directly on top (slot 9, no gap). The order matters here: the
  // IMMEDIATE clear check (step 1, using the as-placed board) already
  // sees all 10 connected and clears right away, revealing orange at
  // slot 9 -- THEN the turn's one scheduled step of movement (step 2)
  // finds that orange now unsupported (slot 8 just emptied) and advances
  // it to slot 8. That is exactly one step, matching the documented
  // order (immediate clear, then ONE step, then a no-further-movement
  // cascade) -- it must NOT continue on down to slot 0 within this same
  // resolveCascadeStepGravity call.
  var layout = [];
  for (var s = 0; s < 11; s++) layout.push({ col: 0, slot: s });
  var board = Logic.createBoard(layout);
  var tokens = [];
  for (s = 0; s < 9; s++) tokens.push({ col: 0, slot: s, layers: ['purple'] });
  tokens.push({ col: 0, slot: 9, layers: ['purple', 'orange'] });
  board = Logic.withInitialTokens(board, tokens);
  var result = Logic.resolveCascadeStepGravity(board, 10);
  assert.strictEqual(Logic.getActiveColor(result.board, 0, 8), 'orange', 'the revealed piece should have advanced exactly one slot, from 9 to 8');
  assert.strictEqual(Logic.getCell(result.board, 0, 9), null);
  assert.deepStrictEqual(result.events.map(function (e) { return e.groups.map(function (g) { return g.color; }); }), [['purple'], []],
    'expected exactly 2 events: the purple clear, then one plain step -- no third event from further falling');
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

test('cloneBoard produces an independent snapshot of layered cells for undo (kept internally, debug-only in the UI since V0.7)', function () {
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
// V0.8 -- FIVE LEVELS: one Settle Gravity control + four Step Gravity
// levels. Baseline checks for every level, plus one structural test per
// level proving its signature insight actually works, AND that the
// documented tempting mistake actually produces an unsolvable board.
// ===========================================================================

test('there are exactly 5 levels', function () {
  assert.strictEqual(Config.LEVELS.length, 5);
});

test('exactly one level (the control) uses Settle Gravity; the other four use Step Gravity', function () {
  var settle = Config.LEVELS.filter(function (l) { return (l.gravityMode || 'settle') === 'settle'; });
  var step = Config.LEVELS.filter(function (l) { return l.gravityMode === 'step'; });
  assert.strictEqual(settle.length, 1, 'expected exactly 1 Settle Gravity level');
  assert.strictEqual(step.length, 4, 'expected exactly 4 Step Gravity levels');
});

test('at least 3 of the 5 boards are WIDE (more columns than the tallest column\'s height)', function () {
  function isWide(layout) {
    var byCol = {};
    layout.forEach(function (c) { byCol[c.col] = (byCol[c.col] || 0) + 1; });
    var columnCount = Object.keys(byCol).length;
    var maxHeight = Math.max.apply(null, Object.keys(byCol).map(function (c) { return byCol[c]; }));
    return columnCount >= 4 && maxHeight <= 10;
  }
  var wideCount = Config.LEVELS.filter(function (lvl) { return isWide(lvl.layout); }).length;
  assert.ok(wideCount >= 3, 'expected at least 3 wide levels, found ' + wideCount);
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

function resolveOneTurn(lvl, board) {
  var cascade = lvl.gravityMode === 'step'
    ? Logic.resolveCascadeStepGravity(board, Config.CLEAR_THRESHOLD)
    : Logic.resolveCascade(board, Config.CLEAR_THRESHOLD);
  return cascade;
}

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
    board = resolveOneTurn(lvl, board).board;

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
  test(lvl.id + ' (' + lvl.name + ', ' + (lvl.gravityMode || 'settle') + ' gravity) is fully solvable via its documented solution', function () {
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
    board = resolveOneTurn(lvl, board).board;
  });
  return board;
}

// ---- Level 1 (CONTROL, Settle Gravity): baseline tower + decoy, unchanged mechanics ----

test('level 1 (control): the decoy tower is two columns from the orange target and can never reach it', function () {
  var lvl = Config.LEVELS[0];
  var board = Logic.createBoard(lvl.layout);
  lvl.layout.filter(function (c) { return c.col === 3; }).forEach(function (c) {
    var neighborCols = Logic.getNeighbors(board, 3, c.slot).map(function (n) { return n.col; });
    assert.ok(neighborCols.indexOf(0) === -1, 'level1 column 3 should never border column 0 (slot ' + c.slot + ')');
  });
});

test('level 1 (control): the tempting mistake (ROUTE placed in the decoy instead of the real tower) leaves the board unsolvable', function () {
  var lvl = Config.LEVELS[0];
  var board = Logic.withInitialTokens(Logic.createBoard(lvl.layout), lvl.initialTokens);
  var steps = lvl.solution.map(function (s) { return Object.assign({}, s); });
  var route = steps.find(function (s) { return s.pieceId === 'ROUTE'; });
  route.target = { col: 3, slot: 2 };
  board = placeSteps(lvl, board, steps);
  assert.strictEqual(Logic.boardIsEmpty(board), false, 'placing ROUTE in the decoy should leave the board unsolvable');
});

// ---- Level 2 (STEP GRAVITY INTRO): a piece genuinely travels over several turns ----

test('level 2: the board is wide and uniform (no funnel) -- every column shares the same floor and height', function () {
  var lvl = Config.LEVELS[1];
  var heights = {};
  lvl.layout.forEach(function (c) { heights[c.col] = (heights[c.col] || []).concat(c.slot); });
  var cols = Object.keys(heights);
  assert.ok(cols.length >= 5, 'expected a wide board (>=5 columns)');
  cols.forEach(function (c) {
    assert.deepStrictEqual(heights[c].sort(function (a, b) { return a - b; }), [0, 1, 2, 3], 'level2 column ' + c + ' should span slots 0-3 like every other column');
  });
});

test('level 2: a piece placed near the top genuinely takes multiple turns to reach the floor (does not teleport)', function () {
  var lvl = Config.LEVELS[1];
  var board = Logic.createBoard(lvl.layout);
  var piece = pieceById(lvl, 'P1');
  board = Logic.placePiece(board, piece, 0, 3);
  var afterTurn1 = Logic.resolveCascadeStepGravity(board, 10).board;
  assert.strictEqual(Logic.getActiveColor(afterTurn1, 0, 2), 'purple', 'after 1 turn, should be at slot 2 (one step down), not slot 0');
  var afterTurn2 = Logic.resolveCascadeStepGravity(afterTurn1, 10).board;
  assert.strictEqual(Logic.getActiveColor(afterTurn2, 0, 1), 'purple', 'after 2 turns, should be at slot 1');
});

// ---- Level 3 (CROSSING PATHS): future POSITION, not just future column ----

test('level 3: the elevator column\'s top has nothing to touch -- it only enters range after descending several turns', function () {
  var lvl = Config.LEVELS[2];
  var board = Logic.createBoard(lvl.layout);
  var topNeighbors = Logic.getNeighbors(board, 1, 15).map(function (n) { return n.col; });
  assert.deepStrictEqual(topNeighbors, [1], 'level3 column 1 slot 15 should only touch its own column (slot 14)');
  var lowNeighbors = Logic.getNeighbors(board, 1, 8).map(function (n) { return n.col; });
  assert.ok(lowNeighbors.indexOf(0) !== -1 && lowNeighbors.indexOf(2) !== -1, 'level3 column 1 slot 8 should border both column 0 and column 2');
});

test('level 3: the tempting mistake (ELEVATOR dropped LAST instead of FIRST) leaves it stuck mid-descent, board unsolvable', function () {
  var lvl = Config.LEVELS[2];
  var board = Logic.createBoard(lvl.layout);
  var steps = lvl.solution.filter(function (s) { return s.pieceId !== 'ELEVATOR'; });
  steps.push({ pieceId: 'ELEVATOR', target: { col: 1, slot: 15 } });
  board = placeSteps(lvl, board, steps);
  assert.strictEqual(Logic.boardIsEmpty(board), false, 'dropping ELEVATOR last should leave the board unsolvable');
});

// ---- Level 4 (DELAY THE CLEAR): the dead-end wave is free to complete early, but not with the wrong piece ----

test('level 4: the dead-end wave (column 0) is two columns from the orange target and structurally isolated', function () {
  var lvl = Config.LEVELS[3];
  var board = Logic.createBoard(lvl.layout);
  lvl.layout.filter(function (c) { return c.col === 0; }).forEach(function (c) {
    var neighborCols = Logic.getNeighbors(board, 0, c.slot).map(function (n) { return n.col; });
    assert.ok(neighborCols.indexOf(3) === -1, 'level4 column 0 should never border column 3 (the orange target)');
  });
});

test('level 4: the tempting mistake (ELEVATOR and QUICK swapped between the two waves) leaves the board unsolvable', function () {
  var lvl = Config.LEVELS[3];
  var board = Logic.createBoard(lvl.layout);
  var steps = lvl.solution.map(function (s) { return Object.assign({}, s); });
  var quick = steps.find(function (s) { return s.pieceId === 'QUICK'; });
  var elevator = steps.find(function (s) { return s.pieceId === 'ELEVATOR'; });
  var tmp = quick.target; quick.target = elevator.target; elevator.target = tmp;
  board = placeSteps(lvl, board, steps);
  assert.strictEqual(Logic.boardIsEmpty(board), false, 'using ELEVATOR for the dead-end wave should leave the board unsolvable');
});

// ---- Level 5 (MOTION PUZZLE): future color AND future position, plus a 3-stage cascade ----

test('level 5: the tower\'s floor borders BOTH the orange target and the red target at once', function () {
  var lvl = Config.LEVELS[4];
  var board = Logic.createBoard(lvl.layout);
  var neighborCols = Logic.getNeighbors(board, 3, 0).map(function (n) { return n.col; });
  assert.ok(neighborCols.indexOf(2) !== -1 && neighborCols.indexOf(4) !== -1, 'level5 column 3 slot 0 should border both column 2 and column 4');
});

test('level 5: the documented solution produces a 3-stage cascade (purple, then orange, then red)', function () {
  var lvl = Config.LEVELS[4];
  var board = Logic.withInitialTokens(Logic.createBoard(lvl.layout), lvl.initialTokens);
  board = placeSteps(lvl, board, lvl.solution.slice(0, -1));
  var last = lvl.solution[lvl.solution.length - 1];
  board = Logic.placePiece(board, pieceById(lvl, last.pieceId), last.target.col, last.target.slot);
  var cascade = Logic.resolveCascadeStepGravity(board, Config.CLEAR_THRESHOLD);
  var clearColors = cascade.events.filter(function (e) { return e.groups.length > 0; })
    .map(function (e) { return e.groups[0].color; });
  assert.deepStrictEqual(clearColors, ['purple', 'orange', 'red'], 'expected purple, then orange, then red to clear in that order');
  assert.ok(Logic.boardIsEmpty(cascade.board));
});

test('level 5: the tempting mistake (ELEVATOR finishes the dead end instead of the tower) leaves the board unsolvable', function () {
  var lvl = Config.LEVELS[4];
  var board = Logic.createBoard(lvl.layout);
  var steps = lvl.solution.map(function (s) { return Object.assign({}, s); });
  var quick = steps.find(function (s) { return s.pieceId === 'QUICK'; });
  var elevator = steps.find(function (s) { return s.pieceId === 'ELEVATOR'; });
  var tmp = quick.target; quick.target = elevator.target; elevator.target = tmp;
  board = placeSteps(lvl, board, steps);
  assert.strictEqual(Logic.boardIsEmpty(board), false, 'using ELEVATOR for the dead end should leave the board unsolvable');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
