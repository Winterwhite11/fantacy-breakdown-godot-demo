/** App shell: menu → prepare / map → combat */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const screens = {
  menu: $("#screen-menu"),
  charselect: $("#screen-charselect"),
  settings: $("#screen-settings"),
  market: $("#screen-market"),
  prepare: $("#screen-prepare"),
  map: $("#screen-map"),
  event: $("#screen-event"),
  combat: $("#screen-combat"),
};

let marketZone = "gear";
let marketState = null;
/** 当前打开的商品详情（挂牌 id） */
let marketDetailId = null;

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
let loadout = window.FBLoadout.ensureTestCollectibles(
  window.FBLoadout.ensureTestBackpacks(window.FBLoadout.createLoadoutState())
);
let dragEquipUid = null;
let dragCollectUid = null;
/** 战后奖励会话 */
let lootSession = null;
/** 本局是否已败北锁定（须回主菜单重开） */
let runFailed = false;
/** 本局跑团资源 */
let runMeta = createRunMeta();
/** 事件会话 */
let eventSession = null;
/** 事件触发的战斗挂起 */
let pendingEventCombat = null;

/** 事件专属选项用的角色 id：pure / royalty / rock / hero */
const FALLBACK_CHARACTERS = [
  { id: "pure", name: "纯白", blurb: "静默旁观的旅人。解锁「童年」等纯白专属事件。", maxHpDelta: 0, startTokens: 0, startBlock: 0 },
  { id: "royalty", name: "王权", blurb: "习惯开条件的谈判者。解锁王权专属交易/施压选项。", maxHpDelta: 0, startTokens: 0, startBlock: 0 },
  { id: "rock", name: "磐石", blurb: "厚重稳健。生命略高，开场护甲。", maxHpDelta: 10, startTokens: 0, startBlock: 4 },
  { id: "hero", name: "豪杰", blurb: "敢打敢冲。解锁豪杰专属挑战选项。", maxHpDelta: 0, startTokens: 0, startBlock: 0 },
];

let pendingCharId = null;
let shopCell = null;
let rewardCell = null;

function listCharacters() {
  return window.FBContent?.CHARACTERS || FALLBACK_CHARACTERS;
}

function characterById(id) {
  return listCharacters().find((c) => c.id === id) || null;
}

function applyCharacterBonuses(char) {
  if (!char) return;
  const b = char.bonuses || char;
  if (b.startTokens) runMeta.tokens += Number(b.startTokens) || 0;
  if (b.maxHpDelta) {
    loadout.runHpBonus = (loadout.runHpBonus || 0) + (Number(b.maxHpDelta) || 0);
  }
  metaHp = maxHpNow();
  if (b.startBlock) runMeta.flags.start_block_bonus = Number(b.startBlock) || 0;
}

function createRunMeta() {
  return {
    tokens: 0,
    inventory: [],
    flags: {},
    character: null,
    seenEvents: [],
    hardWins: 0,
    fightWins: 0,
    runWon: false,
    /** 本局暂存：撤离后才入永久仓库 */
    staging: { cards: [], collectibles: [] },
  };
}

function ensureStaging() {
  if (!runMeta.staging) runMeta.staging = { cards: [], collectibles: [] };
  if (!Array.isArray(runMeta.staging.cards)) runMeta.staging.cards = [];
  if (!Array.isArray(runMeta.staging.collectibles)) runMeta.staging.collectibles = [];
  return runMeta.staging;
}

function stageRunCard(cardId, name, meta = {}) {
  const st = ensureStaging();
  st.cards.push({ cardId, name: name || cardId, at: Date.now(), ...meta });
}

function stageRunCollectible(item) {
  if (!item) return;
  const st = ensureStaging();
  st.collectibles.push(JSON.parse(JSON.stringify(item)));
}

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
  const base = window.FBLoadout.effectiveMaxHp(loadout);
  return base + (Number(loadout?.runHpBonus) || 0);
}

function combatOptsFromLoadout(hp) {
  const L = window.FBLoadout;
  const opts = {
    maxHp: maxHpNow(),
    hp: hp != null ? hp : maxHpNow(),
    deck: L.buildBattleDeck(loadout),
    startBlock: L.startBlockBonus(loadout) + (Number(runMeta.flags?.start_block_bonus) || 0),
    gearIntervals: L.pistolEffects(loadout),
  };
  if (runMeta.flags?.guide_extra_draw) {
    opts.extraDraw = 1;
    runMeta.flags.guide_extra_draw = false;
  }
  if (window.FBContent?.listPlayerResists) {
    const carried = window.FBLoadout.backpackContents?.(loadout) || [];
    opts.playerResists = window.FBContent.listPlayerResists(runMeta, carried);
  }
  return opts;
}

// —— Menu ——
$$(".menu-nav [data-action], #screen-settings [data-action]").forEach((btn) => {
  btn.addEventListener("click", () => {
    unlockAudio();
    const a = btn.dataset.action;
    if (a === "enter") continueOrStartRun();
    if (a === "new-run") startFreshRun(true);
    if (a === "prepare") openPrepare();
    if (a === "market") openMarket();
    if (a === "settings") show("settings");
    if (a === "back-menu") {
      refreshMenuContinueLabel();
      show("menu");
    }
  });
});

/** 仓库战备（市场 / 主菜单整理用）：确保有可编辑 loadout */
function ensureWarehouseLoadout() {
  const vault = window.FBSave?.loadVault?.() || { tokens: 0, loadout: null };
  if (vault.loadout) {
    loadout = window.FBLoadout.ensureTestCollectibles(
      window.FBLoadout.ensureTestBackpacks(JSON.parse(JSON.stringify(vault.loadout)))
    );
  } else {
    loadout = window.FBLoadout.ensureTestCollectibles(
      window.FBLoadout.ensureTestBackpacks(window.FBLoadout.createLoadoutState())
    );
  }
  return loadout;
}

function persistWarehouseLoadout() {
  const vault = window.FBSave?.loadVault?.() || { tokens: 0 };
  window.FBSave?.saveVault?.({
    ...vault,
    loadout: JSON.parse(JSON.stringify(loadout)),
  });
}

function openMarket() {
  if (mapState && !runFailed && !runMeta?.runWon) {
    toast("出征中请先撤离或结束本局后再进市场");
    return;
  }
  ensureWarehouseLoadout();
  marketZone = "gear";
  marketDetailId = null;
  const pack = window.FBMarket?.getState?.();
  marketState = pack?.state || null;
  if (pack?.restock?.restocked) {
    toast(`周一补货：系统商品库存各 +${pack.restock.delta || 3}`);
  }
  show("market");
  renderMarket();
}

function renderMarket() {
  if (!window.FBMarket || !marketState) {
    const pack = window.FBMarket?.getState?.();
    marketState = pack?.state;
  }
  if (!marketState) return;

  const vault = window.FBSave?.loadVault?.() || { tokens: 0 };
  const tokEl = $("#market-vault-tokens");
  if (tokEl) tokEl.textContent = `仓库代币 ${vault.tokens || 0}`;

  const hint = window.FBMarket.nextRestockHint(marketState);
  const restockEl = $("#market-restock-chip");
  if (restockEl) {
    const n = hint.nextAt;
    restockEl.textContent = `下补货 ${n.getMonth() + 1}/${n.getDate()} 00:00 · +${hint.delta}`;
  }

  $$(".market-zone").forEach((b) => {
    b.classList.toggle("active", b.dataset.zone === marketZone);
  });

  const side = $("#market-side-hint");
  const list = $("#market-list");
  if (!list) return;

  if (marketZone === "sell") {
    if (side) {
      side.innerHTML = `<strong>挂牌规则</strong><br/>从仓库托管商品并自定价格。<br/>成交时买方付全价，卖方得 95%（手续费 5%）。<br/>也可「快速寄售」立即回收 95%。`;
    }
    renderMarketSellPanel(list);
    return;
  }
  if (marketZone === "mine") {
    if (side) {
      side.innerHTML = `<strong>我的挂牌</strong><br/>未售出的商品仍托管在市场。<br/>可撤牌退回仓库。`;
    }
    renderMarketMine(list);
    return;
  }

  const zoneMeta = window.FBMarket.ZONES.find((z) => z.id === marketZone);
  if (side) {
    side.innerHTML = `<strong>${zoneMeta?.name || "分区"}</strong><br/>${zoneMeta?.hint || ""}<br/><br/>系统货源每周一补货 +${window.FBMarket.RESTOCK_DELTA}。<br/>定价固定为挂牌价（无动态浮动）。`;
  }
  if (marketDetailId) {
    renderMarketDetail(list, marketDetailId);
    return;
  }

  const rows = window.FBMarket.listingsByZone(marketState, marketZone);
  if (!rows.length) {
    list.innerHTML = `<p class="market-empty">该分区暂无在售</p>`;
    return;
  }
  list.innerHTML = rows
    .map((l) => {
      const src = l.source === "system" ? "系统" : "玩家";
      const fee = window.FBMarket.feeOf(l.price);
      const series = window.FBMarket.getPriceSeries(marketState, l.zone, l.catalogId, l.price);
      const stats = window.FBMarket.priceStats(series, l.price);
      return `<article class="market-row" data-open="${l.id}">
        <div class="market-row-title">
          <strong class="${l.css || ""}">${l.name}</strong>
          <span class="market-row-meta">${src} · 库存 ${l.qty} · 近14日均 ${stats.avg} · 费 ${fee}</span>
        </div>
        <div class="market-row-price">${l.price} 代币</div>
        <div class="market-row-actions">
          <button type="button" data-open="${l.id}">行情/购买</button>
        </div>
      </article>`;
    })
    .join("");
  list.querySelectorAll("[data-open]").forEach((btn) => {
    btn.onclick = (ev) => {
      ev.stopPropagation();
      marketDetailId = btn.dataset.open;
      renderMarket();
    };
  });
}

