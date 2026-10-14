/**
 * terrain-art.js —— 异星地表像素装饰（2026-10-14）
 *
 * 目标：让地图有「**站在异星表面**」的感觉 —— 用像素绘制山地、植物、晶簇等。
 *
 * 做法：**程序化生成**（而非手绘），因为地图格是 15×15 且每格纹理不同。
 *   每个地形按 (x,y) 用确定性哈希生成独属于自己的装饰位图，
 *   于是相邻格子的山形/植株不会重复，整张地图看起来是连续地貌而非贴图阵列。
 *
 * 输出 CSS 自定义属性：
 *   --fb-terrain  = 前景装饰（山脊/植株/晶簇），24×24 像素
 *   --fb-terrain2 = 第二层微细节（碎石/孢子），可选
 *
 * 与地图的配合（见 style.css）：
 *   格子用 ::before 铺装饰，::after 铺一层从上方来的冷光，
 *   合起来就是"异星白昼 + 起伏地表"的观感。
 */
(function () {
  const root = typeof window !== "undefined" ? window : null;

  const N = 24;                          // 位图边长（每格 24×24 像素）

  /** 确定性哈希：同一 (x,y) 永远得到同一张装饰 */
  function hash(x, y, salt) {
    let h = (x * 374761393 + y * 668265263 + salt * 2246822519) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /** 生成 0..1 的平滑噪声（用于山脊高度） */
  function ridge(x, i, salt) {
    const a = hash(x, i, salt);
    const b = hash(x, i + 1, salt);
    return (a + b) / 2;
  }

  /**
   * 山地：连续山脊轮廓 + 受光面 + 雪顶/岩纹。
   * 用一条高度曲线画出「远山」的剪影，再在下半部加深色岩体。
   */
  function mountains(x, y, seed, colors) {
    const grid = Array.from({ length: N }, () => new Array(N).fill(null));
    // 两条山脊（远近各一条，产生纵深）
    const layers = [
      { base: 13, amp: 5, salt: seed + 11, top: colors.far, body: colors.far2 },
      { base: 18, amp: 4, salt: seed + 29, top: colors.near, body: colors.near2 },
    ];
    for (const L of layers) {
      for (let i = 0; i < N; i++) {
        const h = Math.round(L.base - ridge(x * 3 + i, y, L.salt) * L.amp);
        for (let j = Math.max(0, h); j < N; j++) {
          if (grid[j][i]) continue;                 // 近山不覆盖远山已画处（保留层次）
          grid[j][i] = j === Math.max(0, h) ? L.top : L.body;
        }
      }
    }
    // 雪顶/高光：最上面一两行点缀亮色
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        if (grid[j][i] === colors.far && hash(x + i, y + j, seed + 7) > 0.62) {
          grid[j][i] = colors.snow;
        }
      }
    }
    return grid;
  }

  /**
   * 植物：直立茎 + 左右交错叶片/孢子球。
   * 异星感来自「非对称分枝 + 孢囊」而不是普通树形。
   */
  function plant(x, y, seed, colors) {
    const grid = Array.from({ length: N }, () => new Array(N).fill(null));
    const h = 8 + Math.floor(hash(x, y, seed + 3) * 7);      // 株高
    const stemX = 10 + Math.floor(hash(x, y, seed + 5) * 5); // 茎的位置略偏
    const bottom = N - 2;
    // 茎
    for (let j = bottom; j > bottom - h; j--) {
      if (grid[j]?.[stemX] === null) grid[j][stemX] = colors.stem;
    }
    // 交错叶片
    const leaves = 3 + Math.floor(hash(x, y, seed + 9) * 3);
    for (let k = 0; k < leaves; k++) {
      const ly = bottom - Math.round((h - 2) * (k / leaves)) - 2;
      const dir = (k % 2 === 0) ? 1 : -1;
      const len = 2 + Math.floor(hash(x + k, y, seed + 13) * 3);
      for (let t = 1; t <= len; t++) {
        const lx = stemX + dir * t;
        const yy = ly - Math.floor(t / 2);
        if (lx >= 0 && lx < N && yy >= 0 && yy < N) grid[yy][lx] = colors.leaf;
      }
    }
    // 顶端孢囊
    const ty = bottom - h;
    if (ty >= 0) {
      grid[ty][stemX] = colors.pod;
      if (stemX + 1 < N) grid[ty][stemX + 1] = colors.pod;
      if (ty + 1 < N) grid[ty + 1][stemX] = colors.pod;
    }
    return grid;
  }

  /** 晶簇：从地面向上生长的尖锥（高度递减），带高光棱面 */
  function crystals(x, y, seed, colors) {
    const grid = Array.from({ length: N }, () => new Array(N).fill(null));
    const count = 2 + Math.floor(hash(x, y, seed + 2) * 3);
    for (let c = 0; c < count; c++) {
      const cx = 4 + Math.floor(hash(x + c, y, seed + 4) * (N - 8));
      const hh = 5 + Math.floor(hash(x, y + c, seed + 6) * 10);
      const bottom = N - 2;
      for (let j = 0; j <= hh; j++) {
        const w = Math.max(0, Math.round((1 - j / hh) * 2));
        for (let d = -w; d <= w; d++) {
          const px = cx + d, py = bottom - j;
          if (px < 0 || px >= N || py < 0 || py >= N) continue;
          grid[py][px] = (d < 0 || j > hh - 2) ? colors.hi : colors.body;
        }
      }
    }
    return grid;
  }

  /** 岩块/陨坑边缘：散落的多边形碎石 */
  function rocks(x, y, seed, colors) {
    const grid = Array.from({ length: N }, () => new Array(N).fill(null));
    const count = 3 + Math.floor(hash(x, y, seed + 8) * 4);
    for (let c = 0; c < count; c++) {
      const cx = 3 + Math.floor(hash(x + c * 3, y, seed + 12) * (N - 6));
      const cy = 8 + Math.floor(hash(x, y + c * 5, seed + 16) * (N - 10));
      const r = 2 + Math.floor(hash(x + c, y + c, seed + 20) * 3);
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          const px = cx + dx, py = cy + dy;
          if (px < 0 || px >= N || py < 0 || py >= N) continue;
          grid[py][px] = dy <= -r + 1 ? colors.hi : colors.body;
        }
      }
    }
    return grid;
  }

  /** 孢子/苔点：低矮的地被覆盖 */
  function spores(x, y, seed, colors) {
    const grid = Array.from({ length: N }, () => new Array(N).fill(null));
    for (let j = N - 6; j < N; j++) {
      for (let i = 0; i < N; i++) {
        if (hash(x * N + i, y * N + j, seed + 24) > 0.72) {
          grid[j][i] = hash(i, j, seed + 31) > 0.5 ? colors.body : colors.hi;
        }
      }
    }
    return grid;
  }

  /** 每个地形的配色（延续 tokens.css 的冷色 + 琥珀强调） */
  const SCHEMES = {
    plain:   { far: "#1b2a38", far2: "#152230", near: "#243444", near2: "#1c2938",
               snow: "#6f97ab", stem: "#3f6b52", leaf: "#4f8a63", pod: "#ffb84d" },
    moss:    { far: "#16301f", far2: "#102518", near: "#1d4029", near2: "#16331f",
               snow: "#00e8c0", stem: "#2f6b45", leaf: "#3f9a5e", pod: "#00e8c0" },
    crystal: { far: "#241f45", far2: "#1b1734", near: "#322a5e", near2: "#261f48",
               snow: "#b6a8ff", body: "#6a5acd", hi: "#cfc4ff" },
    basalt:  { far: "#0b1118", far2: "#080d13", near: "#141c26", near2: "#0f161e",
               snow: "#3a4a5a", body: "#1a2330", hi: "#2c3a4a" },
    crater:  { far: "#101822", far2: "#0c1219", near: "#1a2430", near2: "#131b25",
               snow: "#5a7a8a", body: "#202c3a", hi: "#31414f" },
  };

  /** 各地形用哪种装饰（可叠加两层） */
  const KIND = {
    plain:   ["plant", "spores"],
    moss:    ["plant", "spores"],
    crystal: ["crystals", null],
    basalt:  ["mountains", null],
    crater:  ["rocks", null],
  };

  function build(kind, x, y, scheme) {
    if (!kind) return null;
    if (kind === "mountains") return mountains(x, y, 101, scheme);
    if (kind === "plant") return plant(x, y, 211, scheme);
    if (kind === "crystals") return crystals(x, y, 307, scheme);
    if (kind === "rocks") return rocks(x, y, 401, scheme);
    if (kind === "spores") return spores(x, y, 503, scheme);
    return null;
  }

  /** 位图 → SVG（同行同色合并，压缩体积） */
  function toSvg(grid) {
    const parts = [];
    for (let y = 0; y < grid.length; y++) {
      const row = grid[y];
      let x = 0;
      while (x < row.length) {
        const c = row[x];
        if (!c) { x++; continue; }
        let x2 = x + 1;
        while (x2 < row.length && row[x2] === c) x2++;
        parts.push(`<rect x="${x}" y="${y}" width="${x2 - x}" height="1" fill="${c}"/>`);
        x = x2;
      }
    }
    if (!parts.length) return null;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" ` +
      `shape-rendering="crispEdges">${parts.join("")}</svg>`;
  }

  /**
   * 生成某格地形的装饰。
   *
   * 【2026-10-14 性能修正】原实现为**每格**内联一个 SVG（2~5KB），
   * 15×15 地图 = 500KB+ 内联样式，实际会卡。
   * 改为：每个地形预生成固定数量的**变体**（VARIANTS 个），
   * 一次性注入成 `.--terrain-<t>-<i>` 规则；格子只挂 class，零内联开销。
   * 变体数 ≥ 地图格数的一半时，视觉上已看不出重复。
   */
  const VARIANTS = 6;

  function variantIndex(x, y) {
    return Math.floor(hash(x, y, 977) * VARIANTS) % VARIANTS;
  }

  /** 生成并注入变体样式（幂等） */
  function applyTo(doc = root?.document) {
    if (!doc || doc.querySelector?.("style[data-fb-terrain]")) return 0;
    const target = doc.head || doc.documentElement;
    if (!target) return 0;
    let css = "";
    let n = 0;
    for (const terrain of Object.keys(KIND)) {
      const scheme = SCHEMES[terrain] || SCHEMES.plain;
      const [k1, k2] = KIND[terrain];
      for (let v = 0; v < VARIANTS; v++) {
        // 用固定种子派生变体（与格子坐标无关，保证只有 VARIANTS 张图）
        const svg1 = k1 ? toSvg(build(k1, v * 7 + 1, v * 13 + 3, scheme)) : null;
        const svg2 = k2 ? toSvg(build(k2, v * 5 + 2, v * 11 + 5, scheme)) : null;
        if (!svg1 && !svg2) continue;
        const d1 = svg1 ? `url("data:image/svg+xml,${encodeURIComponent(svg1)}")` : "none";
        const d2 = svg2 ? `url("data:image/svg+xml,${encodeURIComponent(svg2)}")` : "none";
        css += `.--terrain-${terrain}-${v}{--fb-terrain:${d1};--fb-terrain2:${d2};}\n`;
        n++;
      }
    }
    if (!n) return 0;
    const style = doc.createElement("style");
    style.setAttribute("data-fb-terrain", "1");
    style.textContent = css;
    target.appendChild(style);
    return n;
  }

  /** 格子该用哪个变体的 class（零内联开销） */
  function classFor(terrain, x, y) {
    const t = KIND[terrain] ? terrain : "plain";
    return `--terrain-${t}-${variantIndex(x, y)}`;
  }

  root.FBTerrainArt = {
    N, VARIANTS, hash, applyTo, classFor, variantIndex, SCHEMES, KIND,
    _build: build, _toSvg: toSvg,
  };
})();
