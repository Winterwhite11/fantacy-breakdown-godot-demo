# -*- coding: utf-8 -*-
"""修复斜杠配方解析：正确提取「砂+火/加热+增幅」形式的材料链。

改进点：
1. 括号内说明不再被误当配方（如「（无前后摇，咏唱时间为1s）」）
2. 斜杠只在「单个 token」内展开（砂+火/加热+增幅 → [砂,火,增幅],[砂,加热,增幅]）
3. 冲突说明（如异化的「水+火 火+木 …」）识别为冲突对，不作为配方
4. 产出 craft_alts / materials_alts 完整链路
"""
import re, sys, json
from itertools import product
from pathlib import Path

ROOT = Path(r"C:\Users\王冬睿\Desktop\Fantacy Breakdown")
DOCX = ROOT / "card table.docx"

NAME_TO_ID = {
    "水":"water","火":"fire","气":"air","毒":"poison","砂":"sand","冰":"ice","木":"wood",
    "铪":"hafnium","金":"gold","钢铁":"steel","电":"electric",
    "压缩":"compress","堆砌":"stack","加热":"heat","冷却":"cool","增幅":"amp",
    "蒸汽":"steam","冷气":"cold_air","毒气":"poison_gas","酸":"acid","气枪":"air_gun",
    "混凝土":"concrete","混凝土墙":"concrete_wall","米":"rice","酒":"wine","酒精":"alcohol",
    "燃烧瓶":"molotov","琉璃":"glass","电光":"spark","熔金":"molten_gold",
    "金库":"vault","锈蚀":"rust","孢子":"spore","堡垒":"fortress","火枪":"firearm",
    "藤蔓":"vine","火藤":"fire_vine","毒藤":"poison_vine","根须":"root","繁茂":"flourish",
    "铁树":"iron_tree","黄金枪":"gold_gun","失温":"hypothermia","炭火":"charcoal",
    "热浪":"heatwave","助燃":"kindle","爆燃":"burst_burn","燃油":"fuel","圣火":"holy_fire",
    "焚化":"incinerate","灰烬":"ash","过热":"overheat","火雨":"fire_rain","火葬":"cremate",
    "青焰":"blue_flame","Cold Allodynia":"cold_allodynia","热驱动":"heat_drive",
    "烬灭":"ember_end","涅槃":"nirvana","蓄电":"store_charge","磁场":"magnetic_field",
    "电网":"grid","过载":"overload","磁暴":"magnetic_storm","电击":"shock",
    "交流电":"ac","落雷":"lightning","超导":"superconduct","电涌":"surge",
    "发电机":"generator","岩浆":"lava","酸雨":"acid_rain","沼泽":"swamp","沙暴":"sandstorm",
    "雾霭":"mist","毒雾":"poison_mist","冻土":"permafrost",
    "元素人":"elemental","大元素":"great_elemental","元素王":"element_king",
    "共鸣":"resonance","奉献":"devote","殉道":"martyr","同化":"assimilate","异化":"alienate",
    # 流派6 砂类防御体系（2026-10-14）
    "沙墙":"sand_wall","砂壁":"sand_barrier","砂岩":"sandstone",
    "流沙":"quicksand","砂爆":"sand_burst","砂崩":"sand_collapse",
    "砂幕":"sand_blind","凝砂石":"solidify_sand","砂钢":"sand_steel",
    "砂菌":"sand_fungus","砂甲":"sand_armor",
    "砂葬":"sand_burial","砂盾":"sand_shield","砂牢":"sand_bind",
    "砂棺":"quicksand_burial",
    # 339-340 中毒跨体系出口（2026-10-13）
    "熔毒":"melt_poison","电解毒":"electrolyze_poison",
    # 259-261 占位卡实现 + 338 中毒防护（2026-10-13）
    "脉冲":"pulse","绝缘":"insulation","天罚":"judgment",
    "毒障":"poison_barrier",
    # 013 菌 + 流派5 中毒流派（2026-10-13）
    "菌":"fungus",
    # 流派5 中毒流派（2026-10-13）
    "毒刃":"poison_blade","瘴气":"miasma","毒藤阵":"poison_vine_field",
    "毒爆":"poison_burst","淬毒":"envenom","毒甲":"poison_armor",
    "蚀甲":"corrode_armor","嗜毒":"poison_frenzy","解毒":"antidote",
    "化毒":"detox_heal","血毒":"blood_poison","瘟疫":"plague",
    "毒环":"poison_ring","耐毒":"poison_tolerance","蚀骨":"bone_corrode",
    "万毒噬心":"myriad_poison",
    # 流派4 冻结流派（核心卡=雪@214）
    "雪":"snow","霜核":"frost_core","不化之冰":"everfrost",
    "永冻":"eternal_winter","冰墙":"ice_wall","凝结":"condense",
    "破碎":"shatter","雪盲":"snow_blind","融雪成焰":"melt_to_flame",
    "炽热呼吸":"hot_breath","温差发电":"thermal_power","电流凝霜":"current_frost",
    "冰河世纪":"ice_age","凛冬降临":"winter_fall","寒霜庇护":"frost_aegis",
}

