/** App shell: menu → prepare / map → combat */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const screens = {
  menu: $("#screen-menu"),
  settings: $("#screen-settings"),
  prepare: $("#screen-prepare"),
  map: $("#screen-map"),
  combat: $("#screen-combat"),
};

const bgm = $("#bgm");
bgm.volume = 0.55;

function playBgm(filename) {
  const next = String(filename || "");
  if (bgm.dataset.file !== next) {
    bgm.dataset.file = next;
    bgm.src = "../assets/music/" + encodeURIComponent(next);
    bgm.load();
  }
  const p = bgm.play();
  if (p) p.catch(() => {});
}

playBgm("拓宇者2.mp3");

let mapState = null;
let combat = null;
let selectedHand = null;
let selectedEnemy = null;
let metaHp = 60;
let loadout = window.FBLoadout.createLoadoutState();
let dragEquipUid = null;

function show(name) {
  Object.values(screens).forEach((el) => el.classList.remove("active"));
  screens[name].classList.add("active");
}

function unlockAudio() {
  if (bgm.dataset.file) playBgm(bgm.dataset.file);
  else playBgm("拓宇者2.mp3");
}

document.body.addEventListener("pointerdown", unlockAudio, { once: true });

function maxHpNow() {
  return window.FBLoadout.effectiveMaxHp(loadout);
}

function combatOptsFromLoadout(hp) {
  const L = window.FBLoadout;
  return {
    maxHp: L.effectiveMaxHp(loadout),
    hp: hp != null ? hp : L.effectiveMaxHp(loadout),
    deck: L.buildBattleDeck(loadout),
    startBlock: L.startBlockBonus(loadout),
    gearIntervals: L.pistolEffects(loadout),
  };
}

// —— Menu ——
$$(".menu-nav [data-action], #screen-settings [data-action]").forEach((btn) => {
  btn.addEventListener("click", () => {
    unlockAudio();
    const a = btn.dataset.action;
    if (a === "enter") startRun();
    if (a === "prepare") openPrepare();
    if (a === "settings") show("settings");
    if (a === "back-menu") show("menu");
  });
});

$("#vol-master").addEventListener("input", (e) => {
  bgm.volume = Number(e.target.value) / 100;
});

function flowTime() {
  if (!combat || combat.ended) return;
  combat.advanceTime(0.5);
}

function bindTimeFlow(id) {
  const el = $(id);
  if (el) el.addEventListener("click", flowTime);
}
bindTimeFlow("#btn-time-flow-main");

$("#btn-map-menu").addEventListener("click", () => {
  if (combat) combat.stop();
  show("menu");
});

function startRun() {
  metaHp = maxHpNow();
  mapState = window.FBMap.createMapState();
  updateMapHp();
  show("map");
  paintMap();
}

function updateMapHp() {
  $("#map-hp").textContent = `HP ${metaHp}/${maxHpNow()}`;
}

function paintMap() {
  window.FBMap.renderMap($("#map-board"), mapState, onMapClick);
}

function toast(msg) {
  let el = $("#global-toast");
  if (!el) {
    el = document.createElement("aside");
    el.id = "global-toast";
    el.className = "global-toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  const mapToast = $("#map-toast");
  if (mapToast && screens.map.classList.contains("active")) {
    mapToast.textContent = msg;
    mapToast.classList.remove("hidden");
    clearTimeout(toast._mapT);
    toast._mapT = setTimeout(() => mapToast.classList.add("hidden"), 2200);
  }
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 2200);
}

function onMapClick(x, y) {
  const res = window.FBMap.tryMove(mapState, x, y);
  if (!res.ok) {
    toast(res.reason);
    return;
  }
  paintMap();
  const cell = res.cell;
  if (!cell || !cell.type || cell.cleared) return;

  if (cell.type === "fight" || cell.type === "hard") {
    enterCombat(cell);
  } else if (cell.type === "event") {
    toast("事件区：Demo 占位——获得 1 张「气」感（回复 3 HP）");
    metaHp = Math.min(maxHpNow(), metaHp + 3);
    cell.cleared = true;
    updateMapHp();
    paintMap();
  } else if (cell.type === "reward") {
    toast("奖励区：Demo 占位——回复 8 HP");
    metaHp = Math.min(maxHpNow(), metaHp + 8);
    cell.cleared = true;
    updateMapHp();
    paintMap();
  }
}

