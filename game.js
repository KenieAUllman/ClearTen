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
  // cells -- and (V0.7) to reveal the Undo button, which normal play no
  // longer shows: a meaningful mistake should cost a Restart, not a free
  // rewind. Not exposed to normal players.
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

  // A layered piece's visual.
  //
  // V0.12 BURIED-LAYER READABILITY FIX: V0.11 moved the buried-color pips
  // INSIDE the active circle's own radius to keep the piece compact --
  // but layerCircleSpecs still listed pips BEFORE the active spec, so
  // buildPieceVisual painted the active circle LAST, on top, completely
  // covering the pips wherever they overlapped (SVG paints later document
  // elements over earlier ones). Combined with the pips having been
  // shrunk, buried colors became fully invisible, not just subtle -- a
  // genuine occlusion bug, not a contrast/size issue alone.
  //
  // The fix: pips are drawn AFTER the active circle (so they can never be
  // covered by it, regardless of any future size/position tweaks), sit
  // just below the active circle's own rim (a small, deliberate overlap
  // so they read as "attached tabs," not floating debris) rather than
  // buried inside its footprint, are backed by one dark contrast plate so
  // they stay legible against ANY active/buried color combination, and
  // are large enough to read at a glance on a phone screen. A piece with
  // no buried colors shows NO pips and NO backing plate at all.
  //
  // ORDER CONVENTION (unchanged, documented): left = the NEXT color this
  // piece reveals, right = the color after that. Never more than 2 pips
  // -- this game limits pieces to 2-3 layers total.
  var LAYER_MAIN_RADIUS = HEX_SIZE * 0.56;
  var LAYER_PIP_RADIUS = HEX_SIZE * 0.16;
  var LAYER_PIP_ROW_Y = LAYER_MAIN_RADIUS + LAYER_PIP_RADIUS * 0.35;
  var LAYER_PIP_SPACING = LAYER_PIP_RADIUS * 2.5;

  function layerCircleSpecs(layers) {
    var buriedCount = layers.length - 1;
    var specs = [];
    // Active spec FIRST -- see the paint-order note above; this is the
    // single most load-bearing line in this function.
    specs.push({ cx: 0, cy: 0, r: LAYER_MAIN_RADIUS, color: layers[0], active: true, layerIndex: 0 });
    for (var i = 1; i < layers.length; i++) {
      var pipIndex = i - 1;
      var offsetFromCenter = (pipIndex - (buriedCount - 1) / 2) * LAYER_PIP_SPACING;
      specs.push({ cx: offsetFromCenter, cy: LAYER_PIP_ROW_Y, r: LAYER_PIP_RADIUS, color: layers[i], active: false, layerIndex: i });
    }
    return specs;
  }

  // The reusable visual: buried circles behind, active circle on top,
  // all positioned relative to local (0,0). Used identically for board
  // pieces (wrapped in a positioned outer group) and queue previews
  // (dropped straight into a small dedicated SVG), so the player learns
  // one visual language for "what's in this piece" everywhere it appears.
  // The active layer renders as a glossy gradient circle (defined once in
  // index.html's shared <defs> and referenced by url(#id) here -- url()
  // references resolve against the whole document, not just the local
  // <svg> root, so one shared gradient set covers the board AND every
  // separate piece-tray <svg>).
  function fillForColor(color) {
    return 'url(#grad-' + color + ')';
  }

  function buildPieceVisual(layers) {
    var g = svgEl('g', { class: 'piece-visual' });
    var specs = layerCircleSpecs(layers);
    var activeSpec = specs[0];
    var pipSpecs = specs.slice(1);

    // 1. Active circle + its gloss highlight, drawn FIRST (bottom of
    // paint order) so anything drawn after it -- specifically the pips
    // below -- can never be hidden underneath it.
    g.appendChild(svgEl('circle', {
      cx: activeSpec.cx,
      cy: activeSpec.cy,
      r: activeSpec.r,
      fill: fillForColor(activeSpec.color),
      class: 'layer-circle layer-active',
      'data-layer-index': activeSpec.layerIndex
    }));
    g.appendChild(svgEl('ellipse', {
      cx: activeSpec.cx - activeSpec.r * 0.32,
      cy: activeSpec.cy - activeSpec.r * 0.4,
      rx: activeSpec.r * 0.32,
      ry: activeSpec.r * 0.2,
      class: 'layer-active-highlight',
      'pointer-events': 'none'
    }));

    // 2. Buried-color pips (only when there ARE buried colors -- a
    // 1-layer piece gets no backing plate and no pips, never a fake
    // empty indicator). One shared dark backing plate sits behind the
    // whole row so each pip's color stays readable regardless of what
    // color the active circle or the scene behind it happens to be.
    if (pipSpecs.length > 0) {
      var minX = Math.min.apply(null, pipSpecs.map(function (s) { return s.cx - s.r; }));
      var maxX = Math.max.apply(null, pipSpecs.map(function (s) { return s.cx + s.r; }));
      var padX = LAYER_PIP_RADIUS * 0.5;
      var padY = LAYER_PIP_RADIUS * 0.45;
      g.appendChild(svgEl('rect', {
        x: minX - padX,
        y: LAYER_PIP_ROW_Y - LAYER_PIP_RADIUS - padY,
        width: (maxX - minX) + padX * 2,
        height: LAYER_PIP_RADIUS * 2 + padY * 2,
        rx: LAYER_PIP_RADIUS * 0.8,
        class: 'layer-pip-backing'
      }));
      pipSpecs.forEach(function (spec) {
        var pipSize = spec.r * 2;
        g.appendChild(svgEl('rect', {
          x: spec.cx - spec.r,
          y: spec.cy - spec.r,
          width: pipSize,
          height: pipSize,
          rx: spec.r * 0.4,
          fill: fillForColor(spec.color),
          class: 'layer-circle layer-pip',
          'data-layer-index': spec.layerIndex
        }));
      });
    }
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

  // ---- Illustrated scene backdrop (V0.11) ------------------------------------
  // One shared, hand-authored SVG "Quiet Bay" composition -- dusk sky,
  // distant isles with glowing windows, a shimmering water band, and a
  // dark foreground rock/foliage frame -- reused behind all three screens.
  // Every color that should vary by region is a CSS custom property (see
  // style.css's [data-region-index] blocks), so the SAME illustration
  // re-themes per level without regenerating any markup. This is the ONE
  // polished environment the brief asked for, not eight separate skins.
  //
  // ASSET SLOT: this is an SVG approximation (gradients + silhouette
  // paths), not painted illustration. A real painted background (sky,
  // isles, water, foreground foliage) would be the single highest-impact
  // upgrade over this -- see the after-implementation report.
  var SCENE_SVG_MARKUP = '' +
    '<svg viewBox="0 0 100 170" preserveAspectRatio="xMidYMax slice" aria-hidden="true">' +
      '<defs>' +
        '<linearGradient id="scene-sky" x1="0" y1="0" x2="0" y2="1">' +
          '<stop class="stop-sky-1" offset="0%"/>' +
          '<stop class="stop-sky-2" offset="55%"/>' +
          '<stop class="stop-sky-3" offset="100%"/>' +
        '</linearGradient>' +
        '<linearGradient id="scene-water" x1="0" y1="0" x2="0" y2="1">' +
          '<stop class="stop-water-1" offset="0%"/>' +
          '<stop class="stop-water-2" offset="100%"/>' +
        '</linearGradient>' +
        '<radialGradient id="scene-orb" cx="50%" cy="50%" r="50%">' +
          '<stop class="stop-orb-1" offset="0%"/>' +
          '<stop class="stop-orb-2" offset="100%"/>' +
        '</radialGradient>' +
      '</defs>' +
      '<rect x="0" y="0" width="100" height="170" fill="url(#scene-sky)"/>' +
      '<g class="scene-stars">' +
        '<circle cx="10" cy="14" r="0.5"/><circle cx="24" cy="8" r="0.4"/>' +
        '<circle cx="38" cy="18" r="0.6"/><circle cx="52" cy="7" r="0.4"/>' +
        '<circle cx="68" cy="15" r="0.5"/><circle cx="82" cy="9" r="0.4"/>' +
        '<circle cx="91" cy="20" r="0.5"/><circle cx="15" cy="28" r="0.4"/>' +
        '<circle cx="60" cy="24" r="0.4"/><circle cx="76" cy="30" r="0.5"/>' +
      '</g>' +
      '<circle class="scene-orb-glow" cx="70" cy="34" r="20"/>' +
      '<circle class="scene-orb" cx="70" cy="34" r="7"/>' +
      '<path class="scene-isle-far" d="M0,86 L9,70 L19,80 L29,62 L42,78 L55,64 L67,80 L79,66 L90,82 L100,72 L100,170 L0,170 Z"/>' +
      '<g class="scene-isle-lights">' +
        '<circle cx="29" cy="66" r="0.55"/><circle cx="55" cy="68" r="0.5"/><circle cx="79" cy="70" r="0.55"/>' +
      '</g>' +
      '<path class="scene-isle-near" d="M0,104 L12,90 L26,102 L38,84 L52,100 L64,88 L78,106 L100,92 L100,170 L0,170 Z"/>' +
      '<rect x="0" y="112" width="100" height="58" fill="url(#scene-water)"/>' +
      '<g class="scene-water-shimmer">' +
        '<rect x="8" y="122" width="18" height="0.6" rx="0.3"/>' +
        '<rect x="42" y="132" width="24" height="0.6" rx="0.3"/>' +
        '<rect x="20" y="144" width="30" height="0.7" rx="0.35"/>' +
        '<rect x="60" y="126" width="16" height="0.6" rx="0.3"/>' +
        '<rect x="70" y="150" width="22" height="0.7" rx="0.35"/>' +
      '</g>' +
      '<path class="scene-foreground scene-foreground-left" d="M0,170 L0,118 Q14,124 17,140 Q19,156 8,170 Z"/>' +
      '<path class="scene-foreground scene-foreground-right" d="M100,170 L100,124 Q86,130 84,144 Q83,158 94,170 Z"/>' +
    '</svg>';

  function renderSceneInto(el) {
    if (!el || el.dataset.sceneBuilt) return;
    el.innerHTML = SCENE_SVG_MARKUP;
    el.dataset.sceneBuilt = 'true';
  }

  // ---- Mascot (V0.10) --------------------------------------------------------
  // A small, deliberately simple traveler companion, built from plain SVG
  // shapes (no image assets) so it stays lightweight and legible at any
  // size. `mood` swaps the face: 'idle' (default) or 'happy' (level
  // clear). The scarf color comes from the CSS variable --mascot-scarf,
  // which the current region's theme controls -- so the same mascot
  // subtly matches wherever the player currently is.
  function buildMascotSVG(mood) {
    var svg = svgEl('svg', { viewBox: '0 0 120 120' });

    // Ears (behind the body).
    svg.appendChild(svgEl('ellipse', { cx: 34, cy: 32, rx: 13, ry: 20, transform: 'rotate(-18 34 32)', class: 'mascot-ear' }));
    svg.appendChild(svgEl('ellipse', { cx: 86, cy: 32, rx: 13, ry: 20, transform: 'rotate(18 86 32)', class: 'mascot-ear' }));
    svg.appendChild(svgEl('ellipse', { cx: 34, cy: 34, rx: 6, ry: 12, transform: 'rotate(-18 34 34)', class: 'mascot-ear-inner' }));
    svg.appendChild(svgEl('ellipse', { cx: 86, cy: 34, rx: 6, ry: 12, transform: 'rotate(18 86 34)', class: 'mascot-ear-inner' }));

    // Body.
    svg.appendChild(svgEl('ellipse', { cx: 60, cy: 74, rx: 36, ry: 32, class: 'mascot-body' }));

    // Scarf.
    var scarf = svgEl('path', {
      d: 'M 27 62 Q 60 78 93 62 L 90 74 Q 60 88 30 74 Z',
      class: 'mascot-scarf'
    });
    svg.appendChild(scarf);
    svg.appendChild(svgEl('path', { d: 'M 68 72 L 76 96 L 64 92 L 66 74 Z', class: 'mascot-scarf-tail' }));

    // Face.
    if (mood === 'happy') {
      svg.appendChild(svgEl('path', { d: 'M 42 62 Q 48 54 54 62', class: 'mascot-eye', fill: 'none' }));
      svg.appendChild(svgEl('path', { d: 'M 66 62 Q 72 54 78 62', class: 'mascot-eye', fill: 'none' }));
      svg.appendChild(svgEl('path', { d: 'M 48 74 Q 60 86 72 74', class: 'mascot-mouth', fill: 'none' }));
      [[20, 22], [102, 30], [96, 88]].forEach(function (p) {
        var star = svgEl('path', {
          d: 'M0,-4 L1.2,-1.2 4,0 1.2,1.2 0,4 -1.2,1.2 -4,0 -1.2,-1.2 Z',
          transform: 'translate(' + p[0] + ',' + p[1] + ')',
          class: 'mascot-sparkle'
        });
        svg.appendChild(star);
      });
    } else {
      svg.appendChild(svgEl('circle', { cx: 48, cy: 64, r: 3.2, class: 'mascot-eye-dot' }));
      svg.appendChild(svgEl('circle', { cx: 72, cy: 64, r: 3.2, class: 'mascot-eye-dot' }));
      svg.appendChild(svgEl('path', { d: 'M 54 76 Q 60 81 66 76', class: 'mascot-mouth', fill: 'none' }));
    }
    svg.appendChild(svgEl('ellipse', { cx: 60, cy: 70, rx: 2.2, ry: 1.6, class: 'mascot-nose' }));

    return svg;
  }

  function renderMascotInto(el, mood) {
    if (!el) return;
    el.innerHTML = '';
    el.appendChild(buildMascotSVG(mood));
  }

  // ---- DOM references -------------------------------------------------------

  var boardSvg = document.getElementById('board-svg');
  var levelNameEl = document.getElementById('level-name');
  var regionNameEl = document.getElementById('region-name');
  var currentPiecesEl = document.getElementById('current-pieces');
  var undoBtn = document.getElementById('undo-btn');
  var restartBtn = document.getElementById('restart-btn');
  var endOverlay = document.getElementById('end-overlay');
  var endMessage = document.getElementById('end-message');
  var endActionBtn = document.getElementById('end-action-btn');
  var endMapBtn = document.getElementById('end-map-btn');
  var introBanner = document.getElementById('intro-banner');
  var introBannerText = document.getElementById('intro-banner-text');
  var clearCallout = document.getElementById('clear-callout');
  var levelSelectEl = document.getElementById('level-select');
  var appEl = document.getElementById('app');
  var titleScreenEl = document.getElementById('title-screen');
  var mapScreenEl = document.getElementById('map-screen');
  var gameScreenEl = document.getElementById('game-screen');
  var playBtn = document.getElementById('play-btn');
  var mapBtn = document.getElementById('map-btn');
  var mapPathEl = document.getElementById('map-path');
  var mapSubtitleEl = document.getElementById('map-subtitle');
  var titleMascotEl = document.getElementById('title-mascot');
  var boardMascotEl = document.getElementById('board-mascot');
  var endMascotEl = document.getElementById('end-mascot');
  var sceneTitleEl = document.getElementById('scene-title');
  var sceneMapEl = document.getElementById('scene-map');
  var sceneGameEl = document.getElementById('scene-game');

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

  // V0.10: which levels have been cleared this session, purely for the map
  // screen's checkmark badge. Session-only (not persisted) on purpose --
  // this is presentation, not a save system or a new gameplay mechanic;
  // every level stays freely selectable from the map either way.
  var completedLevels = {};

  function currentLevel() {
    return Config.LEVELS[currentLevelIndex];
  }

  // ---- Screens: title / map / game (V0.10) -----------------------------------
  // A minimal 3-screen flow layered on top of the existing single-screen
  // gameplay UI below, which is otherwise unchanged. `screen` is UI-only
  // state, not part of Undo/Restart's history.

  var screen = 'title'; // 'title' | 'map' | 'game'

  function applyRegionTheme(levelIndex) {
    appEl.setAttribute('data-region-index', String(levelIndex));
  }

  function showScreen(name) {
    screen = name;
    titleScreenEl.hidden = name !== 'title';
    mapScreenEl.hidden = name !== 'map';
    gameScreenEl.hidden = name !== 'game';
    if (name === 'map') {
      applyRegionTheme(currentLevelIndex);
      renderMap();
    }
  }

  function renderMap() {
    mapPathEl.innerHTML = '';
    mapSubtitleEl.textContent = currentLevel() ? 'You are in ' + currentLevel().region + '.' : 'Choose where to go next.';

    Config.LEVELS.forEach(function (lvl, i) {
      var row = document.createElement('div');
      row.className = 'map-node-row';

      if (i > 0) row.appendChild(document.createElement('div')).className = 'map-connector';

      var node = document.createElement('button');
      node.type = 'button';
      var classes = ['map-node'];
      if (i === currentLevelIndex) classes.push('current');
      if (completedLevels[i]) classes.push('completed');
      node.className = classes.join(' ');
      node.textContent = String(i + 1);
      node.title = lvl.name;
      node.setAttribute('data-level-index', i);
      node.addEventListener('click', function () {
        goToLevel(i);
        showScreen('game');
      });
      row.appendChild(node);

      var label = document.createElement('div');
      label.className = 'map-node-label';
      label.textContent = lvl.region;
      row.appendChild(label);

      mapPathEl.appendChild(row);
    });

    // Mascot marker travels to whichever node is "current."
    var marker = document.createElement('div');
    marker.className = 'mascot-wrap mascot-wrap--map';
    marker.appendChild(buildMascotSVG('idle'));
    mapPathEl.appendChild(marker);
    requestAnimationFrame(function () {
      var currentBtn = mapPathEl.querySelector('.map-node.current');
      if (!currentBtn) return;
      var pathRect = mapPathEl.getBoundingClientRect();
      var btnRect = currentBtn.getBoundingClientRect();
      marker.style.left = (btnRect.left - pathRect.left + btnRect.width / 2 - 23 + mapPathEl.scrollLeft) + 'px';
      marker.style.top = (btnRect.top - pathRect.top - 44 + mapPathEl.scrollTop) + 'px';
    });
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
    applyRegionTheme(currentLevelIndex);
    renderMascotInto(boardMascotEl, 'idle');
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

  // Used by both the player-facing map screen (renderMap) and the
  // DEBUG-only developer level select (renderLevelSelect) -- jumps
  // straight to any level without requiring the ones before it to be
  // cleared first. This is a prototype: there is no lock/unlock system.
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

  // Small, visually-modest developer convenience: jump directly to any
  // level for testing. Hidden from normal play -- the map screen is the
  // real player-facing navigation now (see renderMap). Rebuilt only when
  // the level count or current index could have changed (resetGame), not
  // on every render.
  function renderLevelSelect() {
    if (!levelSelectEl) return;
    levelSelectEl.hidden = !DEBUG;
    if (!DEBUG) return;
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

  // V0.11 board treatment: the old "programmer drew a hex grid" look (one
  // stroked hex polygon per cell) is gone. Visually, a cell is now a soft
  // round "well" sunk into one continuous sculpted tray -- the tray's
  // organic silhouette is many overlapping circles (one per cell, larger
  // than the cell spacing) fused into a single soft shape by the #goo-tray
  // SVG filter (a standard blur-then-threshold "metaball" trick). None of
  // this touches the underlying hex coordinates: `cellPixels` positions
  // are exactly the same axial-derived centers as before, so adjacency,
  // gravity, and every gameplay rule are entirely unaffected -- only how
  // each position is DRAWN changed.
  //
  // A cell's clickable area is a separate, fully invisible hex polygon
  // (`cell-hit`) laid on TOP of the visible pieces/wells, in the exact
  // same position a visible hex tile used to occupy. Since its fill is
  // transparent, it never changes what the player sees -- it exists only
  // to keep 100% of the board's surface reliably tappable (no dead zones
  // between the now-smaller visible wells), and every hit-hex + the
  // piece sitting on it carry the same data-col/data-slot, so it doesn't
  // matter which one an event target resolves to.
  var wellElements = {}; // key -> visible well circle (preview/debug styling target)
  var previewedKeys = []; // keys currently carrying a preview-* class

  // Full rebuild: call this whenever the underlying board state changes
  // (placement, cascade step, undo, restart). Does NOT apply any preview.
  function renderBoard() {
    while (boardSvg.firstChild) boardSvg.removeChild(boardSvg.firstChild);
    wellElements = {};
    previewedKeys = [];

    var legalDebugCells = debugLegalCellKeys();
    var keys = Object.keys(cellPixels);

    // 1. Tray silhouette: one large soft circle per cell, fused into a
    // single organic shape by the goo filter. Purely decorative.
    var trayFilterGroup = svgEl('g', { filter: 'url(#goo-tray)' });
    keys.forEach(function (key) {
      var cell = cellPixels[key];
      trayFilterGroup.appendChild(svgEl('circle', {
        cx: cell.x, cy: cell.y, r: HEX_SIZE * 0.98, class: 'tray-blob-dot'
      }));
    });
    boardSvg.appendChild(trayFilterGroup);

    // 2. Visible wells (empty-cell pockets).
    keys.forEach(function (key) {
      var cell = cellPixels[key];
      var well = svgEl('circle', {
        cx: cell.x, cy: cell.y, r: HEX_SIZE * 0.72,
        class: 'cell-well' + (legalDebugCells[key] ? ' debug-legal' : '')
      });
      boardSvg.appendChild(well);
      wellElements[key] = well;
    });

    // 3. Pieces, seated in their wells.
    keys.forEach(function (key) {
      var cell = cellPixels[key];
      var layers = Logic.getLayers(state.board, cell.col, cell.slot);
      if (!layers) return;
      var group = svgEl('g', { class: 'piece-group', 'data-col': cell.col, 'data-slot': cell.slot });
      group.style.transform = translatePx(cell.x, cell.y);
      group.appendChild(buildPieceVisual(layers));
      boardSvg.appendChild(group);
    });

    // 4. Invisible full-hex hit areas, topmost, for 100% tap coverage.
    keys.forEach(function (key) {
      var cell = cellPixels[key];
      boardSvg.appendChild(svgEl('polygon', {
        points: hexCorners(cell.x, cell.y, HEX_SIZE),
        class: 'cell-hit',
        'data-col': cell.col,
        'data-slot': cell.slot
      }));
    });

    // Debug labels last, on top of everything, so they stay legible even
    // over an occupied cell's piece visual.
    if (DEBUG) {
      keys.forEach(function (key) {
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
      var el = wellElements[key];
      if (el) el.classList.remove('preview-valid', 'preview-invalid');
    });
    previewedKeys = [];

    if (!preview) return;
    var cls = preview.valid ? 'preview-valid' : 'preview-invalid';
    preview.cells.forEach(function (c) {
      var key = Logic.cellKey(c.col, c.slot);
      var el = wellElements[key];
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

  // The active circle's specular-highlight ellipse (see buildPieceVisual)
  // is a separate sibling element purely for visual polish -- it must
  // fade/pulse in lockstep with the active circle whenever a clear or
  // emphasize animation runs, or it would be left floating on screen
  // after the circle underneath it has already faded away.
  function addActiveAnimClass(col, slot, cls) {
    var circle = activeCircleAt(col, slot);
    if (!circle) return;
    circle.classList.add(cls);
    var highlight = circle.nextElementSibling;
    if (highlight && highlight.classList.contains('layer-active-highlight')) {
      highlight.classList.add(cls);
    }
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
    levelNameEl.textContent = currentLevel().name;
    if (regionNameEl) regionNameEl.textContent = currentLevel().region || '';
    // V0.9: move count is no longer shown to the player -- the only
    // success condition is clearing the whole board, not how many
    // placements it took. state.moveCount is still tracked internally
    // (Undo/Restart and debug logging still use it), just never rendered
    // in the normal UI. DEBUG mode surfaces it below instead.
    if (DEBUG) {
      levelNameEl.textContent += ' [#' + (currentLevelIndex + 1) + '/' + Config.LEVELS.length +
        ', queue: ' + state.pieceIndex + '/' + currentLevel().pieceSequence.length +
        ', moves: ' + state.moveCount + ']';
    }
  }

  function renderControls() {
    // V0.7: Undo is removed from normal play (a meaningful mistake should
    // cost a Restart) but the underlying history/onUndo mechanism is kept
    // fully intact for debugging -- the button just stays hidden unless
    // DEBUG is on.
    undoBtn.hidden = !DEBUG;
    undoBtn.disabled = state.history.length === 0 || isAnimating;
    restartBtn.disabled = isAnimating;
  }

  function renderEndState() {
    if (state.status === 'won') {
      completedLevels[currentLevelIndex] = true;
      var isLastLevel = currentLevelIndex === Config.LEVELS.length - 1;
      if (isLastLevel) {
        showEndOverlay('JOURNEY COMPLETE', null, 'happy');
      } else {
        showEndOverlay('LEVEL CLEARED', { label: 'Next Level', onClick: goToNextLevel }, 'happy');
      }
    } else if (state.status === 'lost') {
      showEndOverlay('No more moves. Try again.', { label: 'Try Again', onClick: resetGame }, 'idle');
    } else {
      hideEndOverlay();
    }
  }

  function showEndOverlay(message, action, mascotMood) {
    endMessage.textContent = message;
    renderMascotInto(endMascotEl, mascotMood || 'idle');
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
        addActiveAnimClass(c.col, c.slot, 'emphasize');
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
    // V0.9: SETTLE GRAVITY only -- every level uses Logic.resolveCascade.
    // gamelogic.js still exports applyStepGravity/resolveCascadeStepGravity
    // from the V0.8 experiment (playtesting concluded Settle Gravity felt
    // better), but nothing in the shipped game calls them anymore.
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
          addActiveAnimClass(c.col, c.slot, 'clearing');
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

  // ---- Screen flow wiring (V0.10) --------------------------------------------

  playBtn.addEventListener('click', function () { showScreen('map'); });
  mapBtn.addEventListener('click', function () { showScreen('map'); });
  endMapBtn.addEventListener('click', function () { hideEndOverlay(); showScreen('map'); });

  renderSceneInto(sceneTitleEl);
  renderSceneInto(sceneMapEl);
  renderSceneInto(sceneGameEl);
  renderMascotInto(titleMascotEl, 'idle');
  resetGame();
  showScreen('title');
})();
