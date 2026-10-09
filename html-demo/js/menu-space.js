/**
 * 主页像素太空穿梭背景：飞船持续飞行，途经陨石 / 星球 / 星云
 */
(function () {
  const canvas = document.getElementById("menu-space-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const REDUCE = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  let w = 0;
  let h = 0;
  let dpr = 1;
  let raf = 0;
  let t0 = performance.now();

  /** @type {{x:number,y:number,z:number,s:number}[]} */
  let stars = [];
  /** @type {{x:number,y:number,vx:number,size:number,rot:number,vr:number,hue:number}[]} */
  let rocks = [];
  /** @type {{x:number,y:number,vx:number,r:number,palette:number[],rings?:boolean}[]} */
  let planets = [];
  let shipBob = 0;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = canvas.clientWidth || window.innerWidth;
    h = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seedIfNeeded(true);
  }

  function seedIfNeeded(force) {
    if (!force && stars.length) return;
    stars = [];
    const n = Math.floor((w * h) / 2800);
    for (let i = 0; i < n; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        z: 0.35 + Math.random() * 2.4,
        s: Math.random() < 0.15 ? 2 : 1,
      });
    }
    rocks = [];
    for (let i = 0; i < 7; i++) spawnRock(true);
    planets = [];
    for (let i = 0; i < 3; i++) spawnPlanet(true);
  }

  function spawnRock(anywhere) {
    rocks.push({
      x: anywhere ? Math.random() * (w + 120) : w + 40 + Math.random() * 160,
      y: Math.random() * h,
      vx: -(1.2 + Math.random() * 2.8),
      size: 6 + Math.floor(Math.random() * 14),
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.04,
      hue: 20 + Math.random() * 30,
    });
  }

  function spawnPlanet(anywhere) {
    const palettes = [
      ["#3d7ea6", "#1e4a6e", "#7ec8e3", "#0d2438"],
      ["#c45c2a", "#7a3010", "#e8a060", "#3a1808"],
      ["#5a9a6a", "#2a5a38", "#a8d4b0", "#143020"],
      ["#b8a050", "#6a5820", "#e8d878", "#302808"],
    ];
    planets.push({
      x: anywhere ? Math.random() * w * 1.2 : w + 80 + Math.random() * 200,
      y: 40 + Math.random() * (h * 0.55),
      vx: -(0.15 + Math.random() * 0.35),
      r: 18 + Math.random() * 42,
      palette: palettes[Math.floor(Math.random() * palettes.length)],
      rings: Math.random() < 0.35,
    });
  }

  function pixelRect(x, y, pw, ph, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), pw, ph);
  }

  function drawStars(dt) {
    for (const s of stars) {
      s.x -= s.z * (REDUCE ? 0.4 : 2.2) * dt * 60;
      if (s.x < -2) {
        s.x = w + 2;
        s.y = Math.random() * h;
        s.z = 0.35 + Math.random() * 2.4;
      }
      const alpha = 0.35 + s.z * 0.28;
      ctx.fillStyle = `rgba(200, 240, 255, ${Math.min(1, alpha)})`;
      ctx.fillRect(Math.round(s.x), Math.round(s.y), s.s, s.s);
      if (s.z > 1.8) {
        ctx.fillStyle = `rgba(120, 220, 255, ${0.25 * alpha})`;
        ctx.fillRect(Math.round(s.x + s.s), Math.round(s.y), Math.ceil(s.z * 2), 1);
      }
    }
  }

  function drawNebula(time) {
    const g = ctx.createRadialGradient(w * 0.7, h * 0.3, 10, w * 0.7, h * 0.3, w * 0.55);
    g.addColorStop(0, "rgba(20, 80, 110, 0.22)");
    g.addColorStop(0.5, "rgba(40, 30, 70, 0.1)");
    g.addColorStop(1, "transparent");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const g2 = ctx.createRadialGradient(w * 0.2, h * 0.75, 8, w * 0.2, h * 0.75, w * 0.4);
    g2.addColorStop(0, "rgba(0, 120, 100, 0.12)");
    g2.addColorStop(1, "transparent");
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, w, h);
    // slow drift bands
    const ox = (time * 8) % 40;
    ctx.fillStyle = "rgba(0, 200, 180, 0.03)";
    for (let i = 0; i < 6; i++) {
      ctx.fillRect((-ox + i * 70) % (w + 80), (i * 37) % h, 48, 2);
    }
  }

  function drawPlanet(p) {
    const [c1, c2, c3, c4] = p.palette;
    const cx = Math.round(p.x);
    const cy = Math.round(p.y);
    const r = Math.round(p.r);
    // pixel disc
    for (let dy = -r; dy <= r; dy += 2) {
      for (let dx = -r; dx <= r; dx += 2) {
        if (dx * dx + dy * dy > r * r) continue;
        const n = (dx / r + 1) * 0.5;
        let col = c2;
        if (n > 0.72) col = c3;
        else if (n > 0.4) col = c1;
        else col = c4;
        if (dy < -r * 0.35) col = c3;
        pixelRect(cx + dx, cy + dy, 2, 2, col);
      }
    }
    if (p.rings) {
      ctx.strokeStyle = "rgba(220, 200, 140, 0.45)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 2, r * 1.55, r * 0.35, -0.2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawRock(r) {
    ctx.save();
    ctx.translate(Math.round(r.x), Math.round(r.y));
    ctx.rotate(r.rot);
    const s = r.size;
    const body = `hsl(${r.hue}, 18%, 42%)`;
    const shade = `hsl(${r.hue}, 22%, 28%)`;
    const lite = `hsl(${r.hue}, 25%, 58%)`;
    pixelRect(-s * 0.5, -s * 0.35, s, s * 0.7, body);
    pixelRect(-s * 0.35, -s * 0.55, s * 0.55, s * 0.35, lite);
    pixelRect(-s * 0.2, 0, s * 0.45, s * 0.4, shade);
    pixelRect(s * 0.15, -s * 0.15, 3, 3, "#1a1010");
    pixelRect(-s * 0.25, s * 0.05, 2, 2, "#1a1010");
    ctx.restore();
  }

  function drawShip(time) {
    shipBob = Math.sin(time * 2.4) * 4;
    const sx = Math.round(w * 0.28);
    const sy = Math.round(h * 0.58 + shipBob);
    // engine trail
    const trail = 10 + Math.floor((Math.sin(time * 18) + 1) * 4);
    for (let i = 0; i < trail; i++) {
      const a = 0.55 - i * 0.04;
      pixelRect(sx - 10 - i * 3, sy - 1 + (i % 3) - 1, 3, 2, `rgba(0, 255, 200, ${a})`);
      pixelRect(sx - 10 - i * 3, sy + 2 + ((i + 1) % 3) - 1, 3, 2, `rgba(80, 200, 255, ${a * 0.7})`);
    }
    // body (pixel craft)
    pixelRect(sx - 2, sy - 4, 22, 10, "#2a3a48");
    pixelRect(sx, sy - 6, 16, 14, "#3d5a6e");
    pixelRect(sx + 4, sy - 3, 10, 6, "#7ad4ff");
    pixelRect(sx + 6, sy - 1, 6, 2, "#e8ffff");
    pixelRect(sx - 6, sy - 2, 6, 6, "#1e2a34");
    pixelRect(sx + 16, sy - 1, 6, 4, "#c9a45c");
    // wings
    pixelRect(sx + 2, sy - 10, 10, 4, "#4a6a7a");
    pixelRect(sx + 2, sy + 8, 10, 4, "#4a6a7a");
    pixelRect(sx + 4, sy - 12, 4, 3, "#00e8c0");
    pixelRect(sx + 4, sy + 11, 4, 3, "#00e8c0");
    // cockpit blink
    if (Math.floor(time * 3) % 5 !== 0) {
      pixelRect(sx + 8, sy - 2, 2, 2, "#ffffff");
    }
  }

  function step(now) {
    const time = (now - t0) / 1000;
    const dt = REDUCE ? 0.008 : 0.016;
    ctx.fillStyle = "#05080f";
    ctx.fillRect(0, 0, w, h);
    drawNebula(time);
    drawStars(dt);

    for (const p of planets) {
      p.x += p.vx * (REDUCE ? 0.3 : 1);
      if (p.x < -p.r * 2) {
        p.x = w + 80 + Math.random() * 180;
        p.y = 40 + Math.random() * (h * 0.55);
      }
      drawPlanet(p);
    }

    for (const r of rocks) {
      r.x += r.vx * (REDUCE ? 0.4 : 1);
      r.rot += r.vr;
      if (r.x < -40) {
        r.x = w + 40 + Math.random() * 120;
        r.y = Math.random() * h;
      }
      drawRock(r);
    }

    drawShip(time);

    // scanlines / pixel tech overlay
    ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
    for (let y = 0; y < h; y += 3) {
      ctx.fillRect(0, y, w, 1);
    }
    // vignette
    const vg = ctx.createRadialGradient(w * 0.5, h * 0.5, h * 0.2, w * 0.5, h * 0.5, h * 0.85);
    vg.addColorStop(0, "transparent");
    vg.addColorStop(1, "rgba(0, 0, 0, 0.55)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    raf = requestAnimationFrame(step);
  }

  function start() {
    resize();
    cancelAnimationFrame(raf);
    t0 = performance.now();
    raf = requestAnimationFrame(step);
  }

  function stop() {
    cancelAnimationFrame(raf);
  }

  window.addEventListener("resize", () => {
    resize();
  });

  // only run while menu visible
  const menu = document.getElementById("screen-menu");
  const obs = new MutationObserver(() => {
    if (menu?.classList.contains("active")) start();
    else stop();
  });
  if (menu) obs.observe(menu, { attributes: true, attributeFilter: ["class"] });

  if (menu?.classList.contains("active")) start();

  window.FBMenuSpace = { start, stop, resize };
})();
