#!/usr/bin/env node
/**
 * gen_equip_icons.cjs —— 生成战备像素图标（PNG）
 *
 * 为什么用位图而不是矢量：画风是**像素异星科幻**，图标必须硬边、同调色板、
 * 小尺寸下清晰。每个图标手绘在 12×12 点阵上，按调色板着色后放大为 PNG。
 *
 * 产出：html-demo/img/equip/<icon>.png（带 1px 内描边，便于在深色底上辨认）
 *
 * 用法：node html-demo/tools/gen_equip_icons.cjs
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const HD = path.resolve(__dirname, "..");
const OUT = path.join(HD, "img", "equip");

// ── 调色板（与 css/tokens.css 一致）──
const C = {
  o: "#05080f", // 描边暗
  s: "#8fa6c4", // 钢灰
  S: "#c9d8ea", // 钢灰亮
  a: "#ffb84d", // 琥珀（黄铜/金）
  A: "#ffe0a0", // 琥珀亮
  t: "#00e8c0", // 青绿（能量/玻璃）
  T: "#7ffff0", // 青绿亮
  r: "#ff5a6a", // 红（危险/火焰）
  R: "#ff9a7a", // 橙红
  b: "#3ecbff", // 蓝（水晶/冰）
  B: "#bfeaff", // 冰亮
  g: "#6a9aab", // 灰蓝（布料）
  G: "#d8f4ff", // 冰白
  p: "#a06ad0", // 紫（符石）
  y: "#ffd966", // 黄（火药）
  k: "#3a2a20", // 深褐（皮革）
};

/**
 * 12×12 位图。每行 12 字符。
 * 设计原则：外形优先（剪影可辨），内部用 2~3 色区分材质。
 */
