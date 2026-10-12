/**
 * 像素棋子（Pixel Chess Pieces）
 *
 * 设计意图（用户）：「玩家标记设计成类似像素国际象棋的形式，每个角色代表不同的棋子」。
 *
 * 做法：
 *   · 每个角色手工绘制一张 8×8 位图（'#' = 实心像素）
 *   · 运行时把位图转成 SVG（每个连续像素段一个 <rect>），作为 mask-image 注入
 *   · 为什么不用 clip-path 多边形：一个棋子里有多个**互不连通**的矩形段
 *     （如城堡的两个垛口），polygon 的 nonzero 填充会让它们互相抵消 → 渲染失败。
 *     SVG 的多个 <rect> 没有这个问题，且同样保持硬边像素观感。
 *   · 颜色用 CSS 变量做 background，配合作 mask 的 SVG → 换色只改一个变量
 *   · 无图片资源，任意缩放不糊
 *
 * 角色 ↔ 棋子对应（按角色气质）：
 *   pure     纯白 · 雪与留白 → 主教 Bishop
 *   royalty  王权 · 交易行家 → 国王 King
 *   rock     磐石 · 沉稳如岩 → 城堡 Rook
 *   hero     豪杰 · 刀与胆色 → 骑士 Knight
 */
(function (root) {
  "use strict";

  const GRID = 8;

  /** 8×8 位图。'#' 实心，'.' 透明。 */
  const BITMAPS = {
    // 国王：十字顶 + 王冠 + 收腰 + 宽底座
    royalty: [
      "...##...",
      ".#.##.#.",
      ".######.",
      "..####..",
      "..####..",
      "..####..",
      ".######.",
      "########",
    ],
    // 主教：尖顶 + 冠帽斜口 + 收腰
    pure: [
      "...##...",
      "..####..",
      "..####..",
      ".#.##.#.",
      "..####..",
      "..####..",
      "..####..",
      ".######.",
    ],
    // 城堡：齿状垛口（两段不连通）+ 塔身 + 宽底座
    rock: [
      "##..##..",
      "##..##..",
      "########",
      ".######.",
      "..####..",
      "..####..",
      ".######.",
      "########",
    ],
    // 骑士：马头侧影（右侧前伸）
    hero: [
      "....##..",
      "...###..",
      "..####..",
      ".#####..",
      "..####..",
      "..####..",
      "..####..",
      ".######.",
    ],
  };

  /**
   * 位图 → 每行的连续像素段 [{x0,x1,y}]（x1 为半开区间右端）。
   * 既是 SVG 生成的基础，也便于单测校验。
   */
  function runsOf(rows) {
    const w = rows[0].length;
    const out = [];
    for (let y = 0; y < rows.length; y++) {
      let x = 0;
      while (x < w) {
        if (rows[y][x] !== "#") { x++; continue; }
        const x0 = x;
        while (x < w && rows[y][x] === "#") x++;
        out.push({ x0, x1: x, y });
      }
    }
    return out;
  }

  /** 位图 → SVG 字符串（每个像素段一个 rect，硬边无抗锯齿） */
  function bitmapToSvg(rows) {
    const rects = runsOf(rows)
      .map((r) => `<rect x="${r.x0}" y="${r.y}" width="${r.x1 - r.x0}" height="1"/>`)
      .join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GRID} ${GRID}" ` +
           `shape-rendering="crispEdges"><g fill="#fff">${rects}</g></svg>`;
  }

  /**
   * SVG → 可直接写进 CSS 的 data URI。
   * 用 encodeURIComponent 完整编码：中文环境与各种 CSS 解析器下都最稳。
   * （只手工替换 # 与尖括号在部分解析器上会因逗号/引号而失败。）
   */
  function svgToDataUri(svg) {
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }

  /** 各棋子的主题色（与像素科幻调色板一致） */
  const PIECE_COLORS = {
    pure: "#dfe9ff",      // 雪白
    royalty: "#ffb84d",   // 琥珀金
    rock: "#8fa6c4",      // 岩灰蓝
    hero: "#ff5a6a",      // 刀锋红
  };

  const CLS = "fb-piece";

  /**
   * 注入样式：为每个棋子生成一条 mask 规则 + 一个共享类。
   * @returns {number} 注入的棋子数量
   */
  function applyTo(doc = root?.document) {
    if (!doc) return 0;
    const target = doc.head || doc.documentElement;
    if (!target) return 0;
    let css = "";
    for (const [id, rows] of Object.entries(BITMAPS)) {
      const uri = svgToDataUri(bitmapToSvg(rows));
      const color = PIECE_COLORS[id] || "#fff";
      css += `.--piece-${id}{--fb-piece-mask:${uri};--fb-piece-color:${color};}\n`;
    }
    css +=
      `.${CLS}{` +
      `-webkit-mask-image:var(--fb-piece-mask);mask-image:var(--fb-piece-mask);` +
      `-webkit-mask-size:100% 100%;mask-size:100% 100%;` +
      `-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;` +
      `-webkit-mask-position:center;mask-position:center;` +
      `background:var(--fb-piece-color,#fff);` +
      `image-rendering:pixelated;}\n`;

    let el = doc.getElementById?.("fb-piece-style");
    if (!el) {
      el = doc.createElement("style");
      el.id = "fb-piece-style";
      target.appendChild(el);
    }
    el.textContent = css;
    return Object.keys(BITMAPS).length;
  }

  /** 某角色对应的棋子 id（未知角色回落为国王） */
  function pieceFor(characterId) {
    return BITMAPS[characterId] ? characterId : "royalty";
  }

  /** 生成棋子元素的类名串（供 app.js / map.js 使用） */
  function classFor(characterId) {
    const id = pieceFor(characterId);
    return `${CLS} --piece-${id} piece-${id}`;
  }

  /** 本地中文名（供 UI 提示） */
  const PIECE_NAMES = {
    royalty: "国王",
    pure: "主教",
    rock: "城堡",
    hero: "骑士",
  };

  const API = {
    GRID,
    BITMAPS,
    PIECE_COLORS,
    PIECE_NAMES,
    CLS,
    runsOf,
    bitmapToSvg,
    svgToDataUri,
    applyTo,
    pieceFor,
    classFor,
    has: (id) => !!BITMAPS[id],
    ids: () => Object.keys(BITMAPS),
  };

  if (root) root.FBPieces = API;
  return API;
})(typeof window !== "undefined" ? window : null);
