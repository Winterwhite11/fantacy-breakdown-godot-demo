/** Real-time combat with chanting timeline + 5s monster turns. */
(function () {
const Cards = window.FBCards;
const WINDUP = Cards.WINDUP;
const RECOVER = Cards.RECOVER;
const ARMOR_DURATION = Cards.ARMOR_DURATION;
const TOLERANCE = Cards.TOLERANCE;
const standardDamage = Cards.standardDamage;
const previewCraft = Cards.previewCraft;
const buildTestDeck = Cards.buildTestDeck;
const shuffle = Cards.shuffle;

const HAND_LIMIT = 10;
const DRAW_INTERVAL = 2;
const MONSTER_TURN = 5;
/** 燃烧 / 中毒 / 流血 / 隐匿等：按设计每 5s（一行动回合）结算一次 */
const STATUS_INTERVAL = 5;
const PLAYER_MAX_HP = 60;

class CombatEngine {
  constructor(hooks) {
    this.hooks = hooks; // { onUpdate, onLog, onEnd }
    this.reset();
  }

  reset() {
    this.running = false;
    this.paused = false;
    this.speed = 1;
    this.time = 0;
    this.round = 1;
    this.lastDrawAt = 0;
    this.tokens = 0;
    this.glory = 0;
    this.env = null;
    this.lastStatusAt = 0;

    this.player = {
      name: "拓宇者",
      hp: PLAYER_MAX_HP,
      maxHp: PLAYER_MAX_HP,
      block: 0,
      blockExpire: 0,
      atkBonus: 0,
      nextAtkBonus: 0,
      weak: 0,
      vulnerable: 0,
      burn: 0,
      poison: 0,
      freeze: 0,
      bleed: 0,
      sticky: false,
      pollute: false,
      immuneUntil: 0,
      recoveringUntil: 0,
      busyUntil: 0,
      chant: null,
      skipWindupNext: false,
      reflectNext: false,
      stealth: 0,
      fervor: 0,
      kindle: false,
      tough: false,
      nextBurn: false,
      markCharcoal: false,
    };

    this.encounter = null;
    this.enemies = [];
    /** 玩家召唤物（非敌人）；无存活单位时 UI 不显示召唤栏。uid 建议 ally:* */
    this.allies = [];
    this.player.uid = "player";
    this.draw = [];
    this.discard = [];
    this.hand = [];
    this.craft = [];
    this.craftResult = null;
    this.pendingDrawAt = null; // stack delayed draw
    this.pendingHits = []; // { at, damage, src, aoe }
    this.logs = [];
    this.ended = false;
    this.won = false;
    this.TIME_STEP = 0.5;
    this.autoflowing = false;
    this._autoflowTimer = null;
    this._autoflowRealMs = 140;
    this._gearIntervals = [];
    this._playsThisWindow = 0;
    this.chantReduce = 0;
    this.chantReduceUntil = 0;
  }

  start(encounter, opts = {}) {
    this.reset();
    const maxHp = Math.max(1, opts.maxHp != null ? opts.maxHp : PLAYER_MAX_HP);
    const startHp = Math.min(maxHp, Math.max(1, opts.hp != null ? opts.hp : maxHp));
    this.player.maxHp = maxHp;
    this.player.hp = startHp;
    this.encounter = encounter;
    this.enemies = window.FBEncounters.spawnUnits(encounter);
    this.draw = Array.isArray(opts.deck) && opts.deck.length
      ? opts.deck.slice()
      : buildTestDeck();
    this.hand = [];
    for (let i = 0; i < 5; i++) this._drawOne(false);
    this.lastDrawAt = 0;
    this.running = true;

    // 装备：开场护甲
    if (opts.startBlock > 0) {
      this._addPlayerBlock(opts.startBlock);
      this.log(`装备效果：战斗开始获得 ${opts.startBlock} 护甲`);
    }
    // 装备：间隔伤害（如简易手枪）
    this._gearIntervals = Array.isArray(opts.gearIntervals) ? opts.gearIntervals.map((g) => ({
      every: g.every,
      damage: g.damage,
      name: g.name || "装备",
      nextAt: g.every,
    })) : [];
    // 道具/收集品：player_resist（受到对应状态时减层）
    this._playerResists = Array.isArray(opts.playerResists) ? opts.playerResists.slice() : [];

    this.log(`遭遇 ${encounter.id}「${encounter.name}」· ${this.enemies.length} 个单位`);
    const punctN = this.draw.filter((c) => c.type === "punct").length
      + this.hand.filter((c) => c.type === "punct").length;
    if (punctN > 0) {
      this.log(`牌组不足下限，已用 ${punctN} 张标点卡填充`);
    }
    this.log(`生命 ${this.player.hp}/${this.player.maxHp} · 牌库 ${this.draw.length + this.hand.length} 张`);
    this.log("时间默认静止。点「时间流动」推进 0.5s；咏唱打出后时间轴自动流至后摇结束，再恢复静止。");
    this.log("起始手牌 5 张；时间每累计 2s 抽 1 张。怪物每 5s 行动一次。");
    this.log("燃烧/中毒/流血/隐匿等 Debuff 每 5s 结算一次（对齐行动回合）。");
    this.hooks.onUpdate();
  }

  stop() {
    this.running = false;
    this._stopAutoflow(false);
  }

  setPaused() {
    /* 已改为手动时间流动，保留空实现以免旧 UI 报错 */
  }

  setSpeed() {
    /* 离散时间步下倍速暂不使用 */
  }

  /** 手动推进战斗时间（默认 0.5s）。咏唱自动流动中不可用。 */
  advanceTime(step = this.TIME_STEP) {
    if (!this.running || this.ended) return false;
    if (this.autoflowing) {
      this.log("咏唱进行中，时间轴正自动流动…");
      return false;
    }
    const dt = Number(step) || this.TIME_STEP;
    this._tick(dt);
    this.hooks.onUpdate();
    return true;
  }

  _stopAutoflow(announce) {
    if (this._autoflowTimer != null) {
      clearTimeout(this._autoflowTimer);
      this._autoflowTimer = null;
    }
    const was = this.autoflowing;
    this.autoflowing = false;
    if (announce && was && !this.ended) {
      this.log("后摇结束，时间恢复静止");
    }
  }

  /** 咏唱开始后：按 0.5s 步长自动推进，直到后摇结束。 */
  _startChantAutoflow() {
    this._stopAutoflow(false);
    this.autoflowing = true;
    const stepOnce = () => {
      this._autoflowTimer = null;
      if (!this.running || this.ended) {
        this.autoflowing = false;
        return;
      }
      // 后摇已取消/结束
      if (!this.player.chant && this.player.busyUntil <= this.time) {
        this._stopAutoflow(true);
        this.hooks.onUpdate();
        return;
      }
      this._tick(this.TIME_STEP);
      this.hooks.onUpdate();
      if (this.ended) {
        this.autoflowing = false;
        return;
      }
      if (!this.player.chant && this.player.busyUntil <= this.time) {
        this._stopAutoflow(true);
        this.hooks.onUpdate();
        return;
      }
      this._autoflowTimer = setTimeout(stepOnce, this._autoflowRealMs);
    };
    this._autoflowTimer = setTimeout(stepOnce, this._autoflowRealMs);
  }

  log(msg) {
    const line = `[${this.time.toFixed(1)}s] ${msg}`;
    this.logs.push(line);
    if (this.logs.length > 80) this.logs.shift();
    this.hooks.onLog(line);
  }

  _tick(dt) {
    this.time = Math.round((this.time + dt) * 1000) / 1000;
    this.round = Math.floor(this.time / MONSTER_TURN) + 1;

    // Periodic draw（按战斗时间累计，非现实时间）
    while (this.time - this.lastDrawAt >= DRAW_INTERVAL) {
      this.lastDrawAt = Math.round((this.lastDrawAt + DRAW_INTERVAL) * 1000) / 1000;
      this._drawOne(true);
    }

    // Delayed stack draws
    if (this.pendingDrawAt != null && this.time >= this.pendingDrawAt) {
      this.pendingDrawAt = null;
      this._drawOne(true);
      this._drawOne(true);
      this.log("堆砌生效：抽 2 张");
    }

    // 延迟命中（如电击重复）
    if (this.pendingHits?.length && !this.ended) {
      const due = this.pendingHits.filter((h) => this.time >= h.at);
      this.pendingHits = this.pendingHits.filter((h) => this.time < h.at);
      for (const h of due) {
        if (h.aoe) this._damageAllEnemies(h.damage, h.src, { pierce: h.pierce });
        else this._damageEnemy(h.targetUid || this._defaultTarget(), h.damage, h.src, { pierce: h.pierce });
      }
    }

    // Armor expire
    if (this.player.block > 0 && this.time >= this.player.blockExpire) {
      this.player.block = 0;
      this.log("护甲消散");
    }
    for (const e of this.enemies) {
      if (e.blockExpire != null && this.time >= e.blockExpire) e.block = 0;
    }

    // Player chant phases
    this._tickPlayerChant();

    // Debuff 结算：每 5s 一次（与怪物行动回合对齐）
    while (this.time - this.lastStatusAt >= STATUS_INTERVAL - 1e-9) {
      this.lastStatusAt = Math.round((this.lastStatusAt + STATUS_INTERVAL) * 1000) / 1000;
      this._settleStatusTick();
      if (this.ended) break;
    }

    // 装备间隔伤害（如手枪每 10s）
    if (this._gearIntervals?.length && !this.ended) {
      for (const g of this._gearIntervals) {
        while (!this.ended && this.time >= g.nextAt) {
          const target = this._defaultTarget();
          if (target) {
            this._damageEnemy(target, g.damage, g.name);
            this.log(`${g.name}：造成 ${g.damage} 点伤害`);
          }
          g.nextAt = Math.round((g.nextAt + g.every) * 1000) / 1000;
        }
      }
    }

    // Enemy actions（同一时刻可触发多个单位）
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (!e.awake) continue;
      while (!e.dead && e.awake && this.time >= e.nextActionAt) {
        this._enemyAct(e);
        e.nextActionAt = Math.round((e.nextActionAt + MONSTER_TURN) * 1000) / 1000;
        if (this.ended) break;
      }
    }

    this._checkEnd();
  }

  /**
   * 按 card table.docx 词条：每 5s 结算一次
   * 燃烧：受到层数一半伤害，随后层数减半
   * 中毒：受到层数伤害，随后层数 +1
   * 流血：失去层数生命
   * 隐匿：层数减半
   * 冻结：阈值检查（>10 虚弱，>20 易伤，>生命上限死亡）
   */
  _settleStatusTick() {
    this.log(`—— 状态结算（${this.lastStatusAt.toFixed(1)}s）——`);

    // —— 玩家 ——
    const p = this.player;
    if (p.burn > 0) {
      const dmg = Math.ceil(p.burn / 2);
      this._statusDamagePlayer(dmg, "燃烧");
      p.burn = Math.floor(p.burn / 2);
      this.log(`燃烧残余 ${p.burn} 层`);
    }
    if (p.poison > 0) {
      this._statusDamagePlayer(p.poison, "中毒");
      p.poison += 1;
      this.log(`中毒层数 → ${p.poison}`);
    }
    if (p.bleed > 0) {
      this._statusDamagePlayer(p.bleed, "流血");
    }
    if ((p.stealth || 0) > 0) {
      p.stealth = Math.floor(p.stealth / 2);
      this.log(`隐匿减半 → ${p.stealth}`);
    }
    this._applyFreezeThresholds(p, "你");

    if (this.ended) return;

    // —— 敌人 ——
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.burn > 0) {
        const dmg = Math.ceil(e.burn / 2);
        this._statusDamageEnemy(e, dmg, "燃烧");
        e.burn = Math.floor(e.burn / 2);
        if (!e.dead) this.log(`${e.name} 燃烧残余 ${e.burn} 层`);
      }
      if (e.dead) continue;
      if (e.poison > 0) {
        this._statusDamageEnemy(e, e.poison, "中毒");
        if (!e.dead) {
          e.poison += 1;
          this.log(`${e.name} 中毒层数 → ${e.poison}`);
        }
      }
      if (e.dead) continue;
      if (e.bleed > 0) {
        this._statusDamageEnemy(e, e.bleed, "流血");
      }
      if (e.dead) continue;
      this._applyFreezeThresholds(e, e.name);
    }

    // 环境 tick（卡表：岩浆/酸雨/沼泽/沙暴/毒雾/冻土）
    this._settleEnvTick();

    // 黏稠窗口：每 5s 重置本窗口打出计数
    this._playsThisWindow = 0;

    this._checkEnd();
  }

  /** 卡表环境效果：每行动回合结算 */
  _settleEnvTick() {
    if (!this.env) return;
    const env = this.env;
    const foes = () => this.enemies.filter((e) => !e.dead);
    if (env === "lava") {
      for (const e of foes()) this._statusDamageEnemy(e, 10, "环境·岩浆");
      this.log("环境「岩浆」：全体环境伤害 10");
    } else if (env === "acid_rain") {
      for (const e of foes()) {
        e.poison = (e.poison || 0) + 10;
        if (e.block > 0) e.block = Math.floor(e.block / 2);
      }
      this.log("环境「酸雨」：全体中毒 +10，护甲减半");
    } else if (env === "swamp") {
      for (const e of foes()) e.weak = (e.weak || 0) + 1;
      this.log("环境「沼泽」：全体虚弱 +1");
    } else if (env === "sandstorm") {
      this._addPlayerBlock(5);
      this.log("环境「沙暴」：获得环境护甲 5");
    } else if (env === "poison_mist") {
      for (const e of foes()) {
        e.weak = (e.weak || 0) + 1;
        e.vulnerable = (e.vulnerable || 0) + 1;
        e.poison = (e.poison || 0) + 3;
      }
      this.log("环境「毒雾」：全体虚弱/易伤 +1、中毒 +3");
    } else if (env === "permafrost") {
      for (const e of foes()) e.freeze = (e.freeze || 0) + 2;
      this.log("环境「冻土」：全体冻结 +2");
    }
  }

  _applyFreezeThresholds(unit, label) {
    const fr = unit.freeze || 0;
    if (fr <= 0) return;
    const maxHp = unit.maxHp || PLAYER_MAX_HP;
    if (fr > maxHp) {
      this.log(`${label} 冻结超过生命上限，死亡`);
      if (unit === this.player) {
        unit.hp = 0;
        this._finish(false);
      } else {
        unit.hp = 0;
        unit.dead = true;
      }
      return;
    }
    if (fr > 20) {
      unit.vulnerable = Math.max(unit.vulnerable || 0, 1);
      this.log(`${label} 冻结>${20}：易伤`);
    } else if (fr > 10) {
      unit.weak = Math.max(unit.weak || 0, 1);
      this.log(`${label} 冻结>${10}：虚弱`);
    }
  }

  /** DoT：不触发荆棘；仍吃护甲 / 免疫 / 易伤 */
  _statusDamagePlayer(raw, src) {
    let dmg = raw;
    if (this.player.vulnerable > 0) dmg = Math.floor(dmg * 1.5);
    if (this.time < this.player.immuneUntil) dmg = Math.min(1, dmg);
    if (this.player.block > 0) {
      const used = Math.min(this.player.block, dmg);
      this.player.block -= used;
      dmg -= used;
    }
    if (dmg > 0) {
      this.player.hp -= dmg;
      this.log(`${src}：你受到 ${dmg} 伤害（HP ${Math.max(0, this.player.hp)}）`);
    }
    if (this.player.hp <= 0) {
      this.player.hp = 0;
      this._finish(false);
    }
  }

  _statusDamageEnemy(e, raw, src) {
    let dmg = raw;
    if ((e.vulnerable || 0) > 0) dmg = Math.floor(dmg * 1.5);
    if (e.block > 0) {
      const used = Math.min(e.block, dmg);
      e.block -= used;
      dmg -= used;
    }
    if (dmg > 0) {
      e.hp -= dmg;
      this.log(`${src} → ${e.name} 受到 ${dmg} 伤害（HP ${Math.max(0, e.hp)}）`);
    }
    if (e.hp <= 0) {
      e.hp = 0;
      e.dead = true;
      this.log(`${e.name} 被击败`);
    }
  }

  _drawOne(announce) {
    if (this.hand.length >= HAND_LIMIT) return;
    if (!this.draw.length) {
      if (!this.discard.length) return;
      this.draw = shuffle(this.discard);
      this.discard = [];
      if (announce) this.log("弃牌堆洗入抽牌堆");
    }
    const c = this.draw.pop();
    if (!c) return;
    this.hand.push(c);
    if (announce) this.log(`抽到「${c.name}」`);
  }

  addToCraft(handIndex) {
    if (this.ended || this.player.busyUntil > this.time) return;
    if (handIndex < 0 || handIndex >= this.hand.length) return;
    if (this.craft.length >= TOLERANCE) {
      this.log("铭文耐性已满");
      return;
    }
    const [card] = this.hand.splice(handIndex, 1);
    this.craft.push(card);
    this.craftResult = null;
  }

  clearCraft() {
    this.hand.push(...this.craft);
    this.craft = [];
    this.craftResult = null;
  }

  doCraft() {
    const preview = previewCraft(this.craft);
    if (!preview.card) {
      this.log(preview.meta || "无法合成");
      return { ok: false };
    }
    const product = preview.card;
    // 材料绑定进产物，不进弃牌；打出进弃牌时再分解回材料（战斗不改永久牌组）
    const mats = this.craft.slice();
    product.fromCraft = true;
    product.craftedFrom = mats.map((c) => JSON.parse(JSON.stringify(c)));
    this.craft = [];
    this.craftResult = null;
    this.hand.push(product);
    this.log(
      `合成成功：「${product.name}」入手（战斗临时）· 进弃牌后将分解为 ${mats.map((m) => m.name).join("+")}`
    );
    return { ok: true, card: product, handIndex: this.hand.length - 1 };
  }

  /** Play crafted preview without putting intermediate in hand, or play selected craft result path */
  playCraftDirect(targetUid) {
    const preview = previewCraft(this.craft);
    if (!preview.card) {
      this.log("组合台无有效合成结果");
      return false;
    }
    if (!this._canStartChant()) return false;
    if (this.player.sticky && this._playsThisWindow >= 1) {
      this.log("黏稠：本窗口无法再打出卡牌（每 5s 重置）");
      return false;
    }
    const card = preview.card;
    const mats = this.craft.slice();
    card.fromCraft = true;
    card.craftedFrom = mats.map((c) => JSON.parse(JSON.stringify(c)));
    this.craft = [];
    this.craftResult = null;
    this._playsThisWindow += 1;
    this._startChant(card, targetUid);
    return true;
  }

  /**
   * 卡牌指向性（杀戮尖塔式）：攻击→敌人；防御→自己/玩家召唤物；纯攻击拖到自己需二次确认自伤。
   */
  getCardTargeting(card) {
    if (!card) return { mode: "none", valid: [], isAttack: false, isDefense: false, selfHarm: false };
    if (card.type === "process" || card.type === "punct" || card.type === "curse") {
      return { mode: "none", valid: [], isAttack: false, isDefense: false, selfHarm: false, instant: true };
    }
    const fx = { ...(card.play || {}), ...(card.effect || {}) };
    const aoe = !!(fx.aoe || fx.aoeAll || fx.choose === "steam");
    const hasDmg =
      fx.damage != null ||
      !!fx.multi ||
      !!fx.damageByChant ||
      !!fx.purified ||
      !!fx.consumeFervorDamage ||
      !!fx.shockRepeat ||
      fx.choose === "steam";
    const hasDebuff = !!(
      fx.burn ||
      fx.freeze ||
      fx.poison ||
      fx.stripBlockHalf ||
      fx.stripBlockHand ||
      fx.vulnerable ||
      fx.weak ||
      fx.acDot ||
      fx.alwaysBurn
    );
    const hasDef = !!(
      fx.block ||
      fx.blockByChant ||
      fx.heal ||
      fx.multiBlock ||
      fx.immuneSeconds ||
      fx.reflectNext ||
      fx.skipWindupNext
    );
    const isAttack = hasDmg || hasDebuff;
    const isDefense = hasDef && !isAttack;
    if (aoe) {
      return { mode: "aoe", valid: ["enemy", "aoe"], isAttack: true, isDefense: hasDef, selfHarm: false };
    }
    if (isDefense) {
      return { mode: "ally", valid: ["self", "ally"], isAttack: false, isDefense: true, selfHarm: false };
    }
    if (isAttack && hasDef) {
      // 攻防混合：可点两边；自伤不强制二次确认（仅纯攻击牌警告）
      return { mode: "any", valid: ["enemy", "self", "ally"], isAttack: true, isDefense: true, selfHarm: false };
    }
    if (isAttack) {
      return { mode: "enemy", valid: ["enemy", "self"], isAttack: true, isDefense: false, selfHarm: true };
    }
    // 纯增益/辉煌等：默认对自己
    if (hasDef || fx.glory || fx.fervor || fx.kindle) {
      return { mode: "ally", valid: ["self", "ally"], isAttack: false, isDefense: true, selfHarm: false };
    }
    return { mode: "none", valid: [], isAttack: false, isDefense: false, selfHarm: false };
  }

  _isSelfTarget(uid) {
    return uid === "self" || uid === "player" || uid === this.player?.uid;
  }

  _isAllyTarget(uid) {
    return typeof uid === "string" && uid.startsWith("ally:");
  }

  _findAlly(uid) {
    if (!this._isAllyTarget(uid)) return null;
    const id = uid.slice(5);
    return (this.allies || []).find((a) => !a.dead && (a.uid === uid || a.uid === id || a.id === id));
  }

  _targetLabel(uid) {
    if (this._isSelfTarget(uid)) return "自己";
    if (this._isAllyTarget(uid)) {
      const a = this._findAlly(uid);
      return a?.name || "召唤物";
    }
    if (uid === "aoe") return "全体敌人";
    return this._enemyName(uid);
  }

  /** 解析敌对效果落点：敌人 / 自己 / 召唤物 */
  _hostileSink(targetUid) {
    if (this._isSelfTarget(targetUid)) return { kind: "self", unit: this.player };
    if (this._isAllyTarget(targetUid)) {
      const a = this._findAlly(targetUid);
      return a ? { kind: "ally", unit: a } : null;
    }
    const e = this._findEnemy(targetUid) || this.enemies.find((x) => !x.dead);
    return e ? { kind: "enemy", unit: e } : null;
  }

  _addUnitBlock(unit, n, kind) {
    if (!unit) return;
    if (kind === "self" || unit === this.player) {
      this._addPlayerBlock(n);
      return;
    }
    const add = n + (unit.reinforce || 0);
    unit.block = (unit.block || 0) + add;
    unit.blockExpire = this.time + ARMOR_DURATION;
    this.log(`${unit.name} 获得护甲 ${add}`);
  }

  /** 入弃牌：合成牌自动分解为材料 */
  _toDiscard(card) {
    if (!card) return;
    if (card.craftedFrom?.length) {
      const mats = card.craftedFrom.map((c) => JSON.parse(JSON.stringify(c)));
      this.discard.push(...mats);
      this.log(`「${card.name}」分解 → ${mats.map((m) => m.name).join("、")}`);
      return;
    }
    this.discard.push(card);
  }

  playHand(handIndex, targetUid) {
    if (!this._canStartChant()) return false;
    if (handIndex < 0 || handIndex >= this.hand.length) return false;
    if (this.player.sticky && this._playsThisWindow >= 1) {
      this.log("黏稠：本窗口无法再打出卡牌（每 5s 重置）");
      return false;
    }
    const [card] = this.hand.splice(handIndex, 1);
    this._playsThisWindow += 1;
    // Instant process effects that skip full chant path partially
    if (card.type === "process" && !card.effect) {
      this._resolveProcessInstant(card);
      this._toDiscard(card);
      return true;
    }
    if (card.type === "punct") {
      this.log(`标点「${card.name}」：无效果`);
      this._toDiscard(card);
      return true;
    }
    if (card.type === "curse") {
      this.log(`诅咒「${card.name}」：无效果（收集品占位）`);
      this._toDiscard(card);
      return true;
    }
    this._startChant(card, targetUid);
    return true;
  }

  _canStartChant() {
    if (this.ended) return false;
    if (this.player.busyUntil > this.time) {
      this.log("咏唱/后摇中，无法行动");
      return false;
    }
    return true;
  }

  _startChant(card, targetUid) {
    let chantSec = Math.max(0.5, card.chant || 1);
    if (this.chantReduce > 0 && this.time < this.chantReduceUntil) {
      chantSec = Math.max(0.5, chantSec - this.chantReduce);
    }
    let windup = WINDUP;
    let recover = RECOVER;
    if (this.player.skipWindupNext) {
      windup = 0;
      recover = 0;
      this.player.skipWindupNext = false;
      this.log("冷气/根须效果：本次无视前后摇");
    }
    const windupEnd = this.time + windup;
    const chantEnd = windupEnd + chantSec;
    const recoverEnd = chantEnd + recover;
    const targeting = this.getCardTargeting(card);
    let target = targetUid;
    if (target == null || target === "") {
      if (targeting.mode === "ally" || targeting.mode === "none") target = "self";
      else if (targeting.mode === "aoe") target = "aoe";
      else target = this._defaultTarget();
    }
    this.player.chant = {
      card,
      targetUid: target,
      windupEnd,
      chantEnd,
      recoverEnd,
      phase: windup > 0 ? "windup" : "chant",
    };
    this.player.busyUntil = recoverEnd;
    this.player.recoveringUntil = recoverEnd;
    this.log(`开始咏唱「${card.name}」· ${chantSec}s（目标 ${this._targetLabel(target)}）· 时间轴自动流动至后摇结束`);
    this._startChantAutoflow();
  }

  _tickPlayerChant() {
    const ch = this.player.chant;
    if (!ch) return;
    if (ch.phase === "windup" && this.time >= ch.windupEnd) {
      ch.phase = "chant";
    }
    if (ch.phase === "chant" && this.time >= ch.chantEnd) {
      ch.phase = "resolve";
      this._resolveCard(ch.card, ch.targetUid);
      ch.phase = "recover";
    }
    if (ch.phase === "recover" && this.time >= ch.recoverEnd) {
      this.player.chant = null;
      this.player.busyUntil = 0;
      this.player.recoveringUntil = 0;
    }
  }

  _resolveProcessInstant(card) {
    if (card.defId === "compress") {
      if (this.hand.length) {
        const i = Math.floor(Math.random() * this.hand.length);
        this._toDiscard(this.hand.splice(i, 1)[0]);
      }
      this._drawOne(true);
      this.log("压缩：弃 1 抽 1");
    } else if (card.defId === "stack") {
      this.pendingDrawAt = this.time + 5;
      this.log("堆砌：5 秒后抽 2");
    } else if (card.defId === "heat") {
      this.player.atkBonus += 1;
      this.log("加热：攻击力 +1");
    } else if (card.defId === "cool") {
      if (this.player.chant && this.player.chant.phase === "recover") {
        this.player.chant = null;
      }
      this.player.busyUntil = 0;
      this.player.recoveringUntil = 0;
      this.log("冷却：解除后摇");
    } else if (card.defId === "amp") {
      this.player.nextAtkBonus += 3;
      this.log("增幅：下次攻击伤害 +3");
    }
  }

  _resolveCard(card, targetUid) {
    if (this.player.pollute) {
      this._damagePlayer(3, "污染反噬");
    }

    // Process alone already handled; word / element / crafted
    if (card.type === "process") {
      this._resolveProcessInstant(card);
      this._toDiscard(card);
      return;
    }

    if (card.type === "punct") {
      this.log(`标点「${card.name}」：无效果`);
      this._toDiscard(card);
      return;
    }

    if (card.type === "element") {
      this._resolveElement(card, targetUid);
      this._toDiscard(card);
      return;
    }

    if (card.type === "word" && card.effect) {
      this._resolveEffect(card.effect, card, targetUid);
      this._toDiscard(card);
      return;
    }

    this._toDiscard(card);
  }

  _resolveElement(card, targetUid) {
    const boost = this.player.atkBonus + this.player.nextAtkBonus;
    this.player.nextAtkBonus = 0;
    const play = card.play || window.FBCards.CARD_DEFS[card.defId]?.play || {};
    if (play.damage != null) {
      this._dealCardDamage(play.damage + boost, card.name, targetUid, {});
    }
    if (play.multi) {
      for (const d of play.multi) this._dealCardDamage(d + boost, card.name, targetUid, {});
    }
    if (play.block) {
      const sink = this._hostileSink(targetUid);
      if (sink && (sink.kind === "self" || sink.kind === "ally")) this._addUnitBlock(sink.unit, play.block, sink.kind);
      else this._addPlayerBlock(play.block);
    }
    if (play.poison) this._applyStatusToTarget(targetUid, "poison", play.poison, card.name);
    if (play.freeze) this._applyStatusToTarget(targetUid, "freeze", play.freeze, card.name);
    if (play.glory) {
      this.glory += play.glory;
      this.log(`${card.name}：辉煌 +${play.glory}`);
    }
    if (play.fervor) {
      this.player.fervor = (this.player.fervor || 0) + play.fervor;
      this.log(`${card.name}：激昂 +${play.fervor}`);
    }
  }

  _applyStatusToTarget(targetUid, key, amount, src) {
    const aoe = targetUid === "aoe";
    const list = aoe
      ? this.enemies.filter((e) => !e.dead)
      : (() => {
          const sink = this._hostileSink(targetUid);
          return sink ? [sink.unit] : [];
        })();
    if (!list.length) return;
    for (const u of list) {
      u[key] = (u[key] || 0) + amount;
    }
    const names = list.map((u) => u.name || "自己").join("、");
    this.log(`${src}：${names} ${key}+${amount}`);
  }

  _resolveEffect(fx, card, targetUid) {
    const boost = this.player.atkBonus + this.player.nextAtkBonus;
    this.player.nextAtkBonus = 0;
    const Cards = window.FBCards;
    const std = Cards.standardDamage;
    const dmgOpts = { pierce: !!fx.pierce };

    // 蒸汽：卡表对敌范围 5
    if (fx.choose === "steam") {
      this._dealCardDamage(5 + boost, card.name, targetUid, { aoe: true, ...dmgOpts });
      return;
    }

    if (fx.heal) {
      const sink = this._hostileSink(targetUid);
      const unit = sink && (sink.kind === "self" || sink.kind === "ally") ? sink.unit : this.player;
      const max = unit.maxHp || this.player.maxHp;
      unit.hp = Math.min(max, (unit.hp || 0) + fx.heal);
      this.log(`${card.name}：${unit.name || "自己"} 回复 ${fx.heal}`);
    }
    if (fx.block) {
      const sink = this._hostileSink(targetUid);
      const amt = fx.block + (fx.heatBoost || 0);
      if (sink && (sink.kind === "self" || sink.kind === "ally")) this._addUnitBlock(sink.unit, amt, sink.kind);
      else this._addPlayerBlock(amt);
    }
    if (fx.multiBlock) {
      const sink = this._hostileSink(targetUid);
      for (const b of fx.multiBlock) {
        const amt = b + (fx.heatBoost || 0);
        if (sink && (sink.kind === "self" || sink.kind === "ally")) this._addUnitBlock(sink.unit, amt, sink.kind);
        else this._addPlayerBlock(amt);
      }
    }
    if (fx.damage != null) {
      let dmg = fx.damage + boost + (fx.heatBoost || 0);
      if (fx.gloryScale) dmg += (this.glory || 0) * fx.gloryScale;
      if (fx.burnBonus && targetUid) {
        const e = this._findEnemy(targetUid);
        if (e && (e.burn || 0) > 0) dmg += fx.burnBonus;
      }
      if (fx.burnBonusStack && targetUid) {
        const e = this._findEnemy(targetUid);
        if (e && (e.burn || 0) > 0) dmg += (e.burn || 0) * (fx.burnBonusStack || 1);
      }
      if (this.player.kindle) dmg = Math.floor(dmg * 1.5);
      this._dealCardDamage(dmg, card.name, targetUid, {
        aoe: !!(fx.aoe || fx.aoeAll),
        ...dmgOpts,
        killHeal: fx.killHeal,
        alwaysBurn: fx.alwaysBurn,
      });
    }
    if (fx.multi) {
      for (const d of fx.multi) {
        let hit = d + boost + (fx.heatBoost || 0);
        if (this.player.kindle) hit = Math.floor(hit * 1.5);
        this._dealCardDamage(hit, card.name, targetUid, {
          aoe: !!(fx.aoe || fx.aoeAll),
          ...dmgOpts,
        });
        const hitTargets = (fx.aoe || fx.aoeAll)
          ? this.enemies.filter((e) => !e.dead)
          : [this._findEnemy(targetUid) || this.enemies.find((x) => !x.dead)].filter(Boolean);
        for (const e of hitTargets) {
          if (fx.burnPerHit) e.burn = (e.burn || 0) + fx.burnPerHit;
          if (fx.poisonPerHit) e.poison = (e.poison || 0) + fx.poisonPerHit;
        }
      }
    }
    if (fx.damageByChant) {
      this._dealCardDamage(std(card.chant) + boost, card.name, targetUid, {
        aoe: !!(fx.aoe || fx.aoeAll),
        ...dmgOpts,
      });
    }
    if (fx.blockByChant) {
      const sink = this._hostileSink(targetUid);
      const amt = std(card.chant);
      if (sink && (sink.kind === "self" || sink.kind === "ally")) this._addUnitBlock(sink.unit, amt, sink.kind);
      else this._addPlayerBlock(amt);
    }
    if (fx.purified) {
      this._dealCardDamage(std(1.5) + boost, card.name, targetUid, dmgOpts);
    }
    if (fx.burn) {
      this._applyStatusToTarget(
        fx.aoe || fx.aoeAll || targetUid === "aoe" ? "aoe" : targetUid,
        "burn",
        fx.burn,
        card.name
      );
    }
    if (fx.freeze) {
      this._applyStatusToTarget(
        fx.aoe || fx.aoeAll || targetUid === "aoe" ? "aoe" : targetUid,
        "freeze",
        fx.freeze,
        card.name
      );
    }
    if (fx.poison) {
      this._applyStatusToTarget(
        fx.aoe || fx.aoeAll || targetUid === "aoe" ? "aoe" : targetUid,
        "poison",
        fx.poison,
        card.name
      );
    }
    if (fx.stripBlockHalf) {
      const targets = fx.aoe || fx.aoeAll
        ? this.enemies.filter((e) => !e.dead)
        : [this._findEnemy(targetUid) || this.enemies.find((x) => !x.dead)].filter(Boolean);
      for (const e of targets) {
        if (e.block > 0) {
          e.block = Math.floor(e.block / 2);
          this.log(`${card.name}：${e.name} 护甲减半 → ${e.block}`);
        }
      }
    }
    if (fx.immuneSeconds) {
      this.player.immuneUntil = this.time + fx.immuneSeconds;
      this.log(`${card.name}：免疫 ${fx.immuneSeconds}s`);
    }
    if (fx.skipWindupNext) {
      this.player.skipWindupNext = true;
      this.log(`${card.name}：下次咏唱无视前后摇`);
    }
    if (fx.reflectNext) {
      this.player.reflectNext = true;
      this.log(`${card.name}：下次受伤反弹`);
    }
    if (fx.interrupt) {
      for (const e of this.enemies) {
        if (e.dead) continue;
        e.nextActionAt = Math.round((e.nextActionAt + 2) * 1000) / 1000;
      }
      this.log(`${card.name}：打断 — 全体下次行动 +2s`);
    }
    if (fx.glory) this.glory += fx.glory;
    if (fx.loseGlory) {
      this.glory = Math.max(0, this.glory - fx.loseGlory);
      this.log(`${card.name}：辉煌 -${fx.loseGlory} → ${this.glory}`);
    }
    if (fx.kindle) {
      this.player.kindle = true;
      this.log(`${card.name}：点燃 — 伤害 ×1.5`);
    }
    if (fx.fervor) {
      this.player.fervor = (this.player.fervor || 0) + fx.fervor;
      this.log(`${card.name}：激昂 +${fx.fervor}`);
    }
    if (fx.fervorExtend) {
      this.player.fervor = (this.player.fervor || 0) + fx.fervorExtend;
      this.log(`${card.name}：激昂延长/叠加 +${fx.fervorExtend}`);
    }
    if (fx.draw) {
      for (let i = 0; i < fx.draw; i++) this._drawOne(true);
    }
    if (fx.heatDrive) {
      if ((this.player.burn || 0) > 0) {
        this.player.atkBonus += 1;
        this._drawOne(true);
        this._drawOne(true);
        this.player.burn = 0;
        this.log(`${card.name}：热驱动 — 攻+1、抽2、清除自身燃烧`);
      } else {
        for (const e of this.enemies) {
          if (!e.dead) e.burn = (e.burn || 0) + 3;
        }
        this.log(`${card.name}：热驱动 — 全体燃烧 +3`);
      }
    }
    if (fx.settleBurn) {
      for (const e of this.enemies) {
        if (e.dead || !(e.burn > 0)) continue;
        const dmg = Math.ceil(e.burn / 2);
        this._statusDamageEnemy(e, dmg, `${card.name}·结算燃烧`);
        e.burn = Math.floor(e.burn / 2);
      }
    }
    if (fx.doublePoison) {
      for (const e of this.enemies) {
        if (e.dead || !(e.poison > 0)) continue;
        e.poison *= 2;
        this.log(`${card.name}：${e.name} 中毒翻倍 → ${e.poison}`);
      }
    }
    if (fx.vulnerable) {
      const e = this._findEnemy(targetUid) || this.enemies.find((x) => !x.dead);
      if (e) {
        e.vulnerable = (e.vulnerable || 0) + fx.vulnerable;
        this.log(`${card.name}：${e.name} 易伤 +${fx.vulnerable}`);
      }
    }
    if (fx.stealth) {
      this.player.stealth = (this.player.stealth || 0) + fx.stealth;
      this.log(`${card.name}：隐匿 +${fx.stealth}`);
    }
    if (fx.env) {
      this.env = fx.env;
      this.log(`${card.name}：环境 → ${fx.env}`);
    }
    if (fx.tough) {
      this.player.tough = true;
      this.log(`${card.name}：坚固 — 护甲持续时间延长`);
    }
    if (fx.nextBurn) {
      this.player.nextBurn = true;
      this.log(`${card.name}：下次攻击附加燃烧`);
    }
    if (fx.markCharcoal) {
      this.player.markCharcoal = true;
      this.log(`${card.name}：标记木炭`);
    }
    if (fx.electricChantReduce) {
      this.chantReduce = fx.electricChantReduce;
      this.chantReduceUntil = this.time + (fx.duration || 10);
      this.log(`${card.name}：咏唱时间 -${fx.electricChantReduce}s（${fx.duration || 10}s 内）`);
    }
    if (fx.shockRepeat) {
      const base = 3 + boost;
      this._dealCardDamage(base, card.name, targetUid, dmgOpts);
      this.pendingHits.push(
        { at: this.time + 3, damage: base, src: `${card.name}·重复`, targetUid },
        { at: this.time + 6, damage: base, src: `${card.name}·重复`, targetUid }
      );
      this.log(`${card.name}：将于 +3s / +6s 再各造成 ${base} 伤`);
    }
    if (fx.acDot) {
      for (let i = 1; i <= 5; i++) {
        this.pendingHits.push({
          at: this.time + i * 5,
          damage: 1,
          src: `${card.name}·交流电`,
          aoe: true,
        });
      }
      this.log(`${card.name}：5 段延迟 1 伤（每 5s）`);
    }
    if (fx.consumeFervorDamage) {
      const f = this.player.fervor || 0;
      const dmg = f * fx.consumeFervorDamage + boost;
      this.player.fervor = 0;
      this._dealCardDamage(dmg, card.name, targetUid, { aoe: !!(fx.aoe || fx.aoeAll), ...dmgOpts });
      this.log(`${card.name}：消耗激昂 ${f} → ${dmg} 伤`);
    }
    if (fx.addSurgeCopy) {
      try {
        const copy = window.FBCards.makeWordCard("surge", 1);
        this.hand.push(copy);
        this.log(`${card.name}：手牌获得「电涌」`);
      } catch (_) {
        this.log(`${card.name}：无法生成电涌副本`);
      }
    }
    if (fx.overheat) {
      const got = this._addPlayerStatus("burn", 2, card.name, { applyResist: false });
      if (got > 0) this.log(`${card.name}：过热 — 自身燃烧 +${got}`);
    }
    if (fx.overload) {
      const f = this.player.fervor || 0;
      if (f > 0) {
        const got = this._addPlayerStatus("burn", f * 2, card.name, { applyResist: false });
        if (got > 0) this.log(`${card.name}：过载 — 激昂转化为燃烧 ${got}`);
      }
    }
    if (fx.raw && !fx.damage && !fx.damageByChant && !fx.multi && !fx.block && !fx.heal && !fx.consumeFervorDamage && !fx.shockRepeat) {
      this._dealCardDamage(std(card.chant) + boost, card.name, targetUid, dmgOpts);
      this.log(`（docx 原文）${fx.raw}`);
    }
    if (
      fx.element &&
      (fx.heatBoost || fx.cool) &&
      !fx.damageByChant &&
      !fx.blockByChant &&
      !fx.purified &&
      fx.damage == null &&
      !fx.multi
    ) {
      const el = {
        defId: fx.element,
        name: card.name,
        type: "element",
        play: window.FBCards.CARD_DEFS[fx.element]?.play,
      };
      if (fx.heatBoost) {
        this.player.atkBonus += fx.heatBoost;
        this._resolveElement(el, targetUid);
        this.player.atkBonus -= fx.heatBoost;
      } else {
        this._resolveElement(el, targetUid);
      }
    }
  }

  /** 统一卡伤：支持 AOE / 自伤 / 召唤物 / 穿透 / 击杀回血 / 始终燃烧 */
  _dealCardDamage(raw, src, targetUid, opts = {}) {
    const aoe = !!opts.aoe || targetUid === "aoe";

    if (!aoe && (this._isSelfTarget(targetUid) || this._isAllyTarget(targetUid))) {
      let dmg = raw;
      if (this.player.weak > 0) dmg = Math.floor(dmg * 0.75);
      if ((this.player.fervor || 0) > 0) dmg += this.player.fervor;
      if (this._isSelfTarget(targetUid)) {
        this._damagePlayer(dmg, `${src}（自伤）`);
        if (opts.alwaysBurn) this.player.burn = (this.player.burn || 0) + Math.max(1, Math.floor(raw / 4));
        if (this.player.nextBurn) {
          this.player.burn = (this.player.burn || 0) + 2;
          this.player.nextBurn = false;
        }
        return;
      }
      const ally = this._findAlly(targetUid);
      if (!ally) return;
      if ((ally.vulnerable || 0) > 0) dmg = Math.floor(dmg * 1.5);
      if (!opts.pierce && ally.block > 0) {
        const used = Math.min(ally.block, dmg);
        ally.block -= used;
        dmg -= used;
      }
      if (dmg > 0) {
        ally.hp -= dmg;
        this.log(`${src} → ${ally.name} 受到 ${dmg} 伤害（HP ${Math.max(0, ally.hp)}）`);
        if (ally.hp <= 0) {
          ally.hp = 0;
          ally.dead = true;
          this.log(`${ally.name} 倒下`);
        }
      }
      if (opts.alwaysBurn) ally.burn = (ally.burn || 0) + Math.max(1, Math.floor(raw / 4));
      if (this.player.nextBurn) {
        ally.burn = (ally.burn || 0) + 2;
        this.player.nextBurn = false;
      }
      return;
    }

    const targets = aoe
      ? this.enemies.filter((e) => !e.dead)
      : [this._findEnemy(targetUid) || this.enemies.find((x) => !x.dead)].filter(Boolean);
    if (!targets.length) return;
    for (const e of targets) {
      this._damageEnemy(e.uid, raw, src, opts);
      if (opts.alwaysBurn) e.burn = (e.burn || 0) + Math.max(1, Math.floor(raw / 4));
      if (this.player.nextBurn) e.burn = (e.burn || 0) + 2;
    }
    if (this.player.nextBurn) {
      this.player.nextBurn = false;
      this.log(`${src}：下次燃烧已触发`);
    }
    if (opts.killHeal) {
      const anyDead = targets.some((e) => e.dead);
      if (anyDead) {
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + opts.killHeal);
        this.log(`${src}：击杀回复 ${opts.killHeal}`);
      }
    }
  }

  _damageAllEnemies(raw, src, opts = {}) {
    for (const e of this.enemies) {
      if (!e.dead) this._damageEnemy(e.uid, raw, src, opts);
    }
  }

  _addPlayerBlock(n) {
    const add = n + (this.player.reinforce || 0);
    const dur = ARMOR_DURATION + (this.player.tough ? ARMOR_DURATION : 0);
    this.player.block += add;
    this.player.blockExpire = this.time + dur;
    this.log(`获得护甲 ${add}（持续 ${dur}s）`);
  }

  _addEnemyBlock(e, n) {
    const add = n + (e.reinforce || 0);
    e.block += add;
    e.blockExpire = this.time + ARMOR_DURATION;
  }

  _defaultTarget() {
    const alive = this.enemies.filter((e) => !e.dead);
    return alive[0]?.uid || null;
  }

  _enemyName(uid) {
    return this.enemies.find((e) => e.uid === uid)?.name || "—";
  }

  _findEnemy(uid) {
    return this.enemies.find((e) => e.uid === uid && !e.dead);
  }

  _damageEnemy(uid, raw, src, opts = {}) {
    let e = this._findEnemy(uid) || this.enemies.find((x) => !x.dead);
    if (!e) return;
    if (e.sleepUntilHit && !e.awake) {
      e.awake = true;
      this.log(`${e.name} 被惊醒！`);
    }
    let dmg = raw;
    if (this.player.weak > 0) dmg = Math.floor(dmg * 0.75);
    // 激昂：造成的伤害增加激昂层数
    if ((this.player.fervor || 0) > 0) dmg += this.player.fervor;
    if ((e.weak || 0) > 0) dmg = Math.floor(dmg * 0.75);
    if ((e.vulnerable || 0) > 0) dmg = Math.floor(dmg * 1.5);
    if (!opts.pierce && e.block > 0) {
      const used = Math.min(e.block, dmg);
      e.block -= used;
      dmg -= used;
    } else if (opts.pierce && e.block > 0) {
      this.log(`${src}：穿透，无视护甲 ${e.block}`);
    }
    if (dmg > 0) {
      e.hp -= dmg;
      this.log(`${src} → ${e.name} 受到 ${dmg} 伤害（HP ${Math.max(0, e.hp)}）`);
      if (e.thorns > 0) this._damagePlayer(e.thorns, `${e.name}荆棘`);
    } else {
      this.log(`${src} → ${e.name} 被护甲完全挡住`);
    }
    if (e.hp <= 0) {
      e.hp = 0;
      e.dead = true;
      this.log(`${e.name} 被击败`);
    }
  }

  _damagePlayer(raw, src) {
    let dmg = raw;
    if (this.player.vulnerable > 0) dmg = Math.floor(dmg * 1.5);
    if (this.time < this.player.immuneUntil) dmg = Math.min(1, dmg);
    // 隐匿：低于隐匿层数的伤害不生效
    if ((this.player.stealth || 0) > 0 && dmg < this.player.stealth) {
      this.log(`${src}：伤害 ${dmg} < 隐匿 ${this.player.stealth}，未生效`);
      return;
    }
    if (this.player.block > 0) {
      const used = Math.min(this.player.block, dmg);
      this.player.block -= used;
      dmg -= used;
    }
    if (dmg > 0 && this.player.reflectNext) {
      this.player.reflectNext = false;
      this.log(`琉璃反弹：${src} 的 ${dmg} 伤害被弹回`);
      const foe = this.enemies.find((x) => !x.dead);
      if (foe) this._damageEnemy(foe.uid, dmg, "反弹");
      dmg = 0;
    }
    if (dmg > 0) {
      this.player.hp -= dmg;
      this.log(`${src}：你受到 ${dmg} 伤害（HP ${Math.max(0, this.player.hp)}）`);
    }
    if (this.player.hp <= 0) {
      this.player.hp = 0;
      this._finish(false);
    }
  }

  _enemyAct(e) {
    // decay
    if (e.decayPerTurn) {
      e.hp -= e.decayPerTurn;
      this.log(`${e.name} 崩坏 -${e.decayPerTurn} HP`);
      if (e.hp <= 0) {
        e.dead = true;
        e.hp = 0;
        this.log(`${e.name} 崩坏倒下`);
        return;
      }
    }

    const intent = e.cycle[e.step % e.cycle.length];
    e.step += 1;
    e.actingUntil = this.time + 0.8;
    this.log(`${e.name} 行动：${intent.label}`);

    const alliesAlive = this.enemies.filter((x) => !x.dead && x.uid !== e.uid).length;

    if (intent.skipIfAlliesAlive && alliesAlive > 0) {
      this.log(`${e.name} 因队友仍在而放弃攻击`);
      return;
    }

    if (intent.block) this._addEnemyBlock(e, intent.block);
    if (intent.multiBlock) for (const b of intent.multiBlock) this._addEnemyBlock(e, b);
    if (intent.attackBonus) e.atkBonus += intent.attackBonus;
    if (intent.reinforce) e.reinforce += intent.reinforce;
    if (intent.thorns) e.thorns += intent.thorns;
    if (intent.maxHpBoost) {
      e.maxHp += intent.maxHpBoost;
      e.hp += intent.maxHpBoost;
    }

    const hit = (n) => this._damagePlayer(n + e.atkBonus, e.name);

    if (intent.damage) hit(intent.damage);
    if (intent.attack) for (const a of intent.attack) hit(a);
    if (intent.rampDamage) {
      e.attackCount += 1;
      hit(3 + 2 * (e.attackCount - 1));
    }
    if (intent.roundScaled) hit(intent.roundScaled * this.round);

    if (intent.vulnerable) this._addPlayerStatus("vulnerable", intent.vulnerable, e.name);
    if (intent.weak) this._addPlayerStatus("weak", intent.weak, e.name);
    if (intent.poison) this._addPlayerStatus("poison", intent.poison, e.name);
    if (intent.burn) this._addPlayerStatus("burn", intent.burn, e.name);
    if (intent.freeze) this._addPlayerStatus("freeze", intent.freeze, e.name);
    if (intent.bleed) this._addPlayerStatus("bleed", intent.bleed, e.name);
    if (intent.sticky) {
      this.player.sticky = true;
      this._playsThisWindow = 0;
      this.log(`${e.name}：施加黏稠（本窗口限打 1 张，每 5s 重置）`);
    }
    if (intent.polluteHand) this.player.pollute = true;
    if (intent.stealCard && this.hand.length) {
      const i = Math.floor(Math.random() * this.hand.length);
      this._toDiscard(this.hand.splice(i, 1)[0]);
      this.log(`${e.name} 偷走一张手牌`);
    }
    if (intent.biteCard) {
      this.log(`${e.name} 塞入撕咬卡（Demo：施加虚弱）`);
      this._addPlayerStatus("weak", 1, e.name);
    }
  }

  /** 对玩家叠状态；默认吃 player_resist。自伤/过热传 { applyResist: false } */
  _addPlayerStatus(status, amount, src, opts = {}) {
    let amt = Math.max(0, Number(amount) || 0);
    if (!amt || !status) return 0;
    const applyResist = opts.applyResist !== false;
    let reduced = 0;
    if (applyResist) {
      for (const r of this._playerResists || []) {
        if (r.status !== status) continue;
        const by = Math.max(0, Number(r.reducedBy) || 0);
        if (!by) continue;
        const cut = Math.min(amt, by);
        amt -= cut;
        reduced += cut;
      }
    }
    if (amt > 0) {
      this.player[status] = (this.player[status] || 0) + amt;
    }
    if (reduced > 0) {
      const who = src ? `${src}：` : "";
      this.log(`${who}${status} 抗性减免 ${reduced}${amt ? `，实际 +${amt}` : "（全免）"}`);
    }
    return amt;
  }

  endAction() {
    // Demo: clear sticky / small recover skip
    this.player.sticky = false;
    this.log("结束行动：清除黏稠标记");
  }

  autoSortHand() {
    const order = { element: 0, process: 1, word: 2 };
    this.hand.sort((a, b) => (order[a.type] ?? 9) - (order[b.type] ?? 9) || a.name.localeCompare(b.name, "zh"));
    this.log("手牌已整理");
  }

  _checkEnd() {
    if (this.ended) return;
    if (this.enemies.every((e) => e.dead)) this._finish(true);
  }

  _finish(won) {
    this.ended = true;
    this.won = won;
    this.running = true; // keep raf for UI until leave
    this.log(won ? "战斗胜利！" : "战斗失败…");
    this.hooks.onEnd(won);
  }

  timelineSnapshot(windowSec = 20) {
    const t0 = this.time;
    const scale = (abs) => ((abs - t0) / windowSec) * 100;
    const playerBars = [];
    if (this.player.chant) {
      const ch = this.player.chant;
      playerBars.push({
        cls: "windup",
        left: Math.max(0, scale(ch.windupEnd - WINDUP)),
        width: Math.max(2, scale(ch.windupEnd) - Math.max(0, scale(ch.windupEnd - WINDUP))),
        label: "前摇",
      });
      playerBars.push({
        cls: "chant",
        left: Math.max(0, scale(ch.windupEnd)),
        width: Math.max(2, scale(ch.chantEnd) - Math.max(0, scale(ch.windupEnd))),
        label: ch.card.name,
      });
      playerBars.push({
        cls: "recover",
        left: Math.max(0, scale(ch.chantEnd)),
        width: Math.max(2, scale(ch.recoverEnd) - Math.max(0, scale(ch.chantEnd))),
        label: "后摇",
      });
    }
    const enemyTracks = this.enemies.filter((e) => !e.dead).map((e) => {
      const left = Math.max(0, scale(e.nextActionAt - 0.6));
      const width = Math.max(3, scale(e.nextActionAt + 0.4) - left);
      const intent = e.cycle[e.step % e.cycle.length];
      return {
        name: e.name,
        bars: [{ cls: "enemy-act", left, width, label: intent?.label || "行动" }],
      };
    });
    return { playerBars, enemyTracks, windowSec };
  }
}

window.CombatEngine = CombatEngine;
window.PLAYER_MAX_HP = PLAYER_MAX_HP;
})();
