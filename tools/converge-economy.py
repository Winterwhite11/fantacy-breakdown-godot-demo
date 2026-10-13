# -*- coding: utf-8 -*-
"""收敛各档收益，使三条路线净值同量级（目标：净值均 ≈ 1.3~2 万）。

现状（标定实测）：
  跑刀 收益 58,163 净值 13,820  （收集品 42%）
  常规 收益 108,639 净值 13,039  （收集品 52%）
  猛攻 收益 287,306 净值 121,906 （收集品 65%）  ← 过高，储藏太肥

目标：
  跑刀 收益 ~45,000 净值 ~15,000
  常规 收益 ~95,000 净值 ~15,000
  猛攻 收益 ~180,000 净值 ~15,000
  且收集品占比升到 65~75%（收集品是主角）→ 需**提高收集品、降低代币**

手段：
  1. 下调代币（从占 30% 降到约 25~30%，因为战备成本已定）
  2. 提高 gate 掉率（收集品主角化）
  3. 大幅下调 tierCache（猛攻超额的主因）
"""
import json, sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(r'C:\Users\王冬睿\Desktop\Fantacy Breakdown\godot-demo')
DATA = ROOT / 'game-design-workflow' / 'data'
p = DATA / 'economy-config.json'
cfg = json.loads(p.read_text(encoding='utf-8'))

# 1) 代币下调（收集品主角化）
cfg['combatToken'] = {
    '_note': '战斗代币 = 保底收入。收集品是主角（占一局 65~75%），故代币保持较低的绝对量。',
    '1': {'min': 4000, 'max': 6000},
    '2': {'min': 7000, 'max': 11000},
    '3': {'min': 14000, 'max': 20000},
}

# 2) gate 掉率上调（每节点更多搜索产出）
cfg['collectibleGate'] = {
    '_note': '每节点收集品掉率。搜打撤里「节点=搜索点」，期望可 >1 件/节点。按可达威胁档位分池，跑刀只能拿白/绿。',
    '1': {'white': 1.20, 'green': 0.80},
    '2': {'white': 1.20, 'green': 1.00, 'blue': 0.35},
    '3': {'green': 1.10, 'blue': 0.90, 'purple': 0.30, 'gold': 0.06},
}

# 3) 储藏大幅收敛（猛攻超额的主因）
cfg['tierCache'] = {
    '_note': '档位专属高价值产出（精英/稀有储藏，撤离前丢失）。原先概率过高导致猛攻收益失控（287k → 净值 122k），现收敛。',
    '1': None,
    '2': {'chance': 0.30, 'rarity': 'purple'},
    '3': {'chance': 0.35, 'rarity': 'gold', 'extraChance': 0.10, 'extraRarity': 'unique'},
}

p.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('✅ economy-config.json 已收敛')
print('   代币：4~6k / 7~11k / 14~20k')
print('   gate：档1 1.20+0.80 · 档2 1.20+1.00+0.35 · 档3 1.10+0.90+0.30+0.06')
print('   cache：档2 30%@purple · 档3 35%@gold + 10%@unique')
