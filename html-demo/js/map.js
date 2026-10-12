/** Chessboard map with fight / hard / event / reward / extract nodes + fog of war. */

/** 棋盘边长（相对旧版 9 扩大一倍） */
const MAP_SIZE = 18;
/** 玩家视野：切比雪夫距离（含斜向）≤ 2 格可见 */
const VISION_RANGE = 2;
const NODE_ICONS = {
  fight: "img/map-nodes/fight.png?v=orig1",
  hard: "img/map-nodes/hard.png?v=orig1",
  event: "img/map-nodes/event.png?v=orig1",
  reward: "img/map-nodes/reward.png?v=orig1",
  shop: "img/map-nodes/shop.png?v=orig1",
  extract: "img/map-nodes/extract.svg?v=1",
};
const PLAYER_ICON = null;

/** 通关：走到随机角落的撤离点即可随时撤离 */
function cornerCells(size) {
  const last = size - 1;
  return [
    { x: 0, y: 0 },
    { x: last, y: 0 },
    { x: 0, y: last },
    { x: last, y: last },
  ];
}

/**
 * 异星地表类型（确定性生成，随存档保存）。
 * 用低阶值噪声生成「聚簇」而非随机噪点 —— 地形要成片才像真实地貌。
 * 纯装饰，不影响玩法。
 */
const TERRAIN_KINDS = ["plain", "moss", "crystal", "basalt", "crater"];

/** 2D 整数哈希 → [0,1) */
function hash2(x, y, salt = 0) {
  let h = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 值噪声：格点插值（smoothstep），使同类地形连成片 */
function valueNoise(x, y, scale, salt) {
  const fx = x / scale, fy = y / scale;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const n00 = hash2(x0, y0, salt), n10 = hash2(x0 + 1, y0, salt);
  const n01 = hash2(x0, y0 + 1, salt), n11 = hash2(x0 + 1, y0 + 1, salt);
  const a = n00 + (n10 - n00) * sx;
  const b = n01 + (n11 - n01) * sx;
  return a + (b - a) * sy;
}

function terrainAt(x, y) {
  // 两个尺度叠加 + 少量高频抖动：
  // 纯噪声叠加大尺度定区域、小尺度加细节，高频项只用来避免高阈值档取不到。
  // 权重偏高会破坏成片性，故高频项只占 8%。
  const n =
    valueNoise(x, y, 4.5, 1) * 0.58 +
    valueNoise(x, y, 2.2, 7) * 0.34 +
    hash2(x, y, 13) * 0.08;
  if (n < 0.315) return "crater";
  if (n < 0.420) return "basalt";
  if (n < 0.520) return "plain";
  if (n < 0.585) return "crystal";
  return "moss";
}

function createMapState() {
  const cells = [];
  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      cells.push({
        x, y, type: null, cleared: false, explored: false,
        terrain: terrainAt(x, y),
      });
    }
  }
  const center = { x: Math.floor(MAP_SIZE / 2), y: Math.floor(MAP_SIZE / 2) };
  const player = { ...center };

  // 撤离点：四角随机一格
  const corners = cornerCells(MAP_SIZE);
  const extractPos = corners[Math.floor(Math.random() * corners.length)];
  const extractCell = cellAt({ cells }, extractPos.x, extractPos.y);
  if (extractCell) extractCell.type = "extract";

  const candidates = cells.filter(
    (c) =>
      !(c.x === center.x && c.y === center.y) &&
      !(c.x === extractPos.x && c.y === extractPos.y)
  );
  shuffleInPlace(candidates);

  // 边长×2 → 面积×4；节点约按线性×2 铺，避免过大图过稀
  const plan = [
    ...Array(8).fill("fight"),
    ...Array(4).fill("hard"),
    ...Array(6).fill("event"),
    ...Array(4).fill("reward"),
    ...Array(2).fill("shop"),
  ];
  plan.forEach((t, i) => {
    if (candidates[i]) candidates[i].type = t;
  });

  const state = {
    size: MAP_SIZE,
    visionRange: VISION_RANGE,
    cells,
    player,
    visitedFight: [],
    extractPos: { ...extractPos },
  };
  updateFog(state);
  return state;
}