function renderMarketDetail(list, listingId) {
  const l = (marketState.listings || []).find((x) => x.id === listingId);
  if (!l) {
    marketDetailId = null;
    renderMarket();
    return;
  }
  const series = window.FBMarket.getPriceSeries(marketState, l.zone, l.catalogId, l.price);
  const chart = window.FBMarket.renderPriceChartHtml(series, l.price, {
    title: `${l.name} · 市场价格`,
  });
  const src = l.source === "system" ? "系统货源" : "玩家挂牌";
  const fee = window.FBMarket.feeOf(l.price);
  list.innerHTML = `
    <div class="market-detail">
      <button type="button" class="menu-btn" id="btn-mkt-detail-back">← 返回列表</button>
      <header class="market-detail-head">
        <div>
          <h3 class="${l.css || ""}">${l.name}</h3>
          <p class="muted">${src} · 库存 ${l.qty} · 分区 ${l.zone}</p>
        </div>
        <div class="market-row-price">${l.price} 代币</div>
      </header>
      ${chart}
      <p class="muted">成交手续费 5%（${fee} 代币）· 参考三角洲行情柱，定价仍为自由挂牌</p>
      <div class="loot-actions">
        <button type="button" id="btn-mkt-detail-buy">确认购买</button>
      </div>
    </div>`;
  $("#btn-mkt-detail-back").onclick = () => {
    marketDetailId = null;
    renderMarket();
  };
  $("#btn-mkt-detail-buy").onclick = () => marketBuy(l.id);
}

function marketBuy(listingId) {
  ensureWarehouseLoadout();
  const vault = window.FBSave?.loadVault?.() || { tokens: 0 };
  const res = window.FBMarket.buyListing(marketState, listingId, vault, loadout);
  if (!res.ok) {
    toast(res.reason || "购买失败");
    return;
  }
  window.FBSave.saveVault({ ...vault, loadout: JSON.parse(JSON.stringify(loadout)) });
  window.FBMarket.saveState(marketState);
  toast(
    res.listing?.source === "player"
      ? `购入「${res.listing.name}」· 付 ${res.paid}（卖方净得 ${res.sellerGain}，费 ${res.fee}）`
      : `购入「${res.listing?.name || "商品"}」· 花费 ${res.paid} 代币`
  );
  renderMarket();
}

function renderMarketSellPanel(list) {
  ensureWarehouseLoadout();
  const L = window.FBLoadout;
  const cards = Object.entries(loadout.cardStash || {}).filter(([, n]) => n > 0);
  const gears = loadout.equipStash || [];
  const cols = loadout.collectStash || [];

  list.innerHTML = `
    <div class="market-sell-form">
      <label>分区
        <select id="mkt-sell-zone">
          <option value="cards">卡牌</option>
          <option value="gear">战备</option>
          <option value="collect">收集品</option>
        </select>
      </label>
      <label>商品
        <select id="mkt-sell-item"></select>
      </label>
      <label>挂牌价（代币）
        <input type="number" id="mkt-sell-price" min="1" value="20" />
      </label>
      <p class="muted" id="mkt-sell-fee">成交手续费 5% · 预计到手 —</p>
      <div id="mkt-sell-chart" class="mkt-sell-chart"></div>
      <div class="loot-actions">
        <button type="button" id="btn-mkt-list">挂牌托管</button>
        <button type="button" id="btn-mkt-instant">快速寄售（立即 95%）</button>
      </div>
    </div>
    <p class="muted">挂牌将从仓库扣除商品；撤牌可取回。柱状图为近 14 日市场参考价。</p>`;

  const zoneSel = $("#mkt-sell-zone");
  const itemSel = $("#mkt-sell-item");
  const priceInp = $("#mkt-sell-price");
  const feeLine = $("#mkt-sell-fee");
  const chartBox = $("#mkt-sell-chart");

  function catalogFromOfferRaw(z, raw) {
    if (!raw) return null;
    if (raw.startsWith("card:")) return { zone: z, catalogId: raw.slice(5), name: window.FBCards?.CARD_DEFS?.[raw.slice(5)]?.name };
    if (raw.startsWith("equip:")) {
      const g = gears.find((x) => x.uid === raw.slice(6));
      return g ? { zone: z, catalogId: g.defId, name: g.name } : null;
    }
    if (raw.startsWith("col:")) {
      const c = cols[Number(raw.slice(4))];
      return c ? { zone: z, catalogId: c.uid || c.name, name: c.name } : null;
    }
    return null;
  }

  function refillItems() {
    const z = zoneSel.value;
    itemSel.innerHTML = "";
    if (z === "cards") {
      cards.forEach(([id, n]) => {
        const name = window.FBCards?.CARD_DEFS?.[id]?.name || id;
        itemSel.appendChild(new Option(`${name} ×${n}`, `card:${id}`));
      });
    } else if (z === "gear") {
      gears.forEach((g) => {
        itemSel.appendChild(new Option(`${g.name || g.defId}`, `equip:${g.uid}`));
      });
    } else {
      cols.forEach((c, i) => {
        itemSel.appendChild(new Option(`${c.name} (${c.rarityLabel || c.rarity || ""})`, `col:${i}`));
      });
    }
    if (!itemSel.options.length) {
      itemSel.appendChild(new Option("（仓库无可上架）", ""));
    }
    updateFeeAndChart();
  }

  function updateFeeAndChart() {
    const p = Math.max(1, Math.floor(Number(priceInp.value) || 0));
    const fee = window.FBMarket.feeOf(p);
    const gain = window.FBMarket.sellerProceeds(p);
    feeLine.textContent = `挂牌 ${p} · 手续费 ${fee}（5%）· 成交/寄售到手 ${gain}`;
    const meta = catalogFromOfferRaw(zoneSel.value, itemSel.value);
    if (!meta || !chartBox) {
      if (chartBox) chartBox.innerHTML = "";
      return;
    }
    // 同 catalog 若有在售，用其现价作参考柱
    const live = (marketState.listings || []).find(
      (l) => l.zone === meta.zone && l.catalogId === meta.catalogId && l.qty > 0
    );
    const refPrice = live?.price || p;
    const series = window.FBMarket.getPriceSeries(
      marketState,
      meta.zone,
      meta.catalogId,
      refPrice
    );
    chartBox.innerHTML = window.FBMarket.renderPriceChartHtml(series, p, {
      title: `${meta.name || meta.catalogId} · 市场价格`,
    });
  }

  zoneSel.onchange = refillItems;
  itemSel.onchange = updateFeeAndChart;
  priceInp.oninput = updateFeeAndChart;
  refillItems();

  function parseOffer() {
    const z = zoneSel.value;
    const raw = itemSel.value;
    if (!raw) return null;
    const price = Math.max(1, Math.floor(Number(priceInp.value) || 0));
    if (raw.startsWith("card:")) return { zone: z, offer: { kind: "card", cardId: raw.slice(5), price } };
    if (raw.startsWith("equip:")) return { zone: z, offer: { kind: "equip", equipUid: raw.slice(6), price } };
    if (raw.startsWith("col:")) {
      return { zone: z, offer: { kind: "collectible", collectIndex: Number(raw.slice(4)), price } };
    }
    return null;
  }

  $("#btn-mkt-list").onclick = () => {
    const parsed = parseOffer();
    if (!parsed) {
      toast("请选择商品");
      return;
    }
    const vault = window.FBSave.loadVault();
    const res = window.FBMarket.listFromWarehouse(
      marketState,
      parsed.zone,
      parsed.offer,
      loadout
    );
    if (!res.ok) {
      toast(res.reason || "挂牌失败");
      return;
    }
    persistWarehouseLoadout();
    toast(`已挂牌「${res.listing.name}」· 成交预计到手 ${res.proceedsPreview}`);
    marketZone = "mine";
    renderMarket();
  };

  $("#btn-mkt-instant").onclick = () => {
    const parsed = parseOffer();
    if (!parsed) {
      toast("请选择商品");
      return;
    }
    const vault = window.FBSave.loadVault();
    const res = window.FBMarket.instantSell(
      marketState,
      parsed.zone,
      parsed.offer,
      loadout,
      vault
    );
    if (!res.ok) {
      toast(res.reason || "寄售失败");
      return;
    }
    window.FBSave.saveVault({ ...vault, loadout: JSON.parse(JSON.stringify(loadout)) });
    toast(`寄售「${res.name}」· 到手 ${res.gain}（手续费 ${res.fee}）`);
    renderMarket();
  };
}

function renderMarketMine(list) {
  const mine = (marketState.listings || []).filter(
    (l) => l.source === "player" && l.sellerId === "local"
  );
  if (!mine.length) {
    list.innerHTML = `<p class="market-empty">暂无挂牌</p>`;
    return;
  }
  list.innerHTML = mine
    .map((l) => {
      const fee = window.FBMarket.feeOf(l.price);
      return `<article class="market-row">
        <div class="market-row-title">
          <strong>${l.name}</strong>
          <span class="market-row-meta">挂牌中 · 库存 ${l.qty} · 费 ${fee}</span>
        </div>
        <div class="market-row-price">${l.price} 代币</div>
        <div class="market-row-actions">
          <button type="button" data-cancel="${l.id}">撤牌</button>
        </div>
      </article>`;
    })
    .join("");
  list.querySelectorAll("[data-cancel]").forEach((btn) => {
    btn.onclick = () => {
      ensureWarehouseLoadout();
      const res = window.FBMarket.cancelListing(marketState, btn.dataset.cancel, loadout);
      if (!res.ok) {
        toast(res.reason || "撤牌失败");
        return;
      }
      persistWarehouseLoadout();
      toast(`已撤牌「${res.listing.name}」退回仓库`);
      renderMarket();
    };
  });
}

$$(".market-zone").forEach((btn) => {
  btn.addEventListener("click", () => {
    marketZone = btn.dataset.zone;
    marketDetailId = null;
    renderMarket();
  });
});

$("#btn-market-back")?.addEventListener("click", () => {
  persistWarehouseLoadout();
  refreshMenuContinueLabel();
  show("menu");
});

function refreshMenuContinueLabel() {
  const enter = $("#btn-enter-run");
  if (!enter) return;
  const has = window.FBSave?.hasSave?.();
  enter.textContent = has ? "继续游戏" : "进入游戏";
}

function persistRun(extra = {}) {
  if (!window.FBSave || runMeta?.runWon) return;
  if (runFailed) {
    window.FBSave.clearSave();
    return;
  }
  if (!mapState) return;
  window.FBSave.saveRun({
    mapState,
    loadout,
    runMeta,
    metaHp,
    runFailed,
    ...extra,
  });
  refreshMenuContinueLabel();
}

