#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""economy-scale.py —— 经济量级统一缩放

需求：统一口径后整个经济量级太小（一次撤离仅 90~284 代币），
玩家会看到「只有几百块」的负反馈。目标是把**卡牌价 / 战备价 / 收集品价 /
战斗代币**四者一起放大到「一次成功撤离 3~8 万」的量级。

为什么必须用一个脚本：
  这四者互相耦合（战备定价 = 材料成本×2，材料价值来自阶梯，收集品同用阶梯，
  代币是保底收入）。手工改十几个文件里的数字必然漏掉某处，破坏恒等式。
  统一缩放能**保证所有比例不变**，只改量级。

用法：
  python tools/economy-scale.py --factor 2000           # 执行
  python tools/economy-scale.py --factor 2000 --dry-run # 只报告
"""
import argparse, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HD = ROOT / 'html-demo'
DATA = ROOT / 'game-design-workflow' / 'data'


def scale_number(s, factor, integer=True):
    """把数字字符串按倍数缩放（保留原格式的整数/小数风格）"""
    v = float(s)
    out = v * factor
    if integer and float(s).is_integer():
        return str(int(round(out)))
    return str(round(out, 2))


def sub_numbers(pattern, text, factor, groups=1):
    """对匹配到的数字做缩放替换"""
    n = [0]

    def repl(m):
        n[0] += 1
        return m.group(0).replace(m.group(groups), scale_number(m.group(groups), factor))
    return re.sub(pattern, repl, text), n[0]


def process(rel, rules, factor, dry):
    p = ROOT / rel
    src = p.read_text(encoding='utf-8')
    total = 0
    for desc, pattern in rules:
        src, c = sub_numbers(pattern, src, factor)
        total += c
        if c == 0:
            print(f'  ⚠ {rel}: 「{desc}」未匹配到任何数字')
    if not dry and total:
        p.write_text(src, encoding='utf-8', newline='\n')
    return total


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--factor', type=float, required=True)
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()
    f = args.factor
    print(f'=== 经济量级缩放 ×{f}{"（试算）" if args.dry_run else ""} ===\n')

    changed = {}

    # 1) 收集品价值区间 + 稀有度价值阶梯 + 材料价值（loot.js）
    loot_rules = [
        ('v3(收集品区间 min/max)',
         re.compile(r'\b(white|green|blue|purple|gold|unique):\s*\{\s*"min":\s*([\d.]+),\s*"max":\s*([\d.]+)\s*\}', re.M)),
    ]
    p = HD / 'js' / 'loot.js'
    s = p.read_text(encoding='utf-8')
    # 收集品区间：源码里是换行格式 `white: { min: 6, max: 14 },`
    def sc_range(m):
        return f'{m.group(1)}: {{ min: {scale_number(m.group(2), f)}, max: {scale_number(m.group(3), f)} }}'
    s2, c1 = re.subn(
        r'\b(white|green|blue|purple|gold|unique):\s*\{\s*min:\s*([\d.]+),\s*max:\s*([\d.]+)\s*\}',
        sc_range, s)
    # RARITY_VALUE_STEP：white: 10, green: 22, ...
    def sc_step(m):
        return f'{m.group(1)}: {scale_number(m.group(2), f)}'
    s2, c2 = re.subn(r'\b(white|green|blue|purple|gold|unique|greenUp):\s*(\d+(?:\.\d+)?)(?=,|\s*\})', sc_step, s2)
    # MATERIALS 的 value:
    def sc_mat(m):
        return f'value: {scale_number(m.group(1), f)}'
    s2, c3 = re.subn(r'value:\s*(\d+(?:\.\d+)?)(?=,\s*desc:\s*"战备合成材料)', sc_mat, s2)
    # TIER_GOLD
    def sc_gold(m):
        return f'{m.group(1)}: {{ min: {scale_number(m.group(2), f)}, max: {scale_number(m.group(3), f)} }}'
    s2, c4 = re.subn(r'(\d):\s*\{\s*min:\s*(\d+),\s*max:\s*(\d+)\s*\}', sc_gold, s2)
    changed['js/loot.js'] = c1 + c2 + c3 + c4
    if not args.dry_run:
        p.write_text(s2, encoding='utf-8', newline='\n')
    print(f'  js/loot.js          {changed["js/loot.js"]} 处（收集品区间{c1} 阶梯{c2} 材料{c3} 战金{c4}）')

    # 2) 卡牌价格曲线（economy.js 的 COEF.PRICE_AT_5WV）
    p = HD / 'js' / 'economy.js'
    s = p.read_text(encoding='utf-8')
    s2, c = re.subn(r'(PRICE_AT_5WV:\s*)(\d+(?:\.\d+)?)', lambda m: m.group(1) + scale_number(m.group(2), f), s)
    # 3) 战备曲线（EQUIP_BASE）
    s2, c2 = re.subn(r'(EQUIP_BASE:\s*)(\d+(?:\.\d+)?)', lambda m: m.group(1) + scale_number(m.group(2), f), s2)
    changed['js/economy.js'] = c + c2
    if not args.dry_run:
        p.write_text(s2, encoding='utf-8', newline='\n')
    print(f'  js/economy.js       {c + c2} 处（卡价曲线{c} 战备曲线{c2}）')

    # 4) economy-config.json：代币/收集品/储藏/战备成本
    p = DATA / 'economy-config.json'
    cfg = json.loads(p.read_text(encoding='utf-8'))
    def sc_obj(d, keys):
        n = 0
        for k in keys:
            if k in d and isinstance(d[k], dict) and 'min' in d[k]:
                d[k] = {kk: int(round(vv * f)) if kk in ('min', 'max') else vv for kk, vv in d[k].items()}
                n += 1
            elif k in d and isinstance(d[k], (int, float)):
                d[k] = int(round(d[k] * f)); n += 1
        return n
    n = 0
    for k in cfg.get('combatToken', {}):
        if k.startswith('_'): continue
        cfg['combatToken'][k] = {kk: int(round(vv * f)) for kk, vv in cfg['combatToken'][k].items()}
        n += 1
    for k in cfg.get('collectibleValue', {}):
        if k.startswith('_'): continue
        cfg['collectibleValue'][k] = {kk: int(round(vv * f)) for kk, vv in cfg['collectibleValue'][k].items()}
        n += 1
    for k in cfg.get('builds', {}):
        if k.startswith('_') or not isinstance(cfg['builds'][k], dict): continue
        cfg['builds'][k]['cost'] = int(round(cfg['builds'][k]['cost'] * f)); n += 1
    for k in cfg.get('collectibleGate', {}):
        if k.startswith('_'): continue
        n += 1   # 掉率不缩放
    changed['economy-config.json'] = n
    if not args.dry_run:
        p.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'  economy-config.json {n} 项（代币/收集品/战备成本；掉率不变）')

    print(f'\n共 {sum(changed.values())} 处数字已{"试算" if args.dry_run else "缩放"}')
    if not args.dry_run:
        print('\n注意：卡牌价格表 card-price-table-v1.json 与 card-prices.js 需要重跑生成器：')
        print('  npm run prices')


if __name__ == '__main__':
    sys.exit(main())
