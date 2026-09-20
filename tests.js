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

// ---- STEP GRAVITY engine tests (V0.8) --------------------------------
// V0.9 REMOVED Step Gravity from normal play entirely (playtesting showed
// Settle Gravity felt better -- "I do NOT like pieces moving downward only
// one space per turn"). Nothing in config.js or game.js calls these
// functions anymore, but gamelogic.js still exports them intact, so these
// regression tests stay in place to guard the preserved-but-unused code.

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
// V0.9 -- SIX LEVELS, SETTLE GRAVITY ONLY, WIDE/CONTINUOUS/LAYERED REDESIGN.
//
// Step Gravity is gone from every shipped level. Every level is verified
// solvable through the SAME queue mechanic the real UI uses: pieces are
// drawn into a 3-wide window (state.currentPieces in game.js), and any of
// the 3 currently-drawn pieces can be placed in any order -- placing one
// draws the next undrawn piece from pieceSequence into its slot. A
// solution's step order therefore does not have to match pieceSequence's
// raw index order; it only has to respect "a piece must already be drawn
// before it can be placed." replaySolution below models exactly that.
// ===========================================================================

test('there are exactly 6 levels', function () {
  assert.strictEqual(Config.LEVELS.length, 6);
});

test('no level uses Step Gravity -- gravityMode is never set to "step" anywhere in config.js', function () {
  Config.LEVELS.forEach(function (lvl) {
    assert.notStrictEqual(lvl.gravityMode, 'step', lvl.id + ' must not opt into Step Gravity');
  });
});

test('no piece in any level uses 4 layers (V0.9 explicitly caps layered pieces at 3)', function () {
  Config.LEVELS.forEach(function (lvl) {
    lvl.pieceSequence.forEach(function (p) {
      assert.ok(p.layers.length >= 1 && p.layers.length <= 3, lvl.id + ' piece ' + p.id + ' has ' + p.layers.length + ' layers (max allowed is 3)');
    });
  });
});

function isFullyConnected(lvl) {
  var board = Logic.createBoard(lvl.layout);
  var start = lvl.layout[0];
  var visited = {};
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
  return count === lvl.layout.length;
}

test('at least 4 of the first 5 levels are fully continuous boards (one connected region)', function () {
  var firstFive = Config.LEVELS.slice(0, 5);
  var continuousCount = firstFive.filter(isFullyConnected).length;
  assert.ok(continuousCount >= 4, 'expected at least 4 of the first 5 levels fully continuous, found ' + continuousCount);
});

test('level 6 is mostly continuous (one isolated decoy cell by design, not a fragmented board)', function () {
  var lvl = Config.LEVELS[5];
  var board = Logic.createBoard(lvl.layout);
  var start = lvl.layout[0];
  var visited = {};
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
  assert.strictEqual(count, lvl.layout.length - 1, 'expected exactly one isolated decoy cell excluded from the main region');
});

test('every level board is wider than it is tall (columns > max column height)', function () {
  Config.LEVELS.forEach(function (lvl) {
    var maxCol = Math.max.apply(null, lvl.layout.map(function (c) { return c.col; }));
    var maxSlot = Math.max.apply(null, lvl.layout.map(function (c) { return c.slot; }));
    var width = maxCol + 1;
    var height = maxSlot + 1;
    assert.ok(width > height, lvl.id + ' should be wider than tall (width=' + width + ', height=' + height + ')');
  });
});