function applyLoadedRun(data) {
  mapState = data.mapState;
  loadout = window.FBLoadout.ensureTestCollectibles(
    window.FBLoadout.ensureTestBackpacks(data.loadout || window.FBLoadout.createLoadoutState())
  );
  runMeta = { ...createRunMeta(), ...(data.runMeta || {}) };
  metaHp = data.metaHp != null ? data.metaHp : maxHpNow();
  runFailed = !!data.runFailed;
  eventSession = null;
  pendingEventCombat = null;
  lootSession = null;
}

function continueOrStartRun() {
  const data = window.FBSave?.loadRun?.();
  if (data && !data.runFailed && !data.runMeta?.runWon) {
    applyLoadedRun(data);
    toast("已读取本局进度");
    updateMapHp();
    show("map");
    paintMap();
    playBgm("拓宇者2.mp3");
    return;
  }
  openCharacterSelect();
}

function startFreshRun(confirmReplace) {
  if (confirmReplace && window.FBSave?.hasSave?.()) {
    const ok = window.confirm("将清除当前存档并新开一局，确定吗？");
    if (!ok) return;
  }
  window.FBSave?.clearSave?.();
  openCharacterSelect();
}

function openCharacterSelect() {
  pendingCharId = null;
  const grid = $("#char-grid");
  const confirmBtn = $("#btn-char-confirm");
  if (confirmBtn) confirmBtn.disabled = true;
  if (grid) {
    grid.innerHTML = "";
    listCharacters().forEach((ch) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "char-card";
      btn.dataset.id = ch.id;
      btn.innerHTML = `<strong>${ch.name}</strong><span class="muted">${ch.blurb || ""}</span>`;
      btn.addEventListener("click", () => {
        pendingCharId = ch.id;
        $$(".char-card").forEach((el) => el.classList.toggle("selected", el.dataset.id === ch.id));
        if (confirmBtn) confirmBtn.disabled = false;
      });
      grid.appendChild(btn);
    });
  }
  show("charselect");
}

function startRunWithCharacter(charId) {
  const char = characterById(charId);
  runFailed = false;
  runMeta = createRunMeta();
  runMeta.character = char?.id || charId || null;
  const vault = window.FBSave?.loadVault?.() || { tokens: 0, loadout: null };
  if (vault.loadout) {
    loadout = window.FBLoadout.ensureTestCollectibles(
      window.FBLoadout.ensureTestBackpacks(JSON.parse(JSON.stringify(vault.loadout)))
    );
  } else {
    loadout = window.FBLoadout.ensureTestCollectibles(
      window.FBLoadout.ensureTestBackpacks(window.FBLoadout.createLoadoutState())
    );
  }
  loadout.runHpBonus = 0;
  applyCharacterBonuses(char);
  runMeta.tokens = 0;
  const pending = window.FBSave?.consumePendingNextRun?.();
  if (pending && window.FBContent?.applyNextRunBonuses) {
    const notes = window.FBContent.applyNextRunBonuses(runMeta, loadout, pending);
    (notes || []).forEach((n) => toast(n));
  }
  metaHp = maxHpNow();
  mapState = window.FBMap.createMapState();
  eventSession = null;
  pendingEventCombat = null;
  lootSession = null;
  // 出征：战备从仓库取出；败北不归还（永久损失）
  window.FBSave?.saveVault?.({
    version: vault.version || 1,
    tokens: vault.tokens || 0,
    loadout: null,
  });
  persistRun();
  updateMapHp();
  show("map");
  paintMap();
  playBgm("拓宇者2.mp3");
  toast(`以「${char?.name || charId}」出发 · 本局代币 ${runMeta.tokens} · 仓库 ${vault.tokens || 0}（战备已出征）`);
}

function startRun() {
  // 兼容旧入口：无角色时打开选择
  openCharacterSelect();
}

function updateMapHp() {
  $("#map-hp").textContent = `HP ${metaHp}/${maxHpNow()}`;
  const tok = $("#map-tokens");
  if (tok) tok.textContent = `本局代币 ${runMeta.tokens || 0}`;
  const vaultEl = $("#map-vault");
  if (vaultEl) {
    const v = window.FBSave?.loadVault?.();
    vaultEl.textContent = `仓库代币 ${v?.tokens ?? 0}`;
  }
  const items = $("#map-items");
  if (items) {
    const n = window.FBLoadout.collectibleCount(loadout);
    const st = ensureStaging();
    items.textContent = `行囊 ${n} · 暂存 ${st.cards.length + st.collectibles.length}`;
  }
  const ch = $("#map-char");
  if (ch) {
    const c = characterById(runMeta.character);
    ch.textContent = c ? `身份 ${c.name}` : "身份 —";
  }
  const ext = $("#map-extract");
  if (ext) {
    ext.textContent = "撤离：随时可用";
    ext.classList.add("ok");
  }
  const tip = $("#map-tip");
  if (tip && window.FBMap.extractProgressText) {
    tip.title = window.FBMap.extractProgressText(runMeta);
  }
}

function paintMap() {
  window.FBMap.renderMap($("#map-board"), mapState, onMapClick);
}

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
  persistRun();
  refreshMenuContinueLabel();
  show("menu");
});

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
  if (runFailed) {
    toast("本局已败北，请返回主菜单重新进入游戏");
    return;
  }
  if (runMeta.runWon) {
    toast("本局已通关，请新开一局");
    return;
  }
  const res = window.FBMap.tryMove(mapState, x, y);
  if (!res.ok) {
    toast(res.reason);
    return;
  }
  paintMap();
  const cell = res.cell;
  if (!cell || !cell.type || cell.cleared) {
    persistRun();
    return;
  }

  if (cell.type === "fight" || cell.type === "hard") {
    enterCombat(cell, cell.type === "hard" ? "hard" : "normal");
  } else if (cell.type === "event") {
    openEvent(cell);
  } else if (cell.type === "reward") {
    openRewardNode(cell);
  } else if (cell.type === "shop") {
    openShop(cell);
  } else if (cell.type === "extract") {
    tryExtract(cell);
  }
}

function hasShopHalf() {
  return (
    !!runMeta.flags?.shop_half ||
    (runMeta.inventory || []).some((it) => {
      const eff = window.FBContent?.getItemEffect?.(it.id || it.itemId);
      return eff?.type === "flag_echo" && eff.flag === "shop_half";
    })
  );
}

function shopPrice(base) {
  return Math.max(1, Math.floor(base * (hasShopHalf() ? 0.5 : 1)));
}

function ensureNodeOverlay(id, titleHtml) {
  let ov = document.getElementById(id);
  if (ov) return ov;
  ov = document.createElement("div");
  ov.id = id;
  ov.className = "combat-overlay node-overlay";
  ov.innerHTML = `
    <div class="overlay-card node-card">
      <h2>${titleHtml}</h2>
      <p class="muted" id="${id}-sub"></p>
      <div id="${id}-body" class="node-overlay-body"></div>
      <div class="loot-actions" id="${id}-actions"></div>
    </div>`;
  document.body.appendChild(ov);
  return ov;
}

function openRewardNode(cell) {
  rewardCell = cell;
  const ov = ensureNodeOverlay("reward-overlay", "补给点");
  const sub = ov.querySelector("#reward-overlay-sub");
  const body = ov.querySelector("#reward-overlay-body");
  const actions = ov.querySelector("#reward-overlay-actions");
  if (sub) sub.textContent = "整理行装，领取补给。";
  body.innerHTML = `
    <div class="loot-offer"><span class="loot-pill">+8 生命</span><span class="loot-pill">+6 代币</span></div>
    <p class="muted">可选：再拿一件白色/绿色小收集品（或跳过）。</p>`;
  actions.innerHTML = `
    <button type="button" id="btn-reward-take-col">带走小收集品</button>
    <button type="button" id="btn-reward-skip-col">只要补给</button>`;
  ov.classList.remove("hidden");
  ov.style.display = "grid";
  ov.style.zIndex = "45";

  const finish = (takeCol) => {
    metaHp = Math.min(maxHpNow(), metaHp + 8);
    runMeta.tokens += 6;
    if (takeCol && window.FBLoot?.makeCollectible) {
      const rarity = Math.random() < 0.55 ? "white" : "green";
      const item = window.FBLoot.makeCollectible(rarity);
      const res = window.FBLoadout.tryCarryCollectible(loadout, item);
      if (res.placed) toast(`获得「${item.name}」`);
      else if (res.noBag) {
        window.FBLoadout.forceCollectibleAsCurse(loadout, item);
        toast(`无背包，「${item.name}」诅咒入组`);
      } else toast(`背包已满，放弃「${item.name}」`);
    }
    if (rewardCell) {
      if (!consumeFreeNodePick(rewardCell, "奖励")) {
        rewardCell.cleared = true;
      }
    }
    rewardCell = null;
    ov.classList.add("hidden");
    ov.style.display = "";
    updateMapHp();
    paintMap();
    persistRun();
  };
  $("#btn-reward-take-col").onclick = () => finish(true);
  $("#btn-reward-skip-col").onclick = () => finish(false);
}

function openShop(cell) {
  shopCell = cell;
  const ov = ensureNodeOverlay("shop-overlay", "流浪商店");
  const half = hasShopHalf();
  const sub = ov.querySelector("#shop-overlay-sub");
  const body = ov.querySelector("#shop-overlay-body");
  const actions = ov.querySelector("#shop-overlay-actions");
  if (sub) sub.textContent = half ? `半价生效 · 持有 ${runMeta.tokens} 代币` : `持有 ${runMeta.tokens} 代币`;

  const offers = [
    { id: "heal", label: `包扎回血 +12`, base: 8 },
    { id: "card", label: `随机卡牌入仓库`, base: 12 },
    { id: "col", label: `随机蓝色收集品`, base: 16 },
  ];

  body.innerHTML = offers
    .map((o) => {
      const price = shopPrice(o.base);
      return `<button type="button" class="shop-offer" data-id="${o.id}" data-price="${price}">
        <span>${o.label}</span><span class="loot-pill">${price} 代币</span></button>`;
    })
    .join("");
  actions.innerHTML = `<button type="button" id="btn-shop-leave">离开商店</button>`;
  ov.classList.remove("hidden");
  ov.style.display = "grid";
  ov.style.zIndex = "45";

  body.querySelectorAll(".shop-offer").forEach((btn) => {
    btn.onclick = () => buyShopOffer(btn.dataset.id, Number(btn.dataset.price) || 0, ov);
  });
  $("#btn-shop-leave").onclick = () => {
    if (shopCell) shopCell.cleared = true;
    shopCell = null;
    if (runMeta.flags?.shop_half) runMeta.flags.shop_half = false;
    ov.classList.add("hidden");
    ov.style.display = "";
    updateMapHp();
    paintMap();
    persistRun();
  };
}

