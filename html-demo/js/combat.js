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
    };

    this.encounter = null;
    this.enemies = [];
    this.draw = [];
    this.discard = [];
    this.hand = [];
    this.craft = [];
    this.craftResult = null;
    this.pendingDrawAt = null; // stack delayed draw
    this.logs = [];
    this.ended = false;
    this.won = false;
    this.TIME_STEP = 0.5;
    this.autoflowing = false;
    this._autoflowTimer = null;
    this._autoflowRealMs = 140;
    this._gearIntervals = [];
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

    this.log(`遭遇 ${encounter.id}「${encounter.name}」· ${this.enemies.length} 个单位`);
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

    this._checkEnd();
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
    // 消耗槽内材料 → 弃牌堆；产物作为新卡进入手牌
    this.discard.push(...this.craft);
    this.craft = [];
    this.craftResult = null;
    this.hand.push(product);
    this.log(`合成成功：「${product.name}」已加入手牌（${product.type} · 咏唱 ${product.chant}s）`);
    return { ok: true, card: product, handIndex: this.hand.length - 1 };
  }

  /** Play crafted preview without putting intermediate in hand, or play selected craft result path */
  playCraftDirect() {
    const preview = previewCraft(this.craft);
    if (!preview.card) {
      this.log("组合台无有效合成结果");
      return false;
    }
    if (!this._canStartChant()) return false;
    const card = preview.card;
    this.discard.push(...this.craft);
    this.craft = [];
    this.craftResult = null;
    this._startChant(card);
    return true;
  }

  playHand(handIndex, targetUid) {
    if (!this._canStartChant()) return false;
    if (handIndex < 0 || handIndex >= this.hand.length) return false;
    if (this.player.sticky && this._playsThisWindow >= 2) {
      this.log("黏稠：本窗口只能再打出有限张牌");
    }
    const [card] = this.hand.splice(handIndex, 1);
    // Instant process effects that skip full chant path partially
    if (card.type === "process" && !card.effect) {
      this._resolveProcessInstant(card);
      this.discard.push(card);
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
    const chantSec = Math.max(0.5, card.chant || 1);
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
    const target = targetUid || this._defaultTarget();
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
    this.log(`开始咏唱「${card.name}」· ${chantSec}s（目标 ${this._enemyName(target)}）· 时间轴自动流动至后摇结束`);
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
        this.discard.push(this.hand.splice(i, 1)[0]);
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
      this.discard.push(card);
      return;
    }

    if (card.type === "element") {
      this._resolveElement(card, targetUid);
      this.discard.push(card);
      return;
    }

    if (card.type === "word" && card.effect) {
      this._resolveEffect(card.effect, card, targetUid);
      this.discard.push(card);
      return;
    }

    this.discard.push(card);
  }

  _resolveElement(card, targetUid) {
    const boost = this.player.atkBonus + this.player.nextAtkBonus;
    this.player.nextAtkBonus = 0;
    const play = card.play || window.FBCards.CARD_DEFS[card.defId]?.play || {};
    if (play.damage != null) {
      this._damageEnemy(targetUid, play.damage + boost, card.name);
    }
    if (play.multi) {
      for (const d of play.multi) this._damageEnemy(targetUid, d + boost, card.name);
    }
    if (play.block) this._addPlayerBlock(play.block);
    if (play.poison) {
      const e = this._findEnemy(targetUid) || this.enemies.find((x) => !x.dead);
      if (e) {
        e.poison = (e.poison || 0) + play.poison;
        this.log(`${card.name}：${e.name} 中毒 +${play.poison}`);
      }
    }
    if (play.freeze) {
      const e = this._findEnemy(targetUid) || this.enemies.find((x) => !x.dead);
      if (e) {
        e.freeze = (e.freeze || 0) + play.freeze;
        this.log(`${e.name} 冻结 +${play.freeze}`);
      }
    }
    if (play.glory) {
      this.glory += play.glory;
      this.log(`${card.name}：辉煌 +${play.glory}`);
    }
    if (play.fervor) {
      this.player.fervor = (this.player.fervor || 0) + play.fervor;
      this.log(`${card.name}：激昂 +${play.fervor}`);
    }
  }

  _resolveEffect(fx, card, targetUid) {
    const boost = this.player.atkBonus + this.player.nextAtkBonus;
    this.player.nextAtkBonus = 0;
    const Cards = window.FBCards;
    const std = Cards.standardDamage;

    // 蒸汽：默认打敌人范围 5；无目标时对己（无前后摇已在咏唱侧处理时可另议）
    if (fx.choose === "steam") {
      this._damageEnemy(targetUid, 5 + boost, card.name);
      // 简化：同时记录 docx 对己选项可通过「咏唱打出时无目标」——此处一律对敌
      return;
    }

    if (fx.heal) {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + fx.heal);
      this.log(`${card.name}：回复 ${fx.heal}`);
    }
    if (fx.block) this._addPlayerBlock(fx.block + (fx.heatBoost || 0));
    if (fx.multiBlock) {
      for (const b of fx.multiBlock) this._addPlayerBlock(b + (fx.heatBoost || 0));
    }
    if (fx.damage != null) {
      let dmg = fx.damage + boost + (fx.heatBoost || 0);
      if (fx.gloryScale) dmg += (this.glory || 0) * fx.gloryScale;
      if (fx.burnBonus && targetUid) {
        const e = this._findEnemy(targetUid);
        if (e && (e.burn || 0) > 0) dmg += fx.burnBonus;
      }
      if (this.player.kindle) dmg = Math.floor(dmg * 1.5);
      this._damageEnemy(targetUid, dmg, card.name);
      if (fx.killHeal) {
        const e = this._findEnemy(targetUid);
        if (!e || e.dead) {
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + fx.killHeal);
          this.log(`${card.name}：击杀回复 ${fx.killHeal}`);
        }
      }
    }
    if (fx.multi) {
      for (const d of fx.multi) {
        let hit = d + boost + (fx.heatBoost || 0);
        if (this.player.kindle) hit = Math.floor(hit * 1.5);
        this._damageEnemy(targetUid, hit, card.name);
        if (fx.burnPerHit) {
          const e = this._findEnemy(targetUid) || this.enemies.find((x) => !x.dead);
          if (e) e.burn = (e.burn || 0) + fx.burnPerHit;
        }
        if (fx.poisonPerHit) {
          const e = this._findEnemy(targetUid) || this.enemies.find((x) => !x.dead);
          if (e) e.poison = (e.poison || 0) + fx.poisonPerHit;
        }
      }
    }
    if (fx.damageByChant) {
      this._damageEnemy(targetUid, std(card.chant) + boost, card.name);
    }
    if (fx.blockByChant) {
      this._addPlayerBlock(std(card.chant));
    }
    if (fx.purified) {
      this._damageEnemy(targetUid, std(1.5) + boost, card.name);
    }
    if (fx.burn) {
      const targets = fx.aoe || fx.aoeAll ? this.enemies.filter((e) => !e.dead) : [this._findEnemy(targetUid)].filter(Boolean);
      for (const e of targets) e.burn = (e.burn || 0) + fx.burn;
    }
    if (fx.freeze) {
      const e = this._findEnemy(targetUid) || this.enemies.find((x) => !x.dead);
      if (e) e.freeze = (e.freeze || 0) + fx.freeze;
    }
    if (fx.poison) {
      for (const e of this.enemies) {
        if (e.dead) continue;
        e.poison = (e.poison || 0) + fx.poison;
      }
      this.log(`${card.name}：中毒 +${fx.poison}`);
    }
    if (fx.stripBlockHalf) {
      const e = this._findEnemy(targetUid) || this.enemies.find((x) => !x.dead);
      if (e && e.block > 0) {
        const cut = Math.ceil(e.block * 0.5);
        e.block -= cut;
        this.log(`${card.name}：削减护甲 ${cut}`);
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
      this.log(`${card.name}：反弹下一次伤害`);
    }
    if (fx.interrupt) {
      this.log(`${card.name}：打断（Demo：敌方下次行动 +2s）`);
      for (const e of this.enemies) {
        if (!e.dead) e.nextActionAt += 2;
      }
    }
    if (fx.glory) this.glory += fx.glory;
    if (fx.kindle) {
      this.player.kindle = true;
      this.log(`${card.name}：助燃（对燃烧敌人伤害 +50%）`);
    }
    if (fx.fervor) {
      this.player.fervor = (this.player.fervor || 0) + fx.fervor;
      this.log(`${card.name}：激昂 +${fx.fervor}`);
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
        this.log(`${card.name}：热驱动（有燃烧）攻+1 抽2 清燃烧`);
      } else {
        for (const e of this.enemies) {
          if (!e.dead) e.burn = (e.burn || 0) + 3;
        }
        this.player.burn = (this.player.burn || 0) + 3;
        this.log(`${card.name}：热驱动（无燃烧）全体燃烧 +3`);
      }
    }
    if (fx.settleBurn) {
      for (const e of this.enemies) {
        if (e.dead || !e.burn) continue;
        this._damageEnemy(e.uid, Math.ceil(e.burn / 2), "燃烧结算");
        e.burn = Math.floor(e.burn / 2);
      }
    }
    if (fx.doublePoison) {
      for (const e of this.enemies) {
        if (!e.dead && e.poison) e.poison *= 2;
      }
      this.log(`${card.name}：中毒层数翻倍`);
    }
    if (fx.vulnerable) {
      this.player.vulnerable += fx.vulnerable;
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
      this.log(`${card.name}：坚韧（护甲持续延长）`);
    }
    if (fx.raw && !fx.damage && !fx.damageByChant && !fx.multi && !fx.block && !fx.heal) {
      // 未结构化条目：按咏唱标准伤兜底，保留原文
      this._damageEnemy(targetUid, std(card.chant) + boost, card.name);
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

  _addPlayerBlock(n) {
    const add = n + (this.player.reinforce || 0);
    this.player.block += add;
    this.player.blockExpire = this.time + ARMOR_DURATION;
    this.log(`获得护甲 ${add}（持续 ${ARMOR_DURATION}s）`);
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

  _damageEnemy(uid, raw, src) {
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
    if (e.block > 0) {
      const used = Math.min(e.block, dmg);
      e.block -= used;
      dmg -= used;
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

    if (intent.vulnerable) this.player.vulnerable += intent.vulnerable;
    if (intent.weak) this.player.weak += intent.weak;
    if (intent.poison) this.player.poison += intent.poison;
    if (intent.burn) this.player.burn += intent.burn;
    if (intent.freeze) this.player.freeze += intent.freeze;
    if (intent.bleed) this.player.bleed += intent.bleed;
    if (intent.sticky) this.player.sticky = true;
    if (intent.polluteHand) this.player.pollute = true;
    if (intent.stealCard && this.hand.length) {
      const i = Math.floor(Math.random() * this.hand.length);
      this.discard.push(this.hand.splice(i, 1)[0]);
      this.log(`${e.name} 偷走一张手牌`);
    }
    if (intent.biteCard) {
      this.log(`${e.name} 塞入撕咬卡（Demo：施加虚弱）`);
      this.player.weak += 1;
    }
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
