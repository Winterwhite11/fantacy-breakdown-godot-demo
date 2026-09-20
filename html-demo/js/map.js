/** Chessboard map with fight / hard / event / reward / extract nodes. */

const MAP_SIZE = 9;
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
      cells.push({ x, y, type: null, cleared: false });
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

  const plan = [
    ...Array(4).fill("fight"),
    ...Array(2).fill("hard"),
    ...Array(3).fill("event"),
    ...Array(2).fill("reward"),
  ];
  plan.forEach((t, i) => {
    if (candidates[i]) candidates[i].type = t;
  });

  return {
    size: MAP_SIZE,
    cells,
    player,
    visitedFight: [],
    extractPos: { ...extractPos },
  };
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

function tryMove(state, x, y) {
  if (!isAdjacent(state.player, { x, y })) return { ok: false, reason: "只能移动到相邻格" };
  if (x < 0 || y < 0 || x >= state.size || y >= state.size) return { ok: false, reason: "越界" };
  state.player = { x, y };
  const cell = cellAt(state, x, y);
  return { ok: true, cell };
}

/** Demo：随时可撤离，无解锁门槛 */
function canUnlockExtract() {
  return true;
}

function extractProgressText() {
  return "撤离点在地图随机角落 · 抵达即可随时通关";
}

function renderMap(boardEl, state, onCellClick) {
  const n = state.size;
  boardEl.style.gridTemplateColumns = `repeat(${n}, minmax(0, 1fr))`;
  boardEl.style.gridTemplateRows = `repeat(${n}, minmax(0, 1fr))`;
  boardEl.innerHTML = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const cell = cellAt(state, x, y);
      const div = document.createElement("div");
      const light = (x + y) % 2 === 0;
      div.className = `cell ${light ? "light" : "dark"}`;
      div.setAttribute("role", "gridcell");
      if (isAdjacent(state.player, { x, y })) div.classList.add("reachable");

      if (cell.type && !cell.cleared) {
        if (cell.type === "extract") {
          const mark = document.createElement("div");
          mark.className = "node-extract unlocked";
          mark.title = "撤离点（抵达即可通关）";
          mark.textContent = "撤";
          div.appendChild(mark);
        } else {
          const img = document.createElement("img");
          img.className = "node-icon";
          img.src = NODE_ICONS[cell.type] || NODE_ICONS.event;
          img.alt = cell.type;
          div.appendChild(img);
        }
      }

      if (state.player.x === x && state.player.y === y) {
        const tok = document.createElement("div");
        tok.className = "player-token fallback";
        tok.title = "拓宇者";
        div.appendChild(tok);
      }

      div.addEventListener("click", () => onCellClick(x, y));
      boardEl.appendChild(div);
    }
  }
}

window.FBMap = {
  createMapState,
  tryMove,
  renderMap,
  cellAt,
  NODE_ICONS,
  canUnlockExtract,
  extractProgressText,
};