function buyShopOffer(id, price, ov) {
  if (runMeta.tokens < price) {
    toast("代币不足");
    return;
  }
  runMeta.tokens -= price;
  if (id === "heal") {
    metaHp = Math.min(maxHpNow(), metaHp + 12);
    toast("包扎完成，生命 +12");
  } else if (id === "card") {
    const card = window.FBLoot?.rollRewardCard?.() || { cardId: "period", name: "。" };
    const res = window.FBLoadout.addRewardCardToDeck(loadout, card.cardId);
    if (res.toStash) {
      loadout.cardStash[card.cardId] = Math.max(0, (loadout.cardStash[card.cardId] || 0) - 1);
      if (!loadout.cardStash[card.cardId]) delete loadout.cardStash[card.cardId];
      stageRunCard(card.cardId, card.name, { overflowOnly: true });
      toast(`购得「${card.name || card.cardId}」→ 本局暂存`);
    } else {
      stageRunCard(card.cardId, card.name, { inDeck: true });
      toast(`购得「${card.name || card.cardId}」→ 本局牌组`);
    }
  } else if (id === "col") {
    const item = window.FBLoot.makeCollectible("blue");
    const res = window.FBLoadout.tryCarryCollectible(loadout, item);
    if (res.placed) {
      stageRunCollectible({ ...item, inBag: true });
      toast(`购得「${item.name}」→ 背包`);
    } else if (res.noBag) {
      stageRunCollectible(item);
      toast(`无背包，「${item.name}」暂存（撤离后入仓）`);
    } else toast(`背包满，未能带走「${item.name}」`);
  }
  updateMapHp();
  persistRun();
  // refresh prices / tokens line
  openShop(shopCell);
}

function tryExtract(cell) {
  cell.cleared = true;
  completeRunVictory();
}

/** 败北：本局携带战备不退仓，暂存作废；仓库代币保留 */
function applyRunFailureLoss() {
  const vault = window.FBSave?.loadVault?.() || { tokens: 0 };
  window.FBSave?.saveVault?.({
    version: vault.version || 1,
    tokens: Math.max(0, Number(vault.tokens) || 0),
    loadout: null,
  });
  if (runMeta) {
    runMeta.staging = { cards: [], collectibles: [] };
    runMeta.tokens = 0;
  }
  loadout = window.FBLoadout.ensureTestCollectibles(
    window.FBLoadout.ensureTestBackpacks(window.FBLoadout.createLoadoutState())
  );
  loadout.runHpBonus = 0;
}

function completeRunVictory() {
  runMeta.runWon = true;
  const st = ensureStaging();
  (st.cards || []).forEach((c) => {
    const id = c.cardId || c;
    if (!id) return;
    // 已进本局牌组的随 loadout 快照保存；仅溢出暂存的写入卡牌仓库
    if (c.overflowOnly) window.FBLoadout.addRewardCardToStash(loadout, id);
  });
  (st.collectibles || []).forEach((item) => {
    if (!item || item.inBag) return;
    loadout.collectStash = loadout.collectStash || [];
    loadout.collectStash.push(item);
  });
  const banked = window.FBSave?.bankRunExtract?.({
    tokens: runMeta.tokens || 0,
    loadout: JSON.parse(JSON.stringify(loadout)),
  }) || { added: runMeta.tokens || 0, vault: { tokens: 0 } };

  const nextBonus = window.FBContent?.collectNextRunBonuses?.(runMeta);
  if (nextBonus) {
    window.FBSave?.savePendingNextRun?.(nextBonus);
  }
  window.FBSave?.clearSave?.();
  showRunClearOverlay(nextBonus, banked);
}

function showRunClearOverlay(nextBonus, banked) {
  let ov = $("#run-clear-overlay");
  if (!ov) {
    ov = document.createElement("div");
    ov.id = "run-clear-overlay";
    ov.className = "combat-overlay";
    ov.innerHTML = `
      <div class="overlay-card">
        <h2>撤离成功</h2>
        <p id="run-clear-body"></p>
        <button type="button" id="btn-run-clear-ok">返回主菜单</button>
      </div>`;
    document.body.appendChild(ov);
    ov.querySelector("#btn-run-clear-ok").addEventListener("click", () => {
      ov.classList.add("hidden");
      refreshMenuContinueLabel();
      show("menu");
      playBgm("拓宇者2.mp3");
    });
  }
  const body = ov.querySelector("#run-clear-body");
  if (body) {
    const added = banked?.added ?? 0;
    const vaultTok = banked?.vault?.tokens ?? 0;
    const st = ensureStaging();
    let text =
      `带出代币 +${added} → 仓库共 ${vaultTok} · 暂存卡 ${st.cards.length} / 收集品 ${st.collectibles.length} 已入仓 · ` +
      `精英 ${runMeta.hardWins} · 普通 ${runMeta.fightWins}`;
    if (nextBonus) {
      const bits = [];
      if (nextBonus.startTokens) bits.push(`下局代币 +${nextBonus.startTokens}`);
      if (nextBonus.maxHpDelta) bits.push(`下局生命 +${nextBonus.maxHpDelta}`);
      if (nextBonus.startBlock) bits.push(`下局开战护甲 +${nextBonus.startBlock}`);
      if (bits.length) text += ` · ${bits.join(" · ")}`;
    }
    body.textContent = text;
  }
  ov.classList.remove("hidden");
  ov.style.display = "grid";
  ov.style.zIndex = "50";
}

function enterCombat(cell, pool = "normal", fromEvent = null) {
  const enc = pool === "easy"
    ? window.FBEncounters.pickEasyEncounter?.() || window.FBEncounters.pickRandomEncounter()
    : pool === "hard"
      ? window.FBEncounters.pickHardEncounter?.() || window.FBEncounters.pickRandomEncounter()
      : window.FBEncounters.pickNormalEncounter?.() || window.FBEncounters.pickRandomEncounter();
  const isHardPool = pool === "hard" || enc?.pool === "hard";
  show("combat");
  selectedHand = null;
  selectedEnemy = null;
  $("#combat-overlay").classList.add("hidden");
  $("#loot-overlay")?.classList.add("hidden");
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
      if (won) {
        if (!fromEvent) {
          if (isHardPool) runMeta.hardWins = (runMeta.hardWins || 0) + 1;
          else runMeta.fightWins = (runMeta.fightWins || 0) + 1;
          updateMapHp();
        }
        if (fromEvent) {
          $("#overlay-body").textContent = `击败了 ${enc.name}。结算事件奖励。`;
          $("#btn-overlay-ok").textContent = "继续";
          $("#btn-overlay-ok").dataset.next = "event-combat-win";
          ov.classList.remove("hidden");
        } else {
          if (cell) cell.cleared = true;
          try {
            openCombatLoot(enc, { hard: isHardPool });
          } catch (err) {
            console.error("openCombatLoot failed", err);
            fallbackCombatLoot(enc, err);
          }
        }
      } else {
        runFailed = true;
        metaHp = 0;
        applyRunFailureLoss();
        updateMapHp();
        pendingEventCombat = null;
        eventSession = null;
        window.FBSave?.clearSave?.();
        refreshMenuContinueLabel();
        $("#overlay-body").textContent =
          "生命归零。本局携带的牌组/装备/行囊已永久损失，不会退回仓库。请返回主菜单重新整备。";
        $("#btn-overlay-ok").textContent = "返回主菜单";
        $("#btn-overlay-ok").dataset.next = "menu";
        ov.classList.remove("hidden");
      }
    },
  });
  const opts = combatOptsFromLoadout(metaHp);
  combat.start(enc, opts);
  applyBattleStartContentEffects();
  if (opts.extraDraw) {
    combat._drawOne(true);
    combat.log("向导效果：额外抽 1 张牌");
    renderCombat();
  }
  playBgm("战斗.mp3");
}

/** 背包收集品 + 事件道具：开战瞬间效果 */
function applyBattleStartContentEffects() {
  if (!combat || !window.FBContent) return;
  const carried = window.FBLoadout.backpackContents?.(loadout) || [];
  const notes = [];

  const applyEnemyStatus = (eff) => {
    const enemies = (combat.enemies || []).filter((e) => !e.dead);
    if (!enemies.length) return;
    const targets =
      eff.target === "random"
        ? [enemies[Math.floor(Math.random() * enemies.length)]]
        : enemies;
    targets.forEach((en) => {
      const key = eff.status;
      if (!key) return;
      en[key] = (en[key] || 0) + (Number(eff.amount) || 0);
    });
    notes.push(eff.desc || `${eff.status}+${eff.amount}`);
  };

  carried.forEach((item) => {
    const eff = window.FBContent.getCollectibleEffect(item);
    if (!eff || eff.type === "noop") return;
    if (eff.type === "battle_start_enemy_status") applyEnemyStatus(eff);
    if (eff.type === "start_block") {
      combat.player.block = (combat.player.block || 0) + (Number(eff.amount) || 0);
      notes.push(eff.desc || `开战护甲 +${eff.amount}`);
    }
  });

  (runMeta.inventory || []).forEach((it) => {
    const eff = window.FBContent.getItemEffect(it.id || it.itemId);
    if (eff?.type === "start_block") {
      combat.player.block = (combat.player.block || 0) + (Number(eff.amount) || 0);
      notes.push(eff.desc || `道具护甲 +${eff.amount}`);
    }
  });

  if (notes.length) {
    notes.forEach((n) => combat.log(n));
    renderCombat();
  }
}