test('layered-piece density is substantial in every level (at least 40% of pieces carry a buried color)', function () {
  Config.LEVELS.forEach(function (lvl) {
    var layeredCount = lvl.pieceSequence.filter(function (p) { return p.layers.length > 1; }).length;
    var rate = layeredCount / lvl.pieceSequence.length;
    assert.ok(rate >= 0.4, lvl.id + ' layered rate is only ' + Math.round(rate * 100) + '%, expected at least 40%');
  });
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

// ---- Real-queue-aware solvability + mistake replay -------------------

function pieceById(lvl, id) {
  return lvl.pieceSequence.filter(function (p) { return p.id === id; })[0];
}

// Models the exact draw mechanic in game.js: pieces 0,1,2 start drawn;
// placing any currently-drawn piece draws the next undrawn piece from
// pieceSequence into the vacated slot. Returns the final board, or throws
// if a step tries to place a piece that has not been drawn yet, or an
// illegal placement.
function replaySteps(lvl, steps) {
  var seq = lvl.pieceSequence;
  var board = Logic.withInitialTokens(Logic.createBoard(lvl.layout), lvl.initialTokens);
  var drawnUpTo = Math.min(3, seq.length);
  var available = {};
  for (var i = 0; i < drawnUpTo; i++) available[seq[i].id] = true;

  steps.forEach(function (step, i) {
    assert.ok(available[step.pieceId], lvl.id + ' step ' + i + ': piece ' + step.pieceId + ' has not been drawn into the 3-piece queue yet');
    var piece = pieceById(lvl, step.pieceId);
    assert.ok(Logic.canPlacePiece(board, piece, step.target.col, step.target.slot),
      lvl.id + ' step ' + i + ' (' + piece.id + ') is not a legal placement at ' + JSON.stringify(step.target));
    board = Logic.placePiece(board, piece, step.target.col, step.target.slot);
    board = Logic.resolveCascade(board, Config.CLEAR_THRESHOLD).board;
    delete available[step.pieceId];
    if (drawnUpTo < seq.length) { available[seq[drawnUpTo].id] = true; drawnUpTo++; }
  });
  return board;
}

function replaySolution(lvl) {
  var board = replaySteps(lvl, lvl.solution);
  assert.ok(Logic.boardIsEmpty(board), lvl.id + ': board should be completely empty after the full documented solution');
  return board;
}

Config.LEVELS.forEach(function (lvl) {
  test(lvl.id + ' (' + lvl.name + ') is fully solvable via its documented solution, through the real 3-piece queue', function () {
    replaySolution(lvl);
  });
});

function swapMistake(lvl, idA, idB) {
  var steps = lvl.solution.map(function (s) { return Object.assign({}, s, { target: Object.assign({}, s.target) }); });
  var a = steps.find(function (s) { return s.pieceId === idA; });
  var b = steps.find(function (s) { return s.pieceId === idB; });
  var tmp = a.target; a.target = b.target; b.target = tmp;
  return replaySteps(lvl, steps);
}

function retargetMistake(lvl, id, target) {
  var steps = lvl.solution.map(function (s) { return Object.assign({}, s, { target: Object.assign({}, s.target) }); });
  var step = steps.find(function (s) { return s.pieceId === id; });
  step.target = target;
  return replaySteps(lvl, steps);
}

// ---- Level 1: Wide Open Introduction -----------------------------------

test('level 1: the board is fully flat and continuous (broad, shallow, no vertical funnel)', function () {
  var lvl = Config.LEVELS[0];
  var heights = {};
  lvl.layout.forEach(function (c) { heights[c.col] = (heights[c.col] || 0) + 1; });
  Object.keys(heights).forEach(function (c) {
    assert.strictEqual(heights[c], 2, 'level1 column ' + c + ' should be exactly 2 tall (shallow, uniform)');
  });
  assert.ok(isFullyConnected(lvl), 'level1 should be one continuous board');
});

// ---- Level 2: Layer Introduction ---------------------------------------

test('level 2: a clean 3-color relay (purple -> orange -> red) clears the whole board', function () {
  var lvl = Config.LEVELS[1];
  var board = replaySolution(lvl);
  assert.ok(Logic.boardIsEmpty(board));
});

// ---- Level 3: Uneven Floor ----------------------------------------------

test('level 3: the seam column sits at the bottom of the dip and touches both the purple and orange regions', function () {
  var lvl = Config.LEVELS[2];
  var board = Logic.createBoard(lvl.layout);
  var seamCells = lvl.layout.filter(function (c) { return c.col === 3; });
  seamCells.forEach(function (c) {
    var neighborCols = Logic.getNeighbors(board, 3, c.slot).map(function (n) { return n.col; });
    assert.ok(neighborCols.indexOf(2) !== -1, 'level3 seam should border column 2');
    assert.ok(neighborCols.indexOf(4) !== -1, 'level3 seam should border column 4');
  });
});

test('level 3: the tempting mistake (TRAP routed into the col0 dead end instead of the seam) leaves the board unsolvable', function () {
  var lvl = Config.LEVELS[2];
  var board = swapMistake(lvl, 'TRAP', 'P2');
  assert.strictEqual(Logic.boardIsEmpty(board), false, 'using the dead end for TRAP should leave the board unsolvable');
});

// ---- Level 4: Horizontal Tradeoffs --------------------------------------

test('level 4: the dead-end decoy column is structurally isolated from the seam', function () {
  var lvl = Config.LEVELS[3];
  var board = Logic.createBoard(lvl.layout);
  lvl.layout.filter(function (c) { return c.col === 0; }).forEach(function (c) {
    var neighborCols = Logic.getNeighbors(board, 0, c.slot).map(function (n) { return n.col; });
    assert.ok(neighborCols.indexOf(3) === -1, 'level4 column 0 should never border column 3 (the seam)');
  });
});

test('level 4: the tempting mistake (TRAP1 routed into the dead end instead of the seam) leaves the board unsolvable', function () {
  var lvl = Config.LEVELS[3];
  var board = swapMistake(lvl, 'TRAP1', 'P2');
  assert.strictEqual(Logic.boardIsEmpty(board), false, 'using the dead end for TRAP1 should leave the board unsolvable');
});

// ---- Level 5: Layered Strategy -------------------------------------------

test('level 5: the documented solution produces a 3-stage cascade (purple, then orange, then red)', function () {
  var lvl = Config.LEVELS[4];
  var board = Logic.withInitialTokens(Logic.createBoard(lvl.layout), lvl.initialTokens);
  var allButLast = lvl.solution.slice(0, -1);
  board = replaySteps(lvl, allButLast);
  var last = lvl.solution[lvl.solution.length - 1];
  board = Logic.placePiece(board, pieceById(lvl, last.pieceId), last.target.col, last.target.slot);
  var cascade = Logic.resolveCascade(board, Config.CLEAR_THRESHOLD);
  var clearColors = cascade.events.filter(function (e) { return e.groups.length > 0; })
    .map(function (e) { return e.groups[0].color; });
  assert.deepStrictEqual(clearColors, ['purple', 'orange', 'red'], 'expected purple, then orange, then red to clear in that order');
  assert.ok(Logic.boardIsEmpty(cascade.board));
});

test('level 5: the tempting mistake (TRAP1 routed into the dead end instead of the seam) leaves the board unsolvable', function () {
  var lvl = Config.LEVELS[4];
  var board = swapMistake(lvl, 'TRAP1', 'P2');
  assert.strictEqual(Logic.boardIsEmpty(board), false, 'using the dead end for TRAP1 should leave the board unsolvable');
});

// ---- Level 6: Signature ClearTen Test ------------------------------------

test('level 6: TWO independent trap decisions exist -- TRAP_A (the main seam) and TRAP_B (its own correct cell vs. the isolated decoy)', function () {
  var lvl = Config.LEVELS[5];
  var ids = lvl.pieceSequence.map(function (p) { return p.id; });
  assert.ok(ids.indexOf('TRAP_A1') !== -1 && ids.indexOf('TRAP_A2') !== -1 && ids.indexOf('TRAP_B') !== -1,
    'level6 should define both the TRAP_A pair and TRAP_B');
});

test('level 6: mistake A (TRAP_A1 routed into the col0 dead end instead of the main seam) independently leaves the board unsolvable', function () {
  var lvl = Config.LEVELS[5];
  var board = swapMistake(lvl, 'TRAP_A1', 'P2');
  assert.strictEqual(Logic.boardIsEmpty(board), false, 'using the dead end for TRAP_A1 should leave the board unsolvable');
});

test('level 6: mistake B (TRAP_B routed into the isolated decoy column instead of its own cell) independently leaves the board unsolvable', function () {
  var lvl = Config.LEVELS[5];
  var decoyCell = Config.LEVELS[5].layout.filter(function (c) { return c.col === 9; })[0];
  var board = retargetMistake(lvl, 'TRAP_B', { col: decoyCell.col, slot: decoyCell.slot });
  assert.strictEqual(Logic.boardIsEmpty(board), false, 'using the isolated decoy for TRAP_B should leave the board unsolvable');
});

test('level 6: the isolated decoy cell (col9) is never adjacent to the main red region (col7)', function () {
  var lvl = Config.LEVELS[5];
  var board = Logic.createBoard(lvl.layout);
  var decoyCell = lvl.layout.filter(function (c) { return c.col === 9; })[0];
  var neighborCols = Logic.getNeighbors(board, decoyCell.col, decoyCell.slot).map(function (n) { return n.col; });
  assert.ok(neighborCols.indexOf(7) === -1, 'level6 col9 should never border col7 (2+ columns apart)');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
