/**
 * 调试覆盖：localStorage → 运行时补丁
 * 键：fb_html_demo_debug_v1
 * 在 cards / encounters / market 之后加载；试玩 index 与 debug.html 共用。
 */
(function () {
  const KEY = "fb_html_demo_debug_v1";
  const VERSION = 1;

  function defaultStore() {
    return {
      version: VERSION,
      cardWinRates: {}, // id -> { winRate: 0-100, plays, wins, note }
      encWinRates: {},
      marketCarryWinRates: {}, // zone:catalogId -> { winRate, note }
      cardOverrides: {}, // id -> { chant?, desc?, play? }
      wordEffectOverrides: {}, // id -> effect object
      encOverrides: {}, // encId -> { name?, tier?, units?: [{ hp, cycle }] }
      marketListingOverrides: {}, // listingId -> { price?, qty? }
      updatedAt: 0,
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultStore();
      const data = JSON.parse(raw);
      return { ...defaultStore(), ...data, version: VERSION };
    } catch {
      return defaultStore();
    }
  }

  function save(store) {
    try {
      store.updatedAt = Date.now();
      store.version = VERSION;
      localStorage.setItem(KEY, JSON.stringify(store));
      return true;
    } catch (err) {
      console.warn("debug save failed", err);
      return false;
    }
  }

  function applyCardOverrides(store) {
    const defs = window.FBCards?.CARD_DEFS;
    if (!defs) return;
    Object.entries(store.cardOverrides || {}).forEach(([id, patch]) => {
      if (!defs[id] || !patch) return;
      if (patch.chant != null) defs[id].chant = Number(patch.chant) || defs[id].chant;
      if (patch.desc != null) defs[id].desc = String(patch.desc);
      if (patch.name != null) defs[id].name = String(patch.name);
      if (patch.play && typeof patch.play === "object") {
        defs[id].play = { ...(defs[id].play || {}), ...patch.play };
      }
    });
    const we = window.FBCards?.WORD_EFFECTS;
    const wd = window.FBCards?.WORD_DEFS;
    if (we) {
      Object.entries(store.wordEffectOverrides || {}).forEach(([id, eff]) => {
        if (eff && typeof eff === "object") {
          const copy = JSON.parse(JSON.stringify(eff));
          we[id] = copy;
          if (wd?.[id]) wd[id].effect = copy;
        }
      });
    }
  }

  function applyEncOverrides(store) {
    const pools = [
      window.FBEncounters?.NORMAL_ENCOUNTERS,
      window.FBEncounters?.HARD_ENCOUNTERS,
    ].filter(Boolean);
    Object.entries(store.encOverrides || {}).forEach(([encId, patch]) => {
      pools.forEach((pool) => {
        const enc = pool.find((e) => e.id === encId);
        if (!enc || !patch) return;
        if (patch.name != null) enc.name = String(patch.name);
        if (patch.tier != null) enc.tier = Number(patch.tier) || enc.tier;
        if (Array.isArray(patch.units)) {
          patch.units.forEach((uPatch, i) => {
            if (!enc.units[i] || !uPatch) return;
            if (uPatch.hp != null) enc.units[i].hp = Number(uPatch.hp) || enc.units[i].hp;
            if (uPatch.name != null) enc.units[i].name = String(uPatch.name);
            if (uPatch.cycle != null) {
              try {
                enc.units[i].cycle =
                  typeof uPatch.cycle === "string" ? JSON.parse(uPatch.cycle) : uPatch.cycle;
              } catch (_) { /* keep */ }
            }
          });
        }
      });
    });
  }

  function applyMarketOverrides(store) {
    if (!window.FBMarket?.getState) return;
    const { state } = window.FBMarket.getState();
    if (!state) return;
    let dirty = false;
    Object.entries(store.marketListingOverrides || {}).forEach(([lid, patch]) => {
      const listing = (state.listings || []).find((l) => l.id === lid);
      if (!listing || !patch) return;
      if (patch.price != null) {
        listing.price = Math.max(1, Math.floor(Number(patch.price) || listing.price));
        dirty = true;
      }
      if (patch.qty != null) {
        listing.qty = Math.max(0, Math.floor(Number(patch.qty) || 0));
        dirty = true;
      }
    });
    if (dirty) window.FBMarket.saveState(state);
  }

  function applyAll() {
    const store = load();
    applyCardOverrides(store);
    applyEncOverrides(store);
    applyMarketOverrides(store);
    return store;
  }

  window.FBDebug = {
    KEY,
    VERSION,
    load,
    save,
    applyAll,
    defaultStore,
  };

  // 自动应用（试玩页加载时生效）
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      try {
        applyAll();
      } catch (e) {
        console.warn("FBDebug apply failed", e);
      }
    });
  } else {
    try {
      applyAll();
    } catch (e) {
      console.warn("FBDebug apply failed", e);
    }
  }
})();
