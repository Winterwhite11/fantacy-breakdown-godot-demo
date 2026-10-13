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

/** debuff 键 → 中文名（武器附带状态、战备抗性提示都用它） */
const DEBUFF_LABEL = {
  burn: "燃烧", poison: "中毒", freeze: "冻结",
  vulnerable: "脆弱", weak: "虚弱", thorns: "荆棘",
};

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
    /**
     * 玩家最近一次攻击的敌人 uid。
     * 召唤物/装备的默认索敌优先级：此目标 → 否则第一个存活敌人。
     * （原 404 条「元素人同步攻击」与召唤流整体都依赖此规则）
     */
    this.lastAttackedUid = null;
    /** 236 圣火：为真时敌人燃烧不衰减 */
    this.holyFire = false;

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
      // ── 电系 259-261 ──
      pulseCount: 0,         // 259脉冲：本场战斗内已打出的次数（伤害递增）
      // ── 冻结体系 ──
      freezeBonus: 0,        // 214雪/312霜核：后续冻结层数额外 +N
      freezeRetaliate: 0,    // 315冰墙/325寒霜庇护：被攻击时对攻击者施加 N 层冻结
      freezeOnFrostCard: 0,  // 324凛冬降临：每打出一张冻结牌，群体 +N 冻结
      shatterMul: 1,         // 317破碎：清除冻结时转化为易伤的倍率
      freezeToBlock: 0,      // 325寒霜庇护：自身冻结按比例转为护甲
      // ── 中毒体系 308-311 / 326-337 / 338 ──
      poisonToBlock: 0,      // 327毒甲：自身中毒按比例转为护甲
      poisonToFervor: 0,     // 329嗜毒：自身每 N 层中毒每结算给 1 层激昂
      poisonOnHit: 0,        // 326淬毒：攻击附带的中毒层数
      poisonRing: 0,         // 334毒环：受击时双方各 +N 层中毒
      poisonBarrier: 0,      // 338毒障：自身每层中毒每次结算提供 N 点护甲
      poisonSelfAmp: 0,      // 338毒障的代价：自身中毒伤害提高比例
      selfPoisonPerTurn: 0,  // 338毒障的代价：每次结算自身中毒 +N
    };
    /** 336 蚀骨：敌人受到的中毒伤害倍率加成（0 = 无加成） */
    this.poisonAmp = 0;

    // 全场冻结规则（312/313/314/322）
    this.freezeNoDecay = false;    // 冻结不再被自然削减（本作冻结本就不衰减，此旗标用于对未来的削减效果免疫）
    this.freezePerTurn = 0;        // 每次状态结算时，全体敌人额外 +N 冻结

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
    this._allySeq = 0;
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
    /** 头盔的每次受伤固定减免（app.js 由 damageReductionBonus 注入） */
    this._damageReduction = Math.max(0, Number(opts.damageReduction) || 0);

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
        else this._damageEnemy(h.targetUid || this._defaultTargetUid(), h.damage, h.src, { pierce: h.pierce });
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
            this._damageEnemy(target.uid, g.damage, g.name);
            // 武器附带 debuff（喷火铳→燃烧、淬毒弩→中毒、霜刺枪→冻结）
            if (g.debuff?.key && g.debuff.amount > 0) {
              const t = this._findEnemy(target.uid);
              if (t && !t.dead) {
                t[g.debuff.key] = (t[g.debuff.key] || 0) + g.debuff.amount;
                this.log(`${g.name}：附带 ${g.debuff.amount} 层${DEBUFF_LABEL[g.debuff.key] || g.debuff.key}`);
              }
            }
            this.log(`${g.name}：造成 ${g.damage} 点伤害`);
          }
          g.nextAt = Math.round((g.nextAt + g.every) * 1000) / 1000;
        }
      }
    }

    // 玩家召唤物自动攻击
    if (this.allies?.length && !this.ended) {
      for (const a of this.allies) {
        if (!a || a.dead) continue;
        while (!a.dead && !this.ended && this.time >= (a.nextActionAt ?? Infinity)) {
          this._allyAct(a);
          const every = Math.max(0.5, Number(a.every) || 3);
          a.nextActionAt = Math.round(((a.nextActionAt || this.time) + every) * 1000) / 1000;
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
      // 338 毒障的代价：自身中毒伤害提高
      const amp = 1 + (p.poisonSelfAmp || 0);
      const pz = Math.max(1, Math.round(p.poison * amp));
      this._statusDamagePlayer(pz, p.poisonSelfAmp ? "中毒·毒障" : "中毒");
      p.poison += 1;
      this.log(`自身中毒层数 → ${p.poison}`);
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
        // 236 圣火：燃烧不再衰减
        if (this.holyFire) {
          this.log(`${e.name} 燃烧残余 ${e.burn} 层（圣火·不衰减）`);
        } else {
          e.burn = Math.floor(e.burn / 2);
          if (!e.dead) this.log(`${e.name} 燃烧残余 ${e.burn} 层`);
        }
      }
      if (e.dead) continue;
      if (e.poison > 0) {
        // 336 蚀骨：敌人受到的中毒伤害提升
        const amp = 1 + (this.poisonAmp || 0);
        const pdmg = Math.max(1, Math.round(e.poison * amp));
        this._statusDamageEnemy(e, pdmg, this.poisonAmp ? "中毒·蚀骨" : "中毒");
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

    // 冻结体系：312/314/323 的「每结算 +N 冻结」在此生效
    if (this.freezePerTurn > 0 && !this.ended) {
      for (const e of this._livingFoes()) {
        this._addFreeze(e, this.freezePerTurn, "冻寒环境");
      }
      this.log(`冻寒：全体敌人冻结 +${this.freezePerTurn}`);
    }
    // 325 寒霜庇护：自身冻结按比例转护甲（冻结体系的"续航"手段）
    if ((this.player.freezeToBlock || 0) > 0 && (this.player.freeze || 0) > 0) {
      const gain = Math.floor(this.player.freeze * this.player.freezeToBlock);
      if (gain > 0) {
        this._addPlayerBlock(gain);
        this.log(`寒霜庇护：冻结 ${this.player.freeze} → 护甲 +${gain}`);
      }
    }

    // ── 中毒体系（308-311 / 326-337）──────────────────────────────
    // 设计前提：中毒每结算造成「当前层数」伤害且层数 +1（不衰减、无上限），
    // 故本体系**没有成长牌**；相反地，自身中毒的倒计时有限，
    // 玩家必须用解毒/化毒主动收手 —— 这是核心张力。
    const pz = this.player;
    // 327 毒甲：每2层自身中毒 → 1点护甲
    if ((pz.poisonToBlock || 0) > 0 && (pz.poison || 0) > 0) {
      const gain = Math.floor(pz.poison * pz.poisonToBlock);
      if (gain > 0) {
        this._addPlayerBlock(gain);
        this.log(`毒甲：自身中毒 ${pz.poison} → 护甲 +${gain}`);
      }
    }
    // 329 嗜毒：自身每3层中毒 → 1层激昂
    if ((pz.poisonToFervor || 0) > 0 && (pz.poison || 0) > 0) {
      const gain = Math.floor(pz.poison / pz.poisonToFervor);
      if (gain > 0) {
        pz.fervor = (pz.fervor || 0) + gain;
        this.log(`嗜毒：自身中毒 ${pz.poison} → 激昂 +${gain}`);
      }
    }
    // 338 毒障：自身每层中毒每次结算提供护甲；代价是每次结算自身中毒 +N
    if ((pz.poisonBarrier || 0) > 0) {
      const blk = Math.floor((pz.poison || 0) * pz.poisonBarrier);
      if (blk > 0) {
        this._addPlayerBlock(blk);
        this.log(`毒障：自身中毒 ${pz.poison} → 护甲 +${blk}`);
      }
      if ((pz.selfPoisonPerTurn || 0) > 0) {
        pz.poison = (pz.poison || 0) + pz.selfPoisonPerTurn;
        this.log(`毒障代价：自身中毒 +${pz.selfPoisonPerTurn} → ${pz.poison}`);
      }
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
      for (const e of foes()) e.freeze = (e.freeze || 0) + 2 + (this.player.freezeBonus || 0);
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

  /** 冻结体系的通用加冻入口：统一吃「霜核」增幅（312 freezeBonus） */
  _addFreeze(unit, amount, src) {
    if (!unit || amount <= 0) return 0;
    const bonus = this.player.freezeBonus || 0;
    const total = amount + bonus;
    unit.freeze = (unit.freeze || 0) + total;
    const tag = bonus ? `（含霜核+${bonus}）` : "";
    this.log(`${src || "冻结"}：${unit.name || "你"} 冻结 +${amount}${tag} → ${unit.freeze}`);
    this._applyFreezeThresholds(unit, unit.name || "你");
    return total;
  }

  /** 存活的敌人列表 */
  _livingFoes() {
    return this.enemies.filter((e) => !e.dead);
  }

  /**
   * 判断一张牌是否属于「冻结牌」（用于 323 凛冬降临的触发）。
   * 判据是效果键，而不是卡 id —— 这样 214雪、230失温、307冻土
   * 以及任何未来的冻结来源都会正确计入。
   */
  _isFrostEffect(fx) {
    if (!fx) return false;
    const KEYS = [
      "freeze", "freezeBonus", "freezeRetaliate", "freezeNoDecay", "freezePerTurn",
      "freezeToFervor", "freezeToFervorAoe", "freezeToBurn", "freezeThenBurn",
      "shatterToVulnerable", "blockToFreeze", "freezeOnFrostCard",
    ];
    if (KEYS.some((k) => fx[k] != null && fx[k] !== false)) return true;
    // 环境牌没有 freeze 键，但「冻土」每结算群体上冻，同样属于冻结牌。
    // 否则 323 凛冬降临在冻土上不会触发 —— 这是实测发现的漏洞。
    return CombatEngine.FROST_ENVS.has(fx.env);
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
      // 259脉冲 / 261天罚：伤害由专用键结算（不用 damage 键，避免双重结算），
      // 但它们仍是攻击牌，需被指向性系统识别为"需要选敌人"
      !!fx.pulseDamage ||
      !!fx.lightningStrike ||
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
      else target = this._defaultTargetUid();
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
      // 卡表 404 元素人机制：释放对应元素攻击后，同元素元素人同步攻击一次（无视 cd）
      this._syncElementAllies(card.defId || card.id);
      this._toDiscard(card);
      return;
    }

    if (card.type === "word" && card.effect) {
      this._resolveEffect(card.effect, card, targetUid);
      // 词牌若带元素倾向，同样触发对应元素人的同步攻击
      const we = this._elementFromCard(card);
      if (we) this._syncElementAllies(we);
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
      this._markAttacked(targetUid);
      this._dealCardDamage(play.damage + boost, card.name, targetUid, {});
    }
    if (play.multi) {
      this._markAttacked(targetUid);
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
    // 冻结统一走 _addFreeze，使「霜核」增幅对**所有**冻结来源生效
    // （元素牌、雪、失温、环境、新冻结卡都吃加成，核心卡才名副其实）
    if (key === "freeze") {
      for (const u of list) this._addFreeze(u, amount, src);
      return;
    }
    // 326 淬毒：玩家的攻击附带中毒（对所有攻击性上毒来源统一生效）
    const total = key === "poison" ? amount + (this.player.poisonOnHit || 0) : amount;
    for (const u of list) {
      u[key] = (u[key] || 0) + total;
    }
    const names = list.map((u) => u.name || "自己").join("、");
    const extra = key === "poison" && this.player.poisonOnHit ? `（含淬毒+${this.player.poisonOnHit}）` : "";
    this.log(`${src}：${names} ${key}+${total}${extra}`);
  }

  _resolveEffect(fx, card, targetUid) {
    const boost = this.player.atkBonus + this.player.nextAtkBonus;
    this.player.nextAtkBonus = 0;
    const Cards = window.FBCards;
    const std = Cards.standardDamage;
    const dmgOpts = { pierce: !!fx.pierce };
    // 元素亲和：元素王在场时，全场元素伤害提高（随其持有的元素种类数增长）
    const affinity = this.affinityMultiplier();
    const isElementCard = (() => {
      const d = window.FBCards?.CARD_DEFS?.[card.defId || card.id];
      return d?.type === "element" || !!card.element || this._elementFromCard(card) != null;
    })();
    const aff = (v) => (isElementCard && affinity > 1 ? Math.round(v * affinity) : v);

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
      this._markAttacked(targetUid);
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
      dmg = aff(dmg);
      this._dealCardDamage(dmg, card.name, targetUid, {
        aoe: !!(fx.aoe || fx.aoeAll),
        ...dmgOpts,
        killHeal: fx.killHeal,
        alwaysBurn: fx.alwaysBurn,
      });
      // 酸：无视一半护甲
      if (fx.stripBlockHalf) this._stripBlockHalf(targetUid);
      // 沙尘等复合大元素：连带范围伤害
      if (fx.cleave) this._cleaveDamage(fx.cleave, card.name, targetUid);
    }
    if (fx.multi) {
      for (const d of fx.multi) {
        let hit = d + boost + (fx.heatBoost || 0);
        if (this.player.kindle) hit = Math.floor(hit * 1.5);
        hit = aff(hit);
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
    if (fx.summon) {
      // 元素人：从合成材料中取元素属性（共鸣+任意元素 → 元素人[该元素]）
      this.spawnAlly(fx.summon, card.name, { element: this._elementFromCard(card) });
    }
    if (fx.summonHeal) {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + fx.summonHeal);
      this.log(`${card.name}：生命 +${fx.summonHeal}（HP ${this.player.hp}）`);
    }

    // ── 燃烧系（231-246）实装 ──
    // 234 爆燃：造成敌人当前燃烧层数的伤害
    if (fx.burnStackDamage) {
      const foes = this.enemies.filter((e) => !e.dead);
      if (!foes.length) this.log(`${card.name}：没有目标`);
      for (const e of foes) {
        const stacks = e.burn || 0;
        if (stacks <= 0) { this.log(`${card.name}：${e.name} 无燃烧，未造成伤害`); continue; }
        this._damageEnemy(e.uid, stacks + boost, `${card.name}·爆燃`, dmgOpts);
        this.log(`${card.name}：以 ${stacks} 层燃烧造成 ${stacks} 伤害`);
      }
    }
    // 235 燃油：敌人燃烧层数翻倍
    if (fx.doubleBurn) {
      const foes = this.enemies.filter((e) => !e.dead);
      if (!foes.length) this.log(`${card.name}：没有目标`);
      for (const e of foes) {
        const before = e.burn || 0;
        e.burn = before * 2;
        this.log(`${card.name}：${e.name} 燃烧 ${before} → ${e.burn}`);
      }
    }
    // 236 圣火：敌人燃烧不再衰减（整场战斗）
    if (fx.holyFire) {
      this.holyFire = true;
      this.log(`${card.name}：敌人燃烧不再衰减`);
    }
    // 237 焚化：将敌人所有负面状态转化为燃烧
    if (fx.incinerate) {
      const foes = this.enemies.filter((e) => !e.dead);
      if (!foes.length) this.log(`${card.name}：没有目标`);
      for (const e of foes) {
        const parts = [];
        let total = 0;
        for (const key of ["poison", "freeze", "bleed", "weak", "vulnerable"]) {
          const v = e[key] || 0;
          if (v > 0) { total += v; parts.push(`${key}${v}`); e[key] = 0; }
        }
        e.burn = (e.burn || 0) + total;
        this.log(total > 0
          ? `${card.name}：${e.name} [${parts.join(" ")}] → 燃烧 +${total}（共 ${e.burn}）`
          : `${card.name}：${e.name} 无可转化状态`);
      }
    }
    // 243 Cold Allodynia：赋予 5 层冻结，并给已有冻结的敌人等量燃烧
    if (fx.freezeThenBurn) {
      const foes = this.enemies.filter((e) => !e.dead);
      if (!foes.length) this.log(`${card.name}：没有目标`);
      for (const e of foes) {
        e.freeze = (e.freeze || 0) + fx.freezeThenBurn;
        const gain = e.freeze;
        e.burn = (e.burn || 0) + gain;
        this.log(`${card.name}：${e.name} 冻结 → ${e.freeze}，燃烧 +${gain}（共 ${e.burn}）`);
        this._applyFreezeThresholds(e, e.name);
      }
    }
    // 245 烬灭：按 x=1,2,3… 递增清除燃烧，每级造成 1 点群体伤害
    if (fx.emberEnd) {
      const foeMap = new Map(this.enemies.filter((e) => !e.dead).map((e) => [e.uid, e]));
      if (!foeMap.size) this.log(`${card.name}：没有目标`);
      let x = 1, guard = 0, pulses = 0;
      // 每个脉冲：全场各清 x 层燃烧，并对全体造成 x 点伤害
      while (guard++ < 200) {
        let clearedAny = false;
        for (const e of foeMap.values()) {
          if ((e.burn || 0) > 0) {
            e.burn = Math.max(0, e.burn - x);
            clearedAny = true;
          }
        }
        if (!clearedAny) break;
        pulses++;
        for (const e of foeMap.values()) {
          if (!e.dead) this._damageEnemy(e.uid, x, `${card.name}·脉冲${x}`, dmgOpts);
        }
        // 剩余燃烧仍>0 才继续递增
        const remaining = [...foeMap.values()].some((e) => (e.burn || 0) > 0);
        if (!remaining) break;
        x++;
      }
      this.log(`${card.name}：共 ${pulses} 次脉冲，最高 x=${x}`);
    }
    // ── 冻结体系 309-323（2026-10-13）──────────────────────────────
    // 设计约束：冻结卡**不得造成直接伤害**。故此处只有上冻、转化、增幅、护甲，
    // 没有 damage。伤害一律发生在「转化」之后（燃烧/激昂）或靠召唤物。

    // 323 凛冬降临：每打出一张冻结牌，全体敌人额外 +N 冻结
    // （放在最前，使本次的冻结牌也能吃到自己的增益）
    if ((this.player.freezeOnFrostCard || 0) > 0 && this._isFrostEffect(fx)) {
      for (const e of this._livingFoes()) {
        this._addFreeze(e, this.player.freezeOnFrostCard, "凛冬降临");
      }
    }

    // 312 霜核：后续所有冻结层数额外 +N（核心增幅器）
    if (fx.freezeBonus) {
      this.player.freezeBonus = (this.player.freezeBonus || 0) + fx.freezeBonus;
      this.log(`${card.name}：冻结增幅 +${fx.freezeBonus}（后续冻结额外 +${this.player.freezeBonus}）`);
    }
    // 310 寒霜庇护：被攻击时对攻击者施加 N 层冻结
    if (fx.freezeRetaliate) {
      this.player.freezeRetaliate = (this.player.freezeRetaliate || 0) + fx.freezeRetaliate;
      this.log(`${card.name}：受击时对攻击者冻结 +${fx.freezeRetaliate}`);
    }
    // 313/314/322：冻结不再衰减
    if (fx.freezeNoDecay) {
      this.freezeNoDecay = true;
      this.log(`${card.name}：冻结不再衰减`);
    }
    // 314/322：每次状态结算时全体敌人额外 +N 冻结
    if (fx.freezePerTurn) {
      this.freezePerTurn = Math.max(this.freezePerTurn || 0, fx.freezePerTurn);
      this.log(`${card.name}：每结算全体敌人冻结 +${fx.freezePerTurn}`);
    }
    // 323 凛冬降临：每打出一张冻结牌，全体敌人额外 +N 冻结
    if (fx.freezeOnFrostCard) {
      this.player.freezeOnFrostCard = (this.player.freezeOnFrostCard || 0) + fx.freezeOnFrostCard;
      this.log(`${card.name}：此后每张冻结牌使全体敌人冻结 +${this.player.freezeOnFrostCard}`);
    }
    // 311/319 冻结 → 激昂（自身冻结层数）
    if (fx.freezeToFervor) {
      const have = this.player.freeze || 0;
      const gain = Math.floor(have / fx.freezeToFervor);
      this.player.freeze = 0;
      this.player.fervor = (this.player.fervor || 0) + gain;
      this.log(gain > 0
        ? `${card.name}：自身冻结 ${have} → 激昂 +${gain}`
        : `${card.name}：自身无冻结，未获得激昂`);
    }
    // 320 温差发电：按敌人冻结结算，一半转激昂
    if (fx.freezeToFervorAoe) {
      let gain = 0;
      for (const e of this._livingFoes()) {
        const have = e.freeze || 0;
        const take = Math.floor(have / fx.freezeToFervorAoe);
        e.freeze = 0;
        gain += take;
      }
      this.player.fervor = (this.player.fervor || 0) + gain;
      this.log(`${card.name}：全场冻结转化为激昂 +${gain}`);
    }
    // 318 融雪成焰：冻结 → 燃烧（这是本体系主要的伤害来源，属"转化"而非直接伤害）
    if (fx.freezeToBurn) {
      const targets = this._livingFoes();
      if (!targets.length) this.log(`${card.name}：没有目标`);
      for (const e of targets) {
        const have = e.freeze || 0;
        if (have <= 0) {
          this.log(`${card.name}：${e.name} 无冻结，未转化`);
          continue;
        }
        e.freeze = 0;
        const gain = have * fx.freezeToBurn;
        e.burn = (e.burn || 0) + gain;
        this.log(`${card.name}：${e.name} 冻结 ${have} → 燃烧 +${gain}（共 ${e.burn}）`);
      }
    }
    // 316 破碎：清除冻结，按倍率转为易伤（不造成伤害）
    if (fx.shatterToVulnerable) {
      const e = this._findEnemy(targetUid) || this._livingFoes()[0];
      if (!e) {
        this.log(`${card.name}：没有目标`);
      } else {
        const have = e.freeze || 0;
        if (have <= 0) {
          this.log(`${card.name}：${e.name} 无冻结可碎`);
        } else {
          e.freeze = 0;
          const gain = Math.max(1, Math.floor(have * fx.shatterToVulnerable));
          e.vulnerable = (e.vulnerable || 0) + gain;
          this.log(`${card.name}：${e.name} 冻结 ${have} 碎裂 → 易伤 +${gain}`);
        }
      }
    }
    // 325 寒霜庇护（防御终端）：把自身冻结按比例持续转为护甲
    if (fx.freezeToBlock) {
      this.player.freezeToBlock = (this.player.freezeToBlock || 0) + fx.freezeToBlock;
      this.log(`${card.name}：自身冻结的 ${this.player.freezeToBlock * 100}% 每结算转为护甲`);
    }
    // 316 凝结：自身护甲按比例转为全体敌人的冻结
    if (fx.blockToFreeze) {
      const convert = Math.floor((this.player.block || 0) * fx.blockToFreeze);
      if (convert <= 0) {
        this.log(`${card.name}：护甲不足，未凝结`);
      } else {
        for (const e of this._livingFoes()) this._addFreeze(e, convert, card.name);
        this.log(`${card.name}：护甲 ${this.player.block} → 全体冻结 +${convert}`);
      }
    }

    // ── 中毒体系 308-311 / 326-337（2026-10-13）────────────────────
    // 与冻结体系不同：中毒**允许直接伤害**（引爆毒层是本体系唯一的爆发手段，
    // 用户明确要求加入）。但仍无「成长牌」——中毒自己会长，加成长牌是冗余。

    // 335 耐毒：开局/使用即中和自身若干层中毒（唯一能"减毒"的防御手段）
    if (fx.poisonNeutralize) {
      const before = this.player.poison || 0;
      this.player.poison = Math.max(0, before - fx.poisonNeutralize);
      this.log(`${card.name}：中和自身中毒 ${before - this.player.poison} 层 → ${this.player.poison}`);
    }
    // 326 淬毒：对自身施加中毒，换取「攻击附带毒」
    if (fx.selfPoison) {
      this.player.poison = (this.player.poison || 0) + fx.selfPoison;
      this.log(`${card.name}：自身中毒 +${fx.selfPoison} → ${this.player.poison}`);
    }
    if (fx.poisonOnHit) {
      this.player.poisonOnHit = (this.player.poisonOnHit || 0) + fx.poisonOnHit;
      this.log(`${card.name}：此后攻击附带 ${this.player.poisonOnHit} 层中毒`);
    }
    // 327 毒甲：登记「自身中毒 → 护甲」比例（结算时生效）
    if (fx.poisonToBlock) {
      this.player.poisonToBlock = (this.player.poisonToBlock || 0) + fx.poisonToBlock;
      this.log(`${card.name}：自身中毒的 ${Math.round(this.player.poisonToBlock * 100)}% 每结算转为护甲`);
    }
    // 329 嗜毒：登记「自身中毒 → 激昂」
    if (fx.poisonToFervor) {
      this.player.poisonToFervor = fx.poisonToFervor;
      this.log(`${card.name}：自身每 ${fx.poisonToFervor} 层中毒每结算获得 1 层激昂`);
    }
    if (fx.ferocity) {
      this.player.atkBonus = (this.player.atkBonus || 0) + fx.ferocity;
      this.log(`${card.name}：攻击力 +${fx.ferocity}`);
    }
    // 328 蚀甲：自身中毒半数转护甲并清空（B 闭环的"收手"手段之一）
    if (fx.corrodeArmor) {
      const have = this.player.poison || 0;
      const gain = Math.floor(have / 2);
      this.player.poison = 0;
      if (gain > 0) this._addPlayerBlock(gain);
      this.log(`${card.name}：自身中毒 ${have} → 护甲 +${gain}（已清空）`);
    }
    // 330 解毒：清除自身全部中毒，每层造成伤害
    if (fx.detoxDamage) {
      const have = this.player.poison || 0;
      this.player.poison = 0;
      const dmg = have * fx.detoxDamage;
      this.log(`${card.name}：清除自身中毒 ${have} 层 → 伤害 ${dmg}`);
      if (dmg > 0) {
        const targets = fx.aoe || fx.aoeAll ? this._livingFoes() : [this._findEnemy(targetUid) || this._livingFoes()[0]].filter(Boolean);
        for (const e of targets) if (!e.dead) this._damageEnemy(e.uid, dmg, card.name, dmgOpts);
      }
    }
    // 331 化毒：清除自身全部中毒，每层回复生命
    if (fx.detoxHeal) {
      const have = this.player.poison || 0;
      this.player.poison = 0;
      const heal = have * fx.detoxHeal;
      if (heal > 0) {
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
        this.log(`${card.name}：清除自身中毒 ${have} 层 → 回复 ${heal} 生命（HP ${this.player.hp}）`);
      } else {
        this.log(`${card.name}：自身无中毒可化`);
      }
    }
    // 333 瘟疫：敌人中毒翻倍并扩散给其他敌人
    if (fx.plague) {
      const foes = this._livingFoes();
      let spread = 0;
      for (const e of foes) if ((e.poison || 0) > 0) spread = Math.max(spread, e.poison);
      for (const e of foes) {
        const before = e.poison || 0;
        e.poison = Math.max(before * 2, spread);
        if (e.poison !== before) this.log(`${card.name}：${e.name} 中毒 ${before} → ${e.poison}`);
      }
      if (!foes.some((e) => (e.poison || 0) > 0)) this.log(`${card.name}：没有可扩散的中毒`);
    }
    // 334 毒环：登记"受击反弹中毒"
    if (fx.poisonRing) {
      this.player.poisonRing = (this.player.poisonRing || 0) + fx.poisonRing;
      this.log(`${card.name}：受击时双方各 +${this.player.poisonRing} 层中毒`);
    }
    // 336 蚀骨：使敌人受到的中毒伤害提升（随自身中毒层数额外加成）
    if (fx.poisonAmp) {
      const extra = Math.floor((this.player.poison || 0) / 10) * (fx.poisonAmpPerTen || 0);
      this.poisonAmp = fx.poisonAmp + extra;
      this.log(`${card.name}：敌人中毒伤害 +${Math.round(this.poisonAmp * 100)}%`);
    }
    // 311/337 引爆：消耗敌人全部中毒层数，每层造成伤害（本体系唯一的爆发手段）
    if (fx.detonatePoison) {
      const targets = this._livingFoes();
      if (!targets.length) this.log(`${card.name}：没有目标`);
      for (const e of targets) {
        const have = e.poison || 0;
        if (have <= 0) {
          this.log(`${card.name}：${e.name} 无中毒可引爆`);
          continue;
        }
        e.poison = 0;
        const dmg = have * fx.detonatePoison;
        this.log(`${card.name}：引爆 ${e.name} 的中毒 ${have} 层 → ${dmg} 伤害`);
        this._damageEnemy(e.uid, dmg, `${card.name}·引爆`, dmgOpts);
        // 337：击杀则按层数获得护甲
        if (fx.detonateBlock && e.dead) {
          const blk = Math.floor(have * fx.detonateBlock);
          if (blk > 0) {
            this._addPlayerBlock(blk);
            this.log(`${card.name}：击杀回馈 → 护甲 +${blk}`);
          }
        }
      }
    }
    // 332 血毒：自伤换抽牌
    if (fx.selfDamage) this._damagePlayer(fx.selfDamage, card.name);

    // ── 电系 259-261（2026-10-13 实现占位卡）────────────────────────
    // 261 天罚：激昂终端。消耗全部激昂，按层数造成伤害（对标燃烧的烬灭）
    if (fx.lightningStrike) {
      const f = this.player.fervor || 0;
      this.player.fervor = 0;
      const bonus = aff((fx.lightningBase || 0) + boost + f * fx.lightningStrike);
      const pierce = f >= (fx.pierceAt || 0);
      this.log(`${card.name}：消耗激昂 ${f} 层 → 伤害 ${bonus}${pierce ? "（穿透）" : ""}`);
      this._markAttacked(targetUid);
      const targets = fx.aoe ? this._livingFoes()
        : [this._findEnemy(targetUid) || this._livingFoes()[0]].filter(Boolean);
      for (const e of targets) {
        if (!e.dead) this._damageEnemy(e.uid, bonus, card.name, { pierce });
      }
    }
    // 338 毒障：以「自身中毒加重」换取按毒层计的护甲
    if (fx.poisonBarrier) {
      this.player.poisonBarrier = (this.player.poisonBarrier || 0) + fx.poisonBarrier;
      this.log(`${card.name}：自身每层中毒每结算提供 ${fx.poisonBarrier} 点护甲`);
    }
    if (fx.poisonSelfAmp) {
      this.player.poisonSelfAmp = (this.player.poisonSelfAmp || 0) + fx.poisonSelfAmp;
      this.log(`${card.name}：代价 —— 自身中毒伤害 +${Math.round(this.player.poisonSelfAmp * 100)}%`);
    }
    if (fx.selfPoisonPerTurn) {
      this.player.selfPoisonPerTurn = (this.player.selfPoisonPerTurn || 0) + fx.selfPoisonPerTurn;
      this.log(`${card.name}：代价 —— 每次结算自身中毒 +${this.player.selfPoisonPerTurn}`);
    }

    // 259 脉冲：本场战斗内每次打出递增伤害。
    // 与落雷同法：**不使用 damage 键**，伤害与索敌都在此结算，
    // 避免通用伤害逻辑重复计算（且能吃到 atkBonus / 元素亲和）
    if (fx.pulseDamage) {
      const n = this.player.pulseCount || 0;
      this.player.pulseCount = n + 1;
      const base = (fx.pulseBase || 0) + n * fx.pulseDamage;
      const total = aff(base + boost + (fx.heatBoost || 0));
      this.log(`${card.name}：第 ${n + 1} 次脉冲 → 伤害 ${total}`);
      this._markAttacked(targetUid);
      const targets = fx.aoe ? this._livingFoes()
        : [this._findEnemy(targetUid) || this._livingFoes()[0]].filter(Boolean);
      for (const e of targets) {
        if (!e.dead) this._damageEnemy(e.uid, total, card.name, dmgOpts);
      }
    }

    // 339 熔毒：敌方中毒 → 燃烧（放热分解）。对标 319融雪成焰 的 freezeToBurn
    if (fx.poisonToBurn) {
      const targets = fx.singleTarget
        ? [this._findEnemy(targetUid) || this._livingFoes()[0]].filter(Boolean)
        : this._livingFoes();
      if (!targets.length) this.log(`${card.name}：没有目标`);
      for (const e of targets) {
        const have = e.poison || 0;
        if (have <= 0) {
          this.log(`${card.name}：${e.name} 无中毒可转化`);
          continue;
        }
        e.poison = 0;
        const gain = Math.floor(have * fx.poisonToBurn);
        e.burn = (e.burn || 0) + gain;
        this.log(`${card.name}：${e.name} 中毒 ${have} → 燃烧 +${gain}（共 ${e.burn}）`);
      }
    }
    // 340 电解毒：敌方中毒 → 激昂 + 伤害。对标 320炽热呼吸 的 freezeToFervor。
    // ⚠ 必须与 detonatePoison 分开：两者都消耗毒层，若同时挂上会互相抵消
    //   （先引爆清空毒层 → 转化时已无毒可转）。故这里一次读取、同时产出两种收益。
    // ⚠ 键名与 329嗜毒 的 poisonToFervor（自身毒→激昂）区分开，避免两套逻辑互相触发。
    if (fx.enemyPoisonToFervor) {
      const targets = fx.singleTarget
        ? [this._findEnemy(targetUid) || this._livingFoes()[0]].filter(Boolean)
        : this._livingFoes();
      if (!targets.length) this.log(`${card.name}：没有目标`);
      let fervorGain = 0;
      for (const e of targets) {
        const have = e.poison || 0;
        if (have <= 0) {
          this.log(`${card.name}：${e.name} 无中毒可电解`);
          continue;
        }
        e.poison = 0;
        const gain = Math.floor(have * fx.enemyPoisonToFervor);
        fervorGain += gain;
        this.log(`${card.name}：${e.name} 中毒 ${have} → 激昂 +${gain}`);
        if (fx.electroDamage) {
          this._damageEnemy(e.uid, have * fx.electroDamage, `${card.name}·电解`, dmgOpts);
        }
      }
      if (fervorGain > 0) {
        this.player.fervor = (this.player.fervor || 0) + fervorGain;
        this.log(`${card.name}：激昂合计 +${fervorGain}（共 ${this.player.fervor}）`);
      }
    }

    // 246 涅槃：生命值变为上限一半，按变化绝对值给全体敌人燃烧
    if (fx.nirvana) {
      const maxHp = this.player.maxHp || PLAYER_MAX_HP;
      const before = this.player.hp || 0;
      const after = Math.floor(maxHp / 2);
      this.player.hp = after;
      const delta = Math.abs(after - before);
      this.log(`${card.name}：生命 ${before} → ${after}（变化 ${delta}）`);
      for (const e of this.enemies.filter((x) => !x.dead)) {
        e.burn = (e.burn || 0) + delta;
        this.log(`${card.name}：${e.name} 燃烧 +${delta}（共 ${e.burn}）`);
      }
      if (after <= 0) this._checkEnd();
    }
    // 258 发电机：召唤一个每 5 秒自动打出一张「电」的召唤物
    if (fx.generator) {
      this.spawnAlly({
        name: "发电机",
        hp: fx.generator.hp || 10,
        damage: 7,               // 打出的「电」为 7 伤
        every: fx.generator.every || 5,
        kind: "generator",
        grantsCardOnWin: fx.generator.grantsCardOnWin || "electric",
        logText: "发电机打出一张「电」",
      }, card.name);
    }

    if (fx.buffAllies) {
      const alive = (this.allies || []).filter((a) => a && !a.dead);
      if (!alive.length) this.log(`${card.name}：没有可强化的召唤物`);
      else {
        for (const a of alive) {
          if (fx.buffAllies.hp) {
            a.maxHp = (a.maxHp || a.hp) + fx.buffAllies.hp;
            a.hp += fx.buffAllies.hp;
          }
          if (fx.buffAllies.damage) a.damage = (a.damage || 0) + fx.buffAllies.damage;
        }
        this.log(`${card.name}：强化 ${alive.length} 个召唤物`);
      }
      if (fx.selfHpCost) {
        this._damagePlayer(fx.selfHpCost, card.name);
      }
    }
    if (fx.martyrAllies) {
      const alive = (this.allies || []).filter((a) => a && !a.dead);
      const total = alive.reduce((s, a) => s + Math.max(0, a.hp || 0), 0);
      for (const a of alive) {
        a.hp = 0;
        a.dead = true;
      }
      if (total > 0) {
        this._dealCardDamage(total, `${card.name}·殉道`, targetUid, { aoe: !!fx.aoe });
        this.log(`${card.name}：献祭召唤物，造成 ${total} 伤害`);
      } else {
        this.log(`${card.name}：没有可献祭的召唤物`);
      }
    }
    if (fx.scaleAlly) {
      const alive = (this.allies || []).filter((a) => a && !a.dead);
      for (const a of alive) {
        if (fx.scaleAlly.hp) {
          a.maxHp = (a.maxHp || a.hp) + fx.scaleAlly.hp;
          a.hp += fx.scaleAlly.hp;
        }
        if (fx.scaleAlly.damage) a.damage = (a.damage || 0) + fx.scaleAlly.damage;
        if (fx.scaleAlly.mul != null) {
          a.hp = Math.max(1, Math.floor(a.hp * fx.scaleAlly.mul));
          a.maxHp = Math.max(a.hp, Math.floor((a.maxHp || a.hp) * fx.scaleAlly.mul));
          a.damage = Math.max(1, Math.floor((a.damage || 1) * fx.scaleAlly.mul));
        }
      }
      if (alive.length) this.log(`${card.name}：调整 ${alive.length} 个召唤物`);
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
    // 记录玩家攻击的目标（供召唤物优先索敌）
    if (!aoe && targets[0]) this.lastAttackedUid = targets[0].uid;
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

  /**
   * 默认索敌：**优先玩家先前攻击的目标**，该目标不存在或已死亡时取第一个存活敌人。
   * 召唤物（元素人/大元素/元素王）、装备间隔伤害、延迟命中均走此规则。
   */
  _defaultTarget() {
    const alive = this.enemies.filter((e) => !e.dead);
    if (!alive.length) return null;
    const prev = this.lastAttackedUid
      ? alive.find((e) => e.uid === this.lastAttackedUid)
      : null;
    return prev || alive[0];
  }

  /** 兼容旧调用：只要 uid 时用这个 */
  _defaultTargetUid() {
    return this._defaultTarget()?.uid || null;
  }

  /** 记录玩家攻击过的目标（供召唤物索敌） */
  _markAttacked(uid) {
    if (!uid || uid === "aoe" || uid === "self") return;
    const e = this.enemies.find((x) => x.uid === uid);
    if (e) this.lastAttackedUid = uid;
  }

  _enemyName(uid) {
    return this.enemies.find((e) => e.uid === uid)?.name || "—";
  }

  _findEnemy(uid) {
    return this.enemies.find((e) => e.uid === uid && !e.dead);
  }

  /**
   * 对敌人造成伤害。
   * @param {string|object} uidOrUnit uid 字符串，或敌人对象（容错：历史上多处误传对象）
   *
   * 注意：此处曾用 `|| this.enemies.find(alive)` 兜底，会在 uid 无效时
   * 静默改打第一个敌人，掩盖了「把对象当 uid 传」这类 bug。现改为：
   *   · 接受对象 → 取其 uid
   *   · uid 无效 → 记警告并返回（不静默改目标）
   * 仅在「目标已死亡」时才回退到其他存活敌人（保持原意图）。
   */
  _damageEnemy(uidOrUnit, raw, src, opts = {}) {
    const uid = (uidOrUnit && typeof uidOrUnit === "object") ? uidOrUnit.uid : uidOrUnit;
    let e = this._findEnemy(uid);
    if (!e) {
      // 目标已死亡/不存在：回退到仍有存活敌人时的第一个（保持原行为）
      const alive = this.enemies.filter((x) => !x.dead);
      if (!alive.length) return;
      if (uid != null && this.enemies.some((x) => x.uid === uid)) {
        e = alive[0];                       // 指定目标已死 → 改打存活目标
      } else {
        // uid 完全无效：说明调用方传错了，不再静默改目标
        console.warn("[combat] _damageEnemy 收到无效目标:", uidOrUnit, "src=", src);
        return;
      }
    }
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
    // 头盔：每次受伤固定减免（先于护甲结算；至少保留 1 点穿透性伤害，
    // 否则高减免会让低伤敌人完全无效，战斗变成无风险）
    const dr = Math.max(0, Number(this._damageReduction) || 0);
    if (dr > 0 && dmg > 0) {
      const cut = Math.min(dr, Math.max(0, dmg - 1));
      if (cut > 0) {
        dmg -= cut;
        this.log(`战备减伤 ${cut}（${src}）`);
      }
    }
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
    // 315 冰墙：受到攻击时对攻击者施加冻结（不造成伤害，符合冻结体系约束）
    if ((this.player.freezeRetaliate || 0) > 0 && dmg > 0) {
      const foe = this.enemies.find((x) => !x.dead && x.name === src)
        || this.enemies.find((x) => !x.dead);
      if (foe) this._addFreeze(foe, this.player.freezeRetaliate, "寒霜庇护");
    }
    // 334 毒环：受到攻击时双方各 +N 层中毒（自作自受的反击型资源）
    if ((this.player.poisonRing || 0) > 0 && dmg > 0) {
      const foe = this.enemies.find((x) => !x.dead && x.name === src)
        || this.enemies.find((x) => !x.dead);
      this.player.poison = (this.player.poison || 0) + this.player.poisonRing;
      if (foe) foe.poison = (foe.poison || 0) + this.player.poisonRing;
      this.log(`毒环：自身中毒 +${this.player.poisonRing}（${this.player.poison}），${foe ? foe.name + " 中毒 +" + this.player.poisonRing : "无敌人"}`);
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

    // 设计原文（ENC-01 射手）：成长到"减员至两人"为止，之后不再成长
    if (intent.limitAlliesAt != null && alliesAlive < intent.limitAlliesAt) {
      this.log(`${e.name}：队友已减员至 ${alliesAlive} 人，停止成长`);
      e.nextActionAt = Math.round((e.nextActionAt + MONSTER_TURN) * 1000) / 1000;
      return;
    }
    // 设计原文（ENC-01 射手）：成长结束后固定使用本循环最后一步
    if (intent.repeatLast) {
      const last = e.cycle[e.cycle.length - 1];
      if (last && last !== intent) e.step = e.cycle.length - 1;
    }

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

  /**
   * 生成玩家召唤物（自动攻击会进入我方时间轴）。
   *
   * 召唤流拓展（2026-10-13）：
   *   · carryElement：元素人携带其召唤所用的元素属性（决定可合成哪种大元素）
   *   · 大元素细分效果：burnPerHit / freezePerHit / poisonPerHit / fervorPerHit /
   *     gloryPerHit / teamBlock / selfHeal / bonusDamage / pierce
   *   · kingRelease：元素王不普通攻击，改为释放「元素合成卡牌」
   */
  spawnAlly(spec = {}, src = "召唤", opts = {}) {
    const every = Math.max(0.5, Number(spec.every) || 3);
    // 注意：元素王 damage 显式为 0（不普攻），不能被 `|| 3` 吞掉
    const damage = spec.damage == null ? 3 : Math.max(0, Number(spec.damage) || 0);
    const hp = Math.max(1, Number(spec.hp) || 5);
    const ally = {
      uid: `ally:${++this._allySeq}`,
      name: spec.name || "召唤物",
      hp,
      maxHp: hp,
      block: 0,
      dead: false,
      damage,
      every,
      nextActionAt: Math.round((this.time + every) * 1000) / 1000,
      burn: 0,
      poison: 0,
      freeze: 0,
      bleed: 0,
      weak: 0,
      vulnerable: 0,
      kind: spec.kind || "summon",
      /** 258 发电机：存活到战斗结束时产出的卡牌 id */
      grantsCardOnWin: spec.grantsCardOnWin || null,
      /** 自动行动的日志文案 */
      logText: spec.logText || null,
      // ── 召唤流拓展字段 ──
      /** 元素人携带的元素属性（如 'fire'、'ash'） */
      element: spec.carryElement ? (opts.element || null) : (spec.element || null),
      burnPerHit: spec.burnPerHit || 0,
      freezePerHit: spec.freezePerHit || 0,
      poisonPerHit: spec.poisonPerHit || 0,
      fervorPerHit: spec.fervorPerHit || 0,
      gloryPerHit: spec.gloryPerHit || 0,
      teamBlock: spec.teamBlock || 0,
      selfHeal: spec.selfHeal || 0,
      bonusDamage: spec.bonusDamage || 0,
      pierce: !!spec.pierce,
      /** 元素王：释放合成牌 + 元素亲和 */
      kingRelease: !!spec.kingRelease,
      affinity: !!spec.affinity,
    };
    this.allies.push(ally);
    const elTag = ally.element ? ` · ${ally.element}` : "";
    this.log(`${src}：召唤「${ally.name}」${elTag}（${hp}HP · 每 ${every}s ${damage ? "攻 " + damage : "释放合成牌"}）`);
    return ally;
  }

  /**
   * 从卡牌推断其元素属性。
   * 元素/操作牌直接用自身 id（如 fire）；词牌用 tags 中的元素标签；
   * 卡牌上显式带 element 字段时优先。
   */
  _elementFromCard(card) {
    if (!card) return null;
    if (card.element) return card.element;
    const def = window.FBCards?.CARD_DEFS?.[card.defId || card.id];
    if (def?.type === "element") return def.id;
    const tags = card.tags || [];
    const elems = new Set(Object.keys(window.FBCardTable?.elements || {}));
    for (const t of tags) if (elems.has(t)) return t;
    return null;
  }

  /**
   * 酸（204）/ 酸·大元素：清除目标一半护甲。
   */
  _stripBlockHalf(targetUid) {
    const list = targetUid === "aoe" || !targetUid
      ? this.enemies.filter((e) => !e.dead && e.block > 0)
      : [this._findEnemy(targetUid)].filter((e) => e && e.block > 0);
    for (const e of list) {
      const before = e.block;
      e.block = Math.floor(e.block / 2);
      this.log(`${e.name}：护甲削减 ${before} → ${e.block}`);
    }
  }

  /**
   * 连带范围伤害：对主目标以外的敌人造成少量伤害。
   * 用于「沙尘·大元素」等复合效果。
   */
  _cleaveDamage(amount, src, targetUid) {
    const n = Math.max(0, Number(amount) || 0);
    if (!n) return;
    const others = this.enemies.filter((e) => !e.dead && e.uid !== targetUid);
    if (!others.length) return;
    for (const e of others) this._damageEnemy(e.uid, n, `${src}·连带`, {});
    this.log(`${src}：连带范围伤害 ${n}（${others.length} 个目标）`);
  }

  /**
   * 卡表 404 条：「玩家释放对应元素攻击后，相同元素的元素人会同步进行一次无视cd的攻击」。
   * 只对 `kind === 'elemental'`（元素人）生效；大元素/元素王不参与同步。
   */
  _syncElementAllies(element) {
    if (!element) return;
    const el = this._elementFromCard({ defId: element, element }) || element;
    for (const a of this.allies || []) {
      if (!a || a.dead) continue;
      if (a.kind !== "elemental") continue;      // 仅元素人
      if (a.element !== el) continue;
      const target = this._defaultTarget();
      if (!target) return;
      this._damageEnemy(target.uid, Math.max(0, a.damage || 0), `${a.name}·同步`);
      this.log(`${a.name}：同步攻击（无视冷却）`);
    }
  }

  /** 元素王读取的元素池（带元素属性的召唤物 + 手牌中的元素） */
  kingElementPool() {    const out = [];
    for (const a of this.allies || []) {
      if (a && !a.dead && a.element) out.push({ element: a.element, from: "ally" });
    }
    for (const c of this.hand || []) {
      if (c && c.element) out.push({ element: c.element, from: "hand" });
    }
    return out;
  }

  /** 元素亲和倍率：随元素王持有的元素种类数增长 */
  affinityMultiplier() {
    const kings = (this.allies || []).filter((a) => a && !a.dead && a.affinity);
    if (!kings.length) return 1;
    const S = window.FBSummon;
    if (!S) return 1;
    const pool = this.kingElementPool();
    const types = new Set(pool.map((p) => p.element)).size;
    return S.affinityBonus(types);
  }

  /**
   * 元素王释放「元素合成卡牌」：次数 = 种类数，强度 = 张数。
   *
   * 释放上限（KING_MAX_CASTS）：原设计下 5 种元素会一次行动释放 5 次、
   * 合计 30~50 伤且不占用玩家出牌窗口，单窗口爆发过高。故设上限，
   * 超出部分按「元素亲和」折算为额外强度，而不是继续加次数。
   */
  _kingRelease(a) {
    const KING_MAX_CASTS = 3;
    const S = window.FBSummon;
    const pool = this.kingElementPool();
    if (!S) { this.log(`${a.name}：召唤流模块未加载`); return; }
    const plan = S.kingReleasePlan(pool);
    if (!pool.length) {
      this.log(`${a.name}：元素池为空，无法释放合成牌`);
      return;
    }
    const target = this._defaultTarget();
    if (!target) return;

    const casts = Math.min(KING_MAX_CASTS, plan.casts);
    // 被上限裁掉的次数转化为强度补偿（每次 +2）
    const overflow = Math.max(0, plan.casts - KING_MAX_CASTS) * 2;
    const perCast = Math.round(a.damage || 6) + Math.max(0, plan.budget - 1) + overflow;

    for (let i = 0; i < casts; i++) {
      const [ea, eb] = plan.pairs[i % plan.pairs.length] || ["none", "none"];
      const name = window.FBCards?.CARD_DEFS?.[ea]?.name
        || window.FBCards?.WORD_DEFS?.[ea]?.name || ea;
      const name2 = window.FBCards?.CARD_DEFS?.[eb]?.name
        || window.FBCards?.WORD_DEFS?.[eb]?.name || eb;
      this._damageEnemy(target.uid, perCast, `${a.name}·${name}+${name2}`);
      const t = this._findEnemy(target.uid);
      if (t && !t.dead) {
        if (ea === "fire" || ea === "ash") t.burn = (t.burn || 0) + 2;
        if (eb === "ice") t.freeze = (t.freeze || 0) + 1;
        if (eb === "poison") t.poison = (t.poison || 0) + 1;
      }
      this.log(`${a.name}：释放合成牌「${name} + ${name2}」造成 ${perCast} 伤害`);
    }
    if (plan.casts > KING_MAX_CASTS) {
      this.log(`${a.name}：种类超出释出上限（${plan.casts}→${casts}），溢出转为强度 +${overflow}`);
    }
  }

  _allyAct(a) {
    if (!a || a.dead) return;
    // 元素王：不普通攻击，改为释放合成牌
    if (a.kingRelease) { this._kingRelease(a); return; }
    const dmg = Math.max(0, Number(a.damage) || 0);
    if (!dmg) return;
    const target = this._defaultTarget();
    if (!target) return;
    const total = dmg + (a.bonusDamage || 0);
    this._damageEnemy(target.uid, total, a.name);
    // 大元素细分效果
    const t = this._findEnemy(target.uid);
    if (t && !t.dead) {
      if (a.burnPerHit) t.burn = (t.burn || 0) + a.burnPerHit;
      if (a.freezePerHit) t.freeze = (t.freeze || 0) + a.freezePerHit;
      if (a.poisonPerHit) t.poison = (t.poison || 0) + a.poisonPerHit;
      if (a.fervorPerHit) this.player.fervor = (this.player.fervor || 0) + a.fervorPerHit;
      if (a.gloryPerHit) this.glory = (this.glory || 0) + a.gloryPerHit;
    }
    // 酸·大元素：无视半个护甲
    if (a.stripBlockHalf) this._stripBlockHalf(target.uid);
    // 沙尘·大元素：连带范围伤害
    if (a.cleave) this._cleaveDamage(a.cleave, a.name, target.uid);
    if (a.teamBlock) for (const x of this.allies || []) if (x && !x.dead) x.block = (x.block || 0) + a.teamBlock;
    if (a.selfHeal) this.player.hp = Math.min(this.player.maxHp, this.player.hp + a.selfHeal);
    const extras = [
      a.burnPerHit && `燃+${a.burnPerHit}`,
      a.freezePerHit && `冻+${a.freezePerHit}`,
      a.poisonPerHit && `毒+${a.poisonPerHit}`,
      a.fervorPerHit && `激+${a.fervorPerHit}`,
      a.gloryPerHit && `辉+${a.gloryPerHit}`,
      a.teamBlock && `全队甲+${a.teamBlock}`,
      a.selfHeal && `回复${a.selfHeal}`,
    ].filter(Boolean).join(" ");
    this.log(a.logText
      ? `${a.name}：${a.logText}（${total} 伤）`
      : `${a.name}：自动攻击 ${total} 点${extras ? " · " + extras : ""}`);
  }

  /** 战斗结束时结算召唤物产出（目前仅发电机：存活则给一张电） */
  collectAllyRewards() {
    const out = [];
    for (const a of this.allies || []) {
      if (!a || a.dead || !a.grantsCardOnWin) continue;
      out.push({ cardId: a.grantsCardOnWin, from: a.name, kind: a.kind });
      this.log(`${a.name}：存活至战斗结束，产出一张卡牌`);
    }
    return out;
  }

  /**
   * 时间轴快照：默认展望 15s。
   * 敌方：每单位在窗口内的全部行动；我方：咏唱 / 装备自动攻击 / 延迟伤害 / 召唤物攻击。
   */
  timelineSnapshot(windowSec = 15) {
    const t0 = this.time;
    const t1 = t0 + windowSec;
    const scale = (abs) => ((abs - t0) / windowSec) * 100;
    const clampBar = (start, end, cls, label) => {
      // 含窗口右端点（如 15.0s 的行动仍显示在轴尾）
      if (end <= t0 || start > t1 + 1e-9) return null;
      const left = Math.max(0, Math.min(100, scale(Math.max(start, t0))));
      const right = Math.max(left, Math.min(100, scale(Math.min(end, t1 + 0.01))));
      const width = Math.max(2.2, right - left);
      if (left > 100) return null;
      return { cls, left: Math.min(left, 100 - 2.2), width, label };
    };

    const enemyTracks = this.enemies.filter((e) => !e.dead).map((e) => {
      const bars = [];
      if (!e.awake) {
        return { name: e.name, bars, note: "沉睡" };
      }
      let at = e.nextActionAt;
      let step = e.step;
      let guard = 0;
      while (at <= t1 + 1e-9 && guard++ < 24) {
        const intent = e.cycle[step % e.cycle.length];
        const bar = clampBar(at, at + 0.75, "enemy-act", intent?.label || "行动");
        if (bar) bars.push(bar);
        at = Math.round((at + MONSTER_TURN) * 1000) / 1000;
        step += 1;
      }
      return { name: e.name, bars };
    });

    const playerTracks = [];
    if (this.player.chant) {
      const ch = this.player.chant;
      const bars = [];
      const wu0 = ch.windupEnd - WINDUP;
      const b1 = clampBar(wu0, ch.windupEnd, "windup", "前摇");
      const b2 = clampBar(ch.windupEnd, ch.chantEnd, "chant", ch.card?.name || "咏唱");
      const b3 = clampBar(ch.chantEnd, ch.recoverEnd, "recover", "后摇");
      if (b1) bars.push(b1);
      if (b2) bars.push(b2);
      if (b3) bars.push(b3);
      if (bars.length) playerTracks.push({ name: "咏唱", bars });
    }

    const gearBars = [];
    for (const g of this._gearIntervals || []) {
      let at = g.nextAt;
      let guard = 0;
      while (at <= t1 + 1e-9 && guard++ < 24) {
        const bar = clampBar(at, at + 0.5, "gear-act", g.name || "装备");
        if (bar) gearBars.push(bar);
        at = Math.round((at + Math.max(0.5, g.every || 10)) * 1000) / 1000;
      }
    }
    if (gearBars.length) playerTracks.push({ name: "装备", bars: gearBars });

    const delayBars = [];
    for (const h of this.pendingHits || []) {
      const label = String(h.src || "延迟").replace(/^.*?·/, "") || "延迟";
      const bar = clampBar(h.at, h.at + 0.45, "delay-act", label);
      if (bar) delayBars.push(bar);
    }
    if (delayBars.length) playerTracks.push({ name: "延迟", bars: delayBars });

    for (const a of this.allies || []) {
      if (!a || a.dead) continue;
      const bars = [];
      let at = a.nextActionAt;
      const every = Math.max(0.5, Number(a.every) || 3);
      let guard = 0;
      while (at <= t1 + 1e-9 && guard++ < 24) {
        const bar = clampBar(at, at + 0.5, "ally-act", `${a.damage || 0}伤`);
        if (bar) bars.push(bar);
        at = Math.round((at + every) * 1000) / 1000;
      }
      playerTracks.push({ name: a.name, bars });
    }

    // 兼容旧字段
    const playerBars = playerTracks.flatMap((tr) => tr.bars);
    return { playerTracks, playerBars, enemyTracks, windowSec };
  }
}

/** 属于「冻结环境」的 env 值：这些环境每结算会给敌人上冻 */
CombatEngine.FROST_ENVS = new Set(["permafrost"]);

window.CombatEngine = CombatEngine;
window.PLAYER_MAX_HP = PLAYER_MAX_HP;
})();
