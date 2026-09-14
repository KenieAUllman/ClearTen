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
  var PLACEMENT_POP_MS = 180;

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

  // Precompute pixel centers for every layout cell and the overall bounds,
  // so the board SVG's viewBox can fit the (irregular) board exactly.
  var cellPixels = {}; // key "col_slot" -> {x, y, col, slot}
  var bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  Config.LEVEL_LAYOUT.forEach(function (cell) {
    var p = pixelForCell(cell.col, cell.slot);
    cellPixels[Logic.cellKey(cell.col, cell.slot)] = { x: p.x, y: p.y, col: cell.col, slot: cell.slot };
    bounds.minX = Math.min(bounds.minX, p.x - HEX_SIZE);
    bounds.maxX = Math.max(bounds.maxX, p.x + HEX_SIZE);
    bounds.minY = Math.min(bounds.minY, p.y - HEX_SIZE);
    bounds.maxY = Math.max(bounds.maxY, p.y + HEX_SIZE);
  });
  var PADDING = HEX_SIZE * 0.6;
  var viewBox = {
    x: bounds.minX - PADDING,
    y: bounds.minY - PADDING,
    w: (bounds.maxX - bounds.minX) + PADDING * 2,
    h: (bounds.maxY - bounds.minY) + PADDING * 2
  };

  // ---- DOM references -------------------------------------------------------

  var boardSvg = document.getElementById('board-svg');
  var moveCountEl = document.getElementById('move-count');
  var currentPiecesEl = document.getElementById('current-pieces');
  var upcomingPiecesEl = document.getElementById('upcoming-pieces');
  var undoBtn = document.getElementById('undo-btn');
  var restartBtn = document.getElementById('restart-btn');
  var endOverlay = document.getElementById('end-overlay');
  var endMessage = document.getElementById('end-message');
  var endTryAgain = document.getElementById('end-try-again');

  boardSvg.setAttribute('viewBox', viewBox.x + ' ' + viewBox.y + ' ' + viewBox.w + ' ' + viewBox.h);

  var SVG_NS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs) {
    var el = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    }
    return el;
  }

  // ---- Game state -------------------------------------------------------------
  // `state.board` and `state.pieceIndex`/`moveCount`/`status` together make
  // up everything Undo/Restart need to restore. `history` is a stack of
  // previous snapshots (deep-ish clones), pushed right before each
  // committed placement, so Undo can pop back any number of moves.

  var state = null;

  function buildInitialState() {
    var board = Logic.withInitialTokens(Logic.createBoard(Config.LEVEL_LAYOUT), Config.INITIAL_TOKENS);
    return {
      board: board,
      pieceIndex: 3, // pieces 0,1,2 are already "drawn" into currentPieces
      currentPieces: Config.PIECE_SEQUENCE.slice(0, 3),
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
    hideEndOverlay();
    renderAll();
  }

  // ---- Piece queue helpers -----------------------------------------------

  function drawNextPiece() {
    if (state.pieceIndex < Config.PIECE_SEQUENCE.length) {
      var piece = Config.PIECE_SEQUENCE[state.pieceIndex];
      state.pieceIndex++;
      return piece;
    }
    return null; // supply exhausted
  }

  function upcomingPieces() {
    return Config.PIECE_SEQUENCE.slice(state.pieceIndex, state.pieceIndex + 2);
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
  }

  function renderControls() {
    undoBtn.disabled = state.history.length === 0 || isAnimating;
    restartBtn.disabled = isAnimating;
  }

  function renderEndState() {
    if (state.status === 'won') {
      showEndOverlay('Board cleared! You win.');
    } else if (state.status === 'lost') {
      showEndOverlay('No more moves. Try again.');
    } else {
      hideEndOverlay();
    }
  }

  function showEndOverlay(message) {
    endMessage.textContent = message;
    endOverlay.hidden = false;
  }

  function hideEndOverlay() {
    endOverlay.hidden = true;
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

    runCascadeThenCheckEnd();
  }

  function markJustPlacedTokens(piece, cell) {
    var targets = Logic.getPieceTargetCells(piece, cell.col, cell.slot);
    targets.forEach(function (t) {
      var el = boardSvg.querySelector('circle[data-col="' + t.col + '"][data-slot="' + t.slot + '"]');
      if (el) el.classList.add('token-pop');
    });
  }

  // Steps through Logic.resolveCascade's events one at a time so the
  // player can see each clear happen, instead of jumping straight to the
  // final settled board.
  function runCascadeThenCheckEnd() {
    var cascade = Logic.resolveCascade(state.board, Config.CLEAR_THRESHOLD);
    if (cascade.events.length === 0) {
      checkEndConditions();
      return;
    }
    isAnimating = true;
    renderControls();

    var stepIndex = 0;
    function playNextEvent() {
      if (stepIndex >= cascade.events.length) {
        isAnimating = false;
        state.board = cascade.board;
        renderBoard();
        renderControls();
        checkEndConditions();
        return;
      }
      var event = cascade.events[stepIndex];
      // Show the "about to clear" cells shrinking/fading.
      event.groups.forEach(function (group) {
        group.cells.forEach(function (c) {
          var el = boardSvg.querySelector('circle[data-col="' + c.col + '"][data-slot="' + c.slot + '"]');
          if (el) el.classList.add('clearing');
        });
      });
      delay(CLEAR_ANIMATION_MS).then(function () {
        state.board = event.boardAfterGravity;
        renderBoard();
        stepIndex++;
        playNextEvent();
      });
    }
    playNextEvent();
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
  endTryAgain.addEventListener('click', resetGame);

  resetGame();
})();