# 这些条目的「A+B」是冲突说明（异化），不是配方
CONFLICT_ONLY = {406}
# 这些条目配方为「X+任意元素」类，需特殊处理
ANY_ELEMENT = {404, 405}


def strip_parens(s: str) -> str:
    """去掉中文/英文括号内容（说明文字，非配方）"""
    s = re.sub(r"（[^）]*）", " ", s)
    s = re.sub(r"\([^)]*\)", " ", s)
    return s


def expand_recipe(expr: str):
    """把 '砂+火/加热+增幅' 展开为 [[sand,fire,amp],[sand,heat,amp]]"""
    tokens = [t.strip() for t in expr.split("+") if t.strip()]
    opts = []
    for tok in tokens:
        parts = [p.strip() for p in tok.split("/") if p.strip()]
        opts.append(parts)
    out = []
    for combo in product(*opts):
        mats = []
        ok = True
        for name in combo:
            if name not in NAME_TO_ID:
                ok = False
                break
            mats.append(NAME_TO_ID[name])
        if ok and mats:
            out.append(mats)
    return out


def find_recipes(rest: str):
    """从效果文本中找出所有配方表达式并展开"""
    text = strip_parens(rest)
    # 配方 token：连续的中文/字母/数字，允许 + 与 /
    pat = re.compile(
        r"(?:[\u4e00-\u9fffA-Za-z]+(?:/[\u4e00-\u9fffA-Za-z]+)*)"
        r"(?:\+(?:[\u4e00-\u9fffA-Za-z]+(?:/[\u4e00-\u9fffA-Za-z]+)*))+"
    )
    recipes = []
    for m in pat.finditer(text):
        recipes.extend(expand_recipe(m.group(0)))
    # 去重保序
    uniq, seen = [], set()
    for r in recipes:
        k = tuple(r)
        if k not in seen:
            seen.add(k)
            uniq.append(r)
    return uniq