function enterCombat(cell) {
  const enc = window.FBEncounters.pickRandomEncounter();
  show("combat");
  selectedHand = null;
  selectedEnemy = null;
  $("#combat-overlay").classList.add("hidden");
  $("#combat-log").innerHTML = "";

  if (combat) combat.stop();
  combat = new window.CombatEngine({
    onUpdate: renderCombat,
    onLog: (line) => {
      const box = $("#combat-log");
      const d = document.createElement("div");
      d.textContent = line;
      box.appendChild(d);
      box.scrollTop = box.scrollHeight;
    },
    onEnd: (won) => {
      metaHp = combat.player.hp;
      updateMapHp();
      const ov = $("#combat-overlay");
      $("#overlay-title").textContent = won ? "胜利" : "败北";
      $("#overlay-body").textContent = won
        ? `击败了 ${enc.name}。返回地图继续探索。`
        : "生命归零。可返回地图或主菜单重开。";
      ov.classList.remove("hidden");
      if (won) cell.cleared = true;
    },
  });
  combat.start(enc, combatOptsFromLoadout(metaHp));

  // 战斗 BGM
  playBgm("战斗.mp3");
}

// —— 整理战备 ——
function openPrepare() {
  show("prepare");
  setPrepTab("equip");
  renderPrepare();
}

function setPrepTab(tab) {
  $$(".prep-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  $$(".prep-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === tab);
  });
}

$$(".prep-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    setPrepTab(btn.dataset.tab);
    renderPrepare();
  });
});

$("#btn-prep-back").addEventListener("click", () => show("menu"));

$("#btn-deck-reset").addEventListener("click", () => {
  // 牌组退回仓库后，再按默认测试牌组装配（仓库仍保留测试库存）
  Object.keys(loadout.deck).forEach((id) => {
    while ((loadout.deck[id] || 0) > 0) window.FBLoadout.removeFromDeck(loadout, id);
  });
  Object.keys(window.FBCards.CARD_DEFS || {}).forEach((id) => {
    loadout.cardStash[id] = 3;
  });
  const start = window.FBLoadout.defaultDeckCounts();
  Object.entries(start).forEach(([id, n]) => {
    loadout.deck[id] = n;
  });
  renderPrepare();
});

function equippedValue() {
  let v = 0;
  Object.values(loadout.equipped).forEach((it) => {
    if (it) v += it.value || 0;
  });
  return v;
}

function renderPrepare() {
  const L = window.FBLoadout;
  const deckN = L.deckTotal(loadout);
  const stashN = L.stashCardTotal(loadout);
  $("#prep-summary").textContent =
    `牌组 ${deckN} · 卡牌仓库 ${stashN} · 装备价值 ${equippedValue()}`;
  $("#equip-hp-preview").textContent = `生命 ${L.effectiveMaxHp(loadout)}`;
  $("#equip-value-preview").textContent = `已装备价值 ${equippedValue()}`;
  $("#card-stash-count").textContent = `${stashN} 张`;
  $("#deck-count").textContent = `${deckN} / ${L.DECK_SIZE_MAX} 张`;
  renderEquipSlots();
  renderEquipStash();
  renderCardStash();
  renderDeckList();
}

function renderEquipSlots() {
  const L = window.FBLoadout;
  const box = $("#equip-slots");
  box.innerHTML = "";
  L.SLOT_ORDER.forEach((slot) => {
    const item = loadout.equipped[slot];
    const el = document.createElement("div");
    el.className = "equip-slot" + (item ? " filled" : "");
    el.dataset.slot = slot;
    if (item) {
      el.innerHTML = `
        <div class="equip-slot-label">${L.SLOT_LABEL[slot]}</div>
        <div class="equip-slot-body">${item.name}<br/><span class="equip-slot-empty">${item.desc || ""}</span></div>
        <div class="equip-slot-value">价值 ${item.value}</div>`;
      el.title = "双击卸下";
      el.addEventListener("dblclick", () => {
        L.unequipSlot(loadout, slot);
        renderPrepare();
      });
    } else {
      el.innerHTML = `
        <div class="equip-slot-label">${L.SLOT_LABEL[slot]}</div>
        <div class="equip-slot-body equip-slot-empty">空</div>`;
    }
    el.addEventListener("dragover", (ev) => {
      ev.preventDefault();
      el.classList.add("drag-over");
    });
    el.addEventListener("dragleave", () => el.classList.remove("drag-over"));
    el.addEventListener("drop", (ev) => {
      ev.preventDefault();
      el.classList.remove("drag-over");
      const uid = ev.dataTransfer.getData("text/equip-uid") || dragEquipUid;
      if (!uid) return;
      const idx = loadout.equipStash.findIndex((x) => x.uid === uid);
      if (idx < 0) return;
      const it = loadout.equipStash[idx];
      if (it.slot !== slot) {
        toast(`「${it.name}」只能装到${L.SLOT_LABEL[it.slot]}槽`);
        return;
      }
      L.equipFromStash(loadout, idx);
      renderPrepare();
    });
    box.appendChild(el);
  });
}

