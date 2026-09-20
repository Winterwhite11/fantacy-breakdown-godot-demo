/**
 * 事件运行时：结算效果、卡牌进出、战斗挂起
 */
(function () {
  function randomCardId() {
    const defs = window.FBCards?.CARD_DEFS || {};
    const ids = Object.keys(defs);
    if (!ids.length) return null;
    // 略偏向前中期元素/操作，避免过强
    const prefer = ids.filter((id) => {
      const t = defs[id].type;
      return t === "element" || t === "process";
    });
    const pool = prefer.length ? prefer : ids;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function betterCardId() {
    const defs = window.FBCards?.CARD_DEFS || {};
    const strong = ["steel", "electric", "gold", "ice", "poison", "amp", "compress"];
    const avail = strong.filter((id) => defs[id]);
    if (avail.length) return avail[Math.floor(Math.random() * avail.length)];
    return randomCardId();
  }

  function deckCardIds(loadout) {
    const ids = [];
    Object.entries(loadout.deck || {}).forEach(([id, n]) => {
      for (let i = 0; i < (n || 0); i++) ids.push(id);
    });
    return ids;
  }

  function addCardToStash(loadout, cardId) {
    if (!cardId) return null;
    loadout.cardStash[cardId] = (loadout.cardStash[cardId] || 0) + 1;
    return cardId;
  }

  function loseRandomDeckCard(loadout) {
    const ids = deckCardIds(loadout);
    if (!ids.length) return null;
    const id = ids[Math.floor(Math.random() * ids.length)];
    loadout.deck[id] = (loadout.deck[id] || 0) - 1;
    if (loadout.deck[id] <= 0) delete loadout.deck[id];
    return id;
  }

  /**
   * @returns {{ logs: string[], continueOpen?: boolean, combat?: object, goto?: string, end?: boolean, ctxPatch?: object }}
   */
  function applyEffects(effects, ctx) {
    const {
      run,
      loadout,
      maxHp,
    } = ctx;
    const logs = [];
    let continueOpen = false;
    let combat = null;
    let goto = null;
    let end = false;
    const ctxPatch = {};

    const list = Array.isArray(effects) ? effects : [];
    for (const fx of list) {
      if (!fx || !fx.type) continue;

      if (fx.type === "hp") {
        const before = run.hp;
        run.hp = Math.max(0, Math.min(maxHp(), run.hp + fx.delta));
        logs.push(`生命 ${before} → ${run.hp}`);
      } else if (fx.type === "tokens") {
        const before = run.tokens;
        run.tokens = Math.max(0, run.tokens + fx.delta);
        logs.push(`代币 ${before} → ${run.tokens}`);
      } else if (fx.type === "card_random") {
        const n = fx.count || 1;
        for (let i = 0; i < n; i++) {
          const id = fx.preferBetter ? betterCardId() : randomCardId();
          const got = addCardToStash(loadout, id);
          if (got) {
            const name = window.FBCards.CARD_DEFS[got]?.name || got;
            logs.push(`获得卡牌「${name}」（入库）`);
          }
        }
      } else if (fx.type === "card_lose_random") {
        const n = fx.count || 1;
        for (let i = 0; i < n; i++) {
          const lost = loseRandomDeckCard(loadout);
          if (lost) {
            const name = window.FBCards.CARD_DEFS[lost]?.name || lost;
            logs.push(`失去携带牌「${name}」`);
          } else {
            logs.push("携带牌组已空，未能失去卡牌");
          }
        }
      } else if (fx.type === "card_swap_random") {
        const lost = loseRandomDeckCard(loadout);
        const id = fx.preferBetter ? betterCardId() : randomCardId();
        const got = addCardToStash(loadout, id);
        if (lost) {
          logs.push(`失去「${window.FBCards.CARD_DEFS[lost]?.name || lost}」`);
        } else {
          logs.push("无携带牌可失去（仍获得新卡）");
        }
        if (got) logs.push(`获得「${window.FBCards.CARD_DEFS[got]?.name || got}」`);
      } else if (fx.type === "item") {
        run.inventory = run.inventory || [];
        run.inventory.push({
          id: fx.itemId,
          name: fx.name || fx.itemId,
          placeholder: true,
        });
        logs.push(`获得道具「${fx.name || fx.itemId}」（占位·暂无效果）`);
      } else if (fx.type === "flag_set") {
        run.flags = run.flags || {};
        run.flags[fx.flag] = fx.value;
        logs.push(`记录：${fx.flag}`);
      } else if (fx.type === "goto") {
        goto = fx.node;
        if (fx.init) Object.assign(ctxPatch, fx.init);
      } else if (fx.type === "end_event") {
        end = true;
      } else if (fx.type === "ctx_inc") {
        ctxPatch[fx.key] = (ctx.eventCtx?.[fx.key] || 0) + (fx.by || 1);
      } else if (fx.type === "pay_random") {
        const opts = fx.options || [];
        const pick = opts[Math.floor(Math.random() * opts.length)];
        if (pick) {
          const sub = applyEffects([pick], ctx);
          logs.push(...sub.logs);
        }
      } else if (fx.type === "chance") {
        const rate = typeof fx.rateFrom === "function"
          ? fx.rateFrom(ctx.eventCtx || {})
          : Number(fx.rate) || 0.5;
        const ok = Math.random() < rate;
        const narr = ok ? fx.successNarrative : fx.failNarrative;
        if (narr) logs.push(...(Array.isArray(narr) ? narr : [narr]));
        const branch = ok ? fx.success : fx.fail;
        const sub = applyEffects(branch || [], ctx);
        logs.push(...sub.logs);
        if (sub.combat) combat = sub.combat;
        if (sub.goto) goto = sub.goto;
        if (sub.end) end = true;
        Object.assign(ctxPatch, sub.ctxPatch || {});
        if (!ok && fx.onFailKeepOpen) continueOpen = true;
        if (ok && branch?.some?.(() => false)) { /* noop */ }
        if (ok) {
          // success may end via end_event inside
        } else if (fx.onFailKeepOpen) {
          continueOpen = true;
        }
      } else if (fx.type === "combat") {
        combat = {
          pool: fx.pool || "normal",
          onWin: fx.onWin || [],
          onLoseLock: true,
        };
      } else if (fx.type === "combat_chain") {
        combat = {
          chain: (fx.fights || []).map((f) => ({
            pool: f.pool || "normal",
            onWin: f.onWin || [],
          })),
          onLoseLock: true,
        };
      }
    }

    return { logs, continueOpen, combat, goto, end, ctxPatch };
  }

  /** 角色专属选项：未选对应角色时完全不显示（不灰显占位） */
  function visibleChoices(eventDef, run) {
    const charId = run.character || null;
    return (eventDef.choices || []).filter((c) => {
      if (!c.requireCharacter) return true;
      return c.requireCharacter === charId;
    });
  }

  window.FBEventRuntime = {
    applyEffects,
    visibleChoices,
    randomCardId,
    addCardToStash,
    loseRandomDeckCard,
  };
})();
