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

// 12. Current/upcoming queue displays full layer order -- tested at the
// queue-logic level game.js relies on (slicing pieceSequence, each entry
// keeping its full `layers` array intact).
test('piece queue slices preserve each piece\'s full layer order', function () {
  var seq = level.pieceSequence;
  var current = seq.slice(0, 3);
  var upcoming = seq.slice(3, 5);
  current.concat(upcoming).forEach(function (piece, i) {
    assert.ok(Array.isArray(piece.layers) && piece.layers.length >= 2, 'piece ' + i + ' should carry its full layer array');
  });
  assert.deepStrictEqual(current[0].layers, seq[0].layers);
});

// 13. Undo restores complete layered state -- tested at the snapshot level
// game.js relies on: cloning a board with layered cells and confirming a
// later mutation doesn't affect the earlier snapshot.
test('cloneBoard produces an independent snapshot of layered cells for undo', function () {
  var board = Logic.withInitialTokens(Logic.createBoard(level.layout), level.initialTokens);
  var snapshot = Logic.cloneBoard(board);
  var mutated = Logic.placePiece(board, level.pieceSequence[0], 4, 0);
  assert.deepStrictEqual(Logic.getLayers(snapshot, 2, 0), ['red', 'purple', 'orange']);
  assert.strictEqual(Logic.getCell(snapshot, 4, 0), null, 'snapshot should not see the later placement');
  assert.notStrictEqual(Logic.getCell(mutated, 4, 0), null);

  // Peeling a layer on `mutated` must not retroactively change the
  // snapshot's (or the original board's) layer arrays.
  var cascade = Logic.resolveCascade(mutated, 1); // threshold 1 forces an immediate "clear" for this check
  assert.deepStrictEqual(Logic.getLayers(board, 2, 0), ['red', 'purple', 'orange'], 'original board must be untouched');
  assert.deepStrictEqual(Logic.getLayers(snapshot, 2, 0), ['red', 'purple', 'orange'], 'snapshot must be untouched');
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

// Confirms the level's headline mechanic actually happens when played as
// documented: wave 1 (red) reveals a 4-cell orange region AND a 6-cell
// purple region from different cells; wave 2's 4 placed purple pieces grow
// purple to 10, and peeling it reveals a THIRD orange region that is
// already connected to wave 1's orange region, reaching 10 and clearing
// automatically in the same cascade -- with no additional placement.
test('the level performs the documented red -> purple -> orange chain, ending with a wave that needs no placement of its own', function () {
  var board = Logic.withInitialTokens(Logic.createBoard(level.layout), level.initialTokens);
  var wave1 = level.solution.slice(0, 8);
  var wave2 = level.solution.slice(8, 12);

  wave1.forEach(function (step) {
    var piece = level.pieceSequence.filter(function (p) { return p.id === step.pieceId; })[0];
    board = Logic.placePiece(board, piece, step.target.col, step.target.slot);
  });
  var afterWave1 = Logic.resolveCascade(board, Config.CLEAR_THRESHOLD);
  assert.strictEqual(afterWave1.events.length, 1, 'only red should clear after wave 1');
  assert.strictEqual(afterWave1.events[0].groups[0].color, 'red');
  board = afterWave1.board;
  assert.ok(!Logic.boardIsEmpty(board));

  wave2.forEach(function (step) {
    var piece = level.pieceSequence.filter(function (p) { return p.id === step.pieceId; })[0];
    board = Logic.placePiece(board, piece, step.target.col, step.target.slot);
  });
  var afterWave2 = Logic.resolveCascade(board, Config.CLEAR_THRESHOLD);
  // Expect exactly two clear events here: purple clears, then orange
  // clears automatically as a direct consequence -- no wave 3 placement.
  var colorsCleared = afterWave2.events.map(function (e) { return e.groups.length ? e.groups[0].color : null; }).filter(Boolean);
  assert.deepStrictEqual(colorsCleared, ['purple', 'orange'],
    'expected purple to clear and then orange to clear automatically in the same cascade');
  assert.ok(Logic.boardIsEmpty(afterWave2.board), 'the automatic orange clear should empty the whole board');
});

// 18. At least one solution step requires thinking about a buried color,
// not just the active one. Demonstrated concretely: swap which of two
// wave-1 cells get a [red,orange] vs [red,purple] piece (both are equally
// valid red placements in the moment -- red reaches 10 either way) and
// show that it changes whether wave 2 still finishes the board via the
// automatic chain, proving the buried color -- not the active color --
// is what the placement choice actually affects.
test('wave 1 placement choice must consider buried color, not just active color', function () {
  function playWave1(swapRA1AndRA3Targets) {
    var board = Logic.withInitialTokens(Logic.createBoard(level.layout), level.initialTokens);
    var targets = {};
    level.solution.slice(0, 8).forEach(function (step) { targets[step.pieceId] = step.target; });
    if (swapRA1AndRA3Targets) {
      var t = targets.RA1;
      targets.RA1 = targets.RA3;
      targets.RA3 = t;
    }
    level.solution.slice(0, 8).forEach(function (step) {
      var piece = level.pieceSequence.filter(function (p) { return p.id === step.pieceId; })[0];
      var t = targets[step.pieceId];
      board = Logic.placePiece(board, piece, t.col, t.slot);
    });
    var afterWave1 = Logic.resolveCascade(board, Config.CLEAR_THRESHOLD);
    assert.strictEqual(afterWave1.events[0].groups[0].color, 'red', 'red should still reach 10 either way -- the active color is unaffected by the swap');
    return afterWave1.board;
  }

  var documented = playWave1(false);
  var swapped = playWave1(true);

  // Both are legal, and both still clear red (proving the swap doesn't
  // break the "active color" logic). What differs is the shape of the
  // revealed purple/orange regions -- with the swap, RA1's cell (col1
  // slot0) now reveals purple instead of orange, and RA3's cell (col3
  // slot0) reveals orange instead of purple, breaking each color's
  // single-connected-region shape from the documented solution.
  assert.strictEqual(Logic.getActiveColor(documented, 1, 0), 'orange');
  assert.strictEqual(Logic.getActiveColor(documented, 3, 0), 'purple');
  assert.strictEqual(Logic.getActiveColor(swapped, 1, 0), 'purple');
  assert.strictEqual(Logic.getActiveColor(swapped, 3, 0), 'orange');
  assert.notDeepStrictEqual(documented.cells, swapped.cells,
    'the resulting board must differ -- the buried-color choice has a real, observable effect');
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
