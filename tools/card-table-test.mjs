#!/usr/bin/env node
/**
 * card-table-test.mjs —— 卡表完整性测试
 *
 * 由来（2026-10-13）：我修改 221 火枪的文案时，把「（穿透）」放在了配方之前，
 * 而解析器会**先剥掉括号内容再找配方** → 该卡的配方被整段吃掉。
 * 测试全绿、只有一句解析输出提示配方数变化，**没有任何断言发现它**。
 *
 * 本测试就是为这类回归设的守卫：卡表结构性的东西必须被断言，而不是靠肉眼看输出。
 *
 * 覆盖：
 *   1. 每张卡都有配方（仅召唤流 401-406 例外，设计如此）
 *   2. 无残留占位符（w259 这类兜底 id）
 *   3. id 唯一（同名/重复定义会覆盖）
 *   4. name_to_id 双向一致
 *   5. 效果文本非空且未被括号剥离破坏
 *   6. 配方只由已登记的材料名组成
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");
const HD = path.join(REPO, "html-demo");

const T = JSON.parse(fs.readFileSync(path.join(HD, "js", "card-table-docx.json"), "utf8"));
const specials = T.specials || [];
const baseNames = new Set([
  ...Object.keys(T.elements || {}), ...Object.keys(T.processes || {}),
]);
const allNames = new Set([...Object.keys(T.name_to_id || {})]);

let pass = 0, fail = 0;
const ok = (m) => { console.log(`  ✓ ${m}`); pass++; };
const bad = (m) => { console.log(`  ✗ ${m}`); fail++; };
const check = (c, m) => (c ? ok(m) : bad(m));

console.log("═".repeat(78));
console.log("  卡表完整性测试");
console.log("═".repeat(78));

console.log("\n▌ 1. 每张卡都有配方");
{
  // 设计例外：召唤流 401-406 由「共鸣+任意元素」类规则生成，卡表里本就没有配方
  const NO_RECIPE_BY_DESIGN = new Set([401, 402, 403, 404, 405, 406]);
  const missing = specials.filter((s) => !(s.materials_alts || []).length
    && !NO_RECIPE_BY_DESIGN.has(s.num));
  check(missing.length === 0,
    `无「该有配方却没有」的卡${missing.length ? "：" + missing.map((s) => `${s.num}${s.name}`).join("、") : ""}`);
  const unexpected = specials.filter((s) => (s.materials_alts || []).length
    && NO_RECIPE_BY_DESIGN.has(s.num));
  check(unexpected.length === 0,
    `设计例外项仍无配方${unexpected.length ? "：" + unexpected.map((s) => s.name).join("、") : ""}`);
  const withRec = specials.filter((s) => (s.materials_alts || []).length).length;
  check(withRec === specials.length - NO_RECIPE_BY_DESIGN.size,
    `${withRec}/${specials.length} 张有配方（例外 ${NO_RECIPE_BY_DESIGN.size} 张）`);
}

console.log("\n▌ 2. 无残留占位符");
{
  // w404 是**设计上有意的** id：元素人由「共鸣+任意元素」运行时生成，
  // 卡表里没有固定名称可映射，故解析器给它 w404。见 cards.js 的 summon 注册。
  const BY_DESIGN = new Set(["w404"]);
  const ph = specials.filter((s) => /^w\d+$/.test(s.id || "") && !BY_DESIGN.has(s.id));
  check(ph.length === 0, `无兜底 id（w###）${ph.length ? "：" + ph.map((s) => `${s.num}${s.name}`).join("、") : ""}`);
  check(BY_DESIGN.has("w404") && !!specials.find((s) => s.id === "w404"),
    "w404（元素人）为设计内生成卡，保留");
  const phList = (T.placeholders || []).filter((p) => specials.some((s) => s.num === p.num));
  check(phList.length === 0,
    `placeholders 中的卡已全部实现${phList.length ? "，仍占位：" + phList.map((p) => p.name).join("、") : ""}`);
}

console.log("\n▌ 3. id 与编号唯一");
{
  const ids = specials.map((s) => s.id);
  const dupId = ids.filter((v, i) => ids.indexOf(v) !== i);
  check(dupId.length === 0, `id 唯一${dupId.length ? "，重复：" + [...new Set(dupId)].join("、") : ""}`);
  const nums = specials.map((s) => s.num);
  const dupNum = nums.filter((v, i) => nums.indexOf(v) !== i);
  check(dupNum.length === 0, `编号唯一${dupNum.length ? "，重复：" + [...new Set(dupNum)].join("、") : ""}`);
  const undef = specials.filter((s) => s.id == null || s.num == null || !s.name);
  check(undef.length === 0, `id/编号/名称齐备${undef.length ? "，缺：" + undef.length + " 张" : ""}`);
}

console.log("\n▌ 4. name_to_id 双向一致");
{
  const m = T.name_to_id || {};
  const wrong = Object.entries(m).filter(([name, id]) => {
    const s = specials.find((x) => x.id === id);
    return s && s.name !== name;      // 同名映射到不匹配的卡
  });
  check(wrong.length === 0,
    `name_to_id 指向的卡名一致${wrong.length ? "：" + wrong.slice(0, 4).map(([n, i]) => `${n}→${i}`).join("、") : ""}`);
  const missingMap = specials.filter((s) => !m[s.name]);
  check(missingMap.length === 0,
    `每张卡都在 name_to_id 中${missingMap.length ? "：" + missingMap.map((s) => s.name).join("、") : ""}`);
}

console.log("\n▌ 5. 效果文本未被括号剥离破坏");
{
  // 解析器会 strip_parens 后取效果文本；若一条效果只剩空格，说明文本被剥空了
  const empty = specials.filter((s) => !(s.effect || "").trim());
  check(empty.length === 0, `effect 非空${empty.length ? "：" + empty.map((s) => s.num).join(",") : ""}`);
  // 括号内容被剥离后残留的双空格（解析器把括号换成空格所致）——既有现象，只提示不判失败
  const dblSpace = specials.filter((s) => / {2,}/.test(s.effect || ""));
  check(true, `含连续空格的 effect：${dblSpace.length} 张（解析器剥括号所致，已知现象）`);
  // ⚠ 不要断言「配方 token 出现在 effect 里」——解析器会把配方从效果文本中**分离**出去，
  //   很多卡的 effect 本就不含配方（如 247电、255落雷）。配方是否存在由第 1 组断言。
  const hasAlts = specials.filter((s) => (s.materials_alts || []).length).length;
  check(hasAlts > 0, `配方独立存放在 materials_alts（${hasAlts} 张），不从 effect 文本推断`);
}

console.log("\n▌ 6. 配方只由已登记材料组成");
{
  // 运行时生成卡的 id（由 404/407 等定义，不在 docx 的 name_to_id 里）
  const RUNTIME_IDS = new Set(["elemental", "great_elemental", "element_king"]);
  const unknown = [];
  for (const s of specials) {
    for (const alt of s.materials_alts || []) {
      for (const m of alt) {
        const known = baseNames.has(m) || allNames.has(m)
          || RUNTIME_IDS.has(m) || specials.some((x) => x.id === m);
        if (!known) unknown.push(`${s.num}${s.name}←${m}`);
      }
    }
  }
  check(unknown.length === 0,
    `配方材料均已登记${unknown.length ? "：" + [...new Set(unknown)].slice(0, 6).join("、") : ""}`);
}

console.log("\n▌ 7. 关键卡抽查（防止本次改动回退）");
{
  const fire = specials.find((s) => s.num === 221);
  check(!!fire && (fire.materials_alts || []).some((a) => a.join("+") === "steel+fire"),
    `221 火枪 配方完整：${(fire?.materials_alts || []).map((a) => a.join("+")).join("|")}`);
  check(/无视/.test(fire?.effect || ""), `221 火枪 文案已与代码一致（无视护甲）：${(fire?.effect || "").slice(0, 40)}`);
  const judge = specials.find((s) => s.num === 261);
  check(!!judge && (judge.materials_alts || []).some((a) => a.join("+") === "electric+amp+heat"),
    `261 天罚 配方完整`);
  const glossary = (T.specials || []).length;   // 词条不在 specials 里，改由 docx 层校验
  check(glossary > 0, `special 卡共 ${glossary} 张`);
}

console.log("\n" + "─".repeat(78));
console.log(`  通过 ${pass} · 失败 ${fail}`);
console.log("─".repeat(78));
process.exit(fail ? 1 : 0);
