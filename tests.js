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

console.log('ClearTen game logic tests\n');

// 1. A group of 9 does not clear.
test('group of 9 does not clear', function () {
  var board = makeLineBoard(9);
  for (var s = 0; s < 9; s++) Logic.setColor(board, 0, s, 'red');
  var groups = Logic.findAllQualifyingGroups(board, Config.CLEAR_THRESHOLD);
  assert.strictEqual(groups.length, 0);
});

// 2. A group of 10 clears.
test('group of 10 clears', function () {
  var board = makeLineBoard(10);
  for (var s = 0; s < 10; s++) Logic.setColor(board, 0, s, 'red');
  var groups = Logic.findAllQualifyingGroups(board, Config.CLEAR_THRESHOLD);
  assert.strictEqual(groups.length, 1);
  assert.strictEqual(groups[0].cells.length, 10);
});

// 3. A group larger than 10 clears completely.
test('group of 13 clears completely', function () {
  var layout = [];
  for (var col = 0; col < 5; col++) {
    for (var s = 0; s < 3; s++) layout.push({ col: col, slot: s });
  }
  var board = Logic.createBoard(layout);
  // Fill 13 of the 15 cells with purple, connected; leave 2 empty.
  var count = 0;
  Object.keys(board.cells).forEach(function (k) {
    if (count < 13) {
      var parts = k.split('_');
      Logic.setColor(board, Number(parts[0]), Number(parts[1]), 'purple');
      count++;
    }
  });
  var groups = Logic.findAllQualifyingGroups(board, Config.CLEAR_THRESHOLD);
  assert.strictEqual(groups.length, 1);
  assert.strictEqual(groups[0].cells.length, 13);
  var result = Logic.clearGroups(board, groups);
  assert.strictEqual(result.clearedCount, 13);
  assert.ok(Logic.boardIsEmpty(result.board));
});

// 4. Hex adjacency works correctly (even & odd column rules, and symmetry).
test('hex adjacency: even column neighbor set', function () {
  var board = Logic.createBoard(Config.LEVEL_LAYOUT);
  // col 2 (even), slot 1 should neighbor: (2,0) (2,2) same-col,
  // and (1,0) (1,1) (3,0) (3,1) diagonals.
  var neighbors = Logic.getNeighbors(board, 2, 1)
    .map(function (n) { return n.col + '_' + n.slot; })
    .sort();
  var expected = ['1_0', '1_1', '2_0', '2_2', '3_0', '3_1'].sort();
  assert.deepStrictEqual(neighbors, expected);
});

test('hex adjacency: odd column neighbor set', function () {
  var board = Logic.createBoard(Config.LEVEL_LAYOUT);
  // col 1 (odd), slot 1 should neighbor: (1,0) (1,2) same-col,
  // and (0,1) (0,2) (2,1) (2,2) diagonals.
  var neighbors = Logic.getNeighbors(board, 1, 1)
    .map(function (n) { return n.col + '_' + n.slot; })
    .sort();
  var expected = ['0_1', '0_2', '1_0', '1_2', '2_1', '2_2'].sort();
  assert.deepStrictEqual(neighbors, expected);
});

