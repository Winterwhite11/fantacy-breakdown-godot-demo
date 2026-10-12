# -*- coding: utf-8 -*-
"""Re-parse card table.docx into html-demo/js/card-data.js"""
from pathlib import Path
from docx import Document
from itertools import product
import re, json

ROOT = Path(r"C:\Users\王冬睿\Desktop\Fantacy Breakdown")
DOCX = ROOT / "card table.docx"
OUT_JS = ROOT / "godot-demo" / "html-demo" / "js" / "card-data.js"
OUT_JSON = ROOT / "godot-demo" / "html-demo" / "js" / "card-table-docx.json"

NAME_TO_ID = {
    "水": "water", "火": "fire", "气": "air", "毒": "poison", "砂": "sand", "冰": "ice", "木": "wood",
    "铪": "hafnium", "金": "gold", "钢铁": "steel", "电": "electric",
    "压缩": "compress", "堆砌": "stack", "加热": "heat", "冷却": "cool", "增幅": "amp",
    "蒸汽": "steam", "冷气": "cold_air", "毒气": "poison_gas", "酸": "acid", "气枪": "air_gun",
    "混凝土": "concrete", "混凝土墙": "concrete_wall", "米": "rice", "酒": "wine", "酒精": "alcohol",
    "燃烧瓶": "molotov", "琉璃": "glass", "雪": "snow", "电光": "spark", "熔金": "molten_gold",
    "金库": "vault", "锈蚀": "rust", "孢子": "spore", "堡垒": "fortress", "火枪": "firearm",
    "藤蔓": "vine", "火藤": "fire_vine", "毒藤": "poison_vine", "根须": "root", "繁茂": "flourish",
    "铁树": "iron_tree", "黄金枪": "gold_gun", "失温": "hypothermia", "炭火": "charcoal",
    "热浪": "heatwave", "助燃": "kindle", "爆燃": "burst_burn", "燃油": "fuel", "圣火": "holy_fire",
    "焚化": "incinerate", "灰烬": "ash", "过热": "overheat", "火雨": "fire_rain", "火葬": "cremate",
    "青焰": "blue_flame", "Cold Allodynia": "cold_allodynia", "热驱动": "heat_drive",
    "烬灭": "ember_end", "涅槃": "nirvana", "蓄电": "store_charge", "磁场": "magnetic_field",
    "电网": "grid", "过载": "overload", "磁暴": "magnetic_storm", "电击": "shock",
    "交流电": "ac", "落雷": "lightning", "超导": "superconduct", "电涌": "surge",
    "发电机": "generator", "岩浆": "lava", "酸雨": "acid_rain", "沼泽": "swamp", "沙暴": "sandstorm",
    "雾霭": "mist", "毒雾": "poison_mist", "冻土": "permafrost",
    "元素人": "elemental", "大元素": "great_elemental", "元素王": "element_king",
    "共鸣": "resonance", "奉献": "devote", "殉道": "martyr", "同化": "assimilate", "异化": "alienate",
}

# 这些条目的「水+火」等只是冲突说明，不是独立配方
SKIP_BARE_CONFLICT = {406, 405}  # 异化 / 同化


def expand_slash_recipe(expr):
    tokens = [t for t in expr.split("+") if t.strip()]
    opts = []
    for tok in tokens:
        tok = tok.strip()
        if "/" in tok:
            opts.append([x.strip() for x in tok.split("/") if x.strip()])
        else:
            opts.append([tok])
    results = []
    for combo in product(*opts):
        mats = []
        ok = True
        for name in combo:
            if name not in NAME_TO_ID:
                ok = False
                break
            mats.append(NAME_TO_ID[name])
        if ok and mats:
            results.append(mats)
    return results


d = Document(str(DOCX))
paras = [p.text.strip() for p in d.paragraphs if p.text.strip()]

