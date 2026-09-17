/*
 * ClearTen - gameplay configuration.
 *
 * Everything that defines the puzzles (colors, the clear threshold, the
 * board shapes, starting pieces, and predetermined piece sequences) lives
 * here, separate from the engine (gamelogic.js) and the UI (game.js).
 * Tweak these values to experiment with the rules.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ClearTenConfig = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // How many same-active-color connected pieces are needed to clear a group.
  // LOCKED at exactly 10 -- every level below is built around this number,
  // never more, never less. Unchanged since V0.5.
  var CLEAR_THRESHOLD = 10;

  // The 3 token colors used in this prototype, with their display color.
  var COLORS = {
    red: { hex: '#e15c5c', label: 'Red' },
    purple: { hex: '#8d6fd1', label: 'Purple' },
    orange: { hex: '#f0a04b', label: 'Orange' }
  };

  // Builds a board layout from an array of column heights, every column
  // starting at slot 0. Kept for simple cases; most levels below use
  // layoutFromColumns instead, which allows each column its own FLOOR as
  // well as height.
  function boardLayout(columnHeights) {
    var layout = [];
    columnHeights.forEach(function (height, col) {
      for (var slot = 0; slot < height; slot++) layout.push({ col: col, slot: slot });
    });
    return layout;
  }

  // V0.7: `columns` is an array of {floor, height} -- each column's own
  // slots run from `floor` to `floor + height - 1`, still a CONTIGUOUS
  // range (gravity, per gamelogic.js, compacts a column's occupied cells
  // toward the first slot in its own sorted range, so a contiguous range
  // is what keeps "falling" behaving the way it looks). Uneven floors are
  // what let a board be genuinely irregular -- a bowl, a staircase, a
  // tower -- while still being ONE continuous connected mass, instead of
  // V0.6's technique of using a too-short column to structurally cut the
  // board into separate pieces.
  function layoutFromColumns(columns) {
    var layout = [];
    columns.forEach(function (c, col) {
      for (var slot = c.floor; slot < c.floor + c.height; slot++) layout.push({ col: col, slot: slot });
    });
    return layout;
  }

  function makePiece(id, layers) {
    return { id: id, layers: layers };
  }

  // =====================================================================
  // V0.8 -- STEP GRAVITY EXPERIMENT.
  // =====================================================================
  //
  // Every level up through V0.7 used SETTLE GRAVITY (gamelogic.js:
  // applyGravity/resolveCascade) -- a placement always falls all the way
  // to its final resting position in one instant. Playtesting V0.7 found
  // that this makes almost every puzzle resolve to the same question:
  // "which column?" V0.8 adds a second mode, STEP GRAVITY
  // (applyStepGravity/resolveCascadeStepGravity), where an unsupported
  // piece advances exactly ONE slot per PLAYER TURN instead. A level opts
  // in via `gravityMode: 'step'`; omitting the field (or setting
  // `'settle'`) keeps the original instant behavior. See gamelogic.js for
  // the full mechanical rules and exactly when movement happens.
  //
  // Only levels 2-5 use Step Gravity; Level 1 is a deliberate Settle
  // Gravity CONTROL level for comparison. Every level's documented
  // solution, AND its documented tempting mistake, are replayed through
  // the real engine in tests.js -- the mistake is confirmed to make the
  // board unsolvable, not just narrated.

  // ---------------------------------------------------------------------
  // LEVEL 1 -- CONTROL (Settle Gravity). Medium.
  // ---------------------------------------------------------------------
  //
  // A tower + decoy puzzle, the same family as V0.7's signature Level 5,
  // used here purely as a baseline for comparing against the four Step
  // Gravity levels that follow -- same core trick (a buried-color piece
  // must go in the REAL tower, not the decoy two columns away), same
  // instant settle-to-the-floor behavior V0.5-V0.7 already established.
  //
  // KEY INSIGHT: column 1's tower (9 plain purple + one buried-orange
  // ROUTE piece) is the only way to complete purple; column 3's decoy
  // tower looks identical but is two columns from the orange target and
  // can never reach it.
  //
  // TEMPTING MISTAKE: verified -- placing ROUTE in the decoy instead of
  // finishing the real tower leaves the board unsolvable.
  var level1 = {
    id: 'level1',
    name: 'Level 1: Control',
    introText: 'Connect 10 matching top colors. Buried colors appear next.',
    gravityMode: 'settle',
    layout: layoutFromColumns([
      { floor: 0, height: 9 },  // col0: ORANGE target
      { floor: 0, height: 10 }, // col1: the REAL tower
      { floor: 2, height: 3 },  // col2: small connective filler
      { floor: 2, height: 5 }   // col3: DECOY tower (2 columns from col0)
    ]),
    initialTokens: [],
    pieceSequence: [
      makePiece('O1', ['orange']), makePiece('P1', ['purple']),
      makePiece('O2', ['orange']), makePiece('P2', ['purple']),
      makePiece('O3', ['orange']), makePiece('P3', ['purple']),
      makePiece('O4', ['orange']), makePiece('P4', ['purple']),
      makePiece('O5', ['orange']), makePiece('P5', ['purple']),
      makePiece('O6', ['orange']), makePiece('P6', ['purple']),
      makePiece('O7', ['orange']), makePiece('P7', ['purple']),
      makePiece('O8', ['orange']), makePiece('P8', ['purple']),
      makePiece('O9', ['orange']), makePiece('P9', ['purple']),
      makePiece('ROUTE', ['purple', 'orange'])
    ],
    // Verified: solvable, 19 placements, 2 cascade events (purple, then orange).
    solution: [
      { pieceId: 'O1', target: { col: 0, slot: 0 } }, { pieceId: 'P1', target: { col: 1, slot: 0 } },
      { pieceId: 'O2', target: { col: 0, slot: 1 } }, { pieceId: 'P2', target: { col: 1, slot: 1 } },
      { pieceId: 'O3', target: { col: 0, slot: 2 } }, { pieceId: 'P3', target: { col: 1, slot: 2 } },
      { pieceId: 'O4', target: { col: 0, slot: 3 } }, { pieceId: 'P4', target: { col: 1, slot: 3 } },
      { pieceId: 'O5', target: { col: 0, slot: 4 } }, { pieceId: 'P5', target: { col: 1, slot: 4 } },
      { pieceId: 'O6', target: { col: 0, slot: 5 } }, { pieceId: 'P6', target: { col: 1, slot: 5 } },
      { pieceId: 'O7', target: { col: 0, slot: 6 } }, { pieceId: 'P7', target: { col: 1, slot: 6 } },
      { pieceId: 'O8', target: { col: 0, slot: 7 } }, { pieceId: 'P8', target: { col: 1, slot: 7 } },
      { pieceId: 'O9', target: { col: 0, slot: 8 } }, { pieceId: 'P9', target: { col: 1, slot: 8 } },
      { pieceId: 'ROUTE', target: { col: 1, slot: 9 } }
      // ^ purple (col1, all 10) clears -> ROUTE reveals orange -> touches
      //   col0 (now 9) -> orange reaches 10 -> clears -> WIN
    ]
  };

  // ---------------------------------------------------------------------
  // LEVEL 2 -- STEP GRAVITY INTRODUCTION. Medium.
  // ---------------------------------------------------------------------
  //
  // A wide, uniform, shallow board -- 5 columns, all floor 0, height 4.
  // No funnel, no trick geometry. Every piece is placed near the TOP of
  // its column and visibly steps down one slot per turn (its own turn's
  // step, plus one more for every subsequent placement anywhere on the
  // board) until it reaches the floor, where adjacent columns' floors
  // touch and connect. Deliberately forgiving: there are far more total
  // turns than any single piece needs to fully descend, so exact ordering
  // barely matters -- the point is purely to watch movement happen and
  // learn to predict it.
  //
  // KEY INSIGHT: a piece placed high up doesn't "teleport" to its final
  // spot the way Settle Gravity would -- it takes visible, countable
  // turns. Clicking a cell near the top is not equivalent to clicking one
  // near the bottom anymore.
  var level2 = {
    id: 'level2',
    name: 'Level 2: Step Gravity Intro',
    introText: 'STEP GRAVITY: unsupported pieces fall ONE slot per turn, not all the way. Watch them travel.',
    gravityMode: 'step',
    layout: layoutFromColumns([
      { floor: 0, height: 4 }, { floor: 0, height: 4 }, { floor: 0, height: 4 },
      { floor: 0, height: 4 }, { floor: 0, height: 4 }
    ]),
    initialTokens: [],
    pieceSequence: [
      makePiece('P1', ['purple']), makePiece('P2', ['purple']), makePiece('P3', ['purple']), makePiece('P4', ['purple']),
      makePiece('P5', ['purple']), makePiece('P6', ['purple']), makePiece('P7', ['purple']), makePiece('P8', ['purple']),
      makePiece('P9', ['purple']), makePiece('P10', ['purple'])
    ],
    // Verified: solvable, 10 placements, each piece visibly steps down
    // over 2-3 turns before the whole group connects on the final move.
    solution: [
      { pieceId: 'P1', target: { col: 0, slot: 3 } },
      { pieceId: 'P2', target: { col: 0, slot: 3 } },
      { pieceId: 'P3', target: { col: 1, slot: 3 } },
      { pieceId: 'P4', target: { col: 1, slot: 3 } },
      { pieceId: 'P5', target: { col: 2, slot: 3 } },
      { pieceId: 'P6', target: { col: 2, slot: 3 } },
      { pieceId: 'P7', target: { col: 3, slot: 3 } },
      { pieceId: 'P8', target: { col: 3, slot: 3 } },
      { pieceId: 'P9', target: { col: 4, slot: 1 } },
      { pieceId: 'P10', target: { col: 4, slot: 1 } }
      // ^ by the final placement, all 10 purple pieces have stepped down
      //   to the floor across all 5 columns and connect -> clears -> WIN
    ]
  };

  // ---------------------------------------------------------------------
  // LEVEL 3 -- CROSSING PATHS. Medium-hard.
  // ---------------------------------------------------------------------
  //
  // A wide board: column 0 (purple, 9 direct), column 1 (a very tall
  // "elevator" column, height 16 -- far taller than its neighbors),
  // column 2 (orange, 9 direct), plus columns 3-4 as decoy geometry (two
  // columns from anything relevant, never touched by the solution).
  //
  // KEY INSIGHT: a single [purple, orange] ELEVATOR piece dropped near
  // column 1's top has NOTHING to touch there (columns 0/2 only reach up
  // to slot 8 -- verified via getNeighbors -- while the elevator starts
  // at slot 15). It must fall through 7+ turns of genuinely empty space
  // before entering range. This is a FUTURE POSITION problem, not a
  // "which column" one: dropping it late enough that it can't finish its
  // descent before the rest of the board is filled fails, even though
  // the eventual landing column is obviously correct from the start.
  // Once it does arrive, purple clears (col0 9 + elevator 1), revealing
  // orange right where column 1's floor touches column 2 -- completing
  // orange too.
  //
  // TEMPTING MISTAKE: verified -- dropping ELEVATOR LAST instead of
  // FIRST leaves it stuck mid-descent (slot 14 of 15) with no turns left,
  // permanently short of both groups.
  var level3 = {
    id: 'level3',
    name: 'Level 3: Crossing Paths',
    introText: null,
    gravityMode: 'step',
    layout: layoutFromColumns([
      { floor: 0, height: 9 },  // col0: purple, 9 direct
      { floor: 0, height: 16 }, // col1: the elevator column -- far taller than col0/col2
      { floor: 0, height: 9 },  // col2: orange, 9 direct
      { floor: 2, height: 3 },  // col3: decoy geometry, never used
      { floor: 2, height: 6 }   // col4: decoy geometry, never used
    ]),
    initialTokens: [],
    pieceSequence: [
      makePiece('ELEVATOR', ['purple', 'orange']),
      makePiece('P1', ['purple']), makePiece('O1', ['orange']),
      makePiece('P2', ['purple']), makePiece('O2', ['orange']),
      makePiece('P3', ['purple']), makePiece('O3', ['orange']),
      makePiece('P4', ['purple']), makePiece('O4', ['orange']),
      makePiece('P5', ['purple']), makePiece('O5', ['orange']),
      makePiece('P6', ['purple']), makePiece('O6', ['orange']),
      makePiece('P7', ['purple']), makePiece('O7', ['orange']),
      makePiece('P8', ['purple']), makePiece('O8', ['orange']),
      makePiece('P9', ['purple']), makePiece('O9', ['orange'])
    ],
    // Verified: solvable, 19 placements, 17 cascade events (many are
    // single-slot step-advances, not clears).
    solution: [
      { pieceId: 'ELEVATOR', target: { col: 1, slot: 15 } }, // dropped FIRST -- needs the most turns to descend
      { pieceId: 'P1', target: { col: 0, slot: 0 } }, { pieceId: 'O1', target: { col: 2, slot: 0 } },
      { pieceId: 'P2', target: { col: 0, slot: 1 } }, { pieceId: 'O2', target: { col: 2, slot: 1 } },
      { pieceId: 'P3', target: { col: 0, slot: 2 } }, { pieceId: 'O3', target: { col: 2, slot: 2 } },
      { pieceId: 'P4', target: { col: 0, slot: 3 } }, { pieceId: 'O4', target: { col: 2, slot: 3 } },
      { pieceId: 'P5', target: { col: 0, slot: 4 } }, { pieceId: 'O5', target: { col: 2, slot: 4 } },
      { pieceId: 'P6', target: { col: 0, slot: 5 } }, { pieceId: 'O6', target: { col: 2, slot: 5 } },
      { pieceId: 'P7', target: { col: 0, slot: 6 } }, { pieceId: 'O7', target: { col: 2, slot: 6 } },
      { pieceId: 'P8', target: { col: 0, slot: 7 } }, { pieceId: 'O8', target: { col: 2, slot: 7 } },
      { pieceId: 'P9', target: { col: 0, slot: 8 } }, { pieceId: 'O9', target: { col: 2, slot: 8 } }
      // ^ by now the elevator (dropped on turn 0, 18 subsequent turns of
      //   step-advances) has long since reached column 1's floor -- purple
      //   (col0 9 + elevator 1) reaches 10 -> clears -> reveals orange at
      //   column 1's floor -> touches column 2 (orange, now also 9) -> 10 -> clears -> WIN
    ]
  };

  // ---------------------------------------------------------------------
  // LEVEL 4 -- DELAY THE CLEAR. Hard.
  // ---------------------------------------------------------------------
  //
  // Two SEPARATE purple waves: column 0 (a dead end, 2+ columns from
  // everything relevant) and column 2 (adjacent to column 3, the orange
  // target). Each wave needs 9 plain purple plus ONE more piece. Two
  // "tenth piece" candidates exist: QUICK (plain purple) and ELEVATOR
  // ([purple, orange]).
  //
  // KEY INSIGHT: column 0's dead-end wave has no target waiting on it, so
  // it's very likely to reach 9 FIRST -- the natural impulse is to
  // complete it with whichever purple-ish piece is in hand. If that's
  // ELEVATOR, purple clears immediately (an available Clear Ten, right
  // there) -- but column 0 can never reach column 3 (2 columns apart), so
  // the revealed orange is permanently stranded, and QUICK -- now stuck
  // finishing column 2 -- reveals nothing. The orange target sits at
  // 9/10 forever. The level is solved by recognizing that ELEVATOR's
  // buried color makes it column 2's piece, and deliberately holding it
  // back (placing QUICK and other pieces first) even though column 0
  // might be "ready" sooner.
  //
  // DELAYED CLEAR: yes -- the player can complete column 0's Clear Ten as
  // soon as it reaches 9, using whichever tenth piece is at hand, but
  // should NOT use ELEVATOR there even though it's equally legal.
  //
  // TEMPTING MISTAKE: verified -- swapping ELEVATOR and QUICK's targets
  // (ELEVATOR finishes column 0, QUICK finishes column 2) leaves the
  // board unsolvable: orange stuck at 9/10, orange's buried reveal
  // stranded in the dead end.
  var level4 = {
    id: 'level4',
    name: 'Level 4: Delay the Clear',
    introText: null,
    gravityMode: 'step',
    layout: layoutFromColumns([
      { floor: 0, height: 10 }, // col0: WAVE 1 -- dead end, no target
      { floor: 0, height: 1 },  // col1: unused spacer geometry
      { floor: 0, height: 10 }, // col2: WAVE 2 -- adjacent to the orange target
      { floor: 0, height: 9 }   // col3: ORANGE target
    ]),
    initialTokens: [],
    pieceSequence: (function () {
      var seq = [];
      for (var i = 1; i <= 9; i++) {
        seq.push(makePiece('A' + i, ['purple']));
        seq.push(makePiece('B' + i, ['purple']));
        seq.push(makePiece('T' + i, ['orange']));
      }
      seq.push(makePiece('QUICK', ['purple']));
      seq.push(makePiece('ELEVATOR', ['purple', 'orange']));
      return seq;
    })(),
    // Verified: solvable, 29 placements, 3 cascade events. Verified
    // separately: swapping QUICK/ELEVATOR's targets is unsolvable.
    solution: (function () {
      var steps = [];
      for (var i = 1; i <= 9; i++) {
        steps.push({ pieceId: 'A' + i, target: { col: 0, slot: i - 1 } });
        steps.push({ pieceId: 'B' + i, target: { col: 2, slot: i - 1 } });
        steps.push({ pieceId: 'T' + i, target: { col: 3, slot: i - 1 } });
      }
      steps.push({ pieceId: 'QUICK', target: { col: 0, slot: 9 } });
      // ^ QUICK completes wave 1 (col0 9+1=10) -> clears, nothing buried, nothing revealed
      steps.push({ pieceId: 'ELEVATOR', target: { col: 2, slot: 9 } });
      // ^ ELEVATOR completes wave 2 (col2 9+1=10) -> clears -> reveals
      //   orange at col2's floor -> touches col3 (orange, now 9) -> 10 -> clears -> WIN
      return steps;
    })()
  };

  // ---------------------------------------------------------------------
  // LEVEL 5 -- MOTION PUZZLE (signature). Hard.
  // ---------------------------------------------------------------------
  //
  // Combines Level 4's "two waves, one right piece" choice with a
  // 3-layer tower cascade: a dead-end decoy wave (column 0, identical in
  // appearance to the real tower) sits apart from an orange target
  // (column 2) -- the TOWER (column 3) -- and a red target (column 4).
  // The tower's floor touches BOTH column 2 and column 4 at once
  // (verified).
  //
  // Two "tenth piece" candidates again: QUICK (plain purple) and
  // ELEVATOR, this time a full 3-layer [purple, orange, red] piece.
  //
  // KEY INSIGHT (future color AND future position together): ELEVATOR
  // must go in the TOWER, not the dead end. When the tower's purple (all
  // 10 cells) clears, ELEVATOR is the lone survivor and peels to orange
  // -- which touches column 2 (already 9) -> clears -> peels again to red
  // -- still sitting in that same cell, now touching column 4 (also 9)
  // -> clears -> board empty. One placement decision made many turns
  // earlier pays off as a 3-stage chain reaction.
  //
  // DELAYED CLEAR: yes, same shape as Level 4 -- the dead-end wave is
  // free to complete as soon as it reaches 9, but not with ELEVATOR.
  //
  // TEMPTING MISTAKE: verified -- ELEVATOR finishing the dead end instead
  // of the tower leaves both targets stuck at 9/10 forever, with
  // ELEVATOR's buried colors permanently unreachable.
  var level5 = {
    id: 'level5',
    name: 'Level 5: Motion Puzzle',
    introText: null,
    gravityMode: 'step',
    layout: layoutFromColumns([
      { floor: 0, height: 10 }, // col0: dead-end wave
      { floor: 0, height: 1 },  // col1: spacer
      { floor: 0, height: 9 },  // col2: orange target
      { floor: 0, height: 10 }, // col3: the tower -- floor touches BOTH col2 and col4
      { floor: 0, height: 9 }   // col4: red target
    ]),
    initialTokens: [],
    pieceSequence: (function () {
      var seq = [];
      for (var i = 1; i <= 9; i++) {
        seq.push(makePiece('D' + i, ['purple']));
        seq.push(makePiece('O' + i, ['orange']));
        seq.push(makePiece('T' + i, ['purple']));
        seq.push(makePiece('R' + i, ['red']));
      }
      seq.push(makePiece('QUICK', ['purple']));
      seq.push(makePiece('ELEVATOR', ['purple', 'orange', 'red']));
      return seq;
    })(),
    // Verified: solvable, 38 placements, 5 cascade events (purple, then
    // orange, then red, plus step-advance events). Verified separately:
    // ELEVATOR finishing the dead end instead of the tower is unsolvable.
    solution: (function () {
      var steps = [];
      for (var i = 1; i <= 9; i++) {
        steps.push({ pieceId: 'D' + i, target: { col: 0, slot: i - 1 } });
        steps.push({ pieceId: 'O' + i, target: { col: 2, slot: i - 1 } });
        steps.push({ pieceId: 'T' + i, target: { col: 3, slot: i - 1 } });
        steps.push({ pieceId: 'R' + i, target: { col: 4, slot: i - 1 } });
      }
      steps.push({ pieceId: 'QUICK', target: { col: 0, slot: 9 } });
      steps.push({ pieceId: 'ELEVATOR', target: { col: 3, slot: 9 } });
      // ^ purple (tower, all 10) clears -> ELEVATOR peels to orange ->
      //   touches col2 (9) -> 10 -> clears -> peels to red -> touches
      //   col4 (9) -> 10 -> clears -> board empty -> WIN
      return steps;
    })()
  };

  var LEVELS = [level1, level2, level3, level4, level5];

  return {
    CLEAR_THRESHOLD: CLEAR_THRESHOLD,
    COLORS: COLORS,
    LEVELS: LEVELS
  };
});
