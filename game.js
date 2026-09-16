/*
 * ClearTen - browser UI layer.
 *
 * This file is deliberately "dumb": all real game rules live in
 * gamelogic.js, and all level/rule numbers live in config.js. This file
 * just renders state to SVG/DOM and turns pointer input into calls into
 * the engine.
 *
 * LAYERED TOKEN RENDERING (V0.5)
 * -------------------------------
 * A piece is drawn as one hex cell's worth of nested SVG groups:
 *
 *   <g class="piece-group" data-col data-slot>       -- position only
 *     <g class="piece-visual">                        -- pop-in scale only
 *       <circle class="layer-active">  (large, centered -- dominates)
 *       <circle class="layer-pip">     (tiny, in a row underneath)
 *       <circle class="layer-pip">     (next one over, in order)
 *
 * Position (piece-group) and effects (piece-visual's pop-in, or a
 * layer-active circle's own clearing/emphasize animation) are kept on
 * SEPARATE elements on purpose: SVG elements can carry a `transform`
 * PRESENTATION ATTRIBUTE and a CSS `transform` PROPERTY, but browsers
 * don't compose them -- the CSS property wins outright and the attribute
 * is ignored. Using CSS `transform` consistently, on different elements
 * for position vs. effects, avoids that trap entirely (ordinary nested
 * CSS transforms DO compose correctly).
 */

