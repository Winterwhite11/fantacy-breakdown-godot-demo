/**
 * 遭遇表：普通池 / Hard 池分离
 * Hard 池：冰与火（冰法师 + 火法师）— 更高威胁、更好奖励
 */
(function () {
  const NORMAL_ENCOUNTERS = [
    {
      id: "ENC-01",
      name: "四个野人",
      tier: 3,
      pool: "normal",
      units: [
        { id: "savage", name: "野人", hp: 16, cycle: [
          { label: "连击 3×2", attack: [2, 2, 2] },
          { label: "撕咬成长", attackBonus: 1, biteCard: true },
          { label: "连击 3×1", attack: [1, 1, 1] },
        ]},
        { id: "chief", name: "酋长", hp: 25, cycle: [
          { label: "+5 护甲", block: 5 },
          { label: "重击 15", damage: 15, skipIfAlliesAlive: true },
          { label: "重击 15", damage: 15 },
        ]},
        { id: "archer", name: "射手", hp: 19, cycle: [
          { label: "成长+2", attackBonus: 2 },
          { label: "成长+2", attackBonus: 2 },
          { label: "射击 7", damage: 7 },
        ]},
        { id: "champ", name: "冠军", hp: 13, cycle: [
          { label: "2×2+易伤", attack: [2, 2], vulnerable: 1 },
          { label: "斩击 12", damage: 12 },
        ]},
      ],
    },
    {
      id: "ENC-02",
      name: "小偷与大盗",
      tier: 2,
      pool: "normal",
      units: [
        { id: "thief", name: "小偷", hp: 30, cycle: [
          { label: "3×1", attack: [1, 1, 1] },
          { label: "连击升级", attack: [1, 1, 1, 1] },
          { label: "偷牌", stealCard: true },
        ]},
        { id: "bandit", name: "大盗", hp: 30, cycle: [
          { label: "8 伤", damage: 8 },
          { label: "+10 甲", block: 10 },
          { label: "6伤+攻", damage: 6, attackBonus: 2 },
        ]},
      ],
    },
    {
      id: "ENC-03",
      name: "损坏的机器人",
      tier: 3,
      pool: "normal",
      units: [
        { id: "robot", name: "机器人", hp: 60, cycle: [
          { label: "重放标记", buffReplay: true },
          { label: "+2攻+加固", attackBonus: 2, reinforce: 1 },
          { label: "4×6 甲", multiBlock: [6, 6, 6, 6] },
          { label: "递增加击", rampDamage: true },
        ]},
      ],
    },
    {
      id: "ENC-04",
      name: "离群野狼",
      tier: 1,
      pool: "normal",
      units: [
        { id: "wolf", name: "野狼", hp: 25, sleepUntilHit: true, cycle: [
          { label: "撕咬 8", damage: 8 },
          { label: "+3 攻", attackBonus: 3 },
          { label: "虚弱", weak: 1 },
        ]},
      ],
    },
    {
      id: "ENC-05",
      name: "史莱姆",
      tier: 1,
      pool: "normal",
      units: [
        { id: "slime_s", name: "小史莱姆", hp: 10, cycle: [
          { label: "黏稠", sticky: true },
          { label: "中毒2", poison: 2 },
          { label: "7 伤", damage: 7 },
        ]},
        { id: "slime_l", name: "大史莱姆", hp: 20, cycle: [
          { label: "4 伤", damage: 4 },
          { label: "2×2", attack: [2, 2] },
          { label: "+1 攻", attackBonus: 1 },
        ]},
      ],
    },
    {
      id: "ENC-06",
      name: "污染字素",
      tier: 1,
      pool: "normal",
      units: [
        { id: "glyph", name: "污染字符", hp: 16, cycle: [
          { label: "易伤", vulnerable: 1 },
          { label: "3×5", attack: [5, 5, 5] },
          { label: "污染手牌", polluteHand: true },
        ]},
      ],
    },
    {
      id: "ENC-07",
      name: "甲壳虫",
      tier: 1,
      pool: "normal",
      units: [
        { id: "beetle", name: "甲壳虫", hp: 22, cycle: [
          { label: "+6 甲", block: 6 },
          { label: "3伤+3甲", damage: 3, block: 3 },
          { label: "冲撞", attack: [4, 4] },
        ]},
      ],
    },
    {
      id: "ENC-08",
      name: "潜伏者",
      tier: 1,
      pool: "normal",
      units: [
        { id: "lurk", name: "潜伏者", hp: 28, cycle: [
          { label: "隐匿", stealth: true },
          { label: "背刺", damage: 10 },
          { label: "削弱", weak: 1 },
        ]},
      ],
    },
    {
      id: "ENC-09",
      name: "双头犬",
      tier: 2,
      pool: "normal",
      units: [
        { id: "hound", name: "双头犬", hp: 40, cycle: [
          { label: "12 伤", damage: 12 },
          { label: "撕咬", attack: [4, 4, 4] },
          { label: "狂暴+攻", attackBonus: 2 },
        ]},
      ],
    },
  ];

  /** Hard 遭遇池：仅冰与火（更高威胁） */
  const HARD_ENCOUNTERS = [
    {
      id: "ENC-10",
      name: "冰与火",
      tier: 3,
      pool: "hard",
      units: [
        { id: "fire_mage", name: "火法师", hp: 90, cycle: [
          { label: "燃烧堆叠", burn: 10 },
          { label: "8伤+燃", damage: 8, burn: 3 },
          { label: "炽热斩", damage: 8, burn: 5 },
        ]},
        { id: "ice_mage", name: "冰法师", hp: 60, cycle: [
          { label: "冻结堆叠", freeze: 5 },
          { label: "6伤+冻", damage: 6, freeze: 2 },
          { label: "寒冰攻", damage: 6, freeze: 3 },
        ]},
      ],
    },
  ];

  const ENCOUNTERS = [...NORMAL_ENCOUNTERS, ...HARD_ENCOUNTERS];

  function cloneEnc(e) {
    return JSON.parse(JSON.stringify(e));
  }

  function pickFrom(list) {
    if (!list.length) return null;
    return cloneEnc(list[Math.floor(Math.random() * list.length)]);
  }

  function pickRandomEncounter() {
    return pickFrom(NORMAL_ENCOUNTERS) || pickFrom(ENCOUNTERS);
  }

  function pickByTier(prefer, pool = NORMAL_ENCOUNTERS) {
    const filtered = pool.filter((e) => prefer.includes(e.tier));
    const src = filtered.length ? filtered : pool;
    return pickFrom(src);
  }

  function pickEasyEncounter() {
    return pickByTier([1], NORMAL_ENCOUNTERS);
  }

  function pickNormalEncounter() {
    return pickByTier([1, 2, 3], NORMAL_ENCOUNTERS);
  }

  /** 精英格：仅 Hard 池（冰与火） */
  function pickHardEncounter() {
    return pickFrom(HARD_ENCOUNTERS) || pickByTier([3], NORMAL_ENCOUNTERS);
  }

  function spawnUnits(encounter) {
    return encounter.units.map((u, idx) => ({
      uid: `${u.id}_${idx}`,
      name: u.name,
      hp: u.hp,
      maxHp: u.hp,
      block: 0,
      atkBonus: 0,
      reinforce: 0,
      thorns: 0,
      cycle: u.cycle,
      step: u.phaseOffset || 0,
      sleepUntilHit: !!u.sleepUntilHit,
      awake: !u.sleepUntilHit,
      decayPerTurn: u.decayPerTurn || 0,
      attackCount: 0,
      dead: false,
      nextActionAt: 5,
      actingUntil: 0,
      burn: 0,
      poison: 0,
      freeze: 0,
      bleed: 0,
      weak: 0,
      vulnerable: 0,
    }));
  }

  window.FBEncounters = {
    ENCOUNTERS,
    NORMAL_ENCOUNTERS,
    HARD_ENCOUNTERS,
    pickRandomEncounter,
    pickEasyEncounter,
    pickHardEncounter,
    pickNormalEncounter,
    spawnUnits,
  };
})();