// —— 整理战备 ——
function openPrepare() {
  // 主菜单整理：编辑永久仓库快照；局内整理：编辑本局 loadout
  if (!mapState || runFailed || runMeta?.runWon) {
    const vault = window.FBSave?.loadVault?.();
    if (vault?.loadout) {
      loadout = window.FBLoadout.ensureTestCollectibles(
        window.FBLoadout.ensureTestBackpacks(JSON.parse(JSON.stringify(vault.loadout)))
      );
    }
  }
  window.FBLoadout.ensureTestBackpacks(loadout);
  window.FBLoadout.ensureTestCollectibles(loadout);
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

$("#btn-prep-back").addEventListener("click", () => {
  if (!mapState || runFailed || runMeta?.runWon) {
    const vault = window.FBSave?.loadVault?.() || { tokens: 0 };
    window.FBSave?.saveVault?.({
      ...vault,
      loadout: JSON.parse(JSON.stringify(loadout)),
    });
    toast("战备已写入永久仓库");
  } else {
    persistRun();
  }
  show("menu");
});

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
  const colN = L.collectibleCount(loadout);
  $("#prep-summary").textContent =
    `牌组 ${deckN} · 卡牌仓库 ${stashN} · 装备价值 ${equippedValue()} · 收集品 ${colN}`;
  $("#equip-hp-preview").textContent = `生命 ${L.effectiveMaxHp(loadout)}`;
  $("#equip-value-preview").textContent = `已装备价值 ${equippedValue()}`;
  $("#card-stash-count").textContent = `${stashN} 张`;
  $("#deck-count").textContent =
    `${deckN} / ${L.DECK_SIZE_MAX} 张` + (deckN < L.DECK_SIZE_MIN ? `（开战将补标点至 ${L.DECK_SIZE_MIN}）` : "");
  renderEquipSlots();
  renderEquipStash();
  renderBackpackPanel();
  renderCardStash();
  renderDeckList();
  renderCollectTab();
  // 战备变更写入存档（若已有地图进度）
  if (mapState && !runFailed && !runMeta?.runWon) persistRun();
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
    if (defs[id]?.type === "curse" || String(id).startsWith("curse_")) return;
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
    const isCurse = String(id).startsWith("curse_") || def.type === "curse";
    const row = document.createElement("div");
    row.className = "deck-row" + (isCurse ? " curse-row" : "");
    row.innerHTML = `
      <span class="deck-row-name">${def.name}${isCurse ? " · 诅咒" : ""}</span>
      <span class="deck-row-count">×${n}</span>
      <button type="button" class="deck-row-btn" title="${isCurse ? "销毁诅咒" : "移回仓库"}">−</button>`;
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

function bindBackpackDropTarget(el) {
  el.addEventListener("dragover", (ev) => {
    ev.preventDefault();
    el.classList.add("drag-over");
  });
  el.addEventListener("dragleave", () => el.classList.remove("drag-over"));
  el.addEventListener("drop", (ev) => {
    ev.preventDefault();
    el.classList.remove("drag-over");
    const uid = ev.dataTransfer.getData("text/collect-uid") || dragCollectUid;
    if (!uid) return;
    const idx = loadout.collectStash.findIndex((c) => c.uid === uid);
    if (idx < 0) return;
    const res = window.FBLoadout.putCollectibleFromStash(loadout, idx);
    if (!res.ok) toast(res.reason);
    renderPrepare();
  });
}

function renderBackpackGrid(gridEl, { large = false, allowTake = true } = {}) {
  const L = window.FBLoadout;
  if (!gridEl) return;
  gridEl.innerHTML = "";
  gridEl.classList.toggle("large", !!large);
  const bag = L.equippedBackpack(loadout);
  const cap = L.backpackCapacity(loadout);
  const contents = L.backpackContents(loadout);
  gridEl.dataset.cap = String(cap || 0);
  if (!bag || cap <= 0) {
    gridEl.removeAttribute("data-cap");
    gridEl.innerHTML = '<p class="prep-hint">请先在上方「背包」槽穿戴背包，此处显示收集品格位</p>';
    return;
  }
  for (let i = 0; i < cap; i++) {
    const cell = document.createElement("div");
    const item = contents[i];
    cell.className = "backpack-cell" + (item ? ` filled ${item.css || ""}` : "");
    cell.dataset.bagIndex = String(i);
    cell.setAttribute("role", "listitem");
    if (item) {
      cell.innerHTML = `<span class="col-name">${item.name}</span>`;
      cell.title = allowTake ? "双击放回收集品仓库" : item.desc || item.name;
      if (allowTake) {
        cell.addEventListener("dblclick", () => {
          L.takeCollectibleFromBag(loadout, i);
          renderPrepare();
        });
      }
    } else {
      cell.innerHTML = "";
      cell.title = "空槽 · 可拖入收集品";
      cell.setAttribute("aria-label", "空槽");
      bindBackpackDropTarget(cell);
    }
    gridEl.appendChild(cell);
  }
}

function renderBackpackPanel() {
  const L = window.FBLoadout;
  const bag = L.equippedBackpack(loadout);
  const label = $("#backpack-cap-label");
  const panel = $("#backpack-panel");
  if (label) {
    label.textContent = bag
      ? `${bag.name} · ${L.backpackContents(loadout).length}/${L.backpackCapacity(loadout)}`
      : "未装备背包";
  }
  if (panel) panel.classList.toggle("has-bag", !!bag);
  renderBackpackGrid($("#backpack-grid"), { allowTake: true });
}

function bindShowcaseDrop(el, zone, slotIndex) {
  el.addEventListener("dragover", (ev) => {
    ev.preventDefault();
    el.classList.add("drag-over");
  });
  el.addEventListener("dragleave", () => el.classList.remove("drag-over"));
  el.addEventListener("drop", (ev) => {
    ev.preventDefault();
    el.classList.remove("drag-over");
    const uid = ev.dataTransfer.getData("text/collect-uid") || dragCollectUid;
    if (!uid) return;
    const idx = loadout.collectStash.findIndex((c) => c.uid === uid);
    if (idx < 0) return;
    const res = window.FBLoadout.putCollectibleOnShowcase(loadout, idx, zone, slotIndex);
    if (!res.ok) toast(res.reason);
    renderPrepare();
  });
}

function renderShowcaseSlot(item, zone, slotIndex) {
  const el = document.createElement("div");
  el.className = "showcase-slot" + (item ? ` filled ${item.css || ""}` : " empty");
  el.dataset.zone = zone;
  el.dataset.slot = String(slotIndex);
  if (item) {
    el.draggable = false;
    el.innerHTML = `
      <div class="col-name">${item.name}</div>
      <div class="col-meta">${item.rarityLabel || item.rarity || ""}</div>
      <div class="col-value">价值 ${item.value ?? "—"}</div>`;
    el.title = "单击取下，放回一般仓库";
    el.addEventListener("click", () => {
      const res = window.FBLoadout.takeCollectibleFromShowcase(loadout, zone, slotIndex);
      if (!res.ok) toast(res.reason);
      renderPrepare();
    });
  } else {
    el.title = zone === "unique" ? "拖入唯一收集品" : "拖入紫 / 金 / 唯一收集品";
    bindShowcaseDrop(el, zone, slotIndex);
  }
  return el;
}

function renderCollectTab() {
  const L = window.FBLoadout;
  L.ensureTestCollectibles(loadout);
  const stashGrid = $("#collect-stash-grid");
  const bagLabel = $("#collect-bag-label");
  const stashCount = $("#collect-stash-count");
  const uniqueGrid = $("#showcase-unique-grid");
  const premiumGrid = $("#showcase-premium-grid");
  if (!stashGrid) return;

  const all = L.allCollectibles(loadout);
  const totalVal = window.FBLoot?.totalCollectValue?.(all) || all.reduce((s, it) => s + (it.value || 0), 0);
  const totalEl = $("#collect-total-count");
  const valueEl = $("#collect-total-value");
  if (totalEl) totalEl.textContent = `${L.collectibleCount(loadout)} 件`;
  if (valueEl) valueEl.textContent = `总价值 ${totalVal}`;

  if (stashCount) stashCount.textContent = `${(loadout.collectStash || []).length} 件`;
  const bag = L.equippedBackpack(loadout);
  if (bagLabel) {
    bagLabel.textContent = bag
      ? `${bag.name} ${L.backpackContents(loadout).length}/${L.backpackCapacity(loadout)}`
      : "未装备";
  }

  // 展台
  if (uniqueGrid) {
    uniqueGrid.innerHTML = "";
    const row = loadout.collectShowcase?.unique || [null, null];
    row.forEach((item, i) => uniqueGrid.appendChild(renderShowcaseSlot(item, "unique", i)));
  }
  if (premiumGrid) {
    premiumGrid.innerHTML = "";
    const row = loadout.collectShowcase?.premium || [];
    for (let i = 0; i < 6; i++) {
      premiumGrid.appendChild(renderShowcaseSlot(row[i] || null, "premium", i));
    }
  }

  // 仓库
  stashGrid.innerHTML = "";
  (loadout.collectStash || []).forEach((item) => {
    const el = document.createElement("div");
    el.className = `collect-stash-item ${item.css || ""}`;
    el.draggable = true;
    el.dataset.uid = item.uid;
    const canShow = window.FBLoot?.isShowcaseRarity?.(item.rarity);
    el.innerHTML = `
      <div class="col-name">${item.name}</div>
      <div class="col-meta">${item.rarityLabel || item.rarity || "收集品"}</div>
      <div class="col-value">价值 ${item.value ?? "—"}</div>
      <div class="col-actions">
        ${canShow ? '<button type="button" data-act="show">上架</button>' : ""}
        <button type="button" data-act="bag">装包</button>
      </div>`;
    el.title = canShow ? "可上架展台，或装入背包" : "可装入背包";
    el.addEventListener("dragstart", (ev) => {
      dragCollectUid = item.uid;
      ev.dataTransfer.setData("text/collect-uid", item.uid);
      el.classList.add("dragging");
    });
    el.addEventListener("dragend", () => {
      dragCollectUid = null;
      el.classList.remove("dragging");
    });
    el.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const i = loadout.collectStash.findIndex((c) => c.uid === item.uid);
        if (i < 0) return;
        if (btn.dataset.act === "show") {
          const res = L.autoDisplayFromStash(loadout, i);
          if (!res.ok) toast(res.reason);
        } else {
          const res = L.putCollectibleFromStash(loadout, i);
          if (!res.ok) toast(res.reason);
        }
        renderPrepare();
      });
    });
    stashGrid.appendChild(el);
  });
  if (!(loadout.collectStash || []).length) {
    stashGrid.innerHTML = '<p class="prep-hint">仓库为空——高稀有已在展台，或等待战后掉落</p>';
  }

  renderBackpackGrid($("#collect-backpack-grid"), { large: true, allowTake: true });
}

