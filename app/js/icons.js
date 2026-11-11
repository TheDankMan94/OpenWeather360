/* Weather icons drawn as SVG: soft shaded clouds, glowing sun, no outlines (original artwork). */
(function (WS) {
  const f2 = (v) => +v.toFixed(2);

  /** Sun with soft glow and tapered rays; (cx,cy) centre, r disc radius. */
  function sun(cx, cy, r) {
    let rays = "";
    for (let i = 0; i < 12; i++) {
      rays += `<rect x="${f2(cx - r * 0.07)}" y="${f2(cy - r * 1.75)}" width="${f2(r * 0.14)}" height="${f2(r * 0.6)}" rx="${f2(r * 0.07)}" fill="url(#g-ray)" transform="rotate(${i * 30} ${cx} ${cy})"/>`;
    }
    return `<circle cx="${cx}" cy="${cy}" r="${f2(r * 1.7)}" fill="url(#g-sunglow)"/>${rays}` +
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#g-sun)"/>` +
      `<ellipse cx="${f2(cx - r * 0.28)}" cy="${f2(cy - r * 0.42)}" rx="${f2(r * 0.42)}" ry="${f2(r * 0.22)}" fill="#fff" opacity=".4" filter="url(#f-b1)"/>`;
  }

  function moon(cx, cy, r) {
    const c = (dx, dy, rr, o) => `<circle cx="${f2(cx + dx * r)}" cy="${f2(cy + dy * r)}" r="${f2(rr * r)}" fill="#6f7680" opacity="${o}" filter="url(#f-b1)"/>`;
    return `<circle cx="${cx}" cy="${cy}" r="${f2(r * 1.5)}" fill="url(#g-moonglow)"/>` +
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#g-moon)"/>` +
      c(-0.3, -0.25, 0.22, 0.3) + c(0.28, 0.1, 0.17, 0.26) + c(-0.05, 0.42, 0.13, 0.22) + c(0.35, -0.38, 0.09, 0.2) + c(-0.48, 0.18, 0.08, 0.2);
  }

  /** Cumulus built from overlapping puffs, 80 wide: soft shadow underneath, light on top. */
  function cloud(x, y, s, kind) {
    const fill = kind === "dark" ? "url(#g-cloud-dark)" : kind === "back" ? "url(#g-cloud-back)" : "url(#g-cloud)";
    const puffs = [[20, 32, 13], [36, 22, 16], [55, 26, 14], [67, 34, 10]]
      .map((c) => `<circle cx="${c[0]}" cy="${c[1]}" r="${c[2]}" fill="${fill}"/>`).join("");
    const shade = kind === "back" ? "" : `<ellipse cx="40" cy="47" rx="30" ry="3.6" fill="#13243b" opacity=".22" filter="url(#f-b3)"/>`;
    const lite = kind === "dark" ? ".18" : kind === "back" ? ".25" : ".7";
    return `<g transform="translate(${x} ${y}) scale(${s})">${shade}${puffs}<rect x="9" y="30" width="62" height="16" rx="8" fill="${fill}"/>` +
      `<circle cx="32" cy="16" r="9" fill="#fff" opacity="${lite}" filter="url(#f-b3)"/></g>`;
  }

  function drops(n, x0, y0, len, gap) {
    let out = "";
    for (let i = 0; i < n; i++) {
      const x = x0 + i * gap, y = y0 + (i % 2) * 7;
      out += `<path d="M${x + 3},${y} L${x - 2},${y + len}" stroke="#4d9cf0" stroke-width="3.2" stroke-linecap="round" opacity=".95"/>` +
        `<path d="M${x + 3.4},${y + 1} L${x + 0.6},${y + len * 0.55}" stroke="#bfe0ff" stroke-width="1" stroke-linecap="round" opacity=".8"/>`;
    }
    return out;
  }
  function flake(cx, cy, r) {
    let p = "";
    for (let a = 0; a < 3; a++) {
      const t = (a * Math.PI) / 3 + Math.PI / 2, dx = Math.cos(t) * r, dy = Math.sin(t) * r;
      p += `M${f2(cx - dx)},${f2(cy - dy)} L${f2(cx + dx)},${f2(cy + dy)} `;
    }
    return `<path d="${p}" stroke="#5f84b8" stroke-width="3.4" stroke-linecap="round" opacity=".45"/><path d="${p}" stroke="#fff" stroke-width="1.9" stroke-linecap="round"/>`;
  }
  function flakes(n, x0, y0, gap) {
    let out = "";
    for (let i = 0; i < n; i++) out += flake(x0 + i * gap, y0 + (i % 2) * 9, 5.5);
    return out;
  }
  const boltPath = (x, y) => `M${x + 9},${y} L${x - 3},${y + 21} L${x + 5},${y + 21} L${x - 1},${y + 38} L${x + 17},${y + 14} L${x + 8},${y + 14} L${x + 15},${y} Z`;
  const bolt = (x, y) => `<path d="${boltPath(x, y)}" fill="#ffd54a" opacity=".7" filter="url(#f-b3)"/><path d="${boltPath(x, y)}" fill="url(#g-bolt)" stroke="#ffe27a" stroke-width=".8" stroke-linejoin="round"/>`;
  const fogLines = () => [64, 74, 84].map((y, i) => `<rect x="${14 + i * 5}" y="${y}" width="${66 - i * 8}" height="5" rx="2.5" fill="#dde4ee" opacity="${0.92 - i * 0.12}"/>`).join("");

  const BUILD = {
    "sunny": () => sun(50, 50, 21),
    "clear-night": () => moon(50, 50, 28),
    "mostly-sunny": () => sun(38, 38, 19) + cloud(28, 44, 0.72),
    "mostly-clear-night": () => moon(38, 36, 22) + cloud(28, 44, 0.72),
    "partly-cloudy-day": () => sun(36, 34, 18) + cloud(10, 36, 0.92),
    "partly-cloudy-night": () => moon(36, 32, 19) + cloud(10, 36, 0.92),
    "mostly-cloudy": () => sun(30, 28, 14) + cloud(34, 22, 0.62, "back") + cloud(8, 34, 0.95),
    "mostly-cloudy-night": () => moon(30, 28, 14) + cloud(34, 22, 0.62, "back") + cloud(8, 34, 0.95),
    "cloudy": () => cloud(28, 14, 0.74, "back") + cloud(6, 32, 0.98),
    "fog": () => cloud(10, 10, 0.95) + fogLines(),
    "drizzle": () => cloud(10, 10, 0.95) + drops(4, 24, 64, 9, 14),
    "rain": () => cloud(10, 8, 0.95) + drops(4, 24, 62, 17, 14),
    "heavy-rain": () => cloud(10, 6, 0.95, "dark") + drops(5, 18, 58, 22, 13),
    "showers-day": () => sun(68, 26, 14) + cloud(6, 18, 0.9) + drops(3, 22, 66, 16, 15),
    "showers-night": () => moon(68, 26, 14) + cloud(6, 18, 0.9) + drops(3, 22, 66, 16, 15),
    "thunder": () => cloud(10, 6, 0.95, "dark") + bolt(42, 52) + drops(2, 20, 62, 16, 50),
    "snow": () => cloud(10, 8, 0.95) + flakes(4, 24, 68, 15),
    "heavy-snow": () => cloud(10, 6, 0.95, "dark") + flakes(5, 18, 64, 14) + flakes(4, 25, 84, 14),
    "flurries": () => cloud(10, 10, 0.95) + flakes(2, 34, 70, 24),
    "snow-showers": () => sun(68, 26, 14) + cloud(6, 18, 0.9) + flakes(3, 24, 72, 16),
    "freezing-rain": () => cloud(10, 8, 0.95) + drops(2, 22, 62, 16, 30) + flakes(2, 36, 70, 30),
  };

  WS.icon = function (key) {
    const b = BUILD[key] || BUILD.cloudy;
    return `<svg class="wx-icon" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${b()}</svg>`;
  };

  /** Moon phase drawing for the almanac. frac: 0 new, .25 first quarter, .5 full, .75 last quarter. */
  WS.moonIcon = function (frac) {
    const r = 40, cx = 50, cy = 50;
    const k = Math.cos(frac * 2 * Math.PI); // 1 new, -1 full
    const waxing = frac < 0.5;
    const rx = Math.abs(k) * r;
    // lit region: half disc on the lit side + ellipse
    const litSide = waxing ? 1 : 0; // sweep flags
    let d;
    if (frac === 0) d = "";
    else if (frac === 0.5) d = `M${cx},${cy - r} A${r},${r} 0 1 1 ${cx},${cy + r} A${r},${r} 0 1 1 ${cx},${cy - r} Z`;
    else d = `M${cx},${cy - r} A${r},${r} 0 0 ${litSide} ${cx},${cy + r} A${rx},${r} 0 0 ${k > 0 ? 1 - litSide : litSide} ${cx},${cy - r} Z`;
    return `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#2b2f3a" stroke="#6b7180" stroke-width="2"/>` +
      (d ? `<path d="${d}" fill="url(#g-moon)"/>` : "") + `</svg>`;
  };
})(window.WS);
