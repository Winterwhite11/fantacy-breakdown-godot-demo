# -*- coding: utf-8 -*-
"""修正召唤流设计说明：不同元素组合也能合成大元素（按元素对区分效果）。"""
import sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
from docx import Document

ROOT = Path(r'C:\Users\王冬睿\Desktop\Fantacy Breakdown')
DOCX = ROOT / 'card table.docx'

NEW_BLOCK = [
    '【重要修正】大元素的合成规则（2026-10-13）',
    '大元素 = 任意两个元素人合成，**不要求同属性**。',
    '合成结果由两个元素人的「元素组合」决定，不同组合产生效果不同的大元素。',
    '设计定位：',
    '  · 同属性两个元素人 → 纯属性大元素：单一效果更专精、数值略强。',
    '  · 不同属性两个元素人 → 复合大元素：获得两种元素的复合效果，但单项略弱。',
    '  · 复合大元素与纯属性大元素的基础攻击相同（12生命 / 每3秒 6点伤害）。',
    '  · 复合带来「元素种类」增加，因此元素王的元素亲和更高；纯属性则伤害更高。',
    '    这构成「广度（亲和）↔ 深度（伤害）」的取舍。',
    '复合大元素示例（元素对 → 效果）：',
    '  蒸汽  火+水  ：攻击附带2层燃烧与1层冻结',
    '  岩浆  火+砂  ：攻击无视护甲（穿透）',
    '  酸    水+毒  ：攻击附带2层中毒，并无视一半护甲',
    '  霜    水+冰  ：攻击附带2层冻结',
    '  沙尘  砂+气  ：攻击连带造成3点范围伤害',
    '  星火  电+金  ：每次攻击获得1层辉煌与1层激昂',
    '  炉火  火+钢铁：攻击伤害+1且无视护甲',
    '  锈毒  钢铁+毒：攻击附带3层中毒',
    '  永冻  冰+气  ：攻击间隔缩短至2秒并附带1层冻结',
    '  余烬  火+灰烬：攻击附带4层燃烧',
    '  藤蔓  木+木  ：攻击附带1层中毒并回复1点生命',
    '  荆棘  木+砂  ：攻击时为己方全体提供4点护甲',
    '  导管  电+气  ：攻击间隔缩短至2秒并获得1层激昂',
    '  大地  砂+木  ：攻击时回复2点生命',
    '  恒星  金+火  ：每次攻击获得1层辉煌',
    '（其余未列出组合：取两种元素效果各半，作为通用回退）',
]

def main():
    doc = Document(str(DOCX))
    existing = {p.text.strip() for p in doc.paragraphs}
    if NEW_BLOCK[0] in existing:
        print('该修正说明已存在，跳过')
        return 0
    for line in NEW_BLOCK:
        doc.add_paragraph(line)
    doc.save(str(DOCX))
    print(f'✅ 已追加 {len(NEW_BLOCK)} 行大元素合成规则修正 → {DOCX}')
    return 0

if __name__ == '__main__':
    sys.exit(main())