// —— 战后奖励 ——
function ensureLootOverlay() {
  let ov = $("#loot-overlay");
  if (ov) return ov;
  const host = $("#screen-combat .combat-root") || $("#screen-combat") || document.body;
  ov = document.createElement("div");
  ov.id = "loot-overlay";
  ov.className = "combat-overlay loot-overlay hidden";
  ov.innerHTML = `
    <div class="loot-card">
      <h2 id="loot-title">战斗奖励</h2>
      <p class="loot-tier muted" id="loot-tier"></p>
      <div class="loot-section" id="loot-gold-row"></div>
      <div class="loot-section" id="loot-card-row"></div>
      <div class="loot-section" id="loot-collect-row"></div>
      <div class="loot-section loot-swap hidden" id="loot-swap-row">
        <p class="loot-swap-hint">背包已满。选择一格替换，或放弃携带 / 挤入诅咒牌。</p>
        <div class="backpack-grid loot-swap-grid" id="loot-swap-grid"></div>
        <div class="loot-actions">
          <button type="button" id="btn-loot-curse">挤入牌组（诅咒）</button>
          <button type="button" id="btn-loot-skip-collect">放弃收集品</button>
        </div>
      </div>
      <div class="loot-actions loot-foot">
        <button type="button" id="btn-loot-done" class="loot-done">继续行程</button>
      </div>
    </div>`;
  host.appendChild(ov);
  $("#btn-loot-done")?.addEventListener("click", finishLootAndReturnMap);
  return ov;
}

function fallbackCombatLoot(enc, err) {
  const gold = 8 + Math.floor(Math.random() * 6);
  runMeta.tokens += gold;
  updateMapHp();
  const ov = $("#combat-overlay");
  $("#overlay-title").textContent = "胜利";
  $("#overlay-body").textContent =
    `击败了 ${enc?.name || "敌人"}。获得 ${gold} 代币。（奖励面板异常：${err?.message || "未知"}）`;
  $("#btn-overlay-ok").textContent = "返回地图";
  $("#btn-overlay-ok").dataset.next = "map";
  ov.classList.remove("hidden");
}

function openCombatLoot(enc, opts = {}) {
  if (!window.FBLoot) {
    throw new Error("FBLoot 未加载，请硬刷新页面");
  }
  const hard = !!opts.hard || enc?.pool === "hard";
  const tier = window.FBLoot.clampTier(enc?.tier || 1);
  const loot = window.FBLoot.generateCombatLoot(tier, { hard });
  runMeta.tokens += loot.gold;
  updateMapHp();

  const collectibles = loot.collectibles?.length
    ? loot.collectibles.slice()
    : (loot.collectible ? [loot.collectible] : []);

  lootSession = {
    enc,
    loot,
    hard,
    cardResolved: false,
    collectQueue: collectibles,
    collectIndex: 0,
    collectResolved: collectibles.length === 0,
    pendingCollect: collectibles[0] || null,
    collectNotes: [],
  };

  $("#combat-overlay")?.classList.add("hidden");
  const ov = ensureLootOverlay();
  const title = $("#loot-title");
  const tierEl = $("#loot-tier");
  const goldRow = $("#loot-gold-row");
  if (!ov || !goldRow) throw new Error("奖励面板节点缺失");

  if (title) title.textContent = hard ? "精英战奖励" : "战斗奖励";
  if (tierEl) {
    tierEl.textContent = hard
      ? `击败「${enc.name}」· Hard 池 · 固定紫色掉落`
      : `击败「${enc.name}」· ${tier} 档遭遇`;
  }
  goldRow.innerHTML = `
    <h3>代币</h3>
    <div class="loot-offer"><span class="loot-pill">+${loot.gold} 代币</span>
    <span class="loot-resolved">已入账</span></div>`;

  renderLootCardRow();
  renderLootCollectRow();
  $("#loot-swap-row")?.classList.add("hidden");
  ov.classList.remove("hidden");
  ov.style.zIndex = "40";
  ov.style.display = "grid";
}

function renderLootCardRow() {
  const row = $("#loot-card-row");
  const card = lootSession?.loot?.card;
  if (!card) {
    row.innerHTML = `<h3>卡牌</h3><p class="muted">无卡牌掉落</p>`;
    lootSession.cardResolved = true;
    return;
  }
  if (lootSession.cardResolved) {
    row.innerHTML = `<h3>卡牌</h3><div class="loot-offer"><span class="loot-pill">${card.name}</span>
      <span class="loot-resolved">${lootSession.cardNote || "已处理"}</span></div>`;
    return;
  }
  row.innerHTML = `
    <h3>卡牌</h3>
    <div class="loot-offer"><span class="loot-pill">${card.name}</span><span class="muted">${card.type || ""} · 本局暂存</span></div>
    <div class="loot-actions">
      <button type="button" id="btn-loot-take-card">加入本局牌组</button>
      <button type="button" id="btn-loot-skip-card">放弃</button>
    </div>`;
  $("#btn-loot-take-card").onclick = () => {
    const res = window.FBLoadout.addRewardCardToDeck(loadout, card.cardId);
    if (res.toStash) {
      loadout.cardStash[card.cardId] = Math.max(0, (loadout.cardStash[card.cardId] || 0) - 1);
      if (!loadout.cardStash[card.cardId]) delete loadout.cardStash[card.cardId];
      stageRunCard(card.cardId, card.name, { overflowOnly: true });
      lootSession.cardNote = "牌组已满 → 本局暂存（撤离后入仓）";
    } else {
      stageRunCard(card.cardId, card.name, { inDeck: true });
      lootSession.cardNote = "已加入本局牌组（撤离随战备保存）";
    }
    lootSession.cardResolved = true;
    renderLootCardRow();
  };
  $("#btn-loot-skip-card").onclick = () => {
    lootSession.cardResolved = true;
    lootSession.cardNote = "已放弃";
    renderLootCardRow();
  };
}

function renderLootCollectRow() {
  const row = $("#loot-collect-row");
  if (!lootSession) return;

  const queue = lootSession.collectQueue || [];
  if (!queue.length) {
    row.innerHTML = `<h3>收集品</h3><p class="muted">本次未掉落收集品</p>`;
    lootSession.collectResolved = true;
    return;
  }

  if (lootSession.collectResolved) {
    const notes = (lootSession.collectNotes || []).join("；") || "已处理";
    row.innerHTML = `<h3>收集品</h3><div class="loot-offer">
      ${queue.map((c) => `<span class="loot-pill ${c.css || ""}">${c.name}</span>`).join("")}
      <span class="loot-resolved">${notes}</span></div>`;
    $("#loot-swap-row")?.classList.add("hidden");
    return;
  }

  const idx = lootSession.collectIndex || 0;
  const col = queue[idx];
  lootSession.pendingCollect = col;
  const progress = queue.length > 1 ? `（${idx + 1}/${queue.length}）` : "";
  row.innerHTML = `
    <h3>收集品${progress}</h3>
    <div class="loot-offer">
      <span class="loot-pill ${col.css || ""}">${col.name}</span>
      <span class="muted">价值 ${col.value ?? "—"} · ${col.rarityLabel || col.rarity || ""}</span>
    </div>
    <div class="loot-actions">
      <button type="button" id="btn-loot-take-col">携带</button>
      <button type="button" id="btn-loot-skip-col">放弃</button>
    </div>`;
  $("#btn-loot-take-col").onclick = () => tryTakeLootCollectible();
  $("#btn-loot-skip-col").onclick = () => {
    lootSession.collectNotes.push(`放弃「${col.name}」`);
    advanceLootCollect();
  };
}

function advanceLootCollect() {
  lootSession.collectIndex = (lootSession.collectIndex || 0) + 1;
  if (lootSession.collectIndex >= (lootSession.collectQueue || []).length) {
    lootSession.collectResolved = true;
    lootSession.pendingCollect = null;
    lootSession.collectNote = (lootSession.collectNotes || []).join("；");
  } else {
    lootSession.pendingCollect = lootSession.collectQueue[lootSession.collectIndex];
  }
  $("#loot-swap-row")?.classList.add("hidden");
  renderLootCollectRow();
}

function tryTakeLootCollectible() {
  const L = window.FBLoadout;
  const item = lootSession.pendingCollect;
  if (!item) return;
  const res = L.tryCarryCollectible(loadout, item);
  if (res.placed) {
    stageRunCollectible({ ...item, inBag: true });
    lootSession.collectNotes.push(`「${item.name}」已装入本局背包`);
    advanceLootCollect();
    return;
  }
  if (res.noBag) {
    stageRunCollectible(item);
    lootSession.collectNotes.push(`「${item.name}」无背包→本局暂存（撤离入仓）`);
    toast(`无背包，「${item.name}」已本局暂存`);
    advanceLootCollect();
    return;
  }
  if (res.needSwap) {
    showLootSwapUI(item);
  }
}

function showLootSwapUI(item) {
  const L = window.FBLoadout;
  const swapRow = $("#loot-swap-row");
  const grid = $("#loot-swap-grid");
  swapRow.classList.remove("hidden");
  grid.innerHTML = "";
  const contents = L.backpackContents(loadout);
  contents.forEach((c, i) => {
    const cell = document.createElement("div");
    cell.className = `backpack-cell filled ${c.css || ""}`;
    cell.innerHTML = `<span class="col-name">${c.name}</span>`;
    cell.title = "点击：用新收集品替换此格（被换下的进入卡组为诅咒）";
    cell.addEventListener("click", () => {
      const res = L.swapBackpackSlot(loadout, i, item, true);
      lootSession.collectNotes.push(
        res.curseId
          ? `「${item.name}」替换「${c.name}」（旧物诅咒入组）`
          : `「${item.name}」已替换「${c.name}」`
      );
      advanceLootCollect();
    });
    grid.appendChild(cell);
  });
  $("#btn-loot-curse").onclick = () => {
    L.forceCollectibleAsCurse(loadout, item);
    lootSession.collectNotes.push(`「${item.name}」挤入诅咒`);
    advanceLootCollect();
  };
  $("#btn-loot-skip-collect").onclick = () => {
    lootSession.collectNotes.push(`放弃「${item.name}」`);
    advanceLootCollect();
  };
}