(function () {
  'use strict';

  var Logic = window.ClearTenLogic;
  var Config = window.ClearTenConfig;

  // Flip this to true to see hex coordinates, active color, full layer
  // sequence, connected-group size, queue index, and legal placement
  // cells. Not exposed to normal players.
  var DEBUG = false;

  var CLEAR_ANIMATION_MS = 320;
  var FALL_ANIMATION_MS = 280; // matches the .piece-group.falling CSS transition + a small buffer
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

  // CSS `transform` on an SVG element requires an explicit length unit --
  // a unitless `translate(x,y)` is silently ignored by the browser. `px`
  // here does NOT mean a screen pixel; on an SVG element it resolves to
  // one unit of that element's local coordinate system, which is exactly
  // the SVG user-space units the rest of this file computes in.
  function translatePx(x, y) {
    return 'translate(' + x + 'px,' + y + 'px)';
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

  // A layered piece's visual (V0.5, simplified after playtesting found the
  // V0.4 overlapping-offset-circles treatment too visually messy): one
  // large circle for the active color, dominating the cell, with tiny
  // "pip" dots in a row underneath for whatever's buried -- left-to-right
  // in order (leftmost = next color, rightmost = the one after that).
  // Never more than 2 pips: this level limits pieces to 2-3 layers total.
  var LAYER_MAIN_RADIUS = HEX_SIZE * 0.6;
  var LAYER_PIP_RADIUS = HEX_SIZE * 0.11;
  var LAYER_PIP_ROW_Y = LAYER_MAIN_RADIUS + LAYER_PIP_RADIUS + HEX_SIZE * 0.14;
  var LAYER_PIP_SPACING = LAYER_PIP_RADIUS * 2 + HEX_SIZE * 0.08;

  function layerCircleSpecs(layers) {
    var buriedCount = layers.length - 1;
    var specs = [];
    for (var i = 1; i < layers.length; i++) {
      var pipIndex = i - 1;
      var offsetFromCenter = (pipIndex - (buriedCount - 1) / 2) * LAYER_PIP_SPACING;
      specs.push({ cx: offsetFromCenter, cy: LAYER_PIP_ROW_Y, r: LAYER_PIP_RADIUS, color: layers[i], active: false, layerIndex: i });
    }
    specs.push({ cx: 0, cy: 0, r: LAYER_MAIN_RADIUS, color: layers[0], active: true, layerIndex: 0 });
    return specs;
  }

  // The reusable visual: buried circles behind, active circle on top,
  // all positioned relative to local (0,0). Used identically for board
  // pieces (wrapped in a positioned outer group) and queue previews
  // (dropped straight into a small dedicated SVG), so the player learns
  // one visual language for "what's in this piece" everywhere it appears.
  function buildPieceVisual(layers) {
    var g = svgEl('g', { class: 'piece-visual' });
    layerCircleSpecs(layers).forEach(function (spec) {
      g.appendChild(svgEl('circle', {
        cx: spec.cx,
        cy: spec.cy,
        r: spec.r,
        fill: Config.COLORS[spec.color].hex,
        class: 'layer-circle ' + (spec.active ? 'layer-active' : 'layer-pip'),
        'data-layer-index': spec.layerIndex
      }));
    });
    return g;
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
    // V0.6: five levels have five different board shapes (a wide hill, a
    // tall spike, a twin-pocket gap...). Without this, a board much wider
    // than tall (or vice versa) would render tiny inside a box sized for
    // a different aspect ratio -- CSS aspect-ratio here lets each board
    // claim as much of the available area as its own shape allows.
    boardSvg.style.aspectRatio = viewBox.w + ' / ' + viewBox.h;
  }

  // ---- DOM references -------------------------------------------------------

  var boardSvg = document.getElementById('board-svg');
  var moveCountEl = document.getElementById('move-count');
  var levelNameEl = document.getElementById('level-name');
  var currentPiecesEl = document.getElementById('current-pieces');
  var undoBtn = document.getElementById('undo-btn');
  var restartBtn = document.getElementById('restart-btn');
  var endOverlay = document.getElementById('end-overlay');
  var endMessage = document.getElementById('end-message');
  var endActionBtn = document.getElementById('end-action-btn');
  var introBanner = document.getElementById('intro-banner');
  var introBannerText = document.getElementById('intro-banner-text');
  var clearCallout = document.getElementById('clear-callout');
  var levelSelectEl = document.getElementById('level-select');

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
  // previous snapshots pushed right before each committed placement, so
  // Undo can pop back any number of moves. Because gamelogic.js always
  // replaces a cell's `{layers}` object wholesale rather than mutating it
  // in place, Logic.cloneBoard's shallow copy already gives each snapshot
  // an independent, fully-correct layered board -- no separate deep-clone
  // step is needed here.
  //
  // `currentLevelIndex` lives outside `state` on purpose: it's "which
  // puzzle are we playing," not part of a single level's move history.

  var currentLevelIndex = 0;
  var state = null;

  // Whether the player has ever seen the "10+ CLEAR!" first-clear teaching
  // moment this session. Intentionally NOT reset by Restart -- once the
  // rule has been explained, it stays explained.
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
    if (DEBUG) {
      var lvl = currentLevel();
      console.log('[debug] level #' + (currentLevelIndex + 1) + '/' + Config.LEVELS.length + ' "' + lvl.name + '"');
      console.log('[debug] current piece choices:', state.currentPieces.map(function (p) { return p ? p.id + ':' + p.layers.join('>') : null; }));
      console.log('[debug] documented solution (' + lvl.solution.length + ' steps):', lvl.solution.map(function (s) { return s.pieceId + '@(' + s.target.col + ',' + s.target.slot + ')'; }).join(' -> '));
    }
  }

  function goToNextLevel() {
    if (currentLevelIndex < Config.LEVELS.length - 1) {
      currentLevelIndex++;
    }
    resetGame();
  }

  // Developer-only convenience for playtesting: jump straight to any
  // level without clearing the ones before it. Not part of the intended
  // player-facing progression (see renderLevelSelect / #level-select).
  function goToLevel(index) {
    if (index < 0 || index >= Config.LEVELS.length) return;
    currentLevelIndex = index;
    resetGame();
  }

  // ---- Piece queue helpers -----------------------------------------------

  // The hidden predetermined sequence beyond the 3 current pieces is
  // intentionally never exposed to the player (no Upcoming preview in
  // V0.5) -- the only visible future information comes from what's
  // buried inside the 3 pieces already on offer.
  function drawNextPiece() {
    var sequence = currentLevel().pieceSequence;
    if (state.pieceIndex < sequence.length) {
      var piece = sequence[state.pieceIndex];
      state.pieceIndex++;
      return piece;
    }
    return null; // supply exhausted
  }

  // ---- Rendering: board -----------------------------------------------------

  function renderAll() {
    renderBoard();
    renderPieces();
    renderTopBar();
    renderLevelSelect();
    renderEndState();
    renderControls();
  }

  // Small, visually-modest developer convenience: jump directly to any of
  // the 5 levels for testing. Rebuilt only when the level count or
  // current index could have changed (resetGame), not on every render.
  function renderLevelSelect() {
    if (!levelSelectEl) return;
    levelSelectEl.innerHTML = '';
    Config.LEVELS.forEach(function (lvl, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'level-select-btn' + (i === currentLevelIndex ? ' active' : '');
      btn.textContent = String(i + 1);
      btn.title = lvl.name;
      btn.addEventListener('click', function () { goToLevel(i); });
      levelSelectEl.appendChild(btn);
    });
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

    var legalDebugCells = debugLegalCellKeys();

    // Tiles (background hexes), drawn first so pieces sit on top.
    Object.keys(cellPixels).forEach(function (key) {
      var cell = cellPixels[key];
      var tileClass = 'hex-tile';
      if (legalDebugCells[key]) tileClass += ' debug-legal';
      var hex = svgEl('polygon', {
        points: hexCorners(cell.x, cell.y, HEX_SIZE),
        class: tileClass,
        'data-col': cell.col,
        'data-slot': cell.slot
      });
      boardSvg.appendChild(hex);
      tileElements[key] = hex;
    });

    // Pieces.
    Object.keys(cellPixels).forEach(function (key) {
      var cell = cellPixels[key];
      var layers = Logic.getLayers(state.board, cell.col, cell.slot);
      if (!layers) return;
      var group = svgEl('g', { class: 'piece-group', 'data-col': cell.col, 'data-slot': cell.slot });
      group.style.transform = translatePx(cell.x, cell.y);
      group.appendChild(buildPieceVisual(layers));
      boardSvg.appendChild(group);
    });

    // Debug labels last, on top of everything, so they stay legible even
    // over an occupied cell's piece visual.
    if (DEBUG) {
      Object.keys(cellPixels).forEach(function (key) {
        boardSvg.appendChild(buildDebugLabel(cellPixels[key]));
      });
    }
  }

  function buildDebugLabel(cell) {
    var layers = Logic.getLayers(state.board, cell.col, cell.slot);
    var lines = [cell.col + ',' + cell.slot];
    if (layers) {
      lines.push(layers.map(function (c) { return c.slice(0, 1).toUpperCase(); }).join(''));
      var groupSize = Logic.findConnectedGroup(state.board, cell.col, cell.slot).length;
      lines.push('g' + groupSize);
    }
    var text = svgEl('text', { x: cell.x, y: cell.y - HEX_SIZE * 0.15, class: 'debug-label' });
    lines.forEach(function (line, i) {
      var tspan = svgEl('tspan', { x: cell.x, dy: i === 0 ? 0 : 2.4 });
      tspan.textContent = line;
      text.appendChild(tspan);
    });
    return text;
  }

  // When DEBUG is on and a piece is selected, every empty cell is legal
  // for a single-cell piece -- returns the set so renderBoard can mark
  // them, distinct from the hover preview.
  function debugLegalCellKeys() {
    var keys = {};
    if (!DEBUG || selectedPieceSlot === null || !state || !state.currentPieces[selectedPieceSlot]) return keys;
    var piece = state.currentPieces[selectedPieceSlot];
    Object.keys(cellPixels).forEach(function (key) {
      var cell = cellPixels[key];
      if (Logic.canPlacePiece(state.board, piece, cell.col, cell.slot)) keys[key] = true;
    });
    return keys;
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

  function pieceGroupAt(col, slot) {
    return boardSvg.querySelector('g.piece-group[data-col="' + col + '"][data-slot="' + slot + '"]');
  }

  function activeCircleAt(col, slot) {
    var group = pieceGroupAt(col, slot);
    return group ? group.querySelector('.layer-active') : null;
  }

  // ---- Rendering: piece previews (bottom bar) --------------------------------

  function renderPiecePreview(piece) {
    // A small self-contained SVG diagram of a piece's full layer stack,
    // reusing the exact same visual as the board so the player learns one
    // language for "what's in this piece" everywhere it appears.
    if (!piece) return svgEl('svg');
    var specs = layerCircleSpecs(piece.layers);
    var minX = Math.min.apply(null, specs.map(function (s) { return s.cx - s.r; }));
    var maxX = Math.max.apply(null, specs.map(function (s) { return s.cx + s.r; }));
    var minY = Math.min.apply(null, specs.map(function (s) { return s.cy - s.r; }));
    var maxY = Math.max.apply(null, specs.map(function (s) { return s.cy + s.r; }));
    var pad = HEX_SIZE * 0.35;
    var svg = svgEl('svg', {
      viewBox: (minX - pad) + ' ' + (minY - pad) + ' ' + (maxX - minX + pad * 2) + ' ' + (maxY - minY + pad * 2)
    });
    svg.appendChild(buildPieceVisual(piece.layers));
    return svg;
  }

  function renderPieces() {
    currentPiecesEl.innerHTML = '';
    state.currentPieces.forEach(function (piece, i) {
      var slot = document.createElement('div');
      slot.className = 'piece-slot' + (piece ? '' : ' empty') + (selectedPieceSlot === i ? ' selected' : '');
      if (piece) {
        slot.setAttribute('data-piece-id', piece.id);
        slot.appendChild(renderPiecePreview(piece));
        slot.addEventListener('click', function () { onSelectPiece(i); });
      }
      currentPiecesEl.appendChild(slot);
    });
  }

  function renderTopBar() {
    moveCountEl.textContent = state.moveCount;
    levelNameEl.textContent = currentLevel().name;
    if (DEBUG) {
      levelNameEl.textContent += ' [#' + (currentLevelIndex + 1) + '/' + Config.LEVELS.length +
        ', queue: ' + state.pieceIndex + '/' + currentLevel().pieceSequence.length + ']';
    }
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
  // highlight the connected group's active layer and show a plain "10+
  // CLEAR!" callout before the normal clear animation runs. Every clear
  // after that just animates normally -- this teaches the rule once, not
  // every time.
  function maybeEmphasizeFirstClear(groups, callback) {
    if (hasShownFirstClearTutorial) {
      callback();
      return;
    }
    hasShownFirstClearTutorial = true;
    groups.forEach(function (group) {
      group.cells.forEach(function (c) {
        var el = activeCircleAt(c.col, c.slot);
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
    if (DEBUG) renderBoard(); // refresh the debug "legal cells" overlay
  }

  function cellFromPointerEvent(evt) {
    var target = evt.target.closest ? evt.target.closest('[data-col]') : null;
    if (!target) return null;
    return { col: Number(target.getAttribute('data-col')), slot: Number(target.getAttribute('data-slot')) };
  }

  // A layered piece occupies exactly one cell -- the preview is just that
  // single cell, unlike the old multi-cell geometric pieces.
  function currentPreviewFor(cell) {
    if (selectedPieceSlot === null || !state.currentPieces[selectedPieceSlot]) return null;
    var piece = state.currentPieces[selectedPieceSlot];
    var valid = Logic.canPlacePiece(state.board, piece, cell.col, cell.slot);
    return { cells: [cell], valid: valid };
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
      // Invalid placement (cell already occupied): leave the red preview
      // showing briefly, keep the piece selected so the player can just
      // try another cell.
      setPreview({ cells: [cell], valid: false });
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
    markJustPlaced(cell);
    renderPieces();
    renderTopBar();
    renderControls();

    runGravityAndCascadeThenCheckEnd();
  }

  function markJustPlaced(cell) {
    var group = pieceGroupAt(cell.col, cell.slot);
    if (group) {
      var visual = group.querySelector('.piece-visual');
      if (visual) visual.classList.add('token-pop');
    }
  }

  // Animates pieces falling from their positions in `fromBoard` to their
  // settled positions in `toBoard` by finding each moved piece's existing
  // group element and transitioning its CSS transform, rather than
  // snapping straight to the final board -- this is what makes gravity
  // visible instead of instant. A layered piece's whole group (every
  // layer) moves together in one transform change, so buried colors can
  // never visually separate from their piece while falling.
  function animateFall(fromBoard, toBoard, callback) {
    var moves = Logic.computeGravityMoves(fromBoard, toBoard);
    if (moves.length === 0) {
      callback();
      return;
    }
    var pairs = moves.map(function (m) {
      return { el: pieceGroupAt(m.col, m.fromSlot), move: m };
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
        pair.el.style.transform = translatePx(target.x, target.y);
      });
    });
    delay(FALL_ANIMATION_MS).then(callback);
  }

  // Drives the full post-placement sequence through Logic.resolveCascade's
  // events, one at a time:
  //   1. Gravity ALWAYS runs first, even if nothing clears (event with no
  //      groups) -- newly placed pieces and any pieces a previous change
  //      left dangling settle downward as a single visible step.
  //   2. Any qualifying groups have their ACTIVE layer highlighted/faded
  //      (this is the "peel," not a full removal), the board re-renders to
  //      show whatever's now on top (or nothing, if that was the piece's
  //      last layer), then gravity runs again, and so on until stable.
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
        // Pure gravity settle -- nothing to peel, just animate the fall.
        animateFall(event.boardBeforeGravity, event.boardAfterGravity, function () {
          state.board = event.boardAfterGravity;
          advance();
        });
        return;
      }
      // Peel: shrink/fade only the ACTIVE circle of each cleared cell (the
      // buried layers underneath are already rendered and simply become
      // visible once the board re-renders to boardAfterClear below) --
      // this is what lets the player see "I cleared pink, and purple was
      // underneath" instead of the whole piece vanishing.
      event.groups.forEach(function (group) {
        group.cells.forEach(function (c) {
          var el = activeCircleAt(c.col, c.slot);
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
      console.log('[debug] queue position:', state.pieceIndex, 'legal move exists: true');
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
