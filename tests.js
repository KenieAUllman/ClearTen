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

// 3 & 4. Threshold behavior (9 doesn't clear, 10 does).
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
// reveal. Two adjacent columns (see hex adjacency notes in gamelogic.js).
// Column 0 (height 11) has 10 single-layer red pieces at the bottom (they
// vanish completely on clearing -- no buried layer) plus 1 single-layer
// purple piece stranded at the very top (slot 10). Column 1 (height 9) is
// entirely single-layer purple, already packed at the bottom -- NOT yet
// touching column 0's stranded purple (slot 10 is nowhere near column 1's
// pieces). Clearing the red empties column 0's bottom 10 slots, and
// gravity drops the stranded purple all the way down to slot 0 -- which,
// because column 0 is even, is hex-adjacent to column 1's slot 0. That
// newly-formed adjacency connects 1 + 9 = 10 purple for the first time.
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

// 3 & 9. Used current pieces are replaced from the hidden predetermined
// sequence, and the 3 current pieces never all share the same active
// color (V0.5: with no Upcoming preview, this is the only visible future
// information -- if it were allowed to go monochrome, the player would
// sometimes have no real choice at all).
test('drawing pieces from the hidden sequence preserves order and full layer arrays', function () {
  var seq = level.pieceSequence;
  var current = seq.slice(0, 3);
  assert.strictEqual(current.length, 3);
  seq.forEach(function (piece, i) {
    assert.ok(Array.isArray(piece.layers) && piece.layers.length >= 1 && piece.layers.length <= 3,
      'piece ' + i + ' (' + piece.id + ') should carry 1-3 layers (V0.5 caps depth at 3; a "plain" piece with no buried color is just 1)');
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

test('no window of 3 consecutive pieces in the sequence shares the same active color', function () {
  var seq = level.pieceSequence;
  for (var i = 0; i + 2 < seq.length; i++) {
    var colors = [seq[i], seq[i + 1], seq[i + 2]].map(function (p) { return p.layers[0]; });
    var allSame = colors[0] === colors[1] && colors[1] === colors[2];
    assert.ok(!allSame, 'window at index ' + i + ' (' + seq[i].id + ',' + seq[i + 1].id + ',' + seq[i + 2].id + ') is all ' + colors[0]);
  }
});

// 13. Undo restores complete layered state -- tested at the snapshot level
// game.js relies on: cloning a board with layered cells and confirming a
// later mutation doesn't affect the earlier snapshot.
test('cloneBoard produces an independent snapshot of layered cells for undo', function () {
  var board = Logic.withInitialTokens(Logic.createBoard(level.layout), level.initialTokens);
  var snapshot = Logic.cloneBoard(board);
  var mutated = Logic.placePiece(board, level.pieceSequence[0], 0, 0);
  assert.deepStrictEqual(Logic.getLayers(snapshot, 1, 0), ['purple', 'red']);
  assert.strictEqual(Logic.getCell(snapshot, 0, 0), null, 'snapshot should not see the later placement');
  assert.notStrictEqual(Logic.getCell(mutated, 0, 0), null);

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

// 17. The included level is solvable: replay the documented SOLUTION
// through the real engine (placement -> gravity -> cascade, every step,
// exactly like game.js), and confirm it ends with an empty board.
test('the included level is solvable via its documented solution', function () {
  var board = Logic.withInitialTokens(Logic.createBoard(level.layout), level.initialTokens);
  assert.strictEqual(level.solution.length, level.pieceSequence.length,
    'solution should place every piece in the sequence');

  level.solution.forEach(function (step, i) {
    var piece = level.pieceSequence[i];
    assert.strictEqual(piece.id, step.pieceId,
      'solution step ' + i + ' expected piece ' + step.pieceId + ' but sequence has ' + piece.id);
    assert.ok(
      Logic.canPlacePiece(board, piece, step.target.col, step.target.slot),
      'solution step ' + i + ' (' + piece.id + ') is not a legal placement'
    );
    board = Logic.placePiece(board, piece, step.target.col, step.target.slot);
    var cascade = Logic.resolveCascade(board, Config.CLEAR_THRESHOLD);
    board = cascade.board;

    var isLastStep = i === level.solution.length - 1;
    if (!isLastStep) {
      assert.ok(!Logic.boardIsEmpty(board),
        'board must not be empty after step ' + i + ' (' + piece.id + ') -- that would trigger a premature win');
    }
  });

  assert.ok(Logic.boardIsEmpty(board), 'board should be completely empty after the full solution');
});

// 6, 7 & 8. Board terrain creates real, structural region separation --
// not just "usually" true, but a geometric fact of this board shape.
// Column 0 (the LEFT dead end) and column 4 (the RIGHT dead end) can
// NEVER be adjacent to the bridge (column 2) or the far basin, at ANY
// slot height, because hex adjacency only ever spans one column step.
test('column 0 and column 4 (the dead-end pockets) can never reach the bridge or the far basin', function () {
  var board = Logic.createBoard(level.layout);
  level.layout.filter(function (c) { return c.col === 0; }).forEach(function (c) {
    Logic.getNeighbors(board, c.col, c.slot).forEach(function (n) {
      assert.ok(n.col <= 1, 'column 0 slot ' + c.slot + ' must never neighbor column ' + n.col);
    });
  });
  level.layout.filter(function (c) { return c.col === 4; }).forEach(function (c) {
    Logic.getNeighbors(board, c.col, c.slot).forEach(function (n) {
      assert.ok(n.col >= 3, 'column 4 slot ' + c.slot + ' must never neighbor column ' + n.col);
    });
  });
});

test('the bridge (column 2) is the only path between the left and right basins', function () {
  var board = Logic.createBoard(level.layout);
  // Column 1's higher slots (2,3) are too high for column 2 (only 2
  // cells tall) to ever reach -- only slots 0-1 can touch the bridge.
  var col1TouchesBridge = level.layout.filter(function (c) { return c.col === 1; }).map(function (c) {
    return { slot: c.slot, touchesBridge: Logic.getNeighbors(board, 1, c.slot).some(function (n) { return n.col === 2; }) };
  });
  assert.deepStrictEqual(col1TouchesBridge, [
    { slot: 0, touchesBridge: true },
    { slot: 1, touchesBridge: true },
    { slot: 2, touchesBridge: false },
    { slot: 3, touchesBridge: false }
  ]);
});

function pieceById(id) {
  return level.pieceSequence.filter(function (p) { return p.id === id; })[0];
}

function placeSteps(board, steps) {
  steps.forEach(function (step) {
    var piece = pieceById(step.pieceId);
    assert.ok(Logic.canPlacePiece(board, piece, step.target.col, step.target.slot),
      step.pieceId + ' -> (' + step.target.col + ',' + step.target.slot + ') is not a legal placement');
    board = Logic.placePiece(board, piece, step.target.col, step.target.slot);
  });
  return board;
}

// 18/19. The level performs its documented purple -> orange -> red chain
// as three SEPARATE cascade events (not merged), each still leaving the
// board non-empty except the last -- confirms the terrain-driven design
// works exactly as described in config.js.
test('the level performs three separate purple -> orange -> red waves via the bridge', function () {
  var board = Logic.withInitialTokens(Logic.createBoard(level.layout), level.initialTokens);
  var wave1 = level.solution.slice(0, 11); // through P5
  var wave2 = level.solution.slice(11, 12); // O3
  var wave3 = level.solution.slice(12, 14); // R1, R2

  board = placeSteps(board, wave1);
  var afterWave1 = Logic.resolveCascade(board, Config.CLEAR_THRESHOLD);
  assert.strictEqual(afterWave1.events.length, 1, 'wave 1 should be a single purple-clear event');
  assert.strictEqual(afterWave1.events[0].groups[0].color, 'purple');
  board = afterWave1.board;
  assert.ok(!Logic.boardIsEmpty(board), 'board must not be empty after wave 1');
  // The bridge should be empty right after wave 1 (TRAP_A/TRAP_B's purple
  // peeled to orange, which hasn't cleared yet).
  assert.strictEqual(Logic.getActiveColor(board, 2, 0), 'orange');

  board = placeSteps(board, wave2);
  var afterWave2 = Logic.resolveCascade(board, Config.CLEAR_THRESHOLD);
  assert.strictEqual(afterWave2.events.length, 1, 'wave 2 should be a single orange-clear event');
  assert.strictEqual(afterWave2.events[0].groups[0].color, 'orange');
  board = afterWave2.board;
  assert.ok(!Logic.boardIsEmpty(board), 'board must not be empty after wave 2');
  // The bridge reopens (empty) once orange clears -- left's red and
  // right's red are NOT yet connected.
  assert.strictEqual(Logic.getCell(board, 2, 0), null);
  assert.strictEqual(Logic.getCell(board, 2, 1), null);
  assert.notDeepStrictEqual(
    Logic.findConnectedGroup(board, 1, 0).map(function (c) { return c.col + '_' + c.slot; }).sort(),
    Logic.findConnectedGroup(board, 3, 0).map(function (c) { return c.col + '_' + c.slot; }).sort(),
    'left red and right red should still be two separate groups before the bridge is refilled'
  );

  board = placeSteps(board, wave3);
  var afterWave3 = Logic.resolveCascade(board, Config.CLEAR_THRESHOLD);
  assert.strictEqual(afterWave3.events.length, 1, 'wave 3 should be a single red-clear event');
  assert.strictEqual(afterWave3.events[0].groups[0].color, 'red');
  assert.ok(Logic.boardIsEmpty(afterWave3.board), 'the whole board should be empty after wave 3');
});

// 19. At least two independent decisions reward planning around a buried
// future color rather than only the active one -- TRAP_A and TRAP_B are
// tested SEPARATELY (each is its own placement choice, at a different
// moment in play) to prove this is two situations, not one. Each trap
// piece's "obvious" alternative is a dead-end column-0 cell that some
// OTHER plain-purple piece was going to use -- so testing the wrong
// choice means swapping the trap and that plain piece's targets (both
// still legal placements, both still reach purple=10; only where the
// buried orange ends up differs).
[
  { trapId: 'TRAP_A', swapWithId: 'P1' },
  { trapId: 'TRAP_B', swapWithId: 'P2' }
].forEach(function (pair) {
  test('buried-color decision: ' + pair.trapId + ' placed in the bridge (not the dead-end) is what lets orange connect', function () {
    function playWave1(swapped) {
      var board = Logic.withInitialTokens(Logic.createBoard(level.layout), level.initialTokens);
      var targets = {};
      level.solution.slice(0, 11).forEach(function (step) { targets[step.pieceId] = step.target; });
      if (swapped) {
        var t = targets[pair.trapId];
        targets[pair.trapId] = targets[pair.swapWithId];
        targets[pair.swapWithId] = t;
      }
      var steps = level.solution.slice(0, 11).map(function (step) {
        return { pieceId: step.pieceId, target: targets[step.pieceId] };
      });
      board = placeSteps(board, steps);
      var cascade = Logic.resolveCascade(board, Config.CLEAR_THRESHOLD);
      assert.strictEqual(cascade.events[0].groups[0].color, 'purple', 'purple should still reach 10 either way -- the swap only affects the active color\'s LOCATION, not the count');
      return cascade.board;
    }

    var correctBoard = playWave1(false);
    var wrongBoard = playWave1(true);

    // Placed correctly (in the bridge), the revealed orange joins the
    // right basin's orange group (it's adjacent to column 3's seed).
    var rightGroup = Logic.findConnectedGroup(correctBoard, 3, 0);
    assert.ok(rightGroup.some(function (c) { return c.col === 2; }),
      pair.trapId + ' placed in the bridge should be part of the right basin\'s orange group');

    // Placed in the dead-end column 0 instead, the revealed orange ends
    // up stranded there. Don't assume which exact slot -- clearing plain
    // purple next to it opens a gap, so gravity may drop it further down
    // within column 0 (still confirmed empty of anything in column 3's
    // group either way). Find wherever the orange actually landed.
    var strandedCell = level.layout.filter(function (c) { return c.col <= 1; })
      .find(function (c) { return Logic.getActiveColor(wrongBoard, c.col, c.slot) === 'orange'; });
    assert.ok(strandedCell, pair.trapId + ' should have revealed an orange piece somewhere in the left basin');
    var strandedGroup = Logic.findConnectedGroup(wrongBoard, strandedCell.col, strandedCell.slot);
    assert.ok(strandedGroup.every(function (c) { return c.col <= 1; }),
      pair.trapId + ' placed in column 0 should be stranded there, never reaching the bridge or right basin');

    // The right basin's group is exactly one cell smaller without this
    // trap's contribution -- the only thing the correct placement changes
    // is whether THIS piece's orange counts toward it.
    var rightGroupWrong = Logic.findConnectedGroup(wrongBoard, 3, 0);
    assert.strictEqual(rightGroupWrong.length, rightGroup.length - 1,
      pair.trapId + '\'s orange should be missing from the right basin group when stranded in column 0');
  });
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

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