function renderEquipStash() {
  const L = window.FBLoadout;
  const grid = $("#equip-stash-grid");
  grid.innerHTML = "";
  loadout.equipStash.forEach((item) => {
    const el = document.createElement("div");
    el.className = "stash-item";
    el.draggable = true;
    el.dataset.uid = item.uid;
    el.innerHTML = `
      <div class="stash-item-name">${item.name}</div>
      <div class="stash-item-meta">${L.SLOT_LABEL[item.slot] || item.slot} · ${item.desc || ""}</div>
      <div class="stash-item-meta stash-item-value">价值 ${item.value}</div>`;
    el.title = "拖到左侧槽位，或双击穿戴";
    el.addEventListener("dragstart", (ev) => {
      dragEquipUid = item.uid;
      el.classList.add("dragging");
      ev.dataTransfer.setData("text/equip-uid", item.uid);
      ev.dataTransfer.effectAllowed = "move";
    });
    el.addEventListener("dragend", () => {
      dragEquipUid = null;
      el.classList.remove("dragging");
    });
    el.addEventListener("dblclick", () => {
      const i = loadout.equipStash.findIndex((x) => x.uid === item.uid);
      if (i >= 0) L.equipFromStash(loadout, i);
      renderPrepare();
    });
    grid.appendChild(el);
  });
  if (!loadout.equipStash.length) {
    grid.innerHTML = '<p class="prep-hint">仓库为空——装备均已穿戴或尚未获得</p>';
  }
}

function renderCardStash() {
  const L = window.FBLoadout;
  const defs = window.FBCards.CARD_DEFS;
  const grid = $("#card-stash-grid");
  grid.innerHTML = "";
  const ids = Object.keys(defs).sort((a, b) => {
    const ta = defs[a].type === "element" ? 0 : defs[a].type === "process" ? 1 : 2;
    const tb = defs[b].type === "element" ? 0 : defs[b].type === "process" ? 1 : 2;
    if (ta !== tb) return ta - tb;
    return (defs[a].name || a).localeCompare(defs[b].name || b, "zh");
  });
  ids.forEach((id) => {
    const n = loadout.cardStash[id] || 0;
    if (n <= 0) return;
    const def = defs[id];
    const el = document.createElement("div");
    el.className = "prep-mini-card";
    el.innerHTML = `
      <div class="prep-mini-card-face">${def.name}<span class="type-tag">${def.type === "element" ? "元素" : def.type === "process" ? "操作" : def.type}</span></div>
      <span class="prep-mini-card-badge">×${n}</span>`;
    el.title = `${def.desc || ""} · 单击加入牌组`;
    el.addEventListener("click", () => {
      const res = L.addToDeck(loadout, id);
      if (!res.ok) toast(res.reason);
      renderPrepare();
    });
    grid.appendChild(el);
  });
  if (!grid.children.length) {
    grid.innerHTML = '<p class="prep-hint">仓库卡牌已全部编入携带牌组</p>';
  }
}

function renderDeckList() {
  const L = window.FBLoadout;
  const defs = window.FBCards.CARD_DEFS;
  const list = $("#deck-list");
  list.innerHTML = "";
  const entries = Object.entries(loadout.deck)
    .filter(([, n]) => n > 0)
    .sort((a, b) => (defs[a[0]]?.name || a[0]).localeCompare(defs[b[0]]?.name || b[0], "zh"));
  entries.forEach(([id, n]) => {
    const def = defs[id] || { name: id };
    const row = document.createElement("div");
    row.className = "deck-row";
    row.innerHTML = `
      <span class="deck-row-name">${def.name}</span>
      <span class="deck-row-count">×${n}</span>
      <button type="button" class="deck-row-btn" title="移回仓库">−</button>`;
    const remove = () => {
      L.removeFromDeck(loadout, id);
      renderPrepare();
    };
    row.querySelector(".deck-row-btn").addEventListener("click", (ev) => {
      ev.stopPropagation();
      remove();
    });
    row.addEventListener("click", remove);
    list.appendChild(row);
  });
  if (!entries.length) {
    list.innerHTML = '<p class="prep-hint">牌组为空——从左侧仓库单击加入</p>';
  }
}