function finishLootAndReturnMap() {
  if (!lootSession) return;
  if (!lootSession.cardResolved) {
    toast("请先处理卡牌奖励");
    return;
  }
  if (!lootSession.collectResolved) {
    toast("请先处理收集品奖励");
    return;
  }
  const ov = $("#loot-overlay");
  if (ov) {
    ov.classList.add("hidden");
    ov.style.display = "";
  }
  lootSession = null;
  if (combat) combat.stop();
  playBgm("拓宇者2.mp3");
  persistRun();
  show("map");
  requestAnimationFrame(() => {
    paintMap();
    updateMapHp();
  });
}

const _lootDoneBtn = $("#btn-loot-done");
if (_lootDoneBtn) _lootDoneBtn.addEventListener("click", finishLootAndReturnMap);

$("#btn-overlay-ok").addEventListener("click", () => {
  $("#combat-overlay").classList.add("hidden");
  if (combat) combat.stop();
  playBgm("拓宇者2.mp3");
  const next = $("#btn-overlay-ok").dataset.next || "map";
  if (next === "menu" || runFailed) {
    show("menu");
    return;
  }
  if (next === "event-combat-win") {
    resolveEventCombatWin();
    return;
  }
  show("map");
  requestAnimationFrame(() => {
    paintMap();
    updateMapHp();
  });
});

// —— 事件（明日方舟肉鸽式） ——
function syncRunHpFromMeta() {
  runMeta.hp = metaHp;
}

function openEvent(cell) {
  const id = window.FBEvents.pickRandomEventId(runMeta.seenEvents || []);
  const def = window.FBEvents.getEvent(id);
  if (!def) {
    toast("事件数据缺失");
    cell.cleared = true;
    return;
  }
  if (runMeta.flags?.venice_rock_debt && id === "merchant_of_venice") {
    // 磐石债务：再次遭遇时失去一张牌
    const lost = window.FBEventRuntime.loseRandomDeckCard(loadout);
    runMeta.flags.venice_rock_debt = false;
    if (lost) toast(`「威尼斯商人」旧债：失去「${window.FBCards.CARD_DEFS[lost]?.name || lost}」`);
  }
  runMeta.seenEvents = runMeta.seenEvents || [];
  if (!runMeta.seenEvents.includes(id)) runMeta.seenEvents.push(id);

  eventSession = {
    cell,
    eventId: id,
    nodeId: id,
    ctx: {},
    phase: "choices", // choices | result
  };
  show("event");
  renderEventScreen();
}

function currentEventDef() {
  if (!eventSession) return null;
  return window.FBEvents.getEvent(eventSession.nodeId);
}

function renderEventScreen() {
  const def = currentEventDef();
  if (!def || !eventSession) return;
  syncRunHpFromMeta();
  $("#event-title").textContent = def.title;
  $("#event-region").textContent = def.region || "异星村落";
  $("#event-art").dataset.art = def.art || "ruin";
  $("#event-hp-chip").textContent = `HP ${metaHp}/${maxHpNow()}`;
  $("#event-token-chip").textContent = `代币 ${runMeta.tokens}`;

  const story = $("#event-story");
  story.innerHTML = "";
  let intro = def.intro || [];
  if (typeof def.dynamicIntro === "function") {
    intro = [...intro, ...def.dynamicIntro(eventSession.ctx)];
  }
  // onEnter hooks
  if (def.onEnter && !eventSession.entered) {
    eventSession.entered = true;
    def.onEnter.forEach((hook) => {
      if (hook.whenFlag && runMeta.flags?.[hook.whenFlag]) {
        (hook.narrative || []).forEach((line) => {
          const p = document.createElement("p");
          p.textContent = line;
          story.appendChild(p);
        });
        const res = window.FBEventRuntime.applyEffects(hook.effects || [], eventEffectCtx());
        res.logs.forEach((line) => {
          const p = document.createElement("p");
          p.className = "effect-line";
          p.textContent = line;
          story.appendChild(p);
        });
        if (hook.clearFlag) runMeta.flags[hook.clearFlag] = false;
        metaHp = runMeta.hp;
        updateMapHp();
      }
    });
  }
  intro.forEach((line) => {
    const p = document.createElement("p");
    p.textContent = line;
    story.appendChild(p);
  });

  const result = $("#event-result");
  result.classList.add("hidden");
  result.innerHTML = "";
  const cont = $("#btn-event-continue");
  cont.classList.add("hidden");

  const box = $("#event-choices");
  box.innerHTML = "";
  if (eventSession.phase === "result") return;

  const choices = window.FBEventRuntime.visibleChoices(def, runMeta);
  choices.forEach((ch) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "is-event-choice";
    btn.innerHTML = `
      <span class="is-event-choice-label">${ch.label}</span>
      <span class="is-event-choice-preview">${ch.preview || ""}</span>`;
    btn.addEventListener("click", () => onEventChoice(ch));
    box.appendChild(btn);
  });
}

function eventEffectCtx() {
  runMeta.hp = metaHp;
  return {
    run: runMeta,
    loadout,
    maxHp: maxHpNow,
    eventCtx: eventSession?.ctx || {},
  };
}

function appendStoryLines(lines) {
  const story = $("#event-story");
  (lines || []).forEach((line) => {
    const p = document.createElement("p");
    p.textContent = line;
    story.appendChild(p);
  });
  const scroll = $("#event-scroll");
  scroll.scrollTop = scroll.scrollHeight;
}

function showEventResult(effectLogs) {
  const result = $("#event-result");
  result.classList.remove("hidden");
  result.innerHTML = "";
  (effectLogs || []).forEach((line) => {
    const p = document.createElement("p");
    p.className = "effect-line";
    p.textContent = line;
    result.appendChild(p);
  });
  $("#event-choices").innerHTML = "";
  $("#btn-event-continue").classList.remove("hidden");
  eventSession.phase = "result";
  metaHp = runMeta.hp;
  updateMapHp();
  $("#event-hp-chip").textContent = `HP ${metaHp}/${maxHpNow()}`;
  $("#event-token-chip").textContent = `代币 ${runMeta.tokens}`;
}

function onEventChoice(ch) {
  if (!eventSession || ch.locked) return;
  appendStoryLines(ch.narrative || []);
  const res = window.FBEventRuntime.applyEffects(ch.effects || [], eventEffectCtx());
  Object.assign(eventSession.ctx, res.ctxPatch || {});
  metaHp = runMeta.hp;
  updateMapHp();

  if (res.combat) {
    pendingEventCombat = {
      cell: eventSession.cell,
      payload: res.combat,
      chainIndex: 0,
      storyLogs: res.logs || [],
    };
    showEventResult([...(res.logs || []), "即将进入战斗…"]);
    $("#btn-event-continue").textContent = "进入战斗";
    $("#btn-event-continue").dataset.mode = "combat";
    return;
  }

  if (res.goto) {
    eventSession.nodeId = res.goto;
    eventSession.phase = "choices";
    eventSession.entered = true;
    $("#btn-event-continue").classList.add("hidden");
    renderEventScreen();
    if (res.logs?.length) {
      const result = $("#event-result");
      result.classList.remove("hidden");
      result.innerHTML = res.logs.map((l) => `<p class="effect-line">${l}</p>`).join("");
    }
    return;
  }

  if (res.end || !ch.keepOpen && !res.continueOpen) {
    showEventResult(res.logs);
    $("#btn-event-continue").textContent = "继续行程";
    $("#btn-event-continue").dataset.mode = "leave";
    return;
  }

  // keep open（如加入仪式）
  showEventResult(res.logs);
  eventSession.phase = "choices";
  $("#btn-event-continue").classList.add("hidden");
  // re-render choices below result
  const def = currentEventDef();
  const box = $("#event-choices");
  box.innerHTML = "";
  window.FBEventRuntime.visibleChoices(def, runMeta).forEach((c) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "is-event-choice";
    btn.innerHTML = `
      <span class="is-event-choice-label">${c.label}</span>
      <span class="is-event-choice-preview">${c.preview || ""}</span>`;
    btn.addEventListener("click", () => onEventChoice(c));
    box.appendChild(btn);
  });
}

function consumeFreeNodePick(cell, kindLabel) {
  if (!runMeta.flags?.free_node_pick || !cell) return false;
  runMeta.flags.free_node_pick = false;
  cell.cleared = false;
  toast(`${kindLabel}：自由再访生效，节点保留（可再进入一次）`);
  persistRun();
  return true;
}

function leaveEventToMap() {
  if (eventSession?.cell) {
    const cell = eventSession.cell;
    if (!consumeFreeNodePick(cell, "事件")) {
      cell.cleared = true;
    }
  }
  eventSession = null;
  pendingEventCombat = null;
  persistRun();
  show("map");
  updateMapHp();
  requestAnimationFrame(() => paintMap());
}

function startPendingEventCombat() {
  if (!pendingEventCombat) return;
  const payload = pendingEventCombat.payload;
  let pool = "normal";
  if (payload.chain) {
    const step = payload.chain[pendingEventCombat.chainIndex] || payload.chain[0];
    pool = step.pool || "normal";
  } else {
    pool = payload.pool || "normal";
  }
  enterCombat(pendingEventCombat.cell, pool, pendingEventCombat);
}

function resolveEventCombatWin() {
  if (!pendingEventCombat) {
    leaveEventToMap();
    return;
  }
  const payload = pendingEventCombat.payload;
  let onWin = payload.onWin || [];
  if (payload.chain) {
    const step = payload.chain[pendingEventCombat.chainIndex];
    onWin = step?.onWin || [];
    pendingEventCombat.chainIndex += 1;
    const res = window.FBEventRuntime.applyEffects(onWin, eventEffectCtx());
    metaHp = runMeta.hp;
    updateMapHp();
    if (pendingEventCombat.chainIndex < payload.chain.length) {
      toast("连战下一场…");
      startPendingEventCombat();
      return;
    }
    show("event");
    appendStoryLines(["战斗结束。"]);
    showEventResult(res.logs);
    $("#btn-event-continue").textContent = "继续行程";
    $("#btn-event-continue").dataset.mode = "leave";
    pendingEventCombat = null;
    return;
  }
  const res = window.FBEventRuntime.applyEffects(onWin, eventEffectCtx());
  metaHp = runMeta.hp;
  updateMapHp();
  show("event");
  appendStoryLines(["战斗胜利。"]);
  showEventResult(res.logs);
  $("#btn-event-continue").textContent = "继续行程";
  $("#btn-event-continue").dataset.mode = "leave";
  pendingEventCombat = null;
}