const ICONS = {
  // 手枪：短枪管 + 握把
  gun_pistol: [
    "............",
    "............",
    "...oooooo...",
    "..oSSSSSSo..",
    "..oSsssSSo..",
    "..oooSSSo...",
    "....oSSo....",
    "....okko....",
    "....okko....",
    "....okko....",
    ".....oo.....",
    "............",
  ],
  // 速射手枪：双管
  gun_rapid: [
    "............",
    "..oooooooo..",
    "..oSSSSSSo..",
    "..oSssssSo..",
    "..oSSSSSSo..",
    "..oooooSo...",
    "....okko....",
    "....okko....",
    "....okko....",
    ".....oo.....",
    "............",
    "............",
  ],
  // 重铳：粗枪管 + 明显枪托（左下延伸，避免看起来像哑铃）
  gun_heavy: [
    "............",
    ".oooooooooo.",
    "oSSSSSSSSSSo",
    "oSssssssssSo",
    "oSSSSSSSSSSo",
    "ooooSSSSSooo",
    "..okkko.....",
    ".okkko......",
    ".okko.......",
    "okko........",
    "ooo.........",
    "............",
  ],
  // 淬毒弩：弓臂 + 毒囊
  gun_toxic: [
    "............",
    "..o......o..",
    ".oSo....oSo.",
    ".oSo....oSo.",
    "..oSoooSo...",
    "....otto....",
    "....otto....",
    "...ototto...",
    "...ototto...",
    "....oooo....",
    "............",
    "............",
  ],
  // 喷火铳：枪口火焰
  gun_burner: [
    "...r........",
    "..rRr.......",
    "...r..oooo..",
    "..oSooSSSSo.",
    ".oSSSssssSo.",
    ".ooooSSSSSo.",
    "....okkko...",
    "....okkko...",
    "....okko....",
    ".....oo.....",
    "............",
    "............",
  ],
  // 霜刺枪：冰晶枪管
  gun_cryo: [
    "..........b.",
    "..oooooo.bBb",
    ".oSSSSSSoBb.",
    ".oSssssSo b.",
    ".oSSSSSSo...",
    ".ooooSSSo...",
    "....okkko...",
    "....okkko...",
    ".....oko....",
    ".....oo.....",
    "............",
    "............",
  ],

  // 护甲：胸甲轮廓
  armor_light: [
    "............",
    "...oooooo...",
    "..oSSSSSSo..",
    ".oSSoooSoSo.",
    ".oSSottSoSo.",
    ".oSSottSoSo.",
    ".oSSSSSSSSo.",
    ".oSSSSSSSSo.",
    "..oSSSSSSo..",
    "...oooooo...",
    "............",
    "............",
  ],
  armor_padded: [
    "............",
    "..oooooooo..",
    ".oggggggggo.",
    ".oggggggggo.",
    ".oggggggggo.",
    ".oggtttgggo.",
    ".oggtttgggo.",
    ".oggggggggo.",
    "..oggggggo..",
    "...oooooo...",
    "............",
    "............",
  ],
  armor_plate: [
    "............",
    ".oooooooooo.",
    "oSSooooooSSo",
    "oSSotttoSSo.",
    "oSSotStoSo..",
    "oSSotttoSo..",
    "oSSSSSSSSo..",
    "oSSSSSSSSo..",
    ".oSSSSSSSo..",
    "..oooooooo..",
    "............",
    "............",
  ],

  // 头盔
  helmet_light: [
    "............",
    "....oooo....",
    "...oSSSSo...",
    "..oSSSSSSo..",
    ".oSSSSSSSSo.",
    ".oSSooooSSo.",
    ".oSotttSoSo.",
    ".oSSSSSSSSo.",
    "..oooooooo..",
    "............",
    "............",
    "............",
  ],
  helmet_visor: [
    "............",
    "..oooooooo..",
    ".oSSSSSSSSo.",
    "oSSSSSSSSSSo",
    "oSSooooSSSo.",
    "oSSotttSSSo.",
    "oSSotttSSSo.",
    "oSSSSSSSSSo.",
    ".oooooooooo.",
    "............",
    "............",
    "............",
  ],
  helmet_bulwark: [
    "............",
    "..oooooooo..",
    ".oSSooooSSo.",
    "oSSoaaaaSSo.",
    "oSSoattaSSo.",
    "oSSoattaSSo.",
    "oSSSSSSSSSo.",
    "oSSSSSSSSSo.",
    ".oSSSSSSSo..",
    "..oooooooo..",
    "............",
    "............",
  ],

  // 背包
  bag_small: [
    "............",
    "....oooo....",
    "...okkkko...",
    "..okggggko..",
    ".okggggggko.",
    ".okggggggko.",
    ".okgaagggko.",
    ".okggggggko.",
    ".okkkkkkkko.",
    "..oooooooo..",
    "............",
    "............",
  ],
  bag_mid: [
    "............",
    "...oooooo...",
    "..okkkkkko..",
    ".okggggggko.",
    "okggggggggko",
    "okggggggggko",
    "okgaaaaaagko",
    "okggggggggko",
    "okkkkkkkkkko",
    ".oooooooooo.",
    "............",
    "............",
  ],
  bag_large: [
    "...oooooo...",
    "..okkkkkko..",
    ".okkkkkkkko.",
    "okggggggggko",
    "okgttttttgko",
    "okgttttttgko",
    "okgaaaaaagko",
    "okggggggggko",
    "okggggggggko",
    "okkkkkkkkkko",
    ".oooooooooo.",
    "............",
  ],

  // 材料
  mat_fiber: [
    "............",
    "..g..g..g...",
    ".gGg.gGg.g..",
    "..g..g..g...",
    ".gGg.gGg.g..",
    "..g..g..g...",
    ".gGg.gGg.g..",
    "..g..g..g...",
    ".gGg.gGg.g..",
    "..g..g..g...",
    "............",
    "............",
  ],
  mat_alloy: [
    "............",
    "..oooooooo..",
    ".oSSSSSSSSo.",
    "oSSttttttSSo",
    "oSSttttttSSo",
    "oSSSSSSSSSSo",
    ".oooooooooo.",
    "..oSSSSSSo..",
    "..oooooooo..",
    "............",
    "............",
    "............",
  ],
  mat_gunpowder: [
    "............",
    "....oo......",
    "...oyyo.....",
    "..oyyyyo....",
    ".oyykyyyo...",
    ".oyykyyyo...",
    "..oyyyyo....",
    "...oooo.....",
    "....oo......",
    "............",
    "............",
    "............",
  ],
  // 精炼底火：中档缺口材料（钢壳 + 琥珀底火）
  mat_primer: [
    "............",
    "...aaaaaa...",
    "..aooooooa..",
    "..aossssoa..",
    "..aossssoa..",
    "..aooooooa..",
    "..aossssoa..",
    "..aooooooa..",
    "...aaaaaa...",
    "............",
    "............",
    "............",
  ],
  mat_lens: [
    "............",
    "....oooo....",
    "..oobbbboo..",
    ".obbbbbbbbo.",
    ".obbBBBBbbo.",
    ".obbBBBBbbo.",
    ".obbbbbbbbo.",
    "..oobbbboo..",
    "....oooo....",
    "............",
    "............",
    "............",
  ],
  mat_ember: [
    "............",
    "....rr......",
    "...rRRr.....",
    "..rRaaRr....",
    "..rRaaRr....",
    "...rRRr.....",
    "....rr......",
    "...r..r.....",
    "..r....r....",
    "............",
    "............",
    "............",
  ],
  mat_toxic: [
    "............",
    ".....oo.....",
    "....otto....",
    "...otttto...",
    "..otttttto..",
    "..otttttto..",
    "..otttttto..",
    "...otttto...",
    "....oooo....",
    "............",
    "............",
    "............",
  ],
  mat_rune: [
    "............",
    "....oooo....",
    "...opppo....",
    "..opGGGpo...",
    "..opGtGpo...",
    "..opGtGpo...",
    "..opGGGpo...",
    "..opGGGpo...",
    "...opppo....",
    "....oooo....",
    "............",
    "............",
  ],
};