$("#btn-overlay-ok").addEventListener("click", () => {
  $("#combat-overlay").classList.add("hidden");
  if (combat) combat.stop();
  playBgm("拓宇者2.mp3");
  show("map");
  // 等战斗屏隐藏后再绘制，避免格子尺寸被错误布局缓存
  requestAnimationFrame(() => {
    paintMap();
    updateMapHp();
  });
});

$("#btn-combat-map").addEventListener("click", () => {
  toast("战斗中无法打开地图——请先结束或结算");
});

$("#btn-combat-settings").addEventListener("click", () => show("settings"));

$("#btn-craft").addEventListener("click", () => {
  if (!combat) return;
  const res = combat.doCraft();
  if (res && res.ok) {
    selectedHand = res.handIndex;
  }
  renderCombat();
});
$("#btn-craft-clear").addEventListener("click", () => {
  if (!combat) return;
  combat.clearCraft();
  renderCombat();
});
$("#btn-play-craft").addEventListener("click", () => {
  if (!combat || combat.ended) return;
  // 组合台有材料：优先咏唱合成结果；否则打出当前选中的手牌
  if (combat.craft.length > 0) {
    const ok = combat.playCraftDirect();
    if (ok) selectedHand = null;
    renderCombat();
    return;
  }
  if (selectedHand == null) {
    combat.log("请先单击选择一张手牌，或将材料放入组合台");
    renderCombat();
    return;
  }
  const idx = selectedHand;
  selectedHand = null;
  combat.playHand(idx, selectedEnemy);
  renderCombat();
});
function renderCombat() {
  if (!combat) return;
  const p = combat.player;
  $("#c-round").textContent = `回合 ${combat.round}`;
  const timeEl = $("#c-time");
  if (timeEl) {
    timeEl.textContent = combat.autoflowing
      ? `时间 ${combat.time.toFixed(1)}s · 流动中`
      : `时间 ${combat.time.toFixed(1)}s`;
  }
  const flowBtn = $("#btn-time-flow-main");
  if (flowBtn) flowBtn.disabled = !!combat.autoflowing || !!combat.ended;
  $("#c-token").textContent = `代币 ${combat.tokens}`;
  $("#c-glory").textContent = `辉煌 ${combat.glory}`;
  $("#p-hp").textContent = `${p.hp} / ${p.maxHp}`;
  $("#p-block").textContent = `护甲 ${p.block}` + (p.block > 0 ? ` · ${Math.max(0, p.blockExpire - combat.time).toFixed(1)}s` : "");
  const st = [];
  if (p.weak) st.push(`虚弱${p.weak}`);
  if (p.vulnerable) st.push(`易伤${p.vulnerable}`);
  if (p.burn) st.push(`燃${p.burn}`);
  if (p.poison) st.push(`毒${p.poison}`);
  if (p.freeze) st.push(`冻${p.freeze}`);
  if (p.bleed) st.push(`流血${p.bleed}`);
  if (p.stealth) st.push(`隐匿${p.stealth}`);
  if (p.fervor) st.push(`激昂${p.fervor}`);
  if (p.sticky) st.push("黏稠");
  if (p.pollute) st.push("污染");
  if (p.atkBonus) st.push(`攻+${p.atkBonus}`);
  if (p.nextAtkBonus) st.push(`下次+${p.nextAtkBonus}`);
  const untilStatus = Math.max(0, combat.lastStatusAt + 5 - combat.time);
  st.push(`Debuff ${untilStatus.toFixed(1)}s`);
  $("#p-status").textContent = st.join(" · ") || "状态：无";

  // enemies
  const ez = $("#enemy-zone");
  ez.innerHTML = "";
  combat.enemies.forEach((e) => {
    const card = document.createElement("div");
    card.className = "enemy-card" + (e.dead ? " dead" : "");
    if (selectedEnemy === e.uid) card.style.outline = "2px solid #e07060";
    const intent = e.cycle[e.step % e.cycle.length];
    const pct = Math.max(0, (e.hp / e.maxHp) * 100);
    card.innerHTML = `
      <div class="capsule red"></div>
      <div class="ename">${e.name}</div>
      <div>${e.hp}/${e.maxHp} · 甲 ${e.block}</div>
      <div class="hp-bar"><i style="width:${pct}%"></i></div>
      <div class="intent">${e.dead ? "已倒下" : e.awake ? `意图：${intent.label}` : "沉睡中"}</div>
      <div class="status-row">${[
        e.atkBonus ? "攻+" + e.atkBonus : "",
        e.thorns ? "荆棘" + e.thorns : "",
        e.burn ? "燃" + e.burn : "",
        e.poison ? "毒" + e.poison : "",
        e.freeze ? "冻" + e.freeze : "",
        e.bleed ? "流血" + e.bleed : "",
        e.weak ? "虚弱" : "",
        e.vulnerable ? "易伤" : "",
      ].filter(Boolean).join(" · ") || "状态：无"}</div>
    `;
    card.addEventListener("click", () => {
      if (!e.dead) {
        selectedEnemy = e.uid;
        renderCombat();
      }
    });
    ez.appendChild(card);
  });

  // craft
  const slots = $("#craft-slots");
  slots.innerHTML = "";
  for (let i = 0; i < window.FBCards.TOLERANCE; i++) {
    const s = document.createElement("div");
    const c = combat.craft[i];
    s.className = "craft-slot" + (c ? " filled" : "");
    s.textContent = c ? c.name : String(i + 1);
    slots.appendChild(s);
  }
  const prev = window.FBCards.previewCraft(combat.craft);
  $(".craft-name").textContent = prev.title;
  if (combat.craft.length > 0) {
    $("#craft-meta").textContent = prev.meta;
  } else if (selectedHand != null && combat.hand[selectedHand]) {
    const c = combat.hand[selectedHand];
    $("#craft-meta").textContent = `已选手牌「${c.name}」· 点「咏唱打出」释放`;
    $(".craft-name").textContent = c.name;
  } else {
    $("#craft-meta").textContent = prev.meta;
  }

  // hand
  const hand = $("#hand-area");
  hand.innerHTML = "";
  combat.hand.forEach((c, idx) => {
    const el = document.createElement("div");
    el.className = `card ${c.type}` + (selectedHand === idx ? " selected" : "");
    el.innerHTML = `<div class="cname">${c.name}</div><div class="ctype">${c.type === "word" ? "字词" : c.type}<br/>${c.chant || 1}s</div>`;
    el.title = c.desc || "";
    if (c.type === "word") el.classList.add("word");
    el.addEventListener("click", () => onHandClick(idx));
    hand.appendChild(el);
  });

  $("#draw-pile").querySelector("span").textContent = String(combat.draw.length);
  $("#discard-pile").querySelector("span").textContent = String(combat.discard.length);

  // timeline
  const snap = combat.timelineSnapshot(20);
  const et = $("#enemy-tracks");
  et.innerHTML = "";
  snap.enemyTracks.forEach((tr) => {
    const row = document.createElement("div");
    row.className = "track-row";
    row.title = tr.name;
    tr.bars.forEach((b) => {
      const bar = document.createElement("div");
      bar.className = `bar ${b.cls}`;
      bar.style.left = `${b.left}%`;
      bar.style.width = `${Math.min(100 - b.left, b.width)}%`;
      bar.textContent = `${tr.name}:${b.label}`;
      row.appendChild(bar);
    });
    et.appendChild(row);
  });
  if (!snap.enemyTracks.length) et.innerHTML = '<div class="track-row"></div>';

  const pt = $("#player-track");
  pt.innerHTML = "";
  const prow = document.createElement("div");
  prow.className = "track-row";
  snap.playerBars.forEach((b) => {
    if (b.left > 100) return;
    const bar = document.createElement("div");
    bar.className = `bar ${b.cls}`;
    bar.style.left = `${b.left}%`;
    bar.style.width = `${Math.min(100 - b.left, Math.max(2, b.width))}%`;
    bar.textContent = b.label;
    prow.appendChild(bar);
  });
  pt.appendChild(prow);
}

function onHandClick(idx) {
  if (!combat || combat.ended) return;
  // 单击仅选中；通过「咏唱打出」打出（或再点同一张也可快捷打出）
  if (selectedHand === idx) {
    combat.playHand(idx, selectedEnemy);
    selectedHand = null;
    renderCombat();
    return;
  }
  selectedHand = idx;
  renderCombat();
}

// Right-click hand → craft
$("#hand-area").addEventListener("contextmenu", (ev) => {
  ev.preventDefault();
  if (!combat) return;
  const cardEl = ev.target.closest(".card");
  if (!cardEl) return;
  const idx = [...$("#hand-area").children].indexOf(cardEl);
  if (idx < 0) return;
  combat.addToCraft(idx);
  selectedHand = null;
  renderCombat();
});

// Keyboard: space = time flow; C = add selected to craft
document.addEventListener("keydown", (e) => {
  if (e.key === "c" && combat && selectedHand != null) {
    combat.addToCraft(selectedHand);
    selectedHand = null;
    renderCombat();
  }
  if (e.key === " " && combat && screens.combat.classList.contains("active")) {
    e.preventDefault();
    flowTime();
  }
});

// Init recipe list empty; show menu
show("menu");
