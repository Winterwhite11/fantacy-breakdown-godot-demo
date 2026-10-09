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

function createMapState() {
  const cells = [];
  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      cells.push({ x, y, type: null, cleared: false, explored: false });
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
      if (!explored) div.classList.add("fog-unknown");
      else if (!visible) div.classList.add("fog-explored");
      else div.classList.add("fog-clear");
      div.setAttribute("role", "gridcell");
      div.dataset.x = String(x);
      div.dataset.y = String(y);

      if (visible && isAdjacent(state.player, { x, y })) div.classList.add("reachable");

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
          img.src = NODE_ICONS[cell.type] || NODE_ICONS.event;
          img.alt = cell.type;
          img.title = visible ? cell.type : `曾见：${cell.type}`;
          div.appendChild(img);
        }
      }

      if (state.player.x === x && state.player.y === y) {
        const tok = document.createElement("div");
        tok.className = "player-token fallback";
        tok.title = "拓宇者";
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