test('hex adjacency is symmetric across the whole board', function () {
  var board = Logic.createBoard(Config.LEVEL_LAYOUT);
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

// 5. Pieces cannot overlap existing cells.
test('piece placement rejects overlap with occupied cell', function () {
  var board = Logic.createBoard(Config.LEVEL_LAYOUT);
  board = Logic.withInitialTokens(board, [{ col: 0, slot: 0, color: 'red' }]);
  var piece = { cells: [{ dq: 0, dr: 0, color: 'orange' }, { dq: 0, dr: 1, color: 'orange' }] };
  assert.strictEqual(Logic.canPlacePiece(board, piece, 0, 0), false);
});

// 6. Pieces cannot be placed outside the board.
test('piece placement rejects cells outside the board layout', function () {
  var board = Logic.createBoard(Config.LEVEL_LAYOUT);
  // col 0 only has slots 0-2; a vertical pair anchored at slot 2 needs slot 3, which doesn't exist.
  var piece = { cells: [{ dq: 0, dr: 0, color: 'red' }, { dq: 0, dr: 1, color: 'red' }] };
  assert.strictEqual(Logic.canPlacePiece(board, piece, 0, 2), false);
});

// 7. Gravity always resolves consistently (compacts down, preserves order, deterministic).
test('gravity compacts a column downward preserving order', function () {
  var board = makeLineBoard(5);
  Logic.setColor(board, 0, 4, 'red');
  Logic.setColor(board, 0, 2, 'purple');
  Logic.setColor(board, 0, 0, 'orange');
  var settled = Logic.applyGravity(board);
  assert.strictEqual(Logic.getColor(settled, 0, 0), 'orange');
  assert.strictEqual(Logic.getColor(settled, 0, 1), 'purple');
  assert.strictEqual(Logic.getColor(settled, 0, 2), 'red');
  assert.strictEqual(Logic.getColor(settled, 0, 3), null);
  assert.strictEqual(Logic.getColor(settled, 0, 4), null);
});

test('gravity is idempotent (applying twice matches applying once)', function () {
  var board = makeLineBoard(6);
  Logic.setColor(board, 0, 5, 'red');
  Logic.setColor(board, 0, 1, 'purple');
  var once = Logic.applyGravity(board);
  var twice = Logic.applyGravity(once);
  assert.deepStrictEqual(once.cells, twice.cells);
});

// 8. Cascades continue until stable.
test('cascade clears a group, gravity exposes a new group, clears again', function () {
  // Two adjacent columns. Column 0 (height 11) has 10 red at the bottom
  // plus 1 lone orange token stranded at the very top (slot 10), too far
  // from column 1's 9-token orange block to be connected -- yet. Column 1
  // (height 9) is entirely orange, already packed at the bottom.
  //
  // Pass 1 clears the 10 red. Gravity then drops column 0's lone orange
  // token from slot 10 down to slot 0 -- which, because column 0 is even,
  // is hex-adjacent to column 1's slot 0. That newly-formed adjacency
  // connects 1 + 9 = 10 orange tokens for the first time, so pass 2 clears
  // them too. This is exactly the "gravity creates a new qualifying group"
  // cascade behavior the game relies on.
  var layout = [];
  for (var s = 0; s < 11; s++) layout.push({ col: 0, slot: s });
  for (s = 0; s < 9; s++) layout.push({ col: 1, slot: s });
  var board = Logic.createBoard(layout);
  for (s = 0; s < 10; s++) Logic.setColor(board, 0, s, 'red');
  Logic.setColor(board, 0, 10, 'orange');
  for (s = 0; s < 9; s++) Logic.setColor(board, 1, s, 'orange');

  var preCheck = Logic.findAllQualifyingGroups(board, Config.CLEAR_THRESHOLD);
  assert.strictEqual(preCheck.length, 1, 'only the red group should qualify before any clearing');

  var result = Logic.resolveCascade(board, Config.CLEAR_THRESHOLD);
  assert.strictEqual(result.events.length, 2, 'expected two separate cascade events');
  assert.strictEqual(result.events[0].groups[0].color, 'red');
  assert.strictEqual(result.events[1].groups[0].color, 'orange');
  assert.ok(Logic.boardIsEmpty(result.board));
});

test('cascade does nothing when no group qualifies', function () {
  var board = makeLineBoard(3);
  Logic.setColor(board, 0, 0, 'red');
  var result = Logic.resolveCascade(board, Config.CLEAR_THRESHOLD);
  assert.strictEqual(result.events.length, 0);
});

// 9. Current/upcoming queue advances correctly -- tested at the queue-logic
// level used by game.js: slicing PIECE_SEQUENCE by an advancing index.
test('piece queue slices advance correctly as pieces are used', function () {
  var seq = Config.PIECE_SEQUENCE;
  var index = 0;
  function currentAndUpcoming() {
    return {
      current: seq.slice(index, index + 3),
      upcoming: seq.slice(index + 3, index + 5)
    };
  }
  var view = currentAndUpcoming();
  assert.strictEqual(view.current.length, 3);
  assert.strictEqual(view.current[0].id, seq[0].id);
  assert.strictEqual(view.upcoming[0].id, seq[3].id);
  index++; // simulate playing the first current piece
  view = currentAndUpcoming();
  assert.strictEqual(view.current[0].id, seq[1].id);
  assert.strictEqual(view.current[2].id, seq[3].id);
  assert.strictEqual(view.upcoming[0].id, seq[4].id);
});

// 10. Undo restores the exact previous state -- tested at the snapshot
// level game.js relies on (deep-equal cells object after clone + mutate).
test('cloneBoard produces an independent snapshot for undo', function () {
  var board = Logic.createBoard(Config.LEVEL_LAYOUT);
  board = Logic.withInitialTokens(board, Config.INITIAL_TOKENS);
  var snapshot = Logic.cloneBoard(board);
  var mutated = Logic.placePiece(board, Config.PIECE_SEQUENCE[0], 0, 0);
  // The snapshot taken before placing must be unaffected by the mutation.
  assert.deepStrictEqual(snapshot.cells, board.cells);
  assert.notDeepStrictEqual(mutated.cells, snapshot.cells);
});

// 11. Restart restores the original state -- this just confirms building
// the initial board twice from the same config gives identical results
// (i.e. board construction is deterministic, which is what "restart" relies on).
test('building the initial board is deterministic', function () {
  var boardA = Logic.withInitialTokens(Logic.createBoard(Config.LEVEL_LAYOUT), Config.INITIAL_TOKENS);
  var boardB = Logic.withInitialTokens(Logic.createBoard(Config.LEVEL_LAYOUT), Config.INITIAL_TOKENS);
  assert.deepStrictEqual(boardA.cells, boardB.cells);
});

// 12 & 14. Clearing the entire board produces a win, AND the included level
// is actually solvable -- replay the documented SOLUTION through the real
// engine, exactly the way game.js would apply moves, and confirm it ends
// with an empty board using every piece in PIECE_SEQUENCE.
test('the included level is solvable via the documented SOLUTION', function () {
  var board = Logic.withInitialTokens(Logic.createBoard(Config.LEVEL_LAYOUT), Config.INITIAL_TOKENS);
  assert.strictEqual(Config.SOLUTION.length, Config.PIECE_SEQUENCE.length,
    'solution should place every piece in the sequence');

  Config.SOLUTION.forEach(function (step, i) {
    var piece = Config.PIECE_SEQUENCE[i];
    assert.strictEqual(piece.id, step.pieceId,
      'solution step ' + i + ' expected piece ' + step.pieceId + ' but sequence has ' + piece.id);
    assert.ok(
      Logic.canPlacePiece(board, piece, step.anchor.col, step.anchor.slot),
      'solution step ' + i + ' (' + piece.id + ') is not a legal placement'
    );
    board = Logic.placePiece(board, piece, step.anchor.col, step.anchor.slot);
    var cascade = Logic.resolveCascade(board, Config.CLEAR_THRESHOLD);
    board = cascade.board;

    // Regression guard: the win condition is "board completely empty,"
    // checked after every move. If an intermediate wave's clear ever left
    // nothing on the board, the game would declare an accidental win long
    // before the rest of PIECE_SEQUENCE was played (this happened during
    // development -- the fix was the S1 seed token in column 4).
    var isLastStep = i === Config.SOLUTION.length - 1;
    if (!isLastStep) {
      assert.ok(!Logic.boardIsEmpty(board),
        'board must not be empty after step ' + i + ' (' + piece.id + ') -- that would trigger a premature win');
    }
  });

  assert.ok(Logic.boardIsEmpty(board), 'board should be completely empty after the full solution');
});

test('an empty board is a win condition', function () {
  var board = Logic.createBoard(Config.LEVEL_LAYOUT);
  assert.ok(Logic.boardIsEmpty(board));
});

// 13. An unsalvageable board produces a loss (no legal placement remains).
test('a full board with no matching empty shape has no legal move', function () {
  var layout = [{ col: 0, slot: 0 }, { col: 0, slot: 1 }];
  var board = Logic.createBoard(layout);
  board = Logic.withInitialTokens(board, [
    { col: 0, slot: 0, color: 'red' },
    { col: 0, slot: 1, color: 'purple' }
  ]);
  var pieces = [{ cells: [{ dq: 0, dr: 0, color: 'orange' }] }];
  assert.strictEqual(Logic.hasAnyLegalMove(board, pieces), false);
});

test('a board with room still reports a legal move', function () {
  var board = Logic.createBoard(Config.LEVEL_LAYOUT);
  var pieces = [Config.PIECE_SEQUENCE[0]];
  assert.strictEqual(Logic.hasAnyLegalMove(board, pieces), true);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
