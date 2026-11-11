/* Slide catalog and segment ("package") builder. */
(function (WS) {
  const S = (WS.slides = {});
  const el = WS.el, esc = WS.esc, R = WS.round;

  const panel = (cls, style, html) => `<div class="panel ${cls || ""}" style="${style || ""}">${html || ""}</div>`;
  const today0 = (loc) => { const n = WS.locNow(loc.offset); return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()); };
  const dayRow = (loc, plus) => (loc.daily || []).find((d) => d.date.getTime() === today0(loc) + plus * 86400000);
  const hourAt = (loc, ms) => (loc.hourly || []).find((h) => h.t.getTime() === ms);
  const noData = (msg) => `<div class="no-data">${esc(msg || "Temporarily Unavailable")}</div>`;

  /* ================= Forecast package ================= */
  const intro = {
    title: "", dur: 10,
    build(ctx) {
      const b = [[20, 150, 260], [110, 120, 330], [250, 170, 220], [640, 140, 300], [760, 110, 380], [860, 130, 250]];
      const bld = b.map(([x, w, h]) => `<div class="bldg" style="left:${x}px;width:${w}px;height:${h}px"></div>`).join("");
      const words = Array(12).fill(esc(WS.config.wordmark || "OpenWeather360")).map((w) => `<span>${w}</span>`).join("");
      return `<div class="s-intro" style="position:absolute;inset:0"><div class="scene"><div class="sky"></div><div class="glow"></div>${bld}<div class="ground"></div></div>
        <div class="msg">${esc(WS.config.wordmark || "OpenWeather360")} is only available on<br>${esc(WS.config.providerName)}</div>
        <div class="bigloc">${esc(ctx.loc.name)}</div><div class="wordrow">${words}</div></div>`;
    },
    fullBleed: true,
  };

  const currently = {
    title: "Currently", dur: 10,
    build({ loc }) {
      const c = loc.current;
      if (!c) return null;
      const u = WS.units();
      const arrow = c.pressTrend === "rising" ? "↑" : c.pressTrend === "falling" ? "↓" : "";
      const rows = [
        ["Humidity", R(c.rh) + "%"],
        ["Dew Point", R(c.dew)],
        ["Pressure", WS.pressure(c.pressure) + `<span class="press-arrow">${arrow}</span>`],
        ["Wind", WS.windText(c.windDir, c.windSpd)],
        ["Gusts", c.gust != null && c.gust - (c.windSpd || 0) >= 5 ? R(c.gust) + " " + u.windLbl : "None"],
      ];
      const cold = u.metric ? c.temp <= 4 : c.temp <= 40, hot = u.metric ? c.temp >= 27 : c.temp >= 80;
      if (cold && c.windSpd >= 3) rows.push(["Wind Chill", R(c.feels)]);
      else if (hot) rows.push(["Heat Index", R(c.feels)]);
      else rows.push(["Visibility", WS.visibility(c.vis)]);
      return `<div class="s-cc">` +
        panel("left", "", rows.map(([k, v]) => `<div class="row"><span class="lbl">${k}</span><span class="val">${v}</span></div>`).join("")) +
        panel("right", "", `<div class="icon">${WS.icon(c.icon)}</div><div class="cond">${esc(c.text)}</div><div class="temp">${R(c.temp)}</div>`) + `</div>`;
    },
  };

  function nearbyPage(start) {
    return {
      title: "Currently", dur: 9,
      when: () => WS.data.nearby.length > start,
      build() {
        const rows = WS.data.nearby.slice(start, start + 4).map((n) => {
          const w = WS.wx(n.code, n.isDay);
          return `<div class="r"><span class="c name">${esc(n.name)}</span><span class="c num">${R(n.temp)}</span><span class="c ic">${WS.icon(w.icon)}</span><span class="c wind">${WS.windText(n.windDir, n.windSpd)}</span></div>`;
        }).join("");
        return `<div class="s-table"><div class="rows">${rows}</div></div>`;
      },
    };
  }

  function legendHTML(loc) {
    const span = loc.isUS ? `Past ${WS.config.radar.hours} Hours` : "Past 2 Hours";
    return `<div class="legend"><div class="lg-t">${span}</div><div class="lg-scale"><span>Light</span><span class="lg-grad"></span><span>Heavy</span></div></div>`;
  }

  function mapSlide(title, mk) {
    return {
      title, dur: 15,
      build(ctx) {
        const wrap = el("div", "s-map");
        const m = el("div", "map");
        wrap.appendChild(m);
        const stamp = el("div", "stamp");
        wrap.appendChild(stamp);
        ctx.afterInsert = () => {
          const opts = mk(ctx);
          if (!opts) return;
          if (opts.legend) ctx.titleExtra(legendHTML(ctx.loc));
          opts.onFrame = (t) => {
            const sh = new Date(t.getTime() + ctx.loc.offset * 1000);
            stamp.textContent = WS.clockTime(sh);
          };
          const h = WS.maps.create(m, opts);
          if (opts.bounds) h.map.fitBounds(opts.bounds, { padding: opts.padding || 50, duration: 0 });
          ctx.cleanup = () => h.destroy();
        };
        return wrap;
      },
    };
  }

  const dopplerRadar = mapSlide("Local Doppler Radar", ({ loc }) => {
    const z = WS.config.radar.mainZoom;
    const labels = [{ name: loc.name, lat: loc.lat, lon: loc.lon }].concat(WS.maps.labelCities(loc.lat, loc.lon, z, 973, 466, 6, loc.name));
    return { center: [loc.lon + 0.2, loc.lat], zoom: z, kind: "radar", radar: true, isUS: loc.isUS, labels, legend: true };
  });

  const radarSatellite = mapSlide("Radar/Satellite", ({ loc }) => {
    const z = 4.6;
    const labels = WS.maps.labelCities(loc.lat, loc.lon, z, 973, 466, 6, null);
    return { center: [loc.lon, loc.lat], zoom: z, kind: "radar", radar: true, satellite: true, isUS: loc.isUS, labels, legend: true };
  });

  function localForecastPage(i) {
    return {
      id: "localfc",
      title: "Local Forecast", dur: 8,
      when: (ctx) => (ctx.loc.periods || []).length > i,
      build({ loc }) {
        const p = loc.periods[i];
        const wrap = el("div", "s-text", panel("", "", `<div class="name">${esc(p.name)}</div><div class="body">${esc(p.text)}</div>`));
        return wrap;
      },
      fit: ".body",
    };
  }

  const extended = {
    title: "Extended Forecast", dur: 10,
    build({ loc }) {
      const start = today0(loc) + 86400000;
      const days = (loc.daily || []).filter((d) => d.date.getTime() >= start).slice(0, 5);
      if (days.length < 3) return null;
      return `<div class="s-ext">` + days.map((d, i) => {
        const w = WS.wxDaily(d.code);
        return panel("col", `left:${22 + i * 186}px`, `<div class="d">${WS.dayShort(d.date)}</div><div class="icon">${WS.icon(w.icon)}</div><div class="cond">${esc(w.text.replace(" ", "<br>")).replace("&lt;br&gt;", "<br>")}</div><div class="hi">${R(d.hi)}</div><div class="sepline"></div><div class="lo">${R(d.lo)}</div>`);
      }).join("") + `</div>`;
    },
  };

  const almanac = {
    title: "Almanac", dur: 10,
    when: (ctx) => !!ctx.loc.almanac,
    build({ loc }) {
      const a = loc.almanac, d0 = dayRow(loc, 0) || {};
      const now = WS.locNow(loc.offset);
      const phases = WS.moonPhases(new Date()).map((p) => {
        const sh = new Date(p.date.getTime() + loc.offset * 1000);
        return `<div class="moon"><div class="p">${p.name}</div>${WS.moonIcon(p.frac)}<div class="dt">${WS.monShort(sh)} ${sh.getUTCDate()}</div></div>`;
      }).join("");
      const ln = (k, v, y) => `<div class="ln"><span class="k">${k}</span><span class="v">${R(v)}</span><span class="y">${y || ""}</span></div>`;
      return `<div class="s-alm">` +
        panel("top", "", `<div class="date">${WS.MONTHS[now.getUTCMonth()]} ${now.getUTCDate()}</div>
          <div class="blk" style="left:60px"><div class="h">Average</div>${ln("High", a.avgHi)}${ln("Low", a.avgLo)}</div>
          <div class="blk" style="left:480px"><div class="h">Record</div>${ln("High", a.recHi, a.recHiYear)}${ln("Low", a.recLo, a.recLoYear)}</div>`) +
        panel("bot dark", "", `<div class="sun"><span class="k">Sunrise</span><span>${d0.sunrise ? WS.clockTime(d0.sunrise) : "--"}</span><span class="k">Sunset</span><span>${d0.sunset ? WS.clockTime(d0.sunset) : "--"}</span></div><div class="moons">${phases}</div>`) +
        `</div>`;
    },
  };

  function dpPick(loc) {
    const hr = WS.locNow(loc.offset).getUTCHours();
    const t0 = today0(loc);
    if (hr < 8) return { title: "Today's Forecast", times: [9, 12, 15, 18].map((h) => t0 + h * 3600000) };
    return { title: "Tomorrow's Forecast", times: [6, 12, 15, 17].map((h) => t0 + (24 + h) * 3600000) };
  }
  const dayparts = {
    title: "Tomorrow's Forecast", dur: 10,
    build(ctx) {
      const { loc } = ctx;
      const pick = dpPick(loc);
      ctx.setTitle(pick.title);
      const hs = pick.times.map((t) => hourAt(loc, t)).filter(Boolean);
      if (hs.length < 4) return null;
      const temps = hs.map((h) => h.temp), mn = Math.min(...temps), mx = Math.max(...temps);
      return `<div class="s-dp">` + hs.map((h, i) => {
        const w = WS.wx(h.code, h.isDay);
        const hp = Math.round(mx === mn ? 170 : 130 + ((h.temp - mn) / (mx - mn)) * 90);
        return `<div class="col" style="left:${8 + i * 240}px"><div class="t">${WS.hourLabel(h.t, "cap")}</div><div class="icon">${WS.icon(w.icon)}</div><div class="cond">${esc(w.text)}</div>
          <div class="bar" style="height:${hp}px"><div class="v">${R(h.temp)}</div><div class="w">${WS.windText(h.wd, h.ws)}</div></div></div>`;
      }).join("") + `</div>`;
    },
  };

  /* ================= Health ================= */
  const outdoor = {
    title: "Outdoor Activity", dur: 10,
    build({ loc }) {
      const hr = WS.locNow(loc.offset).getUTCHours();
      const plus = hr < 14 ? 0 : 1;
      const d = dayRow(loc, plus);
      if (!d) return null;
      const dayStart = d.date.getTime();
      const hrs = (loc.hourly || []).filter((h) => h.t.getTime() >= dayStart + 8 * 3600000 && h.t.getTime() <= dayStart + 18 * 3600000);
      const rh = hrs.length ? hrs.reduce((s, h) => s + (h.rh || 0), 0) / hrs.length : null;
      const w = WS.wxDaily(d.code);
      return `<div class="s-out">` +
        panel("left", "", `<div class="h">Forecast for ${plus ? WS.dayName(d.date) : "Today"}</div><div class="icon">${WS.icon(w.icon)}</div><div class="hl"><div>Low<b>${R(d.lo)}</b></div><div>High<b>${R(d.hi)}</b></div></div>`) +
        panel("right", "", `<div class="k">Chance of Precipitation</div><div class="v">${R(d.pop)}%</div><div class="k">Humidity</div><div class="v">${R(rh)}%</div><div class="k">Wind</div><div class="v">${WS.windText(d.wdir, d.wmax)}</div>`) + `</div>`;
    },
  };

  const UV_SCALE = [["Low", "#4eb400", 0, 2], ["Moderate", "#f7e400", 3, 5], ["High", "#f88700", 6, 7], ["Very High", "#d8001d", 8, 10], ["Extreme", "#9b6bd9", 11, 14]];
  const AQI_SCALE = [["Good", "#00e400", 0, 50], ["Moderate", "#ffff00", 51, 100], ["Sensitive", "#ff7e00", 101, 150], ["Unhealthy", "#ff3030", 151, 200], ["Very Unhlthy", "#a35cc4", 201, 300], ["Hazardous", "#a0153e", 301, 500]];
  function gauge(scale, value, maxV) {
    const cat = scale.find((s) => value <= s[3]) || scale[scale.length - 1];
    const pos = Math.min(1, Math.max(0, value / maxV));
    const bar = scale.map((s) => `<div style="background:${s[1]}">${s[0]}</div>`).join("");
    return { cat, html: `<div class="scale">${bar}</div><div class="marker" style="left:${40 + pos * 850}px"></div>` };
  }

  const uvIndex = {
    title: "UV Index", dur: 10,
    when: ({ loc }) => (loc.daily || []).length > 1,
    build({ loc }) {
      const hr = WS.locNow(loc.offset).getUTCHours();
      const plus = hr < 15 ? 0 : 1;
      const d = dayRow(loc, plus);
      if (!d || d.uv == null) return null;
      const v = Math.round(d.uv);
      const g = gauge(UV_SCALE, v, 12);
      const base = d.date.getTime();
      const hours = [9, 11, 13, 15, 17].map((h) => hourAt(loc, base + h * 3600000)).filter(Boolean)
        .map((h) => `<div>${WS.hourLabel(h.t)}<b>${Math.round(h.uv || 0)}</b></div>`).join("");
      return `<div class="s-gauge">` + panel("main", "", `<div class="big"><div class="n">${v}</div><div class="cat" style="background:${g.cat[1]}">${g.cat[0]}</div></div>
        <div class="info"><span class="k">${plus ? WS.dayName(d.date) : "Today"}'s Maximum UV Index</span><br>${uvAdvice(v)}</div><div class="hours">${hours}</div>${g.html}`) + `</div>`;
    },
  };
  function uvAdvice(v) {
    if (v <= 2) return "Minimal sun protection needed.";
    if (v <= 5) return "Wear sunglasses and use sunscreen SPF 30+.";
    if (v <= 7) return "Seek shade during midday hours. Cover up and use SPF 30+.";
    return "Avoid the sun between 10 a.m. and 4 p.m. Shirt, sunscreen and hat are a must.";
  }

  const airQuality = {
    title: "Air Quality", dur: 10,
    when: ({ loc }) => loc.air && loc.air.aqi != null,
    build({ loc }) {
      const a = loc.air, v = Math.round(a.aqi);
      const g = gauge(AQI_SCALE, v, 300);
      const tm = a.tomorrow != null ? `<br><span class="k">Tomorrow</span> AQI ${Math.round(a.tomorrow)} - ${(AQI_SCALE.find((s) => a.tomorrow <= s[3]) || AQI_SCALE[5])[0]}` : "";
      return `<div class="s-gauge">` + panel("main", "", `<div class="big"><div class="n">${v}</div><div class="cat" style="background:${g.cat[1]}">${g.cat[0]}</div></div>
        <div class="info"><span class="k">Current Air Quality Index</span><br>Fine particles (PM2.5): ${a.pm25 != null ? a.pm25.toFixed(1) : "--"} µg/m³<br>Ozone: ${a.ozone != null ? Math.round(a.ozone) : "--"} µg/m³${tm}</div>${g.html}`) + `</div>`;
    },
  };

  const pollen = {
    title: "Pollen Report", dur: 9,
    when: ({ loc }) => loc.air && loc.air.pollen,
    build({ loc }) {
      const lvl = (v) => (v < 10 ? "Low" : v < 50 ? "Moderate" : v < 200 ? "High" : "Very High");
      const rows = Object.entries(loc.air.pollen).slice(0, 5).map(([k, v]) => `<div class="r"><span class="c name">${WS.titleCase(k)}</span><span class="c txt" style="width:260px">${lvl(v)}</span><span class="c num" style="width:180px">${Math.round(v)}</span></div>`).join("");
      return `<div class="s-table"><div class="rows"><div class="r hdr"><span class="c name">Pollen Type</span><span class="c txt" style="width:260px">Level</span><span class="c num" style="width:180px">grains/m³</span></div>${rows}</div></div>`;
    },
  };

  const TIPS_WARM = [
    ["Lightning Safety", "When thunder roars, go indoors. Lightning can strike 10 miles from the storm. Wait 30 minutes after the last thunder before heading back out."],
    ["Beat the Heat", "Drink water before you feel thirsty, take breaks in the shade, and check on elderly neighbors during hot spells."],
    ["Never Leave Anyone in a Parked Car", "The inside of a car can heat up 20 degrees in just 10 minutes, even with the windows cracked."],
    ["Flood Safety", "Turn around, don't drown. Just 6 inches of moving water can knock you down, and 12 inches can carry away a small car."],
    ["Sun Protection", "Reapply sunscreen every two hours and after swimming. UV rays reach you even on cloudy days."],
    ["Allergy Relief", "Keep windows closed on high pollen days and shower after spending time outdoors to wash off pollen."],
  ];
  const TIPS_COLD = [
    ["Dress in Layers", "Several thin layers keep you warmer than one heavy coat. Cover your head, hands and feet to prevent frostbite."],
    ["Winter Driving", "Keep an emergency kit in your car: blanket, flashlight, ice scraper, jumper cables, water and snacks."],
    ["Shovel Safely", "Take frequent breaks when shoveling snow, push rather than lift, and stay hydrated."],
    ["Protect Your Pipes", "Let faucets drip during hard freezes and keep cabinet doors open so warm air can reach the plumbing."],
    ["Space Heater Safety", "Keep space heaters at least three feet from anything that can burn, and turn them off when you leave the room."],
    ["Carbon Monoxide", "Never run a generator or grill indoors or in a garage. Make sure your CO detectors have fresh batteries."],
  ];
  let tipIdx = Math.floor(Math.random() * 6);
  const healthTip = {
    title: "Health Tip", dur: 10,
    build() {
      const m = new Date().getMonth();
      const set = m >= 3 && m <= 8 ? TIPS_WARM : TIPS_COLD; // Apr-Sep warm season
      const t = set[tipIdx++ % set.length];
      return `<div class="s-tip">` + panel("", "", `<div class="h">${esc(t[0])}</div><div class="b">${esc(t[1])}</div>`) + `</div>`;
    },
  };

  /* ================= Travel ================= */
  function tempMarker(c, plus) {
    const d = (c.daily || [])[plus || 0];
    if (!d) return null;
    const e = el("div", "map-temp", `<div class="icon">${WS.icon(WS.wxDaily(d.code).icon)}</div><div class="box"><div class="n">${esc(c.name)}</div><div class="v">${R(d.hi)}</div></div>`);
    return { lat: c.lat, lon: c.lon, el: e, anchor: "left" };
  }
  function boundsOf(pts) {
    const lats = pts.map((p) => p.lat), lons = pts.map((p) => p.lon);
    return [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]];
  }

  const travelMap = mapSlide("Travel Forecast", ({ loc }) => {
    const cities = WS.data.travel || [];
    if (cities.length < 2) return null;
    const plus = WS.locNow(loc.offset).getUTCHours() >= 15 ? 1 : 0;
    const pts = cities.map((c) => tempMarker(c, plus)).filter(Boolean);
    return { center: [loc.lon, loc.lat], zoom: 5, kind: "travel", markers: pts, bounds: boundsOf(cities.concat([loc])), padding: { top: 40, bottom: 70, left: 30, right: 220 } };
  });

  function destPage(start) {
    return {
      title: "Destination Forecast", dur: 9,
      when: () => (WS.data.destinations || []).length > start,
      build() {
        const fmt = (d) => d ? `<span class="c ic">${WS.icon(WS.wxDaily(d.code).icon)}</span><span class="c num" style="width:130px">${R(d.hi)}/${R(d.lo)}</span>` : "";
        const rows = WS.data.destinations.slice(start, start + 5).map((c) => `<div class="r"><span class="c name">${esc(c.name)}</span>${fmt(c.daily[0])}${fmt(c.daily[1])}</div>`).join("");
        const dn = WS.data.destinations[start].daily[1];
        return `<div class="s-table"><div class="rows"><div class="r hdr"><span class="c name"></span><span class="c" style="width:220px;text-align:center">Today</span><span class="c" style="width:220px;text-align:center">${dn ? WS.dayName(dn.date) : "Tomorrow"}</span></div>${rows}</div></div>`;
      },
    };
  }

  /* ================= Airports ================= */
  function airportRows(list) {
    return list.map((a) => {
      const isDay = WS.data.main.current ? WS.data.main.current.isDay : 1;
      const w = a.code != null ? WS.wx(a.code, isDay) : null;
      return `<div class="r"><span class="c name">${esc(a.name)}</span><span class="c num">${a.temp != null ? R(a.temp) : ""}</span><span class="c ic">${w ? WS.icon(w.icon) : ""}</span><span class="c delay ${a.status.bad ? "bad" : ""}">${esc(a.status.text)}</span></div>`;
    }).join("");
  }
  const localAirports = {
    title: "Airport Conditions", dur: 10,
    when: () => (WS.data.localAirports || []).length > 0,
    build() { return `<div class="s-table s-air"><div class="rows">${airportRows(WS.data.localAirports.slice(0, 4))}</div></div>`; },
  };
  function natAirPage(start) {
    return {
      title: "National Airport Conditions", dur: 10,
      when: () => (WS.data.nationalAirports || []).length > start,
      build() { return `<div class="s-table s-air"><div class="rows" style="gap:5px">${airportRows(WS.data.nationalAirports.slice(start, start + 6))}</div></div>`; },
    };
  }

  /* ================= International ================= */
  function intlMap(i) {
    const s = mapSlide("International Forecast", () => {
      const r = (WS.data.intlRegions || [])[i];
      if (!r || !r.cities.length) return null;
      return { center: r.center, zoom: r.zoom, kind: "travel", markers: r.cities.map((c) => tempMarker(c, 0)).filter(Boolean), bounds: boundsOf(r.cities), padding: { top: 40, bottom: 60, left: 30, right: 200 } };
    });
    s.when = () => !!(WS.data.intlRegions || [])[i];
    s.dur = 10;
    s.locLabel = () => ((WS.data.intlRegions || [])[i] || {}).name;
    return s;
  }
  function intlTable(start) {
    return {
      title: "International Forecast", dur: 9,
      when: () => (WS.data.intlForecast || []).length > start,
      locLabel: () => "Today",
      build() {
        const rows = WS.data.intlForecast.slice(start, start + 5).map((c) => {
          const d = c.daily[0], w = WS.wxDaily(d.code);
          return `<div class="r"><span class="c name">${esc(c.name)}</span><span class="c ic">${WS.icon(w.icon)}</span><span class="c txt">${esc(w.text)}</span><span class="c num" style="width:150px">${R(d.hi)}/${R(d.lo)}</span></div>`;
        }).join("");
        return `<div class="s-table"><div class="rows">${rows}</div></div>`;
      },
    };
  }

  /* ================= Garden & golf ================= */
  const garden = {
    title: "Garden Forecast", dur: 11,
    build({ loc }) {
      const days = [0, 1, 2].map((p) => dayRow(loc, p)).filter(Boolean);
      if (!days.length) return null;
      const metric = WS.units().metric;
      const et = days.reduce((s, d) => s + (d.et0 || 0), 0);
      const rain = days.reduce((s, d) => s + (d.precip || 0), 0);
      const etIn = metric ? et : et / 25.4; // et0 is always mm; precip follows units
      const deficit = etIn - (metric ? rain / 25.4 : rain);
      const need = deficit > 0.45 ? "High" : deficit > 0.15 ? "Moderate" : "Low";
      const lows = [0, 1, 2, 3].map((p) => dayRow(loc, p)).filter(Boolean).map((d) => d.lo);
      const minLo = Math.min(...lows);
      const f = metric ? (minLo * 9) / 5 + 32 : minLo;
      const frost = f <= 28 ? "Hard Freeze" : f <= 32 ? "Freeze" : f <= 36 ? "Frost Possible" : "No Frost";
      const now = WS.locNow(loc.offset).getTime();
      const h = (loc.hourly || []).find((x) => x.t.getTime() >= now - 3600000);
      const soilT = h && h.soilT != null ? R(h.soilT) + "°" : "--";
      const soilM = h && h.soilM != null ? Math.round(h.soilM * 100) + "%" : "--";
      const pct = Math.max(5, Math.min(100, ((h && h.soilM) || 0) / 0.45 * 100));
      return `<div class="s-garden">` +
        panel("cell", "left:22px;width:300px", `<div class="h">Watering Needs</div><div class="big">${need}</div><div class="small">Next 3 days: ${(metric ? rain : rain).toFixed(metric ? 0 : 2)} ${WS.units().precip === "inch" ? "in" : "mm"} rain expected</div>`) +
        panel("cell", "left:336px;width:300px", `<div class="h">Frost Outlook</div><div class="big" style="font-size:${frost.length > 9 ? 46 : 60}px">${frost}</div><div class="small">Coldest low next 4 days: ${R(minLo)}°</div>`) +
        panel("cell", "left:650px;width:302px", `<div class="h">Soil Conditions</div><div class="big">${soilT}</div><div class="small">Soil moisture ${soilM}</div><div class="meter"><div style="width:${pct}%"></div></div>`) +
        `</div>`;
    },
  };

  function golfIndex(d, metric) {
    const hiF = metric ? (d.hi * 9) / 5 + 32 : d.hi;
    const wind = metric ? d.wmax / 1.609 : d.wmax;
    let s = 10;
    s -= (d.pop || 0) >= 60 ? 4 : (d.pop || 0) >= 30 ? 2 : 0;
    s -= wind > 22 ? 3 : wind > 14 ? 1.5 : 0;
    s -= hiF < 60 ? (60 - hiF) / 6 : hiF > 88 ? (hiF - 88) / 4 : 0;
    if (d.code >= 95) s -= 3;
    return Math.max(0, Math.min(10, Math.round(s)));
  }
  const golf = {
    title: "Golf Forecast", dur: 10,
    build({ loc }) {
      const start = WS.locNow(loc.offset).getUTCHours() >= 16 ? 1 : 0; // after late afternoon, start with tomorrow
      const days = [start, start + 1, start + 2].map((p) => dayRow(loc, p)).filter(Boolean);
      if (!days.length) return null;
      const metric = WS.units().metric;
      return `<div class="s-garden">` + days.map((d, i) => {
        const g = golfIndex(d, metric);
        const word = g >= 8 ? "Excellent" : g >= 6 ? "Good" : g >= 4 ? "Fair" : "Poor";
        return panel("cell", `left:${22 + i * 314}px;width:302px`, `<div class="h">${i || start ? WS.dayName(d.date) : "Today"}</div><div class="icon">${WS.icon(WS.wxDaily(d.code).icon)}</div><div class="small">High ${R(d.hi)}<br>Wind ${WS.windText(d.wdir, d.wmax)}</div><div class="big" style="font-size:44px;margin-top:8px">${word}</div><div class="meter"><div style="width:${g * 10}%;background:linear-gradient(90deg,#9be36a,#14a00a)"></div></div><div class="small">Golf index ${g}/10</div>`);
      }).join("") + `</div>`;
    },
  };

  /* ================= Boat & beach ================= */
  const beach = {
    title: "Boat & Beach", dur: 11,
    when: ({ loc }) => !!loc.marine,
    build({ loc }) {
      const m = loc.marine, metric = WS.units().metric;
      const unit = metric ? "m" : "ft";
      const t = loc.tides;
      const now = WS.locNow(loc.offset).getTime();
      const tideRows = t ? t.events.filter((e) => e.t.getTime() >= now - 1800000).slice(0, 4).map((e) => `<div class="row"><span class="lbl">${e.type}</span><span class="val">${WS.clockTime(e.t)} &nbsp;${e.v.toFixed(1)} ${unit}</span></div>`).join("") : `<div class="row"><span class="val">No tide station nearby</span></div>`;
      return `<div class="s-cc">` +
        panel("left", "width:440px", `<div class="row"><span class="lbl">Water Temp</span><span class="val">${m.sst != null ? R(m.sst) + "°" : "--"}</span></div>
          <div class="row"><span class="lbl">Waves</span><span class="val">${m.wave != null ? m.wave.toFixed(1) + " " + unit : "--"}</span></div>
          <div class="row"><span class="lbl">Period</span><span class="val">${m.period != null ? Math.round(m.period) + " sec" : "--"}</span></div>
          <div class="row"><span class="lbl">From</span><span class="val">${WS.compass(m.waveDir) || "--"}</span></div>
          <div class="row"><span class="lbl">Wind</span><span class="val">${WS.windText(loc.current.windDir, loc.current.windSpd)}</span></div>`) +
        panel("right", "left:474px;width:478px;text-align:left;padding:14px 24px", `<div class="row" style="justify-content:center"><span class="lbl" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Tides${t ? " - " + esc(t.name) : ""}</span></div>${tideRows}`) + `</div>`;
    },
    fit: ".right .row:first-child .lbl",
  };

  /* ================= Severe ================= */
  function bulletin(i) {
    return {
      title: "Weather Bulletin", dur: 16,
      when: () => (WS.data.alerts || []).length > i,
      build(ctx) {
        const a = sortedAlerts()[i];
        const ends = a.ends ? new Date(a.ends) : null;
        const sh = ends ? new Date(ends.getTime() + ctx.loc.offset * 1000) : null;
        const txt = (a.description + (a.instruction ? "\n\n" + a.instruction : "")).replace(/\n(?!\n)/g, " ").replace(/\s{3,}/g, "\n\n").trim();
        const wrap = el("div", "s-bull", panel("", "", `<div class="ev">${esc(a.event)}</div><div class="until">${sh ? "Until " + WS.clockTime(sh) + " " + WS.dayShort(sh) : ""}</div><div class="txt">${esc(txt)}</div>`));
        ctx.afterInsert = () => {
          const p = wrap.querySelector(".panel"), t = wrap.querySelector(".txt");
          const over = p.scrollHeight - p.clientHeight;
          if (over > 0) {
            t.style.transition = `transform ${(this.dur * WS.config.durationScale - 4).toFixed(1)}s linear 2s`;
            requestAnimationFrame(() => (t.style.transform = `translateY(${-over - 20}px)`));
          }
        };
        return wrap;
      },
    };
  }
  function sortedAlerts() {
    return (WS.data.alerts || []).slice().sort((a, b) => (b.severe - a.severe));
  }


  /* ================= Ski & snow (V1 / Local lineups) ================= */
  const skiSlide = {
    title: "Ski & Snow", dur: 10,
    when: () => (WS.data.ski || []).length > 0,
    build() {
      const u = WS.units().metric ? "cm" : "in";
      const f = (v) => (v >= 0.5 ? Math.round(v) : v > 0 ? "<1" : "0") + (u === "in" ? '"' : " cm");
      const rows = WS.data.ski.map((s) => `<div class="r"><span class="c name">${esc(s.name)}</span><span class="c num" style="width:150px">${s.base >= (u === "in" ? 6 : 15) ? "Open" : "Closed"}</span><span class="c num" style="width:150px">${f(s.base)}</span><span class="c num" style="width:150px">${f(s.new24)}</span><span class="c num" style="width:170px">${f(s.next3)}</span></div>`).join("");
      return `<div class="s-table s-air"><div class="rows" style="gap:5px"><div class="r hdr"><span class="c name">Resort</span><span class="c num" style="width:150px">Status</span><span class="c num" style="width:150px">Base</span><span class="c num" style="width:150px">New 24h</span><span class="c num" style="width:170px">Next 3 days</span></div>${rows}</div></div>`;
    },
  };
  const inSkiSeason = () => {
    const sk = WS.data.ski || [];
    return sk.some((s) => s.base >= 4 || s.next3 > 0.5);
  };

  /* ================= "Up Next..." menu (Local lineup) ================= */
  const UPNEXT_LABEL = { forecast: "Your Local Forecast", extralocal: "Forecast For", health: "Health", travel: "Travel", airport: "Airport", international: "International", garden: "Garden", golf: "Golf", beach: "Boat & Beach", ski: "Ski & Snow", severe: "Severe Weather" };
  const upNext = {
    title: "Up Next...", dur: 6, fullBleed: true,
    build(ctx) {
      const segs = (ctx.segs || []).slice(ctx.idx);
      const seen = new Set();
      const items = [];
      for (const s of segs) {
        const label = s.group === "extralocal" ? "Forecast For " + s.label : UPNEXT_LABEL[s.group] || s.label;
        if (seen.has(label)) continue;
        seen.add(label); items.push(label);
        if (items.length >= 6) break;
      }
      return `<div class="s-upnext"><div class="ttl">Up Next...</div><ul>${items.map((t, i) => `<li class="${i ? "" : "cur"}">${i ? "" : "<i>▶</i>"}${esc(t)}</li>`).join("")}</ul></div>`;
    },
  };

  /* ================= Segments ================= */
  const GROUP_LABEL = { health: "Health", travel: "Travel", airport: "Airport", international: "International", garden: "Garden", golf: "Golf", beach: "Boat & Beach", ski: "Ski & Snow", severe: "Severe Weather" };

  S.buildSegments = function (first) {
    const D = WS.data, main = D.main;
    const look = (WS.look && WS.look.id) || "v2";
    const segs = [];
    const add = (group, label, loc, slides) => {
      // The Local look opens every segment with its "Up Next..." menu.
      if (look === "local" && group !== "severe" && !(group === "forecast" && first && segs.length === 0)) slides = [upNext].concat(slides);
      segs.push({ group, label, loc, slides });
    };
    const pk = WS.config.packages || [];
    const severe = WS.config.severeMode && (D.alerts || []).some((a) => a.severe);
    if (severe) add("severe", GROUP_LABEL.severe, main, [bulletin(0), bulletin(1), bulletin(2), dopplerRadar, currently]);
    for (const p of pk) {
      if (p === "forecast") {
        // each look has its own forecast package, in the order of the original channel
        const lineup = look === "v1"
          ? [first ? intro : null, currently, nearbyPage(0), dopplerRadar, localForecastPage(0), localForecastPage(1), localForecastPage(2), localForecastPage(3), extended, almanac]
          : look === "local"
            ? [first ? intro : null, bulletin(0), dopplerRadar, currently, nearbyPage(0), dopplerRadar, localForecastPage(0), localForecastPage(1), extended, almanac, radarSatellite, dopplerRadar]
            : [first ? intro : null, currently, nearbyPage(0), dopplerRadar, localForecastPage(0), localForecastPage(1), localForecastPage(2), localForecastPage(3), extended, almanac, radarSatellite, dayparts, nearbyPage(4)];
        add("forecast", main.name, main, lineup.filter(Boolean));
      } else if (p === "extralocal") {
        for (const x of D.extras) add("extralocal", x.name, x, look === "v2" ? [currently, localForecastPage(0), localForecastPage(1), extended] : [currently, dayparts, localForecastPage(0), extended]);
      } else if (p === "health") add("health", GROUP_LABEL.health, main, [outdoor, uvIndex, airQuality, pollen, healthTip]);
      else if (p === "travel") add("travel", GROUP_LABEL.travel, main, [travelMap, destPage(0), destPage(5), destPage(10)]);
      else if (p === "airport" && main.isUS) add("airport", GROUP_LABEL.airport, main, [localAirports, natAirPage(0), natAirPage(6), natAirPage(12)]);
      else if (p === "international") add("international", GROUP_LABEL.international, main, [intlMap(0), intlMap(1), intlMap(2), intlTable(0), intlTable(5)]);
      else if (p === "garden") add("garden", GROUP_LABEL.garden, main, [garden]);
      else if (p === "golf") add("golf", GROUP_LABEL.golf, main, [golf]);
      else if (p === "beach" && main.marine) add("beach", GROUP_LABEL.beach, main, [beach]);
      else if (p === "ski" && inSkiSeason()) add("ski", GROUP_LABEL.ski, main, [skiSlide]);
    }
    return segs;
  };

  S.all = { intro, currently, nearby: nearbyPage(0), radar: dopplerRadar, satrad: radarSatellite, localfc: localForecastPage(0), extended, almanac, dayparts, outdoor, uv: uvIndex, aqi: airQuality, pollen, tip: healthTip, travel: travelMap, dest: destPage(0), airports: localAirports, natair: natAirPage(0), intl: intlMap(0), intltable: intlTable(0), garden, golf, beach, ski: skiSlide, upnext: upNext, bulletin: bulletin(0) };
  Object.entries(S.all).forEach(([k, v]) => { if (!v.id) v.id = k; });
})(window.WS);
