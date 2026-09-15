/*
 * ClearTen - browser UI layer.
 *
 * This file is deliberately "dumb": all real game rules live in
 * gamelogic.js, and all level/rule numbers live in config.js. This file
 * just renders state to SVG/DOM and turns pointer input into calls into
 * the engine.
 */

(function () {
  'use strict';

  var Logic = window.ClearTenLogic;
  var Config = window.ClearTenConfig;

  // Flip this to true to see hex coordinates on the board and extra info
  // in the console. Not exposed to normal players.
  var DEBUG = false;

  var CLEAR_ANIMATION_MS = 320;
  var FALL_ANIMATION_MS = 280; // matches the .token.falling CSS transition + a small buffer
  var FIRST_CLEAR_EMPHASIS_MS = 1100;
  var INTRO_BANNER_AUTO_DISMISS_MS = 4200;

  // ---- Hex pixel geometry --------------------------------------------------
  // Flat-top hexagons. `HEX_SIZE` is the circumradius (center to corner) in
  // SVG user-space units. See gamelogic.js for the col/slot -> axial
  // explanation; here we just turn axial coordinates into pixel centers.
  var HEX_SIZE = 6;

  function axialToPixel(q, r) {
    var x = HEX_SIZE * 1.5 * q;
    var y = HEX_SIZE * Math.sqrt(3) * (r + q / 2);
    // Slot increases "upward" in game terms, so flip y for screen space
    // (SVG y grows downward).
    return { x: x, y: -y };
  }

  function pixelForCell(col, slot) {
    var axial = Logic.offsetToAxial(col, slot);
    return axialToPixel(axial.q, axial.r);
  }

  function hexCorners(cx, cy, size) {
    var points = [];
    for (var i = 0; i < 6; i++) {
      var angleDeg = 60 * i;
      var angleRad = (Math.PI / 180) * angleDeg;
      points.push((cx + size * Math.cos(angleRad)).toFixed(2) + ',' + (cy + size * Math.sin(angleRad)).toFixed(2));
    }
    return points.join(' ');
  }

  // Pixel centers for the CURRENT level's cells and the SVG viewBox that
  // fits them. Recomputed whenever a level loads (see loadLevelGeometry) so
  // levels with a different board shape would render correctly too.
  var cellPixels = {}; // key "col_slot" -> {x, y, col, slot}

  function loadLevelGeometry(level) {
    cellPixels = {};
    var bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    level.layout.forEach(function (cell) {
      var p = pixelForCell(cell.col, cell.slot);
      cellPixels[Logic.cellKey(cell.col, cell.slot)] = { x: p.x, y: p.y, col: cell.col, slot: cell.slot };
      bounds.minX = Math.min(bounds.minX, p.x - HEX_SIZE);
      bounds.maxX = Math.max(bounds.maxX, p.x + HEX_SIZE);
      bounds.minY = Math.min(bounds.minY, p.y - HEX_SIZE);
      bounds.maxY = Math.max(bounds.maxY, p.y + HEX_SIZE);
    });
    var padding = HEX_SIZE * 0.6;
    var viewBox = {
      x: bounds.minX - padding,
      y: bounds.minY - padding,
      w: (bounds.maxX - bounds.minX) + padding * 2,
      h: (bounds.maxY - bounds.minY) + padding * 2
    };
    boardSvg.setAttribute('viewBox', viewBox.x + ' ' + viewBox.y + ' ' + viewBox.w + ' ' + viewBox.h);
  }

  // ---- DOM references -------------------------------------------------------

  var boardSvg = document.getElementById('board-svg');
  var moveCountEl = document.getElementById('move-count');
  var levelNameEl = document.getElementById('level-name');
  var currentPiecesEl = document.getElementById('current-pieces');
  var upcomingPiecesEl = document.getElementById('upcoming-pieces');
  var undoBtn = document.getElementById('undo-btn');
  var restartBtn = document.getElementById('restart-btn');
  var endOverlay = document.getElementById('end-overlay');
  var endMessage = document.getElementById('end-message');
  var endActionBtn = document.getElementById('end-action-btn');
  var introBanner = document.getElementById('intro-banner');
  var introBannerText = document.getElementById('intro-banner-text');
  var clearCallout = document.getElementById('clear-callout');

  var SVG_NS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs) {
    var el = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    }
    return el;
  }

  // ---- Level / game state -------------------------------------------------------
  // `state.board` and `state.pieceIndex`/`moveCount`/`status` together make
  // up everything Undo/Restart need to restore. `history` is a stack of
  // previous snapshots (deep-ish clones), pushed right before each
  // committed placement, so Undo can pop back any number of moves.
  //
  // `currentLevelIndex` lives outside `state` on purpose: it's "which
  // puzzle are we playing," not part of a single level's move history.
  // Restart replays the same level; only advancing to the next level (after
  // a win) changes it.

  var currentLevelIndex = 0;
  var state = null;

  // Whether the player has ever seen the "10+ CLEAR!" first-clear teaching
  // moment this session. Intentionally NOT reset by Restart or by moving to
  // a new level -- once the rule has been explained, it stays explained.
  var hasShownFirstClearTutorial = false;

  function currentLevel() {
    return Config.LEVELS[currentLevelIndex];
  }

  function buildInitialState() {
    var level = currentLevel();
    var board = Logic.withInitialTokens(Logic.createBoard(level.layout), level.initialTokens);
    return {
      board: board,
      pieceIndex: 3, // pieces 0,1,2 are already "drawn" into currentPieces
      currentPieces: level.pieceSequence.slice(0, 3),
      moveCount: 0,
      status: 'playing', // 'playing' | 'won' | 'lost'
      history: []
    };
  }

  function snapshotState(s) {
    return {
      board: Logic.cloneBoard(s.board),
      pieceIndex: s.pieceIndex,
      currentPieces: s.currentPieces.slice(),
      moveCount: s.moveCount,
      status: s.status
    };
  }

  function restoreSnapshot(snapshot, history) {
    return {
      board: snapshot.board,
      pieceIndex: snapshot.pieceIndex,
      currentPieces: snapshot.currentPieces,
      moveCount: snapshot.moveCount,
      status: snapshot.status,
      history: history
    };
  }

  // Interaction-only state, not part of undo history.
  var selectedPieceSlot = null; // index into state.currentPieces, or null
  var isAnimating = false;

  function resetGame() {
    state = buildInitialState();
    selectedPieceSlot = null;
    isAnimating = false;
    loadLevelGeometry(currentLevel());
    hideEndOverlay();
    renderAll();
    showIntroBannerIfNeeded();
  }

  function goToNextLevel() {
    if (currentLevelIndex < Config.LEVELS.length - 1) {
      currentLevelIndex++;
    }
    resetGame();
  }

  // ---- Piece queue helpers -----------------------------------------------

  function drawNextPiece() {
    var sequence = currentLevel().pieceSequence;
    if (state.pieceIndex < sequence.length) {
      var piece = sequence[state.pieceIndex];
      state.pieceIndex++;
      return piece;
    }
    return null; // supply exhausted
  }

  function upcomingPieces() {
    var sequence = currentLevel().pieceSequence;
    return sequence.slice(state.pieceIndex, state.pieceIndex + 2);
  }

  // ---- Rendering: board -----------------------------------------------------

  function renderAll() {
    renderBoard();
    renderPieces();
    renderTopBar();
    renderEndState();
    renderControls();
  }

  // Tile elements are cached across renders so preview highlighting (which
  // happens continuously on pointermove) can toggle CSS classes on existing
  // elements instead of tearing down and rebuilding the whole SVG. Rebuilding
  // the DOM on every mouse move is not just wasteful -- it can detach the
  // very element mid-click and cause the click to be swallowed by the
  // browser, which is a real bug, not just a performance concern.
  var tileElements = {}; // key -> polygon element
  var previewedKeys = []; // keys currently carrying a preview-* class

  // Full rebuild: call this whenever the underlying board state changes
  // (placement, cascade step, undo, restart). Does NOT apply any preview.
  function renderBoard() {
    while (boardSvg.firstChild) boardSvg.removeChild(boardSvg.firstChild);
    tileElements = {};
    previewedKeys = [];

    // Tiles (background hexes), drawn first so tokens sit on top.
    Object.keys(cellPixels).forEach(function (key) {
      var cell = cellPixels[key];
      var hex = svgEl('polygon', {
        points: hexCorners(cell.x, cell.y, HEX_SIZE),
        class: 'hex-tile',
        'data-col': cell.col,
        'data-slot': cell.slot
      });
      boardSvg.appendChild(hex);
      tileElements[key] = hex;

      if (DEBUG) {
        var label = svgEl('text', {
          x: cell.x,
          y: cell.y + 1,
          class: 'debug-label'
        });
        label.textContent = cell.col + ',' + cell.slot;
        boardSvg.appendChild(label);
      }
    });

    // Tokens.
    Object.keys(cellPixels).forEach(function (key) {
      var cell = cellPixels[key];
      var color = Logic.getColor(state.board, cell.col, cell.slot);
      if (color === null) return;
      var circle = svgEl('circle', {
        cx: cell.x,
        cy: cell.y,
        r: HEX_SIZE * 0.68,
        fill: Config.COLORS[color].hex,
        class: 'token',
        'data-col': cell.col,
        'data-slot': cell.slot
      });
      boardSvg.appendChild(circle);
    });
  }

  // Lightweight update: only toggles preview-valid/preview-invalid classes
  // on the already-rendered tile elements. `preview` is null to clear, or
  // {cells, valid} to highlight a candidate placement.
  function setPreview(preview) {
    previewedKeys.forEach(function (key) {
      var el = tileElements[key];
      if (el) el.classList.remove('preview-valid', 'preview-invalid');
    });
    previewedKeys = [];

    if (!preview) return;
    var cls = preview.valid ? 'preview-valid' : 'preview-invalid';
    preview.cells.forEach(function (c) {
      var key = Logic.cellKey(c.col, c.slot);
      var el = tileElements[key];
      if (el) {
        el.classList.add(cls);
        previewedKeys.push(key);
      }
    });
  }

  function tokenElementAt(col, slot) {
    return boardSvg.querySelector('circle[data-col="' + col + '"][data-slot="' + slot + '"]');
  }

  // ---- Rendering: piece previews (bottom bar) --------------------------------

  function renderPieceShape(piece) {
    // A small self-contained SVG diagram of a piece's shape, reusing the
    // same hex math as the board so shapes look consistent.
    if (!piece) {
      var empty = svgEl('svg');
      return empty;
    }
    var pts = piece.cells.map(function (c) { return axialToPixel(c.dq, c.dr); });
    var minX = Math.min.apply(null, pts.map(function (p) { return p.x - HEX_SIZE; }));
    var maxX = Math.max.apply(null, pts.map(function (p) { return p.x + HEX_SIZE; }));
    var minY = Math.min.apply(null, pts.map(function (p) { return p.y - HEX_SIZE; }));
    var maxY = Math.max.apply(null, pts.map(function (p) { return p.y + HEX_SIZE; }));
    var pad = HEX_SIZE * 0.5;
    var svg = svgEl('svg', {
      viewBox: (minX - pad) + ' ' + (minY - pad) + ' ' + (maxX - minX + pad * 2) + ' ' + (maxY - minY + pad * 2)
    });
    piece.cells.forEach(function (c, i) {
      var p = pts[i];
      svg.appendChild(svgEl('circle', {
        cx: p.x, cy: p.y, r: HEX_SIZE * 0.68,
        fill: Config.COLORS[c.color].hex
      }));
    });
    return svg;
  }

  function renderPieces() {
    currentPiecesEl.innerHTML = '';
    state.currentPieces.forEach(function (piece, i) {
      var slot = document.createElement('div');
      slot.className = 'piece-slot' + (piece ? '' : ' empty') + (selectedPieceSlot === i ? ' selected' : '');
      if (piece) {
        slot.setAttribute('data-piece-id', piece.id);
        slot.appendChild(renderPieceShape(piece));
        slot.addEventListener('click', function () { onSelectPiece(i); });
      }
      currentPiecesEl.appendChild(slot);
    });

    upcomingPiecesEl.innerHTML = '';
    var upcoming = upcomingPieces();
    for (var i = 0; i < 2; i++) {
      var slot = document.createElement('div');
      var piece = upcoming[i];
      slot.className = 'piece-slot' + (piece ? '' : ' empty');
      if (piece) {
        slot.setAttribute('data-piece-id', piece.id);
        slot.appendChild(renderPieceShape(piece));
      }
      upcomingPiecesEl.appendChild(slot);
    }
  }

  function renderTopBar() {
    moveCountEl.textContent = state.moveCount;
    levelNameEl.textContent = currentLevel().name;
  }

  function renderControls() {
    undoBtn.disabled = state.history.length === 0 || isAnimating;
    restartBtn.disabled = isAnimating;
  }

  function renderEndState() {
    if (state.status === 'won') {
      var isLastLevel = currentLevelIndex === Config.LEVELS.length - 1;
      if (isLastLevel) {
        showEndOverlay('PROTOTYPE COMPLETE', null);
      } else {
        showEndOverlay('LEVEL CLEARED', { label: 'Next Level', onClick: goToNextLevel });
      }
    } else if (state.status === 'lost') {
      showEndOverlay('No more moves. Try again.', { label: 'Try Again', onClick: resetGame });
    } else {
      hideEndOverlay();
    }
  }

  function showEndOverlay(message, action) {
    endMessage.textContent = message;
    if (action) {
      endActionBtn.hidden = false;
      endActionBtn.textContent = action.label;
      endActionBtn.onclick = action.onClick;
    } else {
      endActionBtn.hidden = true;
      endActionBtn.onclick = null;
    }
    endOverlay.hidden = false;
  }

  function hideEndOverlay() {
    endOverlay.hidden = true;
  }

  // ---- Onboarding: level-start banner + first-clear callout -------------------

  var introBannerTimeoutId = null;

  function showIntroBannerIfNeeded() {
    clearTimeout(introBannerTimeoutId);
    var text = currentLevel().introText;
    if (!text) {
      introBanner.hidden = true;
      return;
    }
    introBannerText.textContent = text;
    introBanner.classList.remove('fading');
    introBanner.hidden = false;
    introBannerTimeoutId = setTimeout(dismissIntroBanner, INTRO_BANNER_AUTO_DISMISS_MS);
  }

  function dismissIntroBanner() {
    clearTimeout(introBannerTimeoutId);
    if (introBanner.hidden) return;
    introBanner.classList.add('fading');
    setTimeout(function () { introBanner.hidden = true; }, 400);
  }

  // The first time the player ever clears a group, pause briefly to
  // highlight the connected group and show a plain "10+ CLEAR!" callout
  // before the normal clear animation runs. Every clear after that just
  // animates normally -- this teaches the rule once, not every time.
  function maybeEmphasizeFirstClear(groups, callback) {
    if (hasShownFirstClearTutorial) {
      callback();
      return;
    }
    hasShownFirstClearTutorial = true;
    groups.forEach(function (group) {
      group.cells.forEach(function (c) {
        var el = tokenElementAt(c.col, c.slot);
        if (el) el.classList.add('emphasize');
      });
    });
    clearCallout.hidden = false;
    requestAnimationFrame(function () { clearCallout.classList.add('show'); });
    delay(FIRST_CLEAR_EMPHASIS_MS).then(function () {
      clearCallout.classList.remove('show');
      delay(220).then(function () {
        clearCallout.hidden = true;
        callback();
      });
    });
  }

  // ---- Interaction ------------------------------------------------------------

  function onSelectPiece(index) {
    if (state.status !== 'playing' || isAnimating) return;
    if (!state.currentPieces[index]) return;
    selectedPieceSlot = selectedPieceSlot === index ? null : index;
    renderPieces();
    setPreview(null);
  }

  function cellFromPointerEvent(evt) {
    var target = evt.target;
    if (!target || !target.hasAttribute('data-col')) return null;
    return { col: Number(target.getAttribute('data-col')), slot: Number(target.getAttribute('data-slot')) };
  }

  function currentPreviewFor(cell) {
    if (selectedPieceSlot === null || !state.currentPieces[selectedPieceSlot]) return null;
    var piece = state.currentPieces[selectedPieceSlot];
    var targets = Logic.getPieceTargetCells(piece, cell.col, cell.slot);
    var valid = Logic.canPlacePiece(state.board, piece, cell.col, cell.slot);
    return { cells: targets, valid: valid };
  }

  boardSvg.addEventListener('pointermove', function (evt) {
    if (state.status !== 'playing' || isAnimating || selectedPieceSlot === null) return;
    var cell = cellFromPointerEvent(evt);
    if (!cell) return;
    setPreview(currentPreviewFor(cell));
  });

  boardSvg.addEventListener('pointerleave', function () {
    if (isAnimating) return;
    setPreview(null);
  });

  boardSvg.addEventListener('click', function (evt) {
    if (state.status !== 'playing' || isAnimating || selectedPieceSlot === null) return;
    var cell = cellFromPointerEvent(evt);
    if (!cell) return;
    attemptPlacement(selectedPieceSlot, cell);
  });

  // ---- Committing a move -------------------------------------------------------

  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function attemptPlacement(pieceSlotIndex, cell) {
    var piece = state.currentPieces[pieceSlotIndex];
    if (!piece) return;
    if (!Logic.canPlacePiece(state.board, piece, cell.col, cell.slot)) {
      // Invalid placement: leave the red preview showing briefly, keep the
      // piece selected so the player can just try another cell.
      setPreview({ cells: Logic.getPieceTargetCells(piece, cell.col, cell.slot), valid: false });
      return;
    }
    commitPlacement(pieceSlotIndex, cell);
  }

  function commitPlacement(pieceSlotIndex, cell) {
    dismissIntroBanner();
    state.history.push(snapshotState(state));

    var piece = state.currentPieces[pieceSlotIndex];
    state.board = Logic.placePiece(state.board, piece, cell.col, cell.slot);
    state.currentPieces[pieceSlotIndex] = drawNextPiece();
    state.moveCount++;
    selectedPieceSlot = null;

    renderBoard();
    markJustPlacedTokens(piece, cell);
    renderPieces();
    renderTopBar();
    renderControls();

    runGravityAndCascadeThenCheckEnd();
  }

  function markJustPlacedTokens(piece, cell) {
    var targets = Logic.getPieceTargetCells(piece, cell.col, cell.slot);
    targets.forEach(function (t) {
      var el = tokenElementAt(t.col, t.slot);
      if (el) el.classList.add('token-pop');
    });
  }

  // Animates tokens falling from their positions in `fromBoard` to their
  // settled positions in `toBoard` by finding each moved token's existing
  // circle element and transitioning its `cy`, rather than snapping
  // straight to the final board -- this is what makes gravity visible
  // instead of instant, for BOTH a fresh placement and any tokens a clear
  // leaves dangling.
  function animateFall(fromBoard, toBoard, callback) {
    var moves = Logic.computeGravityMoves(fromBoard, toBoard);
    if (moves.length === 0) {
      callback();
      return;
    }
    var pairs = moves.map(function (m) {
      return { el: tokenElementAt(m.col, m.fromSlot), move: m };
    });
    pairs.forEach(function (pair) {
      if (!pair.el) return;
      pair.el.classList.add('falling');
      pair.el.setAttribute('data-slot', pair.move.toSlot);
    });
    requestAnimationFrame(function () {
      pairs.forEach(function (pair) {
        if (!pair.el) return;
        var target = cellPixels[Logic.cellKey(pair.move.col, pair.move.toSlot)];
        pair.el.setAttribute('cy', target.y);
      });
    });
    delay(FALL_ANIMATION_MS).then(callback);
  }

  // Drives the full post-placement sequence through Logic.resolveCascade's
  // events, one at a time:
  //   1. Gravity ALWAYS runs first, even if nothing clears (event with no
  //      groups) -- this is what "newly placed tokens settle downward"
  //      actually means, and it used to silently not happen at all.
  //   2. Any qualifying groups are highlighted/faded, then gravity runs
  //      again to resettle what's left, and so on until stable.
  // Only once everything is stable does state.board get updated to the
  // final result and the win/loss check run -- Undo relies on state.board
  // never reflecting an in-between animation frame.
  function runGravityAndCascadeThenCheckEnd() {
    var cascade = Logic.resolveCascade(state.board, Config.CLEAR_THRESHOLD);
    if (cascade.events.length === 0) {
      checkEndConditions();
      return;
    }
    isAnimating = true;
    renderControls();
    playCascadeEvent(cascade.events, 0, cascade.board);
  }

  function playCascadeEvent(events, index, finalBoard) {
    if (index >= events.length) {
      isAnimating = false;
      state.board = finalBoard;
      renderBoard();
      renderControls();
      checkEndConditions();
      return;
    }

    var event = events[index];
    var isClearEvent = event.groups.length > 0;

    function advance() {
      playCascadeEvent(events, index + 1, finalBoard);
    }

    function fadeThenFall() {
      if (!isClearEvent) {
        // Pure gravity settle -- nothing to clear, just animate the fall.
        animateFall(event.boardBeforeGravity, event.boardAfterGravity, function () {
          state.board = event.boardAfterGravity;
          advance();
        });
        return;
      }
      event.groups.forEach(function (group) {
        group.cells.forEach(function (c) {
          var el = tokenElementAt(c.col, c.slot);
          if (el) el.classList.add('clearing');
        });
      });
      delay(CLEAR_ANIMATION_MS).then(function () {
        state.board = event.boardAfterClear;
        renderBoard();
        animateFall(event.boardAfterClear, event.boardAfterGravity, function () {
          state.board = event.boardAfterGravity;
          advance();
        });
      });
    }

    if (isClearEvent) {
      maybeEmphasizeFirstClear(event.groups, fadeThenFall);
    } else {
      fadeThenFall();
    }
  }

  function checkEndConditions() {
    if (Logic.boardIsEmpty(state.board)) {
      state.status = 'won';
      renderEndState();
      return;
    }
    var playable = state.currentPieces.filter(function (p) { return p !== null; });
    if (playable.length === 0 || !Logic.hasAnyLegalMove(state.board, playable)) {
      state.status = 'lost';
      renderEndState();
      return;
    }
    if (DEBUG) {
      console.log('[debug] queue position:', state.pieceIndex, 'legal move exists:', true);
    }
  }

  // ---- Undo / Restart -----------------------------------------------------------

  function onUndo() {
    if (isAnimating || state.history.length === 0) return;
    var previous = state.history[state.history.length - 1];
    var newHistory = state.history.slice(0, -1);
    state = restoreSnapshot(previous, newHistory);
    selectedPieceSlot = null;
    hideEndOverlay();
    renderAll();
  }

  undoBtn.addEventListener('click', onUndo);
  restartBtn.addEventListener('click', resetGame);

  resetGame();
})();