def main():
    from docx import Document
    d = Document(str(DOCX))
    paras = [p.text.strip() for p in d.paragraphs if p.text.strip()]

    # ── 元素 ──
    elements = {}
    for t in paras:
        m = re.match(r"^0?(\d{2,3})\s*[:：]\s*([^：:]+?)\s*[:：]\s*(.+)$", t)
        if not m:
            continue
        num, name, rest = m.group(1), m.group(2).strip(), m.group(3).strip()
        if name not in NAME_TO_ID or int(num) > 100:
            continue
        nid = NAME_TO_ID[name]
        alts = find_recipes(rest)
        elements[nid] = {
            "id": nid, "name": name, "num": num.zfill(3),
            "effect": strip_parens(rest).strip(),
            "craft_alts": alts,
        }

    # ── 操作牌 ──
    processes = {}
    for t in paras:
        m = re.match(r"^(10[1-5])\s*[:：]\s*([^：:]+?)\s*[:：]\s*(.+)$", t)
        if m:
            nm = m.group(2).strip()
            if nm in NAME_TO_ID:
                processes[NAME_TO_ID[nm]] = {
                    "id": NAME_TO_ID[nm], "name": nm, "num": m.group(1),
                    "effect": m.group(3).strip(),
                }

    # ── 特殊合成 ──
    specials = []
    placeholders = []
    for t in paras:
        m = re.match(r"^(\d{3})\s*[:：]\s*(.+)$", t)
        if not m:
            continue
        num = int(m.group(1))
        if num < 201:
            continue
        body = m.group(2).strip()
        # 名称 = 到第一个「：」为止
        if "：" in body:
            name, rest = body.split("：", 1)
        elif ":" in body:
            name, rest = body.split(":", 1)
        else:
            name, rest = body, ""
        name, rest = name.strip(), rest.strip()
        if name not in NAME_TO_ID:
            NAME_TO_ID[name] = f"w{num}"
        nid = NAME_TO_ID[name]

        if num in CONFLICT_ONLY:
            alts = []
        elif num in ANY_ELEMENT:
            alts = []          # 「元素人+任意元素」无法静态枚举，保留语义
        else:
            alts = find_recipes(rest)
            # 同名条目已在「元素」区给出配方时（如 011 电 = 砂+增幅），
            # 特殊区若未写配方则继承元素区，避免丢失获取路径
            if not alts and nid in elements:
                alts = [list(a) for a in elements[nid]["craft_alts"]]

        if not rest:
            # 原文仅列名、尚无设计的占位条目（259-262），单独标记不作为卡牌
            placeholders.append({"num": num, "id": nid, "name": name})
            continue

        specials.append({
            "num": num, "id": nid, "name": name,
            "effect": strip_parens(rest).strip() or rest,
            "raw_effect": rest,
            "materials_alts": alts,
        })

    data = {
        "source": "card table.docx",
        # 咏唱伤害表：1-4 档为用户 2026-10-13 拍板值；5-6 档为三次拟合外推
        "chant_damage": {"1": 5, "2": 14, "3": 27, "4": 45, "5": 69, "6": 100},
        "windup": 0.5, "recover": 1.5,
        "armor_duration": 5,
        "tolerance": 6,
        "tolerance_by_character": {"hero": 6, "pure": 5, "royalty": 5, "rock": 6},
        "elements": elements, "processes": processes,
        "defaults": [
            {"rule": "compress+element", "desc": "压缩X 造成咏唱时间对应的标准伤害"},
            {"rule": "stack+element", "desc": "X墙 获得咏唱时间对应的标准护甲"},
            {"rule": "heat+element", "desc": "高温X 伤害/护甲每段+3"},
            {"rule": "cool+element", "desc": "冷却X 咏唱时间-1"},
            {"rule": "cool+heat+element", "desc": "元素"},
            {"rule": "amp+element", "desc": "提纯X 造成1.5s伤害，时间为1s"},
        ],
        "specials": specials,
        "placeholders": placeholders,
        "name_to_id": NAME_TO_ID,
    }

    # ── 报告 ──
    print("=== 元素配方解析 ===")
    for k, v in elements.items():
        alts = " | ".join("+".join(a) for a in v["craft_alts"]) or "（无）"
        print(f"  {v['num']} {v['name']:<4} ← {alts}")
    print()
    print("=== 特殊合成配方统计 ===")
    n_ok = sum(1 for s in specials if s["materials_alts"])
    n_no = [s for s in specials if not s["materials_alts"]]
    print(f"  有配方: {n_ok} / {len(specials)}")
    print(f"  无配方: {len(n_no)} → {[s['name'] for s in n_no]}")
    print()
    print("=== 关键链路验证 ===")
    for nm in ["钢铁", "电", "堡垒", "火枪", "电网", "元素王"]:
        s = next((x for x in specials if x["name"] == nm), None)
        if s:
            alts = " | ".join("+".join(a) for a in s["materials_alts"]) or "（无）"
            print(f"  {s['num']} {nm}: {alts}")
        elif nm in elements:
            alts = " | ".join("+".join(a) for a in elements[nm]["craft_alts"]) or "（无）"
            print(f"  {elements[nm]['num']} {nm}(元素): {alts}")

    out_json = ROOT / "godot-demo" / "html-demo" / "js" / "card-table-docx.json"
    out_js = ROOT / "godot-demo" / "html-demo" / "js" / "card-data.js"
    out_json.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    out_js.write_text(
        "/** Auto-generated from card table.docx — re-run tools/parse_card_table_docx.py to refresh */\n"
        "window.FBCardTable = " + json.dumps(data, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )
    print(f"\n已写出: {out_json.name} / {out_js.name}")


if __name__ == "__main__":
    main()