$("#btn-event-continue").addEventListener("click", () => {
  const mode = $("#btn-event-continue").dataset.mode || "leave";
  if (mode === "combat") {
    startPendingEventCombat();
    return;
  }
  leaveEventToMap();
});

$("#btn-combat-map").addEventListener("click", () => {
  if (!combat || combat.ended) {
    show("map");
    return;
  }
  const ok = window.confirm("退出当前战斗并返回地图？本格不会标记完成，生命保留。");
  if (!ok) return;
  combat.stop();
  combat = null;
  persistRun();
  show("map");
  paintMap();
  updateMapHp();
  playBgm("拓宇者2.mp3");
  toast("已脱离战斗");
});

$("#btn-char-back")?.addEventListener("click", () => {
  pendingCharId = null;
  show("menu");
});

$("#btn-char-confirm")?.addEventListener("click", () => {
  if (!pendingCharId) return;
  startRunWithCharacter(pendingCharId);
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
  const envEl = $("#c-env");
  if (envEl) {
    envEl.textContent = combat.env ? `环境：${combat.env}` : "环境：无";
  }
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
  if (p.kindle) st.push("点燃");
  if (p.nextBurn) st.push("下次燃");
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
    el.innerHTML = `<div class="cname">${c.name}</div><div class="ctype">${c.type === "word" ? "字词" : c.type === "punct" ? "标点" : c.type}<br/>${c.chant || 1}s</div>`;
    el.title = c.desc || "";
    if (c.type === "word") el.classList.add("word");
    if (c.type === "punct") el.classList.add("punct");
    if (c.type === "curse") el.classList.add("punct"); // 诅咒与标点同为「无效果」视觉
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

/** 地图：查看战备 / 牌组 / 背包 · 丢弃 · 永久合成 */
let mapCraftPick = [];

function openMapInventory(tab = "deck") {
  const ov = ensureNodeOverlay("map-inv-overlay", "本局行囊");
  const sub = ov.querySelector("#map-inv-overlay-sub");
  const body = ov.querySelector("#map-inv-overlay-body");
  const actions = ov.querySelector("#map-inv-overlay-actions");
  if (sub) {
    sub.textContent =
      "查看与丢弃 · 永久合成台会改写本局牌组（撤离后写入仓库快照）。战斗内合成不改牌组。";
  }
  actions.innerHTML = `
    <button type="button" data-invtab="equip">装备</button>
    <button type="button" data-invtab="deck">牌组</button>
    <button type="button" data-invtab="bag">背包</button>
    <button type="button" data-invtab="craft">永久合成</button>
    <button type="button" id="btn-map-inv-close">关闭</button>`;
  actions.querySelectorAll("[data-invtab]").forEach((b) => {
    b.onclick = () => openMapInventory(b.dataset.invtab);
  });
  $("#btn-map-inv-close").onclick = () => {
    ov.classList.add("hidden");
    ov.style.display = "";
    mapCraftPick = [];
    updateMapHp();
    persistRun();
  };

  if (tab === "equip") renderMapInvEquip(body);
  else if (tab === "bag") renderMapInvBag(body);
  else if (tab === "craft") renderMapInvCraft(body);
  else renderMapInvDeck(body);

  ov.classList.remove("hidden");
  ov.style.display = "grid";
  ov.style.zIndex = "46";
}

function renderMapInvDeck(body) {
  const L = window.FBLoadout;
  const rows = Object.entries(loadout.deck || {}).filter(([, n]) => n > 0);
  body.innerHTML =
    `<p class="muted">携带牌组 ${L.deckTotal(loadout)} 张 · 点击丢弃 1 张</p>` +
    (rows.length
      ? rows
          .map(
            ([id, n]) =>
              `<button type="button" class="shop-offer" data-drop-card="${id}">
                <span>${window.FBCards?.CARD_DEFS?.[id]?.name || id} ×${n}</span>
                <span class="loot-pill">丢弃</span></button>`
          )
          .join("")
      : `<p class="muted">牌组为空</p>`);
  body.querySelectorAll("[data-drop-card]").forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.dropCard;
      if ((loadout.deck[id] || 0) <= 0) return;
      loadout.deck[id] -= 1;
      if (loadout.deck[id] <= 0) delete loadout.deck[id];
      toast(`已丢弃「${window.FBCards?.CARD_DEFS?.[id]?.name || id}」`);
      persistRun();
      openMapInventory("deck");
    };
  });
}

function renderMapInvEquip(body) {
  const slots = loadout.equip || {};
  const entries = Object.entries(slots).filter(([, v]) => v);
  body.innerHTML =
    `<p class="muted">点击卸下并丢弃（不回仓库）</p>` +
    (entries.length
      ? entries
          .map(
            ([slot, item]) =>
              `<button type="button" class="shop-offer" data-drop-eq="${slot}">
                <span>${slot} · ${item.name || item.id || "装备"}</span>
                <span class="loot-pill">丢弃</span></button>`
          )
          .join("")
      : `<p class="muted">未穿戴装备</p>`);
  body.querySelectorAll("[data-drop-eq]").forEach((btn) => {
    btn.onclick = () => {
      const slot = btn.dataset.dropEq;
      delete loadout.equip[slot];
      toast(`已丢弃 ${slot}`);
      persistRun();
      openMapInventory("equip");
    };
  });
}

function renderMapInvBag(body) {
  const L = window.FBLoadout;
  const contents = L.backpackContents?.(loadout) || [];
  body.innerHTML =
    `<p class="muted">出征背包 · 点击丢弃收集品</p>` +
    (contents.length
      ? contents
          .map(
            (c, i) =>
              `<button type="button" class="shop-offer" data-drop-col="${i}">
                <span class="${c.css || ""}">${c.name}</span>
                <span class="loot-pill">丢弃</span></button>`
          )
          .join("")
      : `<p class="muted">背包为空或未装备背包</p>`);
  body.querySelectorAll("[data-drop-col]").forEach((btn) => {
    btn.onclick = () => {
      const i = Number(btn.dataset.dropCol);
      const contents = L.backpackContents?.(loadout) || [];
      if (i < 0 || i >= contents.length) {
        toast("丢弃失败");
        return;
      }
      const [removed] = contents.splice(i, 1);
      toast(removed ? `已丢弃「${removed.name}」` : "丢弃失败");
      persistRun();
      openMapInventory("bag");
    };
  });
}

function renderMapInvCraft(body) {
  const defs = window.FBCards?.CARD_DEFS || {};
  const rows = Object.entries(loadout.deck || {}).filter(([, n]) => n > 0);
  const pickLabel = mapCraftPick.map((c) => c.name).join(" + ") || "未选材料";
  const preview = window.FBCards?.previewCraft?.(mapCraftPick) || { title: "—", meta: "" };
  body.innerHTML = `
    <p class="muted">点选材料（最多 5）→ 合成后永久替换牌组中的材料为产物</p>
    <div class="loot-offer"><span class="loot-pill">${pickLabel}</span>
      <span class="muted">${preview.title} · ${preview.meta || ""}</span></div>
    <div class="loot-actions">
      <button type="button" id="btn-perm-craft">确认永久合成</button>
      <button type="button" id="btn-perm-craft-clear">清空选择</button>
    </div>
    <div class="node-overlay-body" id="perm-craft-pool"></div>`;
  const pool = body.querySelector("#perm-craft-pool");
  pool.innerHTML = rows
    .map(
      ([id, n]) =>
        `<button type="button" class="shop-offer" data-add-craft="${id}">
          <span>${defs[id]?.name || id} ×${n}</span>
          <span class="loot-pill">加入</span></button>`
    )
    .join("");
  pool.querySelectorAll("[data-add-craft]").forEach((btn) => {
    btn.onclick = () => {
      if (mapCraftPick.length >= 5) {
        toast("耐性上限 5");
        return;
      }
      const id = btn.dataset.addCraft;
      const used = mapCraftPick.filter((c) => c.defId === id || c.id === id).length;
      if (used >= (loadout.deck[id] || 0)) {
        toast("牌组中该卡不足");
        return;
      }
      const card = window.FBCards?.makeInstance?.(id) || {
        defId: id,
        id,
        name: defs[id]?.name || id,
        type: defs[id]?.type || "element",
      };
      mapCraftPick.push(card);
      openMapInventory("craft");
    };
  });
  $("#btn-perm-craft-clear").onclick = () => {
    mapCraftPick = [];
    openMapInventory("craft");
  };
  $("#btn-perm-craft").onclick = () => {
    const prev = window.FBCards?.previewCraft?.(mapCraftPick);
    if (!prev?.card) {
      toast(prev?.meta || "无法合成");
      return;
    }
    // 消耗材料
    for (const m of mapCraftPick) {
      const id = m.defId || m.id;
      if ((loadout.deck[id] || 0) <= 0) {
        toast("材料不足，已取消");
        mapCraftPick = [];
        openMapInventory("craft");
        return;
      }
      loadout.deck[id] -= 1;
      if (loadout.deck[id] <= 0) delete loadout.deck[id];
    }
    const productId = prev.card.defId || prev.card.id;
    if (productId && window.FBCards?.CARD_DEFS?.[productId]) {
      loadout.deck[productId] = (loadout.deck[productId] || 0) + 1;
    } else {
      // 词条等：尽量用 makeWord 结果 id
      const pid = prev.card.defId;
      if (pid) loadout.deck[pid] = (loadout.deck[pid] || 0) + 1;
      else toast("产物无稳定 id，已消耗材料但未写入牌组（请回报）");
    }
    toast(`永久合成：「${prev.card.name}」已写入牌组`);
    mapCraftPick = [];
    persistRun();
    openMapInventory("craft");
  };
}

$("#btn-map-inv")?.addEventListener("click", () => openMapInventory("deck"));

// Init recipe list empty; show menu
refreshMenuContinueLabel();
show("menu");
