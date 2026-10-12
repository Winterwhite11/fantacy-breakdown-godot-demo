/**
 * sim.js —— 可复现的确定性战斗模拟（自动化平衡测试用）
 *
 * 设计目标：
 *   1. 固定随机种子 ⇒ 同一卡组/同一遭遇/同一策略，跑出完全相同的轨迹
 *   2. 无 DOM 依赖，可在 Node 里批量跑数千局
 *   3. 规则镜像 html-demo/js/combat.js 的核心结算（咏唱 / 标准伤害 / 护甲 5s /
 *      状态每 5s / 敌人 5s 行动一次），用于**趋势判断**而非逐帧复刻
 *
 * 重要：本文件是**测试用模型**，不是游戏运行时。
 *   若 combat.js 的结算规则改动，需同步本文件，并跑 tools/validate.mjs。
 */
/**
 * 导出方式：
 *   - 浏览器：`<script src="js/sim.js">` 后使用 `window.FBSim`
 *   - Node 工具：用 new Function 执行本文件并取回 `FBSimModule`
 *     （见 tools/balance.mjs；因 IIFE 返回值赋给了这个顶层变量）
 */
const FBSimModule = (function () {
  const TURN = 5.0;          // 敌人每 5s 行动一次
  const STATUS_EVERY = 5.0;  // 状态每 5s 结算
  const OVERHEAD = 2.0;      // 前摇 0.5 + 后摇 1.5
  const HAND_LIMIT = 10;
  const DRAW_EVERY = 2.0;

  /** mulberry32：小而稳的确定性 PRNG */
  function makeRng(seed) {
    let a = (seed >>> 0) || 1;
    return function rng() {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /**
   * 单局模拟。
   * @param {object} o
   * @param {number} o.seed
   * @param {Array}  o.deckCards   卡牌实例数组（含 name/damage/block/chant 等已解析字段）
   * @param {object} o.encounter   FBEncounters 的一个遭遇（含 units[].hp/cycle）
   * @param {number} o.playerMaxHp
   * @param {'greedy'|'defensive'} o.policy
   * @param {number} o.maxSeconds
   */
  function simulateOne(o) {
    const rng = makeRng(o.seed);
    const maxHp = o.playerMaxHp || 60;
    let hp = maxHp;
    let block = 0, blockExpire = 0;
    let atkBonus = 0;
    let time = 0, lastDraw = 0, lastStatus = 0;
    let drawPile = shuffle(o.deckCards, rng);
    let discard = [];
    let hand = [];
    const enemies = o.encounter.units.map((u, i) => ({
      uid: u.id + "_" + i, name: u.name, hp: u.hp, maxHp: u.hp,
      block: 0, blockExpire: 0, atkBonus: 0, reinforce: 0, thorns: 0,
      cycle: u.cycle, step: u.phaseOffset || 0,
      sleep: !!u.sleepUntilHit, awake: !u.sleepUntilHit,
      decay: u.decayPerTurn || 0, attackCount: 0, dead: false,
      nextActionAt: TURN, burn: 0, poison: 0, freeze: 0, bleed: 0,
      weak: 0, vulnerable: 0,
    }));

    const player = { burn: 0, poison: 0, freeze: 0, bleed: 0, weak: 0, vulnerable: 0, fervor: 0, stealth: 0 };
    const log = [];
    let busy = false;          // 是否正在咏唱
    let busyUntil = 0;
    let pendingCard = null;

    const aliveFoes = () => enemies.filter((e) => !e.dead);
    const dmgToEnemy = (e, raw) => {
      let d = raw;
      if (player.weak > 0) d = Math.floor(d * 0.75);
      if (player.fervor > 0) d += player.fervor;
      if (e.weak > 0) d = Math.floor(d * 0.75);
      if (e.vulnerable > 0) d = Math.floor(d * 1.5);
      if (e.block > 0) { const used = Math.min(e.block, d); e.block -= used; d -= used; }
      if (d > 0) {
        e.hp -= d;
        if (e.thorns > 0) { hp -= e.thorns; }
      }
      if (e.hp <= 0) { e.hp = 0; e.dead = true; }
    };
    const dmgToPlayer = (raw) => {
      let d = raw;
      if (player.vulnerable > 0) d = Math.floor(d * 1.5);
      if (destructBlock(d)) return;   // 护甲吸收
      hp -= d;
    };
    function destructBlock(d) {
      if (block > 0) { const used = Math.min(block, d); block -= used; d -= used; }
      return d <= 0;
    }

    const drawOne = () => {
      if (hand.length >= HAND_LIMIT) return false;
      if (!drawPile.length) {
        if (!discard.length) return false;
        drawPile = shuffle(discard, rng);
        discard = [];
      }
      hand.push(drawPile.pop());
      return true;
    };
    for (let i = 0; i < 5; i++) drawOne();

    /** 选牌策略 */
    const pickCard = () => {
      if (!hand.length) return -1;
      const foes = aliveFoes();
      if (!foes.length) return -1;
      const incoming = foes.reduce((s, e) => {
        const it = e.cycle[e.step % e.cycle.length] || {};
        let d = 0;
        if (it.damage) d += it.damage + e.atkBonus;
        if (Array.isArray(it.attack)) d += it.attack.reduce((a, b) => a + b + e.atkBonus, 0);
        if (it.roundScaled) d += it.roundScaled * (Math.floor(time / TURN) + 1);
        return s + d;
      }, 0);
      const needDefense = o.policy === "defensive" && incoming > 8;
      let best = -1, bestScore = -Infinity;
      hand.forEach((c, i) => {
        let s;
        if (needDefense) {
          s = (c.block || 0) * 3 + (c.damage || 0) * 0.5;
        } else {
          s = (c.damage || 0) + (c.block || 0) * 0.8 + (c.burn || 0) * 0.5 + (c.poison || 0) * 0.8;
        }
        // 优先能击杀的
        if (c.damage >= foes[0].hp) s += 40;
        s -= (c.chant || 1) * 0.4;   // 长咏唱略减分
        if (s > bestScore) { bestScore = s; best = i; }
      });
      return best;
    };

    const playCard = (c) => {
      busy = true;
      busyUntil = time + OVERHEAD + (c.chant || 1);
      pendingCard = c;
    };

    const resolveCard = (c) => {
      const foes = aliveFoes();
      if (!foes.length) return;
      const target = foes[0];
      if (c.multi && c.multi.length) {
        for (const h of c.multi) dmgToEnemy(target, h + atkBonus);
      } else if (c.damage) {
        dmgToEnemy(target, c.damage + atkBonus);
      }
      if (c.aoe && foes.length > 1) {
        for (const e of foes.slice(1)) dmgToEnemy(e, c.damage || 0);
      }
      if (c.block) { block += c.block; blockExpire = time + 5; }
      if (c.burn) target.burn = (target.burn || 0) + c.burn;
      if (c.poison) target.poison = (target.poison || 0) + c.poison;
      if (c.freeze) target.freeze = (target.freeze || 0) + c.freeze;
      if (c.fervor) player.fervor = (player.fervor || 0) + c.fervor;
      if (c.heal) hp = Math.min(maxHp, hp + c.heal);
    };

    const stepTo = (t) => {
      // 按事件推进到 t（只处理离散里程碑，足够做趋势统计）
      while (time < t - 1e-9) {
        const dt = Math.min(0.1, t - time);
        time = Math.round((time + dt) * 1000) / 1000;

        // 抽牌
        while (time - lastDraw >= DRAW_EVERY - 1e-9) { lastDraw += DRAW_EVERY; drawOne(); }

        // 护甲到期
        if (block > 0 && time >= blockExpire) block = 0;
        for (const e of enemies) if (e.block > 0 && time >= e.blockExpire) e.block = 0;

        // 咏唱完成
        if (busy && time >= busyUntil) {
          const c = pendingCard; busy = false; pendingCard = null;
          if (c) resolveCard(c);
        }

        // 状态结算
        while (time - lastStatus >= STATUS_EVERY - 1e-9) {
          lastStatus += STATUS_EVERY;
          if (player.burn > 0) { hp -= Math.ceil(player.burn / 2); player.burn = Math.floor(player.burn / 2); }
          if (player.poison > 0) { hp -= player.poison; player.poison += 1; }
          if (player.bleed > 0) hp -= player.bleed;
          for (const e of enemies) {
            if (e.dead) continue;
            if (e.burn > 0) { dmgToEnemy(e, Math.ceil(e.burn / 2)); e.burn = Math.floor(e.burn / 2); }
            if (e.dead) continue;
            if (e.poison > 0) { dmgToEnemy(e, e.poison); e.poison += 1; }
            if (e.bleed > 0) dmgToEnemy(e, e.bleed);
          }
          if (player.burn > 0 || player.poison > 0) { /* 已处理 */ }
          // 玩家状态衰减
          for (const k of ["weak", "vulnerable", "bleed"]) if (player[k] > 0) player[k] = Math.max(0, player[k] - 1);
          player.stealth = Math.floor(player.stealth / 2);
        }

        // 敌人行动
        for (const e of enemies) {
          if (e.dead || !e.awake) continue;
          while (!e.dead && time >= e.nextActionAt - 1e-9) {
            if (e.decay) e.hp -= e.decay;
            if (e.hp <= 0) { e.hp = 0; e.dead = true; break; }
            const it = e.cycle[e.step % e.cycle.length] || {};
            e.step++;
            const alliesAliveN = aliveFoes().length - 1;
            if (it.skipIfAlliesAlive && alliesAliveN > 0) { e.nextActionAt += TURN; continue; }
            // ENC-01 射手：成长到减员至两人为止
            if (it.limitAlliesAt != null && alliesAliveN < it.limitAlliesAt) {
              e.nextActionAt = Math.round((e.nextActionAt + TURN) * 1000) / 1000;
              continue;
            }
            if (it.repeatLast) {
              const last = e.cycle[e.cycle.length - 1];
              if (last && last !== it) e.step = e.cycle.length - 1;
            }
            if (it.block) { e.block += it.block; e.blockExpire = time + 5; }
            if (it.attackBonus) e.atkBonus += it.attackBonus;
            if (it.reinforce) e.reinforce += it.reinforce;
            if (it.thorns) e.thorns += it.thorns;
            const hit = (n) => dmgToPlayer(n + e.atkBonus);
            if (it.damage) hit(it.damage);
            if (Array.isArray(it.attack)) for (const a of it.attack) hit(a);
            if (it.rampDamage) { e.attackCount++; hit(3 + 2 * (e.attackCount - 1)); }
            if (it.roundScaled) hit(it.roundScaled * (Math.floor(time / TURN) + 1));
            if (it.vulnerable) player.vulnerable += it.vulnerable;
            if (it.weak) player.weak += it.weak;
            if (it.poison) player.poison += it.poison;
            if (it.burn) player.burn += it.burn;
            if (it.freeze) player.freeze += it.freeze;
            if (it.bleed) player.bleed += it.bleed;
            if (e.awake && it.damage) e.awake = true;
            e.nextActionAt = Math.round((e.nextActionAt + TURN) * 1000) / 1000;
          }
        }

        if (hp <= 0 || !aliveFoes().length) break;
      }
    };

    // 主循环：每 0.1s 步进，尝试出牌
    let guard = 0;
    const MAX = o.maxSeconds || 300;
    while (time < MAX && hp > 0 && aliveFoes().length && guard++ < 20000) {
      if (!busy) {
        const idx = pickCard();
        if (idx >= 0) {
          const c = hand.splice(idx, 1)[0];
          discard.push(c);
          playCard(c);
          stepTo(busyUntil);        // 咏唱期间推进
        }
      }
      stepTo(time + 0.1);
    }

    const won = aliveFoes().length === 0 && hp > 0;
    const timedOut = time >= MAX;
    return {
      won, timedOut,
      hpLeft: Math.max(0, hp),
      seconds: Math.round(time * 10) / 10,
      log,
    };
  }

  /**
   * 批量模拟：返回胜率与 95% 置信区间
   */
  function simulateMany(o) {
    const n = o.games || 1000;
    let wins = 0, timeouts = 0, hpSum = 0, secSum = 0;
    const t0 = o.seed || 20261012;
    for (let i = 0; i < n; i++) {
      const r = simulateOne({ ...o, seed: t0 + i * 7919 });
      if (r.won) wins++;
      if (r.timedOut) timeouts++;
      hpSum += r.hpLeft;
      secSum += r.seconds;
    }
    const p = wins / n;
    const se = Math.sqrt((p * (1 - p)) / n);
    return {
      games: n, wins, winRate: Math.round(p * 1000) / 1000,
      ci95: [Math.round((p - 1.96 * se) * 1000) / 1000, Math.round((p + 1.96 * se) * 1000) / 1000],
      timeouts,
      avgHpLeft: Math.round((hpSum / n) * 10) / 10,
      avgSeconds: Math.round((secSum / n) * 10) / 10,
    };
  }

  const API = { TURN, OVERHEAD, makeRng, shuffle, simulateOne, simulateMany };
  if (typeof window !== "undefined") window.FBSim = API;
  return API;
})();