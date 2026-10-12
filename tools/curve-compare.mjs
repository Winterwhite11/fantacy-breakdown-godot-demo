// 决定性问题：伤害曲线「现行 5/12/21/32」vs「原文 5/14/27」对整体平衡的影响
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JS = "C:\\Users\\王冬睿\\Desktop\\Fantacy Breakdown\\godot-demo\\html-demo\\js";

const win = {};
const load = (f) => new Function("window", fs.readFileSync(path.join(JS, f), "utf8"))(win);
for (const f of ["card-data.js", "cards.js", "encounters.js"]) load(f);
const SIM = new Function("window",
  fs.readFileSync(path.join(JS, "sim.js"), "utf8") + "\nreturn FBSimModule;")(win);

const EN = win.FBEncounters;
const ENCS = [...EN.NORMAL_ENCOUNTERS, ...EN.HARD_ENCOUNTERS];

// 把「1费/2费/3费标准伤」显式写死成两条曲线，其余效果不变
/** 造一个纯伤害卡组：按曲线给 1费/2费/3费 的伤害值 */
function deckForCurve(c1, c2, c3) {
  const mk = (chant, dmg) => ({ id: `c${chant}`, name: `${chant}费`, chant, damage: dmg });
  return [mk(1, c1), mk(1, c1), mk(2, c2), mk(2, c2), mk(3, c3), mk(3, c3)];
}

const CURVES = {
  "现行 5/12/21/32": { c1: 5, c2: 12, c3: 21 },
  "原文 5/14/27":    { c1: 5, c2: 14, c3: 27 },
  "折中 5/13/24":    { c1: 5, c2: 13, c3: 24 },
};

const GAMES = 200, SEED = 20261013;
console.log("═".repeat(92));
console.log(`  伤害曲线对比 · 纯伤害卡组 · 每组 ${GAMES} 局 · 种子 ${SEED}`);
console.log("═".repeat(92));
console.log("\n曲线              " + ENCS.map(e => e.id.slice(4).padStart(4)).join(" ") + "   平均");
console.log("─".repeat(92));

const summary = {};
for (const [name, c] of Object.entries(CURVES)) {
  const deck = deckForCurve(c.c1, c.c2, c.c3);
  const cells = [];
  let sum = 0;
  for (const enc of ENCS) {
    const r = SIM.simulateMany({
      games: GAMES, seed: SEED + enc.id.charCodeAt(5) * 1000,
      deckCards: deck, encounter: enc, playerMaxHp: 60, policy: "greedy",
    });
    cells.push((r.winRate * 100).toFixed(0).padStart(4));
    sum += r.winRate;
  }
  summary[name] = (sum / ENCS.length * 100).toFixed(1);
  console.log(`${name.padEnd(18)}${cells.join(" ")}   ${summary[name]}%`);
}

console.log("\n" + "═".repeat(92));
console.log("  单位血量阈值回顾（决定「一击能否击杀」）");
console.log("═".repeat(92));
const hp = { 冠军: 13, 野人: 16, 射手: 19, 酋长: 25 };
for (const [name, c] of Object.entries(CURVES)) {
  const k2 = Object.entries(hp).filter(([, h]) => h <= c.c2).map(([k]) => k);
  const k3 = Object.entries(hp).filter(([, h]) => h <= c.c3).map(([k]) => k);
  console.log(`  ${name.padEnd(18)} 2费(${String(c.c2).padStart(2)})一击可杀 [${(k2.join("/") || "无")}]   3费(${String(c.c3).padStart(2)})一击可杀 [${k3.join("/") || "无"}]`);
}
console.log("\n  注：冠军 13HP 是最低阈值。现行 2费 12 伤差 1 点 → 整个 ENC-01 从可清场变为不可清场。");
