/**
 * 异星村落事件 —— 文本来源：事件文本.docx
 * 数值已按 HP≈60 / 起始代币 0 做温和平衡；道具仅占位无效果。
 */
(function () {
  const CHAR = {
    pure: "纯白",
    royalty: "王权",
    rock: "磐石",
    hero: "豪杰",
  };

  /** @type {Record<string, object>} */
  const EVENTS = {
    withered_leaves: {
      id: "withered_leaves",
      title: "枯枝败叶",
      region: "异星村落",
      art: "ruin",
      intro: [
        "村庄已经死去。",
        "风穿过倾斜的门框，发出一种低而长的嗡鸣，像某个巨大的句子被念到一半，断了气。土墙坍塌，露出一截截的木梁，生活的痕迹已在日晒中褪成浅灰。空气里浮着细碎的残片，偶尔闪一下，又暗下去。",
        "这里曾经有人居住。现在只剩下一些没被带走的字，还粘在废墟深处，像干枯的种子，等待一场不会来的雨。",
      ],
      choices: [
        {
          id: "gather",
          label: "搜集物资",
          preview: "支付 8 点生命，获得 1 张随机卡牌",
          narrative: [
            "你踏进废墟。脚下的碎瓦发出脆裂的声响，每一步都像踩在这个村庄尚未凉透的骨头上。",
            "在一面将倒未倒的墙根下，你找到了一个半埋的匣子。匣子已经开裂，里面残存的字素正以极其缓慢的速度向外逸散——还能用，但再不取走，就什么都没了。",
            "你伸手去够它。墙发出呻吟。",
          ],
          effects: [{ type: "hp", delta: -8 }, { type: "card_random", count: 1 }],
        },
        {
          id: "leave",
          label: "直接离开",
          preview: "获得 5 点生命",
          narrative: [
            "你站在村口，没有进去。",
            "有些地方不该被翻找。这个村庄已经完成了它的句子，剩下的只是句号之后的留白。你转过身，风从背后吹来，把那些若有若无的字素气息带向远方。",
            "你继续上路。",
          ],
          effects: [{ type: "hp", delta: 5 }],
        },
        {
          id: "childhood",
          label: "「童年」",
          requireCharacter: "pure",
          preview: "获得 8 点生命，获得 1 张随机卡牌",
          narrative: [
            "纯白没有进村。她只是走到废墟中央，站定，然后慢慢抬起右手。",
            "一枚极小的「雪」字从她指尖浮起。她低声说：「真是令人怀念。」",
            "雪落下来。不是暴雪，只是一场很轻、很慢的雪。等雪停时，村庄消失在一片纯白之下。",
            "她从雪地里拾起一枚被冷意凝住的字素，转身离开。",
          ],
          effects: [{ type: "hp", delta: 8 }, { type: "card_random", count: 1 }],
        },
      ],
    },

    merchant_of_venice: {
      id: "merchant_of_venice",
      title: "威尼斯商人",
      region: "异星村落",
      art: "trader",
      intro: [
        "村口歪着一棵枯树，树下坐着一个人。",
        "他面前铺着一张脏得发亮的兽皮，上面整齐地摆着几枚杂物。他看见你走近，咧开嘴笑了——嘴里只剩三颗牙齿。",
        "「以物易物吗？」他说，「拿你多余的，换你想要的。怎么换，由你定。」",
      ],
      choices: [
        {
          id: "game",
          label: "「玩个游戏」",
          preview: "失去 1 张随机携带牌，获得 1 张随机卡牌",
          narrative: [
            "「痛快。」他把你递过去的字素丢进陶碗，又抓了几枚一起摇。",
            "「闭眼，摸一个。摸到什么是什么。」",
            "你的指尖触到那些字素时，它们在皮肤下轻轻搏动，像活物。",
          ],
          effects: [{ type: "card_swap_random" }],
        },
        {
          id: "trade",
          label: "定向交换",
          preview: "失去 1 张随机携带牌，获得 1 张较高价值随机卡牌",
          narrative: [
            "你摊开自己的字素。他用黑黄的手指点过，嘴里念念有词。",
            "「这个……换那个。」他拈起一枚淡青色的瓶子，「成色比你的好。不亏。」",
          ],
          effects: [{ type: "card_swap_random", preferBetter: true }],
        },
        {
          id: "bye",
          label: "「告辞」",
          preview: "不进行交换",
          narrative: [
            "「不换。」你说。",
            "他没有露出失望，只是把「宝物」放回兽皮。你走出很远，他还坐在枯树下，像句末被遗忘的标点。",
          ],
          effects: [],
        },
        {
          id: "offer",
          label: "「我会给他一个无法拒绝的条件」",
          requireCharacter: "royalty",
          preview: "进入战斗；胜利后获得 1 张指定品质卡牌",
          narrative: ["他眯起眼，像在称量你身上的分量。交易，有时要用另一种语言完成。"],
          effects: [{ type: "combat", pool: "normal", onWin: [{ type: "card_random", count: 1 }] }],
        },
        {
          id: "invest",
          label: "「I have a dream，你想投资吗」",
          requireCharacter: "rock",
          preview: "获得 1 张卡牌；再次遭遇时失去 1 张卡牌",
          narrative: ["「放心。」他说，「下次我会换一个梦。」"],
          effects: [
            { type: "card_random", count: 1 },
            { type: "flag_set", flag: "venice_rock_debt", value: true },
          ],
        },
      ],
    },

    three_kingdoms: {
      id: "three_kingdoms",
      title: "三国志",
      region: "异星村落",
      art: "war",
      intro: [
        "这个村庄被四道路障切成了四块。四个村长各据一方，像四只被关在同一个笼子里的野兽。",
        "四强的一角在你经过时倒下了。剩下的三家，都派了使者来找你。",
        "「帮我们。」三方说了同样的话，但眼睛里的盘算各不一样。",
      ],
      choices: [
        {
          id: "strong",
          label: "帮助最强的一方",
          preview: "获得 22 枚代币",
          narrative: [
            "村长身后跟着抬着半开箱子的随从。箱子里是一堆明晃晃的代币，烫得人睁不开眼。",
            "村民们在远处看着你，眼睛很平静。",
          ],
          effects: [{ type: "tokens", delta: 22 }],
        },
        {
          id: "mid",
          label: "帮助第二强的一方",
          preview: "进行简单战斗；胜利后获得 12 代币与 6 生命",
          narrative: [
            "「我们打不过最强的那个。但如果加上您……差不多能赢。」",
            "「谢、谢谢！」他深深鞠躬，露出快要哭出来的笑。",
          ],
          effects: [
            {
              type: "combat",
              pool: "easy",
              onWin: [{ type: "tokens", delta: 12 }, { type: "hp", delta: 6 }],
            },
          ],
        },
        {
          id: "weak",
          label: "帮助最弱的一方",
          preview: "进行困难战斗；胜利后获得 28 代币与 1 张卡牌",
          narrative: [
            "最弱的那个人自己来了。身后是老人、孩子、断了手的青年，手里拿着削尖的木棍。",
            "这不是一场战斗。这是一场提前举办的反抗。",
          ],
          effects: [
            {
              type: "combat",
              pool: "hard",
              onWin: [{ type: "tokens", delta: 28 }, { type: "card_random", count: 1 }],
            },
          ],
        },
        {
          id: "once",
          label: "「只限一次哦」",
          requireCharacter: "hero",
          preview: "连续两场战斗（中+难）；胜利后获得全部奖励",
          narrative: ["豪杰拍了拍刀柄：「两边都帮。只限一次。」"],
          effects: [
            {
              type: "combat_chain",
              fights: [
                { pool: "easy", onWin: [{ type: "tokens", delta: 12 }, { type: "hp", delta: 6 }] },
                { pool: "hard", onWin: [{ type: "tokens", delta: 28 }, { type: "card_random", count: 1 }] },
              ],
            },
          ],
        },
      ],
    },

    iliad: {
      id: "iliad",
      title: "伊利亚特",
      region: "异星村落",
      art: "siege",
      intro: [
        "城墙是仓促之间叠起来的。城门紧闭，墙头有村民来回走动，手里握着削尖的竹竿。",
        "你们已经三天没有像样的补给了。城中的风却把烤麦子的香气送过墙来。",
        "城墙并非不可逾越。只是方式不同，代价也不同。",
      ],
      choices: [
        {
          id: "sea",
          label: "「海上来的人」",
          preview: "进行战斗；胜利后获得 24 代币与 8 生命",
          narrative: [
            "你们从正面向城门逼近。墙头火把汇成一只缓缓睁开的巨眼。",
            "海洋教会人的，从来不是绕路，而是把浪头砸在岸上，直到岸妥协。",
          ],
          effects: [
            {
              type: "combat",
              pool: "normal",
              onWin: [{ type: "tokens", delta: 24 }, { type: "hp", delta: 8 }],
            },
          ],
        },
        {
          id: "zeus",
          label: "「宙斯法则」",
          preview: "不战斗；获得 1 张随机卡牌",
          narrative: [
            "你举起空空的双手走到城门下，仰头对那只巨眼说了一个字：「客。」",
            "城门开了一条缝，扔出小包裹：几块硬饼，还有一壶水——以及一枚夹在布里的字素。",
          ],
          effects: [{ type: "card_random", count: 1 }],
        },
        {
          id: "horse",
          label: "「木马计」",
          preview: "失去 1 张随机携带牌；获得 32 代币",
          narrative: [
            "入夜后你们把礼品放在城门外。城门吱呀开了——你们从黑暗中跃出。",
            "真正的木马，不是那包礼物，是你们自己。粮仓里最沉的那一袋，归你们。",
          ],
          effects: [{ type: "card_lose_random", count: 1 }, { type: "tokens", delta: 32 }],
        },
      ],
    },

    don_quixote: {
      id: "don_quixote",
      title: "堂吉诃德",
      region: "异星村落",
      art: "windmill",
      intro: [
        "村外荒原上立着一排老旧的风车。一个村民拦住你们：头上铜盆，身下瘦驴，手里枯朽木剑。",
        "「骑士！那巨人就在前面——你可愿同行？」",
      ],
      choices: [
        {
          id: "join",
          label: "陪同他前往",
          preview: "进入分支抉择",
          narrative: ["你们跟在他身后朝歪斜的巨型风车走去。铜盆在头顶咣当作响。"],
          effects: [{ type: "goto", node: "don_quixote_branch" }],
        },
        {
          id: "refuse",
          label: "拒绝并离开",
          preview: "获得 8 枚代币",
          narrative: [
            "「不了。」你说。他正了正铜盆：「真正的骑士从不强求同伴！」",
            "你走出几步，脚边多了一个小布袋——几枚铜币，成色尚可。",
          ],
          effects: [{ type: "tokens", delta: 8 }],
        },
      ],
    },

    don_quixote_branch: {
      id: "don_quixote_branch",
      title: "堂吉诃德 · 风车之前",
      region: "异星村落",
      art: "windmill",
      intro: ["风车叶片旋转，一下，一下，像在数着你们的死期。你决定相信什么？"],
      choices: [
        {
          id: "just_mill",
          label: "「那只是个风车」",
          preview: "一无所获",
          narrative: [
            "他冲锋，木剑断成两截。他躺在尘土里大笑：「巨人害怕了！」",
            "你终于明白，他最擅长的是把每一个惨败都解释成大胜。",
          ],
          effects: [],
        },
        {
          id: "giant",
          label: "「巨人确实存在」",
          preview: "进行战斗；胜利后获得 16 代币与 1 张卡牌",
          narrative: [
            "地面颤抖。风车重组为一头岩石巨影。",
            "「看吧！巨人！」——这场战斗并不容易，但你们赢了。",
          ],
          effects: [
            {
              type: "combat",
              pool: "hard",
              onWin: [{ type: "tokens", delta: 16 }, { type: "card_random", count: 1 }],
            },
          ],
        },
      ],
    },

    one_hundred_years: {
      id: "one_hundred_years",
      title: "百年孤独",
      region: "异星村落",
      art: "loop",
      intro: [
        "多年以后，当村庄最后一个人忘记如何念出自己的名字时，他会想起你们第一次路过村口石碑的那个下午。",
        "这地方的时间不是一条河，是一条咬着尾巴的蛇。仪式还在继续。",
      ],
      choices: [
        {
          id: "ritual",
          label: "「加入仪式」",
          preview: "失去 6 点生命，获得 1 张随机卡牌（可再次选择）",
          keepOpen: true,
          narrative: [
            "你站进被千万次踩实的圆圈。铭文从喉咙里流出来。",
            "有什么东西被抽走，又有什么温热的东西落进掌心。",
          ],
          effects: [{ type: "hp", delta: -6 }, { type: "card_random", count: 1 }],
        },
        {
          id: "leave",
          label: "「离开这个是非之地」",
          preview: "获得 8 点生命",
          narrative: [
            "你转身走开。荒原上的风灌进肺里，真实得让人想哭。",
            "身后，诵念还在继续，像一条永远流不到海里的河。",
          ],
          effects: [{ type: "hp", delta: 8 }],
        },
        {
          id: "break",
          label: "「打破循环」",
          preview: "55% 成功：获得 36 代币；失败：失去 8 代币",
          narrative: ["你决定打断它。"],
          effects: [
            {
              type: "chance",
              rate: 0.55,
              successNarrative: [
                "那根看不见的绳崩断。村民们瘫倒，又发出长长的哭喊。",
                "一个女人把一捧沾着泥土的代币放进你手心。眼睛在说：谢谢你。",
              ],
              failNarrative: [
                "铭文太老了。你被弹出来，背脊撞在石碑上。",
                "循环还在。诵念重新响起，和昨天一模一样。",
              ],
              success: [{ type: "tokens", delta: 36 }],
              fail: [{ type: "tokens", delta: -8 }],
            },
          ],
        },
      ],
    },

    les_miserables: {
      id: "les_miserables",
      title: "悲惨世界",
      region: "异星村落",
      art: "refugees",
      intro: [
        "荒原上，一群人像被风吹到一处的枯叶。年轻女人跪在最前面：「什么都行。给我们一点活路吧。」",
      ],
      choices: [
        {
          id: "give",
          label: "「给予帮助」",
          preview: "失去 14 枚代币；再次遭遇本事件时获得 1 张卡牌",
          narrative: [
            "你把铜币与水瓶放进她怀里。「拿好。」",
            "她的眼泪落在干裂的地面上，像迟到了太久的雨。",
          ],
          effects: [
            { type: "tokens", delta: -14 },
            { type: "flag_set", flag: "miserables_helped", value: true },
          ],
        },
        {
          id: "hire",
          label: "「雇佣他们」",
          preview: "失去 18 枚代币；下场战斗开始额外抽 1 张牌",
          narrative: [
            "你扶起最壮实的男人：「认得路吗？那带我们走。我们付钱。」",
            "他点头，背挺得比刚才直了一点。",
          ],
          effects: [
            { type: "tokens", delta: -18 },
            { type: "flag_set", flag: "guide_extra_draw", value: true },
          ],
        },
        {
          id: "plunder",
          label: "「掠夺」",
          preview: "获得随机道具（占位，暂无效果）",
          narrative: [
            "他们太弱了。你拿走仅存的财物。没有人反抗。",
            "身后传来婴儿极细的哭声，像一根线，在风里断了。",
          ],
          effects: [{ type: "item", itemId: "refugee_trinket", name: "流民遗物" }],
        },
      ],
      onEnter: [
        {
          whenFlag: "miserables_helped",
          effects: [{ type: "card_random", count: 1 }],
          narrative: ["人群里有人认出了你，塞给你一枚温热的字素，作为当初那点水的回声。"],
          clearFlag: "miserables_helped",
        },
      ],
    },

    old_man_sea: {
      id: "old_man_sea",
      title: "老人与海",
      region: "异星村落",
      art: "sea",
      intro: [
        "酒馆一半悬在礁石上。桌子后面坐着一个老人：「掰手腕。赢了，这个归你。输了，你留下的归我。」",
      ],
      choices: [
        {
          id: "wrestle",
          label: "「来吧。」",
          preview: "进入耐力对抗",
          narrative: [
            "他的手掌像晒干的渔网。两条手臂之间的空气绷得像随时会开裂。",
          ],
          effects: [{ type: "goto", node: "old_man_sea_hold", init: { hold: 0 } }],
        },
      ],
    },

    old_man_sea_hold: {
      id: "old_man_sea_hold",
      title: "老人与海 · 对抗",
      region: "异星村落",
      art: "sea",
      intro: ["手腕发酸。潮水顺着礁石往上漫。你还能再撑一下吗？"],
      dynamicIntro: (ctx) => [
        `已坚持 ${ctx.hold || 0} 次。成功把握约 ${Math.min(85, 28 + (ctx.hold || 0) * 18)}%。`,
      ],
      choices: [
        {
          id: "hold",
          label: "「再撑一下。」",
          preview: "随机失去 4 生命或 5 代币；提升成功率",
          narrative: ["你咬紧牙，把手顶住。老人眼里闪过一丝很淡的光。"],
          effects: [
            { type: "pay_random", options: [{ type: "hp", delta: -4 }, { type: "tokens", delta: -5 }] },
            {
              type: "chance",
              rateFrom: (ctx) => Math.min(0.85, 0.28 + (ctx.hold || 0) * 0.18),
              successNarrative: [
                "「咔。」桌面裂开一道细纹。老人的手腕落了下去。",
                "「好。你像条鱼。」他把木箱推向你。",
              ],
              failNarrative: ["掌心又热了一点。潮水没有尽头——对抗还在继续。"],
              success: [
                { type: "tokens", delta: 26 },
                { type: "card_random", count: 1 },
                { type: "end_event" },
              ],
              fail: [{ type: "ctx_inc", key: "hold", by: 1 }],
              onFailKeepOpen: true,
            },
          ],
        },
        {
          id: "release",
          label: "「松手。」",
          preview: "不获得奖励",
          narrative: [
            "你松开了手。「下次再来。」他说，声音和海浪一样平。",
          ],
          effects: [],
        },
      ],
    },

    fortress_besieged: {
      id: "fortress_besieged",
      title: "围城",
      region: "异星村落",
      art: "gate",
      intro: [
        "城门紧闭。城外的人喊「让我们进去」，城里的人喊「放我们出去」。",
        "你站在两股声浪之间。",
      ],
      choices: [
        {
          id: "break_in",
          label: "「破墙而入」",
          preview: "获得道具「门闩残片」（占位）",
          narrative: [
            "门开的瞬间两边对冲，谁都走不动。你在城里捡了点杂物，拍拍灰走了。",
          ],
          effects: [{ type: "item", itemId: "gate_shard", name: "门闩残片" }],
        },
        {
          id: "status_quo",
          label: "「维持现状」",
          preview: "获得道具「守门水囊」（占位）",
          narrative: [
            "你按紧门闸。「就这样。」咒骂像石子砸来。守门老兵递给你一小壶水。",
          ],
          effects: [{ type: "item", itemId: "gate_water", name: "守门水囊" }],
        },
        {
          id: "tickets",
          label: "「兜售远方」",
          preview: "获得道具「空头城券」（占位）+ 10 代币",
          narrative: [
            "你卖出入城券与出城券。门依旧关着，你口袋鼓了起来，悄然离去。",
          ],
          effects: [
            { type: "item", itemId: "fake_pass", name: "空头城券" },
            { type: "tokens", delta: 10 },
          ],
        },
      ],
    },

    four_generations: {
      id: "four_generations",
      title: "四世同堂",
      region: "异星村落",
      art: "peach",
      intro: [
        "村东头深宅里，四代人为一枚大如碗口的桃子争执，请你评理。",
        "太爷爷：「我给你尊重。」爷爷：「我给你权力。」当家：「我给你物质。」少年：「我给你未来。」",
      ],
      choices: [
        {
          id: "elder",
          label: "「长幼有序。」",
          preview: "获得旗标：下次商店价格减半（占位）",
          narrative: ["「你懂规矩。」太爷爷说，「远近都会知道您的高风亮节。」"],
          effects: [{ type: "flag_set", flag: "shop_half", value: true }, { type: "item", itemId: "respect_token", name: "尊长信物" }],
        },
        {
          id: "status",
          label: "「地位至上。」",
          preview: "获得旗标：下个节点可自选类型（占位）",
          narrative: ["老人一把抓住桃子，仿佛本该属于自己。"],
          effects: [{ type: "flag_set", flag: "free_node_pick", value: true }],
        },
        {
          id: "business",
          label: "「家业为先。」",
          preview: "获得 10 代币与 5 生命",
          narrative: ["当家从柜底摸出一小包宝贝：「不多，您别嫌弃。」"],
          effects: [{ type: "tokens", delta: 10 }, { type: "hp", delta: 5 }],
        },
        {
          id: "future",
          label: "「未来可期。」",
          preview: "获得道具「桃核」（占位，下局奖励预留）",
          narrative: ["少年说：「等我的树结了桃，最大的那个还摆在您面前。」"],
          effects: [{ type: "item", itemId: "peach_pit", name: "桃核" }, { type: "flag_set", flag: "next_run_bonus", value: true }],
        },
      ],
    },
  };

  const POOL_IDS = [
    "withered_leaves",
    "merchant_of_venice",
    "three_kingdoms",
    "iliad",
    "don_quixote",
    "one_hundred_years",
    "les_miserables",
    "old_man_sea",
    "fortress_besieged",
    "four_generations",
  ];

  function pickRandomEventId(excludeIds = []) {
    const pool = POOL_IDS.filter((id) => !excludeIds.includes(id));
    const list = pool.length ? pool : POOL_IDS;
    return list[Math.floor(Math.random() * list.length)];
  }

  function getEvent(id) {
    return EVENTS[id] || null;
  }

  window.FBEvents = {
    EVENTS,
    CHAR,
    POOL_IDS,
    pickRandomEventId,
    getEvent,
  };
})();
