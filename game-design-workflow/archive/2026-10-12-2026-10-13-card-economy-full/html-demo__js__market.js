/**
 * 自由市场（分区 · 玩家可操控的动态供需）
 *
 * 分区：gear 战备 / cards 卡牌 / collect 收集品
 * 定价：挂牌价由卖方自定；成交收取手续费（5%，低价值商品保底 1 代币）
 * 补货：**弹性补货**——系统只做保底供给（基准 SYS_BASE_QTY），
 *       跌破基准才按天渐进补货，且让位于玩家挂牌（玩家能真正掌控供给）。
 *       系统断供时玩家可高于参考价挂出 → 这是「控盘」玩法的收益来源。
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

  /**
   * 成交手续费。
   * 低价值商品必须至少收 1 代币：否则 `floor(12 × 0.05) = 0`，
   * 卖价会等于买价 → 市场零摩擦、可无限无风险套利。
   * @param {number} price 单价
   */
  function feeOf(price) {
    const p = Math.max(0, Math.floor(Number(price) || 0));
    if (p <= 0) return 0;
    return Math.max(1, Math.floor(p * FEE_RATE));
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

    // ── 卡牌货架：使用 economy.js 的权威价格表 ──
    // 卡牌是可交易资产：带出的卡既能自用也能卖出。市场价必须与合成定价一致，
    // 否则会出现「合成 165、市场卖 12」的套利漏洞。
    const E = window.FBEconomy;
    const priceOf = (id) => {
      if (E?.cardPriceOf) {
        const wv = E.wvOf(window.FBCards?.CARD_DEFS?.[id]?.play
          || window.FBCards?.WORD_EFFECTS?.[id] || {}) || 5;
        return Math.max(1, Math.round(E.cardPriceOf(id, wv, 1)));
      }
      return 20;
    };
    // 常驻基础牌（低价、数量足）+ 少量进阶牌（高价、稀缺）
    const staples = ["fire", "water", "sand", "air", "ice", "wood", "poison", "heat", "cool", "compress", "amp", "stack"];
    const advanced = ["steel", "electric", "vine", "ash", "grid", "concrete", "snow", "acid"];
    const cards = [
      ...staples.map((id) => ({ id, qty: 10 })),
      ...advanced.map((id) => ({ id, qty: 3 })),
    ].map(({ id, qty }) => {
      const def = window.FBCards?.CARD_DEFS?.[id] || window.FBCards?.WORD_DEFS?.[id];
      return {
        id: uid("sys"),
        zone: "cards",
        source: "system",
        catalogId: id,
        name: def?.name || id,
        price: priceOf(id),
        qty,
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
      lastRestockDayKey: dayKey(),
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

  /**
   * ── 自由市场：弹性补货（2026-10-13 重做）──
   *
   * 设计意图（用户）：「玩家可操控的自由市场，但通过系统补货维持基本平衡；
   * 自由市场也是游戏的乐趣之一。」
   *
   * 三个机制：
   *   ① 系统只做「保底供给」——每个商品有基准库存 SYS_BASE_QTY；
   *      跌破基准才开始补，且补到基准就停。
   *   ② **让位于玩家**：同 catalogId 已有玩家挂牌时，系统补货被抑制
   *      （每有 1 件玩家挂牌，补货量 -1，最低 0）→ 玩家能真正掌控供给。
   *   ③ 补货按「天」而非「周」渐进（每日 +SYS_RESTOCK_PER_DAY 上限），
   *      避免一次性灌满导致价格瞬间崩塌。
   *
   * 由此玩家可以：囤货 → 系统库存见底 → 以高于参考价挂出 → 赚差价。
   * 系统补货则保证任何商品都不会永久断供。
   */
  const SYS_BASE_QTY = 12;        // 系统基准库存（保底线）
  const SYS_RESTOCK_PER_DAY = 3;  // 每日最多补货量
  const SYS_HARD_FLOOR = 2;       // 绝对下限：低于此值无视玩家抑制，必须补

  /** 同一 catalogId 下玩家挂牌的总数量 */
  function playerQtyOf(state, zone, catalogId) {
    return (state.listings || [])
      .filter((l) => l.source === "player" && l.zone === zone && l.catalogId === catalogId)
      .reduce((s, l) => s + Math.max(0, Number(l.qty) || 0), 0);
  }

  /**
   * 弹性补货：按天渐进，且让位于玩家供给。
   * @returns {{restocked:boolean, dayKey:string, added:number, suppressed:number}}
   */
  function applyElasticRestock(state) {
    const today = dayKey();
    if (state.lastRestockDayKey === today) {
      return { restocked: false, dayKey: today, added: 0, suppressed: 0 };
    }
    let added = 0, suppressed = 0;
    for (const l of state.listings || []) {
      if (l.source !== "system") continue;
      const cur = Math.max(0, Number(l.qty) || 0);
      if (cur >= SYS_BASE_QTY) continue;                 // 未跌破基准，不补

      // ① 先补到硬下限（保证任何商品都不会永久断供，不受玩家抑制）
      const toFloor = Math.max(0, SYS_HARD_FLOOR - cur);
      // ② 硬下限之上的部分才让位于玩家
      const aboveFloorDeficit = Math.max(0, SYS_BASE_QTY - Math.max(cur, SYS_HARD_FLOOR));
      const playerQty = playerQtyOf(state, l.zone, l.catalogId);
      const wantAbove = Math.min(
        Math.max(0, SYS_RESTOCK_PER_DAY - toFloor),
        Math.max(0, aboveFloorDeficit - playerQty)
      );
      const want = Math.min(SYS_RESTOCK_PER_DAY, toFloor + wantAbove);
      const cut = Math.min(
        SYS_RESTOCK_PER_DAY - toFloor > 0 ? SYS_RESTOCK_PER_DAY - toFloor : 0,
        Math.max(0, aboveFloorDeficit - wantAbove)
      );
      suppressed += Math.max(0, cut);
      if (want > 0) { l.qty = cur + want; added += want; }
    }
    state.lastRestockDayKey = today;
    return { restocked: true, dayKey: today, added, suppressed };
  }

  /** 兼容旧调用名（旧档迁移时沿用周一键） */
  function applyWeeklyRestock(state) {
    return applyElasticRestock(state);
  }

  function migrateState(raw) {
    if (!raw || !Array.isArray(raw.listings)) return defaultState();
    const state = {
      version: VERSION,
      lastRestockDayKey: raw.lastRestockDayKey || dayKey(),
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
   * 购买一单（支持部分买入，便于玩家「控盘」：逐步扫货而非一次买断整条挂单）
   * @param {number} [qty=1] 购买数量
   * @returns {{ ok, reason?, fee?, paid?, sellerGain?, listing?, bought? }}
   */
  function buyListing(state, listingId, vault, loadout, qty = 1) {
    const listing = findListing(state, listingId);
    if (!listing) return { ok: false, reason: "商品不存在" };
    const have = Math.max(0, Number(listing.qty) || 0);
    if (have <= 0) return { ok: false, reason: "库存不足" };
    // 单机说明：自由市场里「自己买自己的挂牌」是**控盘玩法的必要手段**
    // （扫货 → 库存见底 → 高价挂出 → 再买回/卖出）。
    // 为避免无限刷单，自购仍照扣 5% 手续费，因此不构成无风险套利。
    const selfBuy = listing.source === "player" && listing.sellerId === "local";
    const want = Math.max(1, Math.min(have, Math.floor(Number(qty) || 1)));
    const unit = Math.max(0, Math.floor(Number(listing.price) || 0));
    const total = unit * want;
    if ((vault.tokens || 0) < total) {
      return { ok: false, reason: `仓库代币不足（需 ${total}，持有 ${vault.tokens || 0}）` };
    }
    // 部分买入时逐件交付；任一失败则中止（不扣款）
    for (let i = 0; i < want; i++) {
      const delivered = deliverPayload(loadout, listing.payload);
      if (!delivered.ok) return delivered;
    }

    vault.tokens -= total;
    listing.qty = have - want;
    const fee = feeOf(unit) * want;
    const sellerGain = sellerProceeds(unit) * want;

    // 单机自由市场记账：
    //  · 他人买走 → 卖方回款 95%（模拟成交），手续费销毁
    //  · 自购（控盘手段）→ 物品只是回到自己手上，价款不应真的流出，
    //    故把全额退回、只净扣手续费。否则自购会被重复扣款。
    if (listing.source === "player" && !selfBuy) {
      vault.tokens += sellerGain;
      listing._lastSale = { price: unit, fee, sellerGain, qty: want, at: Date.now(), self: false };
    } else if (selfBuy) {
      vault.tokens += total - fee;   // 退回全额，仅留下手续费
      listing._lastSale = { price: unit, fee, sellerGain: 0, qty: want, at: Date.now(), self: true };
    }

    if (listing.qty <= 0 && listing.source === "player") {
      state.listings = state.listings.filter((l) => l.id !== listing.id);
    }

    recordPrice(state, listing.zone, listing.catalogId, unit);
    saveState(state);
    return {
      ok: true, paid: total, unitPrice: unit, bought: want,
      fee, sellerGain: selfBuy ? 0 : sellerGain, self: selfBuy, listing,
    };
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

  /**
   * 补货提示：弹性补货是「按天渐进 + 让位于玩家」，不再是每周一次性。
   * 返回当前各商品的供给状态，供 UI 展示市场紧张程度。
   */
  function nextRestockHint(state) {
    const sys = (state.listings || []).filter((l) => l.source === "system");
    const belowBase = sys.filter((l) => (l.qty || 0) < SYS_BASE_QTY);
    const soldOut = sys.filter((l) => (l.qty || 0) <= 0);
    return {
      lastKey: state.lastRestockDayKey || dayKey(),
      perDay: SYS_RESTOCK_PER_DAY,
      baseQty: SYS_BASE_QTY,
      hardFloor: SYS_HARD_FLOOR,
      belowBaseCount: belowBase.length,
      soldOutCount: soldOut.length,
      feeRate: FEE_RATE,
      playerListedQty: (state.listings || [])
        .filter((l) => l.source === "player")
        .reduce((s, l) => s + Math.max(0, Number(l.qty) || 0), 0),
    };
  }

  /** 某商品当前供给状态：系统库存、玩家挂牌量、是否处于「玩家可定价」窗口 */
  function supplyState(state, zone, catalogId) {
    const sys = (state.listings || []).filter(
      (l) => l.source === "system" && l.zone === zone && l.catalogId === catalogId
    );
    const sysQty = sys.reduce((s, l) => s + Math.max(0, Number(l.qty) || 0), 0);
    const playerQty = playerQtyOf(state, zone, catalogId);
    const ref = sys.length ? Math.min(...sys.map((l) => Number(l.price) || 0)) : null;
    return {
      systemQty: sysQty,
      systemRefPrice: ref,
      playerQty,
      /** 系统断供 ⇒ 玩家可以高于参考价挂出 */
      playerCanPriceUp: sysQty <= 0,
      /** 供过于求 ⇒ 玩家需低于参考价才能成交 */
      crowded: playerQty >= SYS_BASE_QTY,
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
    // 自由市场参数（弹性补货）
    SYS_BASE_QTY,
    SYS_RESTOCK_PER_DAY,
    SYS_HARD_FLOOR,
    mondayKey,
    dayKey,
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
    supplyState,
    playerQtyOf,
    applyElasticRestock,
    defaultSystemListings,
    historyKey,
    getPriceSeries,
    priceStats,
    recordPrice,
    renderPriceChartHtml,
  };
})();
