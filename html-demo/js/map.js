/** Chessboard map with fight / event / reward nodes. */

const MAP_SIZE = 9;
const NODE_ICONS = {
  fight: "../assets/ui/map-nodes/fight.png",
  hard: "../assets/ui/map-nodes/hard%20fight.png",
  event: "../assets/ui/map-nodes/event.png",
  reward: "../assets/ui/map-nodes/chest.png",
  shop: "../assets/ui/map-nodes/shop.png",
};

function createMapState() {
  const cells = [];
  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      cells.push({ x, y, type: null, cleared: false });
    }
  }
  const center = { x: Math.floor(MAP_SIZE / 2), y: Math.floor(MAP_SIZE / 2) };
  const player = { ...center };

  // Place nodes around the board (not on center)
  const candidates = cells.filter((c) => !(c.x === center.x && c.y === center.y));
  shuffleInPlace(candidates);

  const plan = [
    ...Array(5).fill("fight"),
    ...Array(2).fill("hard"),
    ...Array(3).fill("event"),
    ...Array(3).fill("reward"),
  ];
  plan.forEach((t, i) => {
    if (candidates[i]) candidates[i].type = t;
  });

  return { size: MAP_SIZE, cells, player, visitedFight: new Set() };
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
        const img = document.createElement("img");
        img.className = "node-icon";
        img.src = NODE_ICONS[cell.type] || NODE_ICONS.event;
        img.alt = cell.type;
        div.appendChild(img);
      }

      if (state.player.x === x && state.player.y === y) {
        const tok = document.createElement("div");
        tok.className = "player-token";
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
};
