/**
 * preview.js —— 悬浮放大预览（仿杀戮尖塔）
 *
 * 需求（用户）：任何时候鼠标在**卡牌 / 战备 / 收集品**上停留 1 秒，
 * 出现一个放大的卡片空间并向玩家展示其效果。
 *
 * 实现要点：
 *   · **事件委托**：在 document 上监听，任何元素只要带
 *     data-pv="card|equip|collect|material" + data-pv-id，就自动获得预览能力。
 *     这样新界面只需加两个属性，无需逐个绑定。
 *   · **1 秒延迟**：用 mouseover 检测「目标元素是否变化」来重置计时器。
 *     在子元素之间移动不算变化（否则卡片内的文字会不断打断计时）。
 *   · **视口避让**：优先显示在光标右侧，越界则翻到左侧/上移。
 *   · 纯读操作：只展示信息，不改动任何游戏状态。
 */
(function () {
  const DELAY_MS = 1000;
  const GAP = 16;        // 与光标的间距
  const MARGIN = 10;     // 距视口边缘

  let panel = null;
  let timer = null;
  let curTarget = null;  // 当前计时中的元素
  let mx = 0, my = 0;    // 最近一次鼠标位置

  function ensurePanel() {
    if (panel && document.body.contains(panel)) return panel;
    panel = document.createElement("aside");
    panel.className = "pv-panel";
    panel.setAttribute("role", "tooltip");
    panel.hidden = true;
    document.body.appendChild(panel);
    return panel;
  }

  function hide() {
    if (timer) { clearTimeout(timer); timer = null; }
    curTarget = null;
    if (panel) { panel.hidden = true; panel.innerHTML = ""; }
  }

  // ── 各类物品的信息组装 ──

  function cardInfo(id) {
    const C = window.FBCards;
    if (!C) return null;
    const def = C.CARD_DEFS?.[id] || C.WORD_DEFS?.[id];
    if (!def) return null;
    const fx = C.WORD_EFFECTS?.[id] || def.play || def.effect || null;
    const E = window.FBEconomy;
    const wv = E?.wvOf ? E.wvOf(fx || {}) : null;
    const price = E?.cardPriceOf && wv != null ? Math.round(E.cardPriceOf(id, wv, 1)) : null;
    const typeCN = { element: "元素", process: "操作", word: "字词", punct: "标点", curse: "诅咒" }[def.type] || def.type || "";
    const rows = [];
    if (def.chant != null) rows.push(["咏唱", `${def.chant}s`]);
    else if (fx?.chant != null) rows.push(["咏唱", `${fx.chant}s`]);
    if (wv != null && wv > 0) rows.push(["窗口价值", String(wv)]);
    if (price != null && price > 0) rows.push(["市场价", `${price} 代币`]);
    // 合成配方
    const rec = (C.SPECIAL_RECIPES || []).filter((r) => r.result === id);
    const recipeLine = rec.length
      ? rec.slice(0, 2).map((r) => r.materials.map((m) => C.CARD_DEFS?.[m]?.name || C.WORD_DEFS?.[m]?.name || m).join(" + ")).join(" ／ ")
      : "";
    return {
      kind: "card", name: def.name || id, sub: `${typeCN}${def.num ? " · " + def.num : ""}`,
      desc: def.desc || "", rows, recipe: recipeLine, accent: "card",
    };
  }

  function equipInfo(defId) {
    const L = window.FBLoadout, E = window.FBEconomy;
    const d = L?.EQUIP_DEFS?.[defId];
    if (!d) return null;
    const SLOT = { head: "头盔", body: "护甲", weapon: "武器", backpack: "背包", accessory: "饰品" };
    const rows = [];
    if (d.maxHpBonus) rows.push(["最大生命", `+${d.maxHpBonus}`]);
    if (d.startBlock) rows.push(["开局护甲", `+${d.startBlock}`]);
    if (d.hitInterval && d.hitDamage != null) {
      rows.push(["触发间隔", `${d.hitInterval}s`]);
      rows.push(["单次伤害", String(d.hitDamage)]);
      rows.push(["60s 总量", `${Math.floor(60 / d.hitInterval) * d.hitDamage}`]);
    }
    if (d.hitDebuff) rows.push(["附带", `${d.hitDebuff.key} ×${d.hitDebuff.amount}`]);
    if (d.damageReduction) rows.push(["受伤减免", `-${d.damageReduction}/次`]);
    if (d.debuffResist) rows.push(["debuff 抗性", Object.entries(d.debuffResist).map(([k, v]) => `${k}-${v}`).join(" ")]);
    if (d.capacity) rows.push(["收集品栏", `${d.capacity} 格`]);
    const wv = L?.equipWv ? L.equipWv(d) : null;
    const mc = L?.recipeValue ? L.recipeValue(defId) : 0;
    let price = null;
    if (E?.equipPrice) price = Math.round(E.equipPrice(wv, mc));
    if (price != null) rows.push(["价格", `${price} 代币`]);
    if (mc > 0 && price != null) rows.push(["合成成本", `${mc}（省 ${price - mc}）`]);
    const rec = L?.equipRecipe ? L.equipRecipe(defId) : null;
    const MATS = window.FBLoot?.MATERIALS || {};
    const recipeLine = rec ? rec.map((m) => MATS[m]?.name || m).join(" + ") : "";
    return {
      kind: "equip", name: d.name, sub: `${SLOT[d.slot] || d.slot} · 战备`,
      desc: d.desc || "", rows, recipe: recipeLine,
      icon: d.icon ? `img/equip/${d.icon}.png` : null, accent: "equip",
    };
  }

  function collectInfo(item) {
    if (!item) return null;
    const rows = [["稀有度", item.rarityLabel || item.rarity || "—"], ["价值", `${item.value || 0} 代币`]];
    const isMat = !!item.isMaterial;
    return {
      kind: isMat ? "material" : "collect",
      name: item.name, sub: isMat ? "战备合成材料" : "收集品",
      desc: item.desc || "", rows,
      icon: isMat ? materialIcon(item.materialId) : null,
      accent: isMat ? "material" : "collect",
    };
  }

  function materialIcon(materialId) {
    const map = {
      fiber_weave: "mat_fiber", alloy_plate: "mat_alloy", gunpowder: "mat_gunpowder",
      primer: "mat_primer", crystal_lens: "mat_lens", ember_core: "mat_ember",
      toxic_sac: "mat_toxic", seal_rune: "mat_rune",
    };
    return map[materialId] ? `img/equip/${map[materialId]}.png` : null;
  }

  /** 根据 data-pv / data-pv-id 解析出预览内容 */
  function resolve(el) {
    const kind = el.dataset.pv;
    const id = el.dataset.pvId;
    if (kind === "card") return cardInfo(id);
    if (kind === "equip") return equipInfo(id);
    if (kind === "collect" || kind === "material") {
      // 收集品是实例：由调用方把 JSON 存在 data-pv-json（短小），或退化为名称+价值
      try { return collectInfo(JSON.parse(el.dataset.pvJson || "null")); } catch { return null; }
    }
    return null;
  }

  function render(info) {
    const p = ensurePanel();
    const icon = info.icon
      ? `<img class="pv-icon" src="${info.icon}?v=eq1" alt="" />`
      : `<span class="pv-glyph pv-glyph-${info.accent}">${(info.name || "?").slice(0, 1)}</span>`;
    const rows = (info.rows || [])
      .map(([k, v]) => `<div class="pv-row"><span class="pv-k">${k}</span><span class="pv-v">${v}</span></div>`)
      .join("");
    const recipe = info.recipe
      ? `<div class="pv-recipe"><span class="pv-k">合成</span><span class="pv-v">${info.recipe}</span></div>`
      : "";
    p.innerHTML = `
      <header class="pv-head pv-head-${info.accent}">
        ${icon}
        <div class="pv-titles">
          <strong class="pv-name">${info.name}</strong>
          <span class="pv-sub">${info.sub || ""}</span>
        </div>
      </header>
      ${info.desc ? `<p class="pv-desc">${info.desc}</p>` : ""}
      ${rows ? `<div class="pv-rows">${rows}</div>` : ""}
      ${recipe}`;
    p.className = `pv-panel pv-${info.accent}`;
    p.hidden = false;
    place(p);
  }

  /** 视口避让：优先右侧，越界翻左；上下夹紧。@param at 可注入光标位置（测试用） */
  function place(p, at) {
    const px = at?.x ?? mx, py = at?.y ?? my;
    const r = p.getBoundingClientRect();
    const vw = window.innerWidth || 1280, vh = window.innerHeight || 800;
    let x = px + GAP;
    let y = py - r.height / 2;
    // 右侧放不下 → 翻到光标左侧
    if (x + r.width + MARGIN > vw) x = px - GAP - r.width;
    x = Math.max(MARGIN, Math.min(x, vw - r.width - MARGIN));
    y = Math.max(MARGIN, Math.min(y, vh - r.height - MARGIN));
    p.style.left = `${Math.round(x)}px`;
    p.style.top = `${Math.round(y)}px`;
  }

  function closestPreviewable(node) {
    let el = node instanceof Element ? node : null;
    while (el && el !== document.body) {
      if (el.dataset && el.dataset.pv) return el;
      el = el.parentElement;
    }
    return null;
  }

  function init() {
    if (typeof document === "undefined" || !document.body) return;

    document.addEventListener("mousemove", (e) => { mx = e.clientX; my = e.clientY; }, { passive: true });

    document.addEventListener("mouseover", (e) => {
      const el = closestPreviewable(e.target);
      if (el === curTarget) {
        // 仍在同一元素内（含其子元素）：不重置计时
        if (panel && !panel.hidden) place(panel);
        return;
      }
      if (timer) { clearTimeout(timer); timer = null; }
      curTarget = el;
      if (panel) { panel.hidden = true; }
      if (!el) return;
      // 记录此刻光标位置，1 秒后按当时位置弹出
      mx = e.clientX; my = e.clientY;
      timer = setTimeout(() => {
        timer = null;
        if (curTarget !== el) return;         // 期间已移开
        const info = resolve(el);
        if (info) render(info);
      }, DELAY_MS);
    });

    document.addEventListener("mouseout", (e) => {
      const el = closestPreviewable(e.target);
      if (!el) return;
      const to = e.relatedTarget;
      // 移到该元素内部（子元素）不算离开
      if (to && el.contains(to)) return;
      if (el === curTarget) hide();
    });

    // 滚动/失焦/点击时收起（避免残留浮层）
    window.addEventListener("scroll", hide, { passive: true, capture: true });
    window.addEventListener("blur", hide);
    document.addEventListener("mousedown", hide, true);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
  }

  window.FBPreview = { init, hide, DELAY_MS, place, _resolve: resolve, _render: render };
})();