function shuffleInPlace(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

function cellAt(state, x, y) {
  return state.cells.find((c) => c.x === x && c.y === y);
}

function isAdjacent(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

/** 切比雪夫距离（王步）：含斜向 */
function chebyshev(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function visionRangeOf(state) {
  const r = state?.visionRange;
  return r != null ? Number(r) : VISION_RANGE;
}

function inVision(state, x, y) {
  if (!state?.player) return false;
  return chebyshev(state.player, { x, y }) <= visionRangeOf(state);
}

/** 将当前视野内格子标为已探索（战争迷雾记忆） */
function updateFog(state) {
  if (!state?.cells || !state.player) return state;
  if (state.visionRange == null) state.visionRange = VISION_RANGE;
  state.cells.forEach((c) => {
    if (c.explored == null) c.explored = false;
    if (inVision(state, c.x, c.y)) c.explored = true;
  });
  return state;
}

/** 旧存档兼容：补齐 explored / visionRange */
function ensureFogState(state) {
  if (!state?.cells) return state;
  if (state.visionRange == null) state.visionRange = VISION_RANGE;
  let missing = false;
  state.cells.forEach((c) => {
    if (c.explored == null) {
      c.explored = false;
      missing = true;
    }
  });
  // 旧档无迷雾记忆：用当前视野初始化；已清理过的点视为探索过
  if (missing) {
    state.cells.forEach((c) => {
      if (c.cleared) c.explored = true;
    });
  }
  updateFog(state);
  return state;
}

function tryMove(state, x, y) {
  if (!isAdjacent(state.player, { x, y })) return { ok: false, reason: "只能移动到相邻格" };
  if (x < 0 || y < 0 || x >= state.size || y >= state.size) return { ok: false, reason: "越界" };
  state.player = { x, y };
  updateFog(state);
  const cell = cellAt(state, x, y);
  return { ok: true, cell };
}

/** Demo：随时可撤离，无解锁门槛 */
function canUnlockExtract() {
  return true;
}

function extractProgressText() {
  return `战争迷雾 · 视野 ${VISION_RANGE} 格 · 撤离点在随机角落，抵达即可通关`;
}

function renderMap(boardEl, state, onCellClick) {
  ensureFogState(state);
  const n = state.size;
  boardEl.style.gridTemplateColumns = `repeat(${n}, minmax(0, 1fr))`;
  boardEl.style.gridTemplateRows = `repeat(${n}, minmax(0, 1fr))`;
  boardEl.innerHTML = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const cell = cellAt(state, x, y);
      const div = document.createElement("div");
      const light = (x + y) % 2 === 0;
      const visible = inVision(state, x, y);
      const explored = !!cell.explored;
      div.className = `cell ${light ? "light" : "dark"}`;
      // 地表类型（纯装饰）：旧档可能没有 terrain，按坐标补算，保证前后一致
      const terrain = cell.terrain || (cell.terrain = terrainAt(x, y));
      div.classList.add(`terrain-${terrain}`);
      if (!explored) div.classList.add("fog-unknown");
      else if (!visible) div.classList.add("fog-explored");
      else div.classList.add("fog-clear");
      div.setAttribute("role", "gridcell");
      div.dataset.x = String(x);
      div.dataset.y = String(y);

      if (visible && isAdjacent(state.player, { x, y })) div.classList.add("reachable");

      // 可移动格：叠加像素方向提示点（提升"能往哪走"的可读性）
      if (visible && isAdjacent(state.player, { x, y })) {
        const hint = document.createElement("span");
        hint.className = "move-hint";
        hint.setAttribute("aria-hidden", "true");
        div.appendChild(hint);
      }

      // 未探索：不显示节点；已探索但视野外：显示记忆中的节点（变暗）
      if (explored && cell.type && !cell.cleared) {
        if (cell.type === "extract") {
          const mark = document.createElement("div");
          mark.className = "node-extract unlocked";
          mark.title = visible ? "撤离点（抵达即可通关）" : "曾见：撤离点";
          mark.textContent = "撤";
          div.appendChild(mark);
        } else {
          const img = document.createElement("img");
          img.className = "node-icon";
          // 按节点语义着色（图标本身是纯白剪影，用 CSS filter 上色）
          img.classList.add(`node-${cell.type}`);
          img.src = NODE_ICONS[cell.type] || NODE_ICONS.event;
          img.alt = cell.type;
          img.title = visible ? cell.type : `曾见：${cell.type}`;
          div.appendChild(img);
        }
      }

      if (state.player.x === x && state.player.y === y) {
        const tok = document.createElement("div");
        // 玩家标记 = 像素棋子：每个角色对应不同棋子（见 pieces.js）
        const charId = state.character || null;
        const P = window.FBPieces;
        if (P) {
          tok.className = `player-token ${P.classFor(charId)}`;
          tok.title = `拓宇者 · ${P.PIECE_NAMES[P.pieceFor(charId)] || "棋子"}`;
          tok.setAttribute("aria-label", tok.title);
        } else {
          tok.className = "player-token fallback";
          tok.title = "拓宇者";
        }
        div.appendChild(tok);
      }

      if (!explored) {
        div.title = "战争迷雾";
      }

      div.addEventListener("click", () => onCellClick(x, y));
      boardEl.appendChild(div);
    }
  }
}

window.FBMap = {
  MAP_SIZE,
  VISION_RANGE,
  createMapState,
  tryMove,
  renderMap,
  cellAt,
  inVision,
  updateFog,
  ensureFogState,
  NODE_ICONS,
  canUnlockExtract,
  extractProgressText,
};
