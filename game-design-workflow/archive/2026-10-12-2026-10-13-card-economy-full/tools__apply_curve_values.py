# -*- coding: utf-8 -*-
"""把新伤害曲线的卡牌数值写回 card table.docx。
安全策略：逐 run 定位替换，保留原有格式（粗体/颜色/字体）。
每一步都校验「恰好命中 1 处」，否则报错并跳过，不做模糊替换。"""
import sys, re, shutil
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
from docx import Document

ROOT = Path(r'C:\Users\王冬睿\Desktop\Fantacy Breakdown')
DOCX = ROOT / 'card table.docx'
BAK = ROOT / 'godot-demo' / 'game-design-workflow' / 'archive' / '2026-10-12-pre-curve-5-14-27-45' / 'card table.ORIGINAL.docx'

# 曲线（用户拍板 1-4 档；5-6 档为三次拟合外推）
CURVE = {1: 5, 2: 14, 3: 27, 4: 45, 5: 69, 6: 100}

# (卡牌ID, 旧文案片段, 新文案片段, 理由)
EDITS = [
    # ── 2 费档：旧基准 12 → 新基准 14，给下限牌更多立即伤害 ──
    ('201', '造成范围5伤害',        '造成范围9伤害',        '2费范围牌，5伤离群'),
    ('204', '造成2点伤害',          '造成6点伤害',          '2费辅助牌，2伤过低'),
    ('214', '造成范围3点伤害',      '造成范围9点伤害',      '2费范围+冻结，3伤过低'),
    ('225', '造成2段2伤害',         '造成2段5伤害',         '2费2段牌，合计4→10'),
    ('227', '造成3段1点伤害',       '造成3段3点伤害',       '2费3段牌，合计3→9'),
    ('253', '造成3点伤害',          '造成9点伤害',          '2费延迟3次的潜力牌，前置过低'),
    ('304', '造成5范围伤害',        '造成9范围伤害',        '2费环境牌，5伤过低'),
    ('232', '造成7点范围伤害',      '造成11点范围伤害',     '2费燃烧杠杆牌，略提'),
    # ── 3 费档：旧基准 21 → 新基准 27 ──
    ('301', '造成10范围伤害',       '造成20范围伤害',       '3费范围环境牌，10伤离群'),
    ('303', '造成4范围伤害',        '造成14范围伤害',       '3费范围+毒，4伤过低'),
    ('240', '造成5点伤害',          '造成16点伤害',         '3费范围+燃10，立即伤害过低'),
    # ── 过强牌下调（旧曲线下的超模项）──
    ('212', '造成范围21伤害',       '造成范围18伤害',       '范围+燃21总价值过高'),
    ('221', '造成40伤害',           '造成30伤害',           '穿透+40伤在旧曲线超模'),
    ('229', '造成25伤害',           '造成20伤害',           '辉煌可成长，基础值下调'),
    ('211', '造成40伤害',           '造成32伤害',           '3费牌超过新基准27的倍数'),
]


def iter_paragraph_text(p):
    return ''.join(r.text for r in p.runs)


def replace_in_paragraph(p, old, new):
    """在段落内替换 old→new，逐 run 处理；返回替换次数。"""
    full = iter_paragraph_text(p)
    if full.count(old) != 1:
        return 0
    start = full.index(old)
    end = start + len(old)
    pos = 0
    for r in p.runs:
        rs, re_ = pos, pos + len(r.text)
        pos = re_
        if re_ <= start or rs >= end:
            continue
        # 本 run 与 [start,end) 有交集
        a = max(start, rs) - rs
        b = min(end, re_) - rs
        # 仅当交集覆盖了整个 old 时才直接替换（最常见）
        if rs <= start and re_ >= end:
            r.text = r.text[:a] + new + r.text[b:]
            return 1
        r.text = r.text[:a] + new + r.text[b:]
        return 1
    return 0


def main():
    if not BAK.exists():
        print('✗ 未找到备份，先运行归档'); return 1
    doc = Document(str(DOCX))
    paras = doc.paragraphs

    print('=== 应用卡牌数值调整 ===')
    ok, fail = 0, []
    for cid, old, new, why in EDITS:
        # 定位包含该卡 ID 的段落
        hit = None
        for p in paras:
            t = iter_paragraph_text(p)
            if re.match(rf'^\s*{cid}\s*[:：]', t) and old in t:
                hit = p
                break
        if hit is None:
            fail.append((cid, old, '未找到该段落或旧文案'))
            print(f'  ✗ {cid}  {old!r} → {new!r}   未命中')
            continue
        n = replace_in_paragraph(hit, old, new)
        if n == 1:
            ok += 1
            print(f'  ✓ {cid}  {old} → {new}   （{why}）')
        else:
            fail.append((cid, old, f'命中 {n} 处'))

    if fail:
        print(f'\n有 {len(fail)} 处失败，**未写入文件**，请先修正：')
        for f in fail:
            print('   ', f)
        return 1

    doc.save(str(DOCX))
    print(f'\n✅ 已写入 {ok} 处调整 → {DOCX}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