elements = {}
for t in paras:
    m = re.match(r"^0?(\d{2,3})[:：]\s*([^：:]+)[:：]\s*(.+)$", t)
    if not m:
        continue
    num, name, rest = m.group(1), m.group(2).strip(), m.group(3).strip()
    if name not in NAME_TO_ID or int(num) > 100:
        continue
    nid = NAME_TO_ID[name]
    found = re.findall(
        r"[\u4e00-\u9fffA-Za-z0-9]+(?:/[\u4e00-\u9fffA-Za-z0-9]+)*(?:\+[\u4e00-\u9fffA-Za-z0-9]+(?:/[\u4e00-\u9fffA-Za-z0-9]+)*)+",
        rest,
    )
    effect = rest
    mats = []
    for f in found:
        effect = effect.replace(f, "").strip()
        mats.extend(expand_slash_recipe(f))
    elements[nid] = {"id": nid, "name": name, "num": num.zfill(3), "effect": effect, "craft_alts": mats}

processes = {}
for t in paras:
    m = re.match(r"^(10[1-5])[:：]\s*([^：:]+)[:：]\s*(.+)$", t)
    if m:
        name = m.group(2).strip()
        processes[NAME_TO_ID[name]] = {
            "id": NAME_TO_ID[name],
            "name": name,
            "num": m.group(1),
            "effect": m.group(3).strip(),
        }

specials = []
for t in paras:
    m = re.match(r"^(\d{3})[:：]\s*([^：:]+)[:：]\s*(.+)$", t)
    if not m:
        continue
    num = int(m.group(1))
    if num < 201:
        continue
    name = m.group(2).strip()
    rest = m.group(3).strip()
    if name not in NAME_TO_ID:
        NAME_TO_ID[name] = f"w{num}"
    nid = NAME_TO_ID[name]
    found = re.findall(
        r"[\u4e00-\u9fffA-Za-z0-9]+(?:/[\u4e00-\u9fffA-Za-z0-9]+)*(?:\+[\u4e00-\u9fffA-Za-z0-9]+(?:/[\u4e00-\u9fffA-Za-z0-9]+)*)+",
        rest,
    )
    effect = rest
    mats_list = []
    for f in found:
        effect = effect.replace(f, "").strip()
        mats_list.extend(expand_slash_recipe(f))

    # 异化/同化：冲突对不是配方；需要元素人+元素
    if num in SKIP_BARE_CONFLICT:
        mats_list = []
        # 保留「元素人+任意」类：同化 元素人+对应元素 — 无具体表则留空，Demo 暂不自动匹配冲突对
        if "元素人" in rest and num == 405:
            pass

    uniq, seen = [], set()
    for mts in mats_list:
        key = tuple(mts)
        if key in seen:
            continue
        seen.add(key)
        uniq.append(mts)

    specials.append({
        "num": num,
        "id": nid,
        "name": name,
        "effect": re.sub(r"\s+", " ", effect).strip(),
        "materials_alts": uniq,
    })

data = {
    "source": DOCX.name,
    "chant_damage": {"1": 5, "2": 12, "3": 21, "4": 32},
    "windup": 0.5,
    "recover": 1.5,
    "armor_duration": 5,
    "tolerance": 5,
    "elements": elements,
    "processes": processes,
    "defaults": [
        {"rule": "compress+element", "desc": "压缩X 造成咏唱时间对应的标准伤害"},
        {"rule": "stack+element", "desc": "X墙 获得咏唱时间对应的标准护甲"},
        {"rule": "heat+element", "desc": "高温X 伤害/护甲每段+3"},
        {"rule": "cool+element", "desc": "冷却X 咏唱时间-1"},
        {"rule": "cool+heat+element", "desc": "元素"},
        {"rule": "amp+element", "desc": "提纯X 造成1.5s伤害，时间为1s"},
    ],
    "specials": specials,
    "name_to_id": NAME_TO_ID,
}

OUT_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
OUT_JS.write_text(
    "/** Auto-generated from card table.docx — re-run tools/parse_card_table_docx.py to refresh */\n"
    "window.FBCardTable = "
    + json.dumps(data, ensure_ascii=False)
    + ";\n",
    encoding="utf-8",
)

# sanity
from collections import defaultdict
by = defaultdict(list)
for s in specials:
    for m in s["materials_alts"]:
        by[tuple(sorted(m))].append(s["name"])
for e in elements.values():
    for m in e["craft_alts"]:
        by[tuple(sorted(m))].append(e["name"] + "(元素)")
print("water+fire", by[tuple(sorted(["water","fire"]))])
print("fire+wood", by[tuple(sorted(["fire","wood"]))])
print("wrote", OUT_JS)