// ── PNG 编码（零依赖：手写 IHDR/IDAT/IEND）──
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
function hexToRgb(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

const SCALE = 4; // 12×12 → 48×48

function renderIcon(rows) {
  const w = rows[0].length, h = rows.length;
  const W = w * SCALE, H = h * SCALE;
  const buf = Buffer.alloc(W * H * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch === "." || ch === " ") continue;
      const hex = C[ch];
      if (!hex) continue;
      const [r, g, b] = hexToRgb(hex);
      for (let dy = 0; dy < SCALE; dy++) {
        for (let dx = 0; dx < SCALE; dx++) {
          const px = x * SCALE + dx, py = y * SCALE + dy;
          const i = (py * W + px) * 4;
          buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255;
        }
      }
    }
  }
  return encodePng(W, H, buf);
}

fs.mkdirSync(OUT, { recursive: true });
let n = 0;
const report = [];
for (const [id, rows] of Object.entries(ICONS)) {
  // 校验位图规整
  const bad = rows.filter((r) => r.length !== 12).length;
  if (rows.length !== 12 || bad) {
    console.error(`✗ ${id}: 位图必须 12×12（实际 ${rows.length}×${rows[0]?.length}，异常行 ${bad}）`);
    process.exitCode = 1;
    continue;
  }
  const unknown = new Set();
  rows.join("").split("").forEach((ch) => { if (ch !== "." && ch !== " " && !C[ch]) unknown.add(ch); });
  if (unknown.size) {
    console.error(`✗ ${id}: 使用了未定义色键 ${[...unknown].join("")}`);
    process.exitCode = 1;
    continue;
  }
  const png = renderIcon(rows);
  fs.writeFileSync(path.join(OUT, `${id}.png`), png);
  const filled = rows.join("").split("").filter((c) => c !== "." && c !== " ").length;
  report.push({ id, px: filled, bytes: png.length });
  n++;
}

console.log("═".repeat(64));
console.log("  战备像素图标生成");
console.log("═".repeat(64));
for (const r of report) {
  console.log(`  ${r.id.padEnd(16)} ${String(r.px).padStart(3)} 实心像素  ${String(Math.round(r.bytes / 1024 * 10) / 10).padStart(5)} KB`);
}
console.log(`\n共生成 ${n} 个图标 → ${path.relative(HD, OUT)}/（${SCALE}× 放大，${12 * SCALE}×${12 * SCALE}）`);
if (process.exitCode) console.error("\n有图标校验失败，见上。");
