/**
 * 自由市场（三角洲式分区 · 非动态定价）
 *
 * 分区：gear 战备 / cards 卡牌 / collect 收集品
 * 定价：挂牌价由卖方自定；成交收取挂牌价 5% 手续费（买方付全价，卖方得 95%）
 * 补货：每周一 00:00（本地时区）起，系统商品库存各 +RESTOCK_DELTA
 */
(function () {
  const MARKET_KEY = "fb_html_demo_market_v1";
  const VERSION = 2;
  const FEE_RATE = 0.05;
  const RESTOCK_DELTA = 3;
  const HISTORY_DAYS = 14;

  const ZONES = [
    { id: "gear", name: "战备", hint: "护甲 / 头盔 / 枪械 / 背包" },
    { id: "cards", name: "卡牌", hint: "字素与词条（仓库卡）" },
    { id: "collect", name: "收集品", hint: "一般仓库收集品" },
  ];

  function uid(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6)}`;
  }

  /** 本地周一 00:00 对应的周键 YYYY-MM-DD（该周一） */
  function mondayKey(date = new Date()) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = d.getDay(); // 0 Sun .. 6 Sat
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }

  function feeOf(price) {
    return Math.max(0, Math.floor(Number(price) * FEE_RATE));
  }

  function sellerProceeds(price) {
    const p = Math.max(0, Math.floor(Number(price) || 0));
    return Math.max(0, p - feeOf(p));
  }

  function defaultSystemListings() {
    const gear = [
      { catalogId: "armor_simple", name: "简易护甲", price: 40, qty: 6 },
      { catalogId: "helmet_simple", name: "简易头盔", price: 36, qty: 6 },
      { catalogId: "pistol_simple", name: "简易手枪", price: 48, qty: 5 },
      { catalogId: "backpack_simple", name: "简易背包", price: 55, qty: 4 },
      { catalogId: "backpack_normal", name: "普通背包", price: 90, qty: 3 },
    ].map((g) => ({
      id: uid("sys"),
      zone: "gear",
      source: "system",
      catalogId: g.catalogId,
      name: g.name,
      price: g.price,
      qty: g.qty,
      payload: { kind: "equip", defId: g.catalogId },
    }));

    const cardIds = ["fire", "water", "ice", "wood", "sand", "air", "heat", "cool", "compress", "amp"];
    const cards = cardIds.map((id, i) => {
      const def = window.FBCards?.CARD_DEFS?.[id];
      return {
        id: uid("sys"),
        zone: "cards",
        source: "system",
        catalogId: id,
        name: def?.name || id,
        price: 12 + i * 2,
        qty: 8,
        payload: { kind: "card", cardId: id },
      };
    });

    const cols = [];
    if (window.FBLoot?.makeCollectible) {
      ["white", "green", "blue", "purple"].forEach((r, i) => {
        const item = window.FBLoot.makeCollectible(r);
        cols.push({
          id: uid("sys"),
          zone: "collect",
          source: "system",
          catalogId: item.uid || item.name,
          name: item.name,
          price: Math.max(20, Math.floor((item.value || 100) / 20) + 15 * i),
          qty: 4,
          rarity: item.rarity,
          css: item.css,
          payload: { kind: "collectible", item },
        });
      });
    }

    return [...gear, ...cards, ...cols];
  }

  function historyKey(zone, catalogId) {
    return `${zone || "all"}:${catalogId || "unknown"}`;
  }

  function dayKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  /** 以基准价生成近 N 日参考行情（三角洲式柱状图种子） */
  function seedHistory(basePrice, days = HISTORY_DAYS) {
    const base = Math.max(1, Math.floor(Number(basePrice) || 20));
    const points = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const wave = Math.sin(i * 0.7) * 0.08 + (Math.random() - 0.5) * 0.12;
      const avg = Math.max(1, Math.round(base * (1 + wave)));
      const low = Math.max(1, Math.round(avg * 0.9));
      const high = Math.max(avg, Math.round(avg * 1.12));
      points.push({ day: dayKey(d), avg, low, high, samples: 1 });
    }
    return points;
  }

  function ensurePriceHistory(state) {
    if (!state.priceHistory || typeof state.priceHistory !== "object") {
      state.priceHistory = {};
    }
    (state.listings || []).forEach((l) => {
      const key = historyKey(l.zone, l.catalogId);
      if (!state.priceHistory[key]?.length) {
        state.priceHistory[key] = seedHistory(l.price);
      }
    });
  }

  /** 记录成交/挂牌价到当日柱 */
  function recordPrice(state, zone, catalogId, price) {
    if (!state.priceHistory) state.priceHistory = {};
    const key = historyKey(zone, catalogId);
    const p = Math.max(1, Math.floor(Number(price) || 0));
    if (!p) return;
    let series = state.priceHistory[key];
    if (!series?.length) series = seedHistory(p);
    const today = dayKey();
    let last = series[series.length - 1];
    if (!last || last.day !== today) {
      last = { day: today, avg: p, low: p, high: p, samples: 0 };
      series.push(last);
    }
    const n = (last.samples || 0) + 1;
    last.avg = Math.round((last.avg * (n - 1) + p) / n);
    last.low = Math.min(last.low, p);
    last.high = Math.max(last.high, p);
    last.samples = n;
    while (series.length > HISTORY_DAYS) series.shift();
    state.priceHistory[key] = series;
  }

  function getPriceSeries(state, zone, catalogId, fallbackPrice) {
    ensurePriceHistory(state);
    const key = historyKey(zone, catalogId);
    let series = state.priceHistory[key];
    if (!series?.length) {
      series = seedHistory(fallbackPrice || 20);
      state.priceHistory[key] = series;
    }
    return series;
  }

  function priceStats(series, currentPrice) {
    if (!series?.length) {
      return { avg: currentPrice || 0, low: currentPrice || 0, high: currentPrice || 0, current: currentPrice || 0 };
    }
    const avgs = series.map((p) => p.avg);
    const lows = series.map((p) => p.low);
    const highs = series.map((p) => p.high);
    return {
      avg: Math.round(avgs.reduce((a, b) => a + b, 0) / avgs.length),
      low: Math.min(...lows),
      high: Math.max(...highs),
      current: Math.max(0, Math.floor(Number(currentPrice) || avgs[avgs.length - 1] || 0)),
      latest: avgs[avgs.length - 1],
    };
  }

  /** 返回柱状图 HTML（纯 CSS） */
  function renderPriceChartHtml(series, currentPrice, opts = {}) {
    const stats = priceStats(series, currentPrice);
    const maxH = Math.max(stats.high, stats.current, 1);
    const bars = (series || [])
      .map((p) => {
        const h = Math.max(6, Math.round((p.avg / maxH) * 100));
        const label = (p.day || "").slice(5); // MM-DD
        const isToday = p.day === dayKey();
        return `<div class="mkt-bar-col${isToday ? " today" : ""}" title="${p.day} 均 ${p.avg}（${p.low}-${p.high}）">
          <div class="mkt-bar" style="height:${h}%"></div>
          <span class="mkt-bar-val">${p.avg}</span>
          <span class="mkt-bar-lab">${label}</span>
        </div>`;
      })
      .join("");
    const curH = Math.max(6, Math.round((stats.current / maxH) * 100));
    const title = opts.title || "市场价格";
    return `<div class="mkt-chart">
      <div class="mkt-chart-head">
        <strong>${title}</strong>
        <span class="muted">近 ${HISTORY_DAYS} 日均价 · 参考柱状图</span>
      </div>
      <div class="mkt-chart-bars">${bars}
        <div class="mkt-bar-col current" title="当前挂牌 ${stats.current}">
          <div class="mkt-bar mkt-bar-current" style="height:${curH}%"></div>
          <span class="mkt-bar-val">${stats.current}</span>
          <span class="mkt-bar-lab">现价</span>
        </div>
      </div>
      <div class="mkt-chart-stats">
        <span>均价 <b>${stats.avg}</b></span>
        <span>最低 <b>${stats.low}</b></span>
        <span>最高 <b>${stats.high}</b></span>
        <span>现挂 <b>${stats.current}</b></span>
      </div>
    </div>`;
  }

  function defaultState() {
    const listings = defaultSystemListings();
    const state = {
      version: VERSION,
      lastRestockWeekKey: mondayKey(),
      listings,
      priceHistory: {},
    };
    ensurePriceHistory(state);
    return state;
  }

  function loadRaw() {
    try {
      const raw = localStorage.getItem(MARKET_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function saveState(state) {
    try {
      localStorage.setItem(
        MARKET_KEY,
        JSON.stringify({ ...state, version: VERSION, savedAt: Date.now() })
      );
      return true;
    } catch (err) {
      console.warn("market save failed", err);
      return false;
    }
  }

  function applyWeeklyRestock(state) {
    const key = mondayKey();
    if (state.lastRestockWeekKey === key) return { restocked: false, key };
    // 跨过至少一个周一：系统商品库存 +RESTOCK_DELTA
    (state.listings || []).forEach((l) => {
      if (l.source !== "system") return;
      l.qty = Math.max(0, Number(l.qty) || 0) + RESTOCK_DELTA;
    });
    state.lastRestockWeekKey = key;
    return { restocked: true, key, delta: RESTOCK_DELTA };
  }

  function migrateState(raw) {
    if (!raw || !Array.isArray(raw.listings)) return defaultState();
    const state = {
      version: VERSION,
      lastRestockWeekKey: raw.lastRestockWeekKey || mondayKey(),
      listings: raw.listings,
      priceHistory: raw.priceHistory && typeof raw.priceHistory === "object" ? raw.priceHistory : {},
    };
    ensurePriceHistory(state);
    return state;
  }

  function getState() {
    let raw = loadRaw();
    let state;
    let migrated = false;
    if (!raw || !Array.isArray(raw.listings)) {
      state = defaultState();
      migrated = true;
    } else if (raw.version !== VERSION || !raw.priceHistory) {
      state = migrateState(raw);
      migrated = true;
    } else {
      state = raw;
      ensurePriceHistory(state);
    }
    const restock = applyWeeklyRestock(state);
    if (migrated || restock.restocked) saveState(state);
    return { state, restock };
  }

  function listingsByZone(state, zone) {
    return (state.listings || []).filter((l) => l.zone === zone && (l.qty || 0) > 0);
  }

  function findListing(state, id) {
    return (state.listings || []).find((l) => l.id === id) || null;
  }

  /**
   * 购买一单
   * @returns {{ ok, reason?, fee?, paid?, sellerGain?, listing? }}
   */
  function buyListing(state, listingId, vault, loadout) {
    const listing = findListing(state, listingId);
    if (!listing) return { ok: false, reason: "商品不存在" };
    if ((listing.qty || 0) <= 0) return { ok: false, reason: "库存不足" };
    if (listing.source === "player" && listing.sellerId === "local") {
      return { ok: false, reason: "不能购买自己的挂牌，请撤牌" };
    }
    const price = Math.max(0, Math.floor(Number(listing.price) || 0));
    if ((vault.tokens || 0) < price) return { ok: false, reason: "仓库代币不足" };

    const delivered = deliverPayload(loadout, listing.payload);
    if (!delivered.ok) return delivered;

    vault.tokens -= price;
    listing.qty -= 1;
    const fee = feeOf(price);
    const sellerGain = sellerProceeds(price);

    // 玩家挂牌：卖方收益记在 listing.escrowSellerCredit（单机：记入 vault 的「待领」或直接作系统回收）
    // 单机自由市场：玩家挂牌被买走时，95% 退回本机仓库（模拟成交），5% 手续费销毁
    if (listing.source === "player") {
      vault.tokens += sellerGain;
      listing._lastSale = { price, fee, sellerGain, at: Date.now() };
    }

    if (listing.qty <= 0 && listing.source === "player") {
      state.listings = state.listings.filter((l) => l.id !== listing.id);
    }

    recordPrice(state, listing.zone, listing.catalogId, price);
    saveState(state);
    return { ok: true, paid: price, fee, sellerGain, listing, delivered };
  }

  function deliverPayload(loadout, payload) {
    if (!payload || !loadout) return { ok: false, reason: "交付失败" };
    const L = window.FBLoadout;
    if (payload.kind === "card") {
      const id = payload.cardId;
      if (!id) return { ok: false, reason: "无效卡牌" };
      L.addRewardCardToStash(loadout, id);
      return { ok: true, kind: "card", cardId: id };
    }
    if (payload.kind === "equip") {
      const def = L.EQUIP_DEFS?.[payload.defId];
      if (!def) return { ok: false, reason: "无效装备" };
      const item = payload.snapshot
        ? JSON.parse(JSON.stringify(payload.snapshot))
        : L.makeEquipInstance
          ? L.makeEquipInstance(def)
          : { defId: payload.defId, uid: uid("eq"), name: def.name, slot: def.slot };
      if (!item.uid) item.uid = uid("eq");
      loadout.equipStash = loadout.equipStash || [];
      loadout.equipStash.push(item);
      return { ok: true, kind: "equip", item };
    }
    if (payload.kind === "collectible") {
      const item = payload.item
        ? JSON.parse(JSON.stringify(payload.item))
        : null;
      if (!item) return { ok: false, reason: "无效收集品" };
      loadout.collectStash = loadout.collectStash || [];
      loadout.collectStash.push(item);
      return { ok: true, kind: "collectible", item };
    }
    return { ok: false, reason: "未知商品类型" };
  }

  /**
   * 挂牌出售（从仓库托管商品）
   * 手续费在成交时扣；挂牌不预扣代币
   */
  function listFromWarehouse(state, zone, offer, loadout) {
    // offer: { price, kind, cardId? , equipUid?, collectIndex? }
    const price = Math.max(1, Math.floor(Number(offer.price) || 0));
    let payload = null;
    let name = "";
    let css = "";
    let rarity = "";

    if (zone === "cards" && offer.kind === "card") {
      const id = offer.cardId;
      const n = loadout.cardStash?.[id] || 0;
      if (n <= 0) return { ok: false, reason: "仓库没有这张卡" };
      // 不挂正在携带牌组里的？允许只挂 stash
      loadout.cardStash[id] = n - 1;
      if (loadout.cardStash[id] <= 0) delete loadout.cardStash[id];
      name = window.FBCards?.CARD_DEFS?.[id]?.name || id;
      payload = { kind: "card", cardId: id };
    } else if (zone === "gear" && offer.kind === "equip") {
      const idx = (loadout.equipStash || []).findIndex((x) => x.uid === offer.equipUid);
      if (idx < 0) return { ok: false, reason: "仓库没有该装备" };
      const [item] = loadout.equipStash.splice(idx, 1);
      name = item.name || item.defId;
      payload = { kind: "equip", defId: item.defId, snapshot: item };
    } else if (zone === "collect" && offer.kind === "collectible") {
      const idx = Number(offer.collectIndex);
      if (!Array.isArray(loadout.collectStash) || idx < 0 || idx >= loadout.collectStash.length) {
        return { ok: false, reason: "仓库没有该收集品" };
      }
      const [item] = loadout.collectStash.splice(idx, 1);
      name = item.name;
      css = item.css || "";
      rarity = item.rarity || "";
      payload = { kind: "collectible", item };
    } else {
      return { ok: false, reason: "挂牌参数无效" };
    }

    const listing = {
      id: uid("pl"),
      zone,
      source: "player",
      sellerId: "local",
      catalogId: payload.cardId || payload.defId || name,
      name,
      price,
      qty: 1,
      css,
      rarity,
      payload,
      listedAt: Date.now(),
    };
    state.listings.push(listing);
    recordPrice(state, zone, listing.catalogId, price);
    saveState(state);
    return {
      ok: true,
      listing,
      feePreview: feeOf(price),
      proceedsPreview: sellerProceeds(price),
    };
  }

  /** 撤牌：退回仓库 */
  function cancelListing(state, listingId, loadout) {
    const listing = findListing(state, listingId);
    if (!listing) return { ok: false, reason: "挂牌不存在" };
    if (listing.source !== "player" || listing.sellerId !== "local") {
      return { ok: false, reason: "只能撤销自己的挂牌" };
    }
    const delivered = deliverPayload(loadout, listing.payload);
    if (!delivered.ok) return delivered;
    state.listings = state.listings.filter((l) => l.id !== listingId);
    saveState(state);
    return { ok: true, listing };
  }

  /** 快速寄售：立即按挂牌价卖给市场，扣 5% 手续费 */
  function instantSell(state, zone, offer, loadout, vault) {
    const listed = listFromWarehouse(state, zone, offer, loadout);
    if (!listed.ok) return listed;
    const price = listed.listing.price;
    const fee = feeOf(price);
    const gain = sellerProceeds(price);
    // 立即成交：移除挂牌，不交付给买方（市场消化），卖方得 95%
    state.listings = state.listings.filter((l) => l.id !== listed.listing.id);
    vault.tokens = (vault.tokens || 0) + gain;
    recordPrice(state, zone, listed.listing.catalogId, price);
    saveState(state);
    return { ok: true, price, fee, gain, name: listed.listing.name, listing: listed.listing };
  }

  function nextRestockHint(state) {
    const key = state.lastRestockWeekKey || mondayKey();
    const [y, m, d] = key.split("-").map(Number);
    const last = new Date(y, m - 1, d);
    const next = new Date(last);
    next.setDate(next.getDate() + 7);
    return {
      lastKey: key,
      nextAt: next,
      delta: RESTOCK_DELTA,
      feeRate: FEE_RATE,
    };
  }

  // expose makeEquipInstance if missing on FBLoadout
  if (window.FBLoadout && !window.FBLoadout.makeEquipInstance) {
    // loadout.js may not export makeEquipInstance — recreate lightly
    window.FBLoadout.makeEquipInstance = function (def) {
      return {
        uid: uid("eq"),
        defId: def.id,
        name: def.name,
        slot: def.slot,
        value: def.value || 0,
        contents: def.slot === "backpack" ? [] : undefined,
        capacity: def.capacity,
      };
    };
  }

  window.FBMarket = {
    MARKET_KEY,
    VERSION,
    FEE_RATE,
    RESTOCK_DELTA,
    HISTORY_DAYS,
    ZONES,
    mondayKey,
    feeOf,
    sellerProceeds,
    getState,
    saveState,
    listingsByZone,
    buyListing,
    listFromWarehouse,
    cancelListing,
    instantSell,
    nextRestockHint,
    defaultSystemListings,
    historyKey,
    getPriceSeries,
    priceStats,
    recordPrice,
    renderPriceChartHtml,
  };
})();
