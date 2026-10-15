/**
 * 数据调试台 UI
 */
(function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  let store = window.FBDebug.load();

  function toast(msg) {
    let el = $("#dbg-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "dbg-toast";
      el.className = "dbg-toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2200);
  }

  function persist() {
    window.FBDebug.save(store);
    window.FBDebug.applyAll();
    // 刷新 marketState 引用
    try {
      window.FBMarket?.getState?.();
    } catch (_) { /* ignore */ }
  }

  // —— Tabs ——
  $$(".dbg-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".dbg-tab").forEach((b) => b.classList.toggle("active", b === btn));
      $$(".dbg-panel").forEach((p) => p.classList.toggle("active", p.id === `panel-${btn.dataset.tab}`));
      if (btn.dataset.tab === "raw") $("#raw-json").value = JSON.stringify(store, null, 2);
    });
  });

  // —— Cards ——
  function allCardDefs() {
    const defs = { ...(window.FBCards?.CARD_DEFS || {}) };
    Object.assign(defs, window.FBCards?.PUNCT_DEFS || {});
    // words that only live in WORD_DEFS
    Object.entries(window.FBCards?.WORD_DEFS || {}).forEach(([id, w]) => {
      if (!defs[id]) {
        defs[id] = {
          id,
          name: w.name || id,
          type: "word",
          chant: w.chant || 1,
          desc: w.desc || w.effect || "",
          play: window.FBCards?.WORD_EFFECTS?.[id] || {},
        };
      }
    });
    return defs;
  }

  function renderCards() {
    const q = ($("#card-filter").value || "").trim().toLowerCase();
    const typeF = $("#card-type-filter").value;
    const defs = allCardDefs();
    const tbody = $("#card-table tbody");
    const rows = Object.values(defs)
      .filter((d) => {
        if (typeF && d.type !== typeF) return false;
        if (!q) return true;
        const hay = `${d.id} ${d.name} ${d.type} ${d.desc || ""}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));

    $("#card-count").textContent = `${rows.length} 张`;
    tbody.innerHTML = rows
      .map((d) => {
        const ov = store.cardOverrides[d.id] || {};
        const wr = store.cardWinRates[d.id] || {};
        const chant = ov.chant != null ? ov.chant : d.chant;
        const desc = ov.desc != null ? ov.desc : d.desc || "";
        const play =
          ov.play ||
          d.play ||
          window.FBCards?.WORD_EFFECTS?.[d.id] ||
          {};
        const playStr = JSON.stringify(play);
        return `<tr data-id="${d.id}">
          <td><code>${d.id}</code></td>
          <td><input class="inp" data-f="name" value="${esc(ov.name != null ? ov.name : d.name || "")}" /></td>
          <td>${d.type || "—"}</td>
          <td><input class="inp num" data-f="chant" type="number" min="0.5" step="0.5" value="${chant ?? 1}" /></td>
          <td><input class="inp wide" data-f="play" value="${esc(playStr)}" /></td>
          <td><input class="inp wide" data-f="desc" value="${esc(desc)}" /></td>
          <td><input class="inp num" data-f="winRate" type="number" min="0" max="100" step="1" value="${wr.winRate ?? ""}" placeholder="—" /></td>
          <td><input class="inp" data-f="note" value="${esc(wr.note || "")}" /></td>
        </tr>`;
      })
      .join("");

    tbody.querySelectorAll("tr").forEach((tr) => {
      const id = tr.dataset.id;
      tr.querySelectorAll("[data-f]").forEach((inp) => {
        inp.addEventListener("change", () => {
          const f = inp.dataset.f;
          if (f === "winRate" || f === "note") {
            store.cardWinRates[id] = store.cardWinRates[id] || {};
            if (f === "winRate") {
              const v = inp.value === "" ? null : Number(inp.value);
              if (v == null || Number.isNaN(v)) delete store.cardWinRates[id].winRate;
              else store.cardWinRates[id].winRate = Math.max(0, Math.min(100, v));
            } else store.cardWinRates[id].note = inp.value;
            if (!store.cardWinRates[id].winRate && !store.cardWinRates[id].note) {
              delete store.cardWinRates[id];
            }
          } else {
            store.cardOverrides[id] = store.cardOverrides[id] || {};
            if (f === "chant") store.cardOverrides[id].chant = Number(inp.value);
            else if (f === "name") store.cardOverrides[id].name = inp.value;
            else if (f === "desc") store.cardOverrides[id].desc = inp.value;
            else if (f === "play") {
              try {
                const obj = JSON.parse(inp.value || "{}");
                store.cardOverrides[id].play = obj;
                if ((allCardDefs()[id] || {}).type === "word" || window.FBCards?.WORD_EFFECTS?.[id]) {
                  store.wordEffectOverrides[id] = obj;
                }
                inp.classList.remove("bad");
              } catch {
                inp.classList.add("bad");
                toast("play JSON 无效");
                return;
              }
            }
          }
          persist();
          toast(`已保存 ${id}`);
        });
      });
    });
  }

  // —— Encounters ——
  function allEncounters() {
    const n = window.FBEncounters?.NORMAL_ENCOUNTERS || [];
    const h = window.FBEncounters?.HARD_ENCOUNTERS || [];
    return [
      ...n.map((e) => ({ ...e, _pool: "normal" })),
      ...h.map((e) => ({ ...e, _pool: "hard" })),
    ];
  }

  function renderEnc() {
    const q = ($("#enc-filter").value || "").trim().toLowerCase();
    const list = $("#enc-list");
    const rows = allEncounters().filter((e) => {
      if (!q) return true;
      return `${e.id} ${e.name} ${e._pool}`.toLowerCase().includes(q);
    });
    $("#enc-count").textContent = `${rows.length} 组`;
    list.innerHTML = rows
      .map((e) => {
        const ov = store.encOverrides[e.id] || {};
        const wr = store.encWinRates[e.id] || {};
        const units = e.units || [];
        const unitHtml = units
          .map((u, i) => {
            const uOv = (ov.units && ov.units[i]) || {};
            const hp = uOv.hp != null ? uOv.hp : u.hp;
            const cycleStr = JSON.stringify(uOv.cycle || u.cycle || [], null, 0);
            return `<div class="enc-unit">
              <div class="enc-unit-head">
                <strong>${esc(u.name)}</strong>
                <label>HP <input class="inp num" data-enc="${e.id}" data-ui="${i}" data-f="hp" type="number" value="${hp}" /></label>
              </div>
              <label class="block">行动周期 cycle JSON
                <textarea class="inp area" data-enc="${e.id}" data-ui="${i}" data-f="cycle" rows="3">${esc(cycleStr)}</textarea>
              </label>
            </div>`;
          })
          .join("");
        return `<article class="enc-card" data-id="${e.id}">
          <header>
            <div>
              <code>${e.id}</code>
              <input class="inp title" data-enc="${e.id}" data-f="name" value="${esc(ov.name != null ? ov.name : e.name)}" />
              <span class="pill">${e._pool}</span>
              <label>档 <input class="inp num" data-enc="${e.id}" data-f="tier" type="number" min="1" max="3" value="${ov.tier != null ? ov.tier : e.tier}" /></label>
            </div>
            <label>胜率% <input class="inp num" data-enc-wr="${e.id}" type="number" min="0" max="100" value="${wr.winRate ?? ""}" placeholder="—" /></label>
          </header>
          <p class="muted">单位行动：cycle 按序循环；字段如 damage / block / burn / freeze / attack[] …</p>
          ${unitHtml}
        </article>`;
      })
      .join("");

    list.querySelectorAll("[data-enc]").forEach((inp) => {
      inp.addEventListener("change", () => {
        const id = inp.dataset.enc;
        store.encOverrides[id] = store.encOverrides[id] || {};
        const f = inp.dataset.f;
        if (inp.dataset.ui != null) {
          const i = Number(inp.dataset.ui);
          store.encOverrides[id].units = store.encOverrides[id].units || [];
          store.encOverrides[id].units[i] = store.encOverrides[id].units[i] || {};
          if (f === "hp") store.encOverrides[id].units[i].hp = Number(inp.value);
          if (f === "cycle") {
            try {
              store.encOverrides[id].units[i].cycle = JSON.parse(inp.value);
              inp.classList.remove("bad");
            } catch {
              inp.classList.add("bad");
              toast("cycle JSON 无效");
              return;
            }
          }
        } else if (f === "name") store.encOverrides[id].name = inp.value;
        else if (f === "tier") store.encOverrides[id].tier = Number(inp.value);
        persist();
        toast(`已保存遭遇 ${id}`);
      });
    });
    list.querySelectorAll("[data-enc-wr]").forEach((inp) => {
      inp.addEventListener("change", () => {
        const id = inp.dataset.encWr;
        store.encWinRates[id] = store.encWinRates[id] || {};
        if (inp.value === "") delete store.encWinRates[id].winRate;
        else store.encWinRates[id].winRate = Math.max(0, Math.min(100, Number(inp.value)));
        if (!store.encWinRates[id].winRate) delete store.encWinRates[id];
        persist();
      });
    });
  }

  // —— Market ——
  function renderMarket() {
    const pack = window.FBMarket?.getState?.();
    const state = pack?.state;
    const list = $("#mkt-list");
    if (!state) {
      list.innerHTML = `<p class="muted">市场未加载</p>`;
      return;
    }
    const zf = $("#mkt-zone-filter").value;
    const q = ($("#mkt-filter").value || "").trim().toLowerCase();
    const rows = (state.listings || []).filter((l) => {
      if (zf && l.zone !== zf) return false;
      if (!q) return true;
      return `${l.name} ${l.catalogId} ${l.zone}`.toLowerCase().includes(q);
    });
    $("#mkt-count").textContent = `${rows.length} 条`;

    list.innerHTML = rows
      .map((l) => {
        const key = window.FBMarket.historyKey(l.zone, l.catalogId);
        const carry = store.marketCarryWinRates[key] || {};
        const series = window.FBMarket.getPriceSeries(state, l.zone, l.catalogId, l.price);
        const chart = window.FBMarket.renderPriceChartHtml(series, l.price, {
          title: `${l.name} · 价格波动`,
        });
        const ov = store.marketListingOverrides[l.id] || {};
        const price = ov.price != null ? ov.price : l.price;
        const qty = ov.qty != null ? ov.qty : l.qty;
        return `<article class="mkt-dbg-card" data-lid="${l.id}">
          <header>
            <div>
              <strong>${esc(l.name)}</strong>
              <span class="pill">${l.zone}</span>
              <span class="pill">${l.source}</span>
              <code>${esc(l.catalogId)}</code>
            </div>
          </header>
          <div class="mkt-dbg-fields">
            <label>价格 <input class="inp num" data-mkt="${l.id}" data-f="price" type="number" min="1" value="${price}" /></label>
            <label>库存 <input class="inp num" data-mkt="${l.id}" data-f="qty" type="number" min="0" value="${qty}" /></label>
            <label>携带胜率% <input class="inp num" data-carry="${key}" type="number" min="0" max="100" value="${carry.winRate ?? ""}" placeholder="—" /></label>
            <label class="grow">备注 <input class="inp" data-carry-note="${key}" value="${esc(carry.note || "")}" /></label>
          </div>
          ${chart}
          <div class="mkt-hist-edit">
            <span class="muted">快捷改最近一日均价：</span>
            <input class="inp num" data-hist="${key}" data-base="${l.price}" type="number" min="1" value="${series[series.length - 1]?.avg ?? l.price}" />
            <button type="button" class="btn" data-hist-btn="${key}">写入今日柱</button>
          </div>
        </article>`;
      })
      .join("");

    list.querySelectorAll("[data-mkt]").forEach((inp) => {
      inp.addEventListener("change", () => {
        const id = inp.dataset.mkt;
        store.marketListingOverrides[id] = store.marketListingOverrides[id] || {};
        store.marketListingOverrides[id][inp.dataset.f] = Number(inp.value);
        persist();
        // also patch live listing immediately
        const listing = (state.listings || []).find((x) => x.id === id);
        if (listing) {
          if (inp.dataset.f === "price") listing.price = Number(inp.value);
          if (inp.dataset.f === "qty") listing.qty = Number(inp.value);
          window.FBMarket.saveState(state);
        }
        toast("市场数值已保存");
        renderMarket();
      });
    });
    list.querySelectorAll("[data-carry]").forEach((inp) => {
      inp.addEventListener("change", () => {
        const key = inp.dataset.carry;
        store.marketCarryWinRates[key] = store.marketCarryWinRates[key] || {};
        if (inp.value === "") delete store.marketCarryWinRates[key].winRate;
        else store.marketCarryWinRates[key].winRate = Math.max(0, Math.min(100, Number(inp.value)));
        persist();
      });
    });
    list.querySelectorAll("[data-carry-note]").forEach((inp) => {
      inp.addEventListener("change", () => {
        const key = inp.dataset.carryNote;
        store.marketCarryWinRates[key] = store.marketCarryWinRates[key] || {};
        store.marketCarryWinRates[key].note = inp.value;
        persist();
      });
    });
    list.querySelectorAll("[data-hist-btn]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.histBtn;
        const inp = list.querySelector(`[data-hist="${key}"]`);
        const price = Number(inp?.value);
        if (!price) return;
        const [zone, catalogId] = key.split(":");
        window.FBMarket.recordPrice(state, zone, catalogId, price);
        window.FBMarket.saveState(state);
        toast("已写入今日价格柱");
        renderMarket();
      });
    });
  }

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  // —— Toolbar ——
  $("#card-filter").addEventListener("input", renderCards);
  $("#card-type-filter").addEventListener("change", renderCards);
  $("#enc-filter").addEventListener("input", renderEnc);
  $("#mkt-filter").addEventListener("input", renderMarket);
  $("#mkt-zone-filter").addEventListener("change", renderMarket);

  $("#btn-apply").addEventListener("click", () => {
    persist();
    toast("已套用到运行时（刷新试玩页生效完整链路）");
  });

  $("#btn-reset").addEventListener("click", () => {
    if (!confirm("清空全部调试覆盖与胜率记录？")) return;
    store = window.FBDebug.defaultStore();
    persist();
    renderCards();
    renderEnc();
    renderMarket();
    toast("已清空");
  });

  $("#btn-export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(store, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `fb-debug-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $("#btn-import").addEventListener("click", () => $("#import-file").click());
  $("#import-file").addEventListener("change", async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      store = { ...window.FBDebug.defaultStore(), ...JSON.parse(text) };
      persist();
      renderCards();
      renderEnc();
      renderMarket();
      toast("导入成功");
    } catch {
      toast("导入失败：JSON 无效");
    }
    ev.target.value = "";
  });

  $("#btn-raw-save").addEventListener("click", () => {
    try {
      store = { ...window.FBDebug.defaultStore(), ...JSON.parse($("#raw-json").value) };
      persist();
      toast("原始 JSON 已保存");
    } catch {
      toast("JSON 解析失败");
    }
  });

  // init
  window.FBDebug.applyAll();
  renderCards();
  renderEnc();
  renderMarket();
})();
