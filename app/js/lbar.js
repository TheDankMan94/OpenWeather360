/* The "L-bar": left observation panel, mini radar, lower forecast bar, ticker, crawl, clock. */
(function (WS) {
  const L = (WS.lbar = {});
  const $ = (s) => document.querySelector(s);
  let subIdx = 0, fbIdx = 0, mini = null;

  /* ---------- Clock ---------- */
  function tickClock() {
    const d = new Date();
    $("#clock .date").textContent = WS.MONTHS[d.getMonth()].slice(0, 3) + " " + d.getDate();
    let h = d.getHours();
    const ap = h < 12 ? "am" : "pm";
    h = h % 12 || 12;
    const mm = String(d.getMinutes()).padStart(2, "0");
    $("#clock .time").textContent = `${h}:${mm}:${String(d.getSeconds()).padStart(2, "0")}${ap}`;
    $("#clock .alt-v1").textContent = `${WS.MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()} ${h}:${mm} ${ap}`;
    $("#clock .alt-l1").textContent = `${h}:${mm}:${String(d.getSeconds()).padStart(2, "0")} ${ap.toUpperCase()}`;
    $("#clock .alt-l2").textContent = `${WS.DAYS[d.getDay()].slice(0, 3).toUpperCase()} ${WS.MONTHS[d.getMonth()].slice(0, 3).toUpperCase()} ${d.getDate()}`;
  }

  /* ---------- Left observation panel ---------- */
  function obsLines(loc) {
    const c = loc.current;
    if (!c) return ["no report"];
    const u = WS.units();
    const lines = [
      "wind " + WS.windText(c.windDir, c.windSpd),
      "humidity " + WS.round(c.rh) + "%",
      "dew point " + WS.round(c.dew) + "°",
      "visibility " + WS.visibility(c.vis),
      "UV index " + uvCat(c.uv),
      c.text.toLowerCase(),
    ];
    if (c.gust != null && c.gust - c.windSpd > 8 && c.gust > 15) lines.splice(1, 0, "gusts " + WS.round(c.gust) + " " + u.windLbl);
    const t = c.temp;
    if (!u.metric ? t <= 40 && c.windSpd >= 3 : t <= 4 && c.windSpd >= 5) lines.push("wind chill " + WS.round(c.feels) + "°");
    if (!u.metric ? t >= 80 : t >= 27) lines.push("heat index " + WS.round(c.feels) + "°");
    lines.push("pressure " + WS.pressure(c.pressure) + (c.pressTrend === "rising" ? "↑" : c.pressTrend === "falling" ? "↓" : ""));
    return lines;
  }
  /* V1's top status line: "Forecast for <city>", "Today's High 65", "Currently Fair"... */
  function renderStatus(loc) {
    const c = loc.current, n = WS.locNow(loc.offset), t0 = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
    const d0 = (loc.daily || []).find((d) => d.date.getTime() === t0);
    const items = [["Forecast for", loc.name]];
    if (c) items.push(["Currently", c.text], ["Temperature", WS.round(c.temp) + "°"], ["Wind", WS.windText(c.windDir, c.windSpd)]);
    if (d0) items.push(["Today's High", WS.round(d0.hi) + "°"]);
    const it = items[subIdx % items.length];
    const el = $("#statusline");
    el.innerHTML = `<span>${WS.esc(it[0])}</span> <b>${WS.esc(it[1])}</b>`;
  }

  function uvCat(uv) {
    if (uv == null) return "--";
    const v = Math.round(uv);
    return v <= 2 ? "Low" : v <= 5 ? "Moderate" : v <= 7 ? "High" : v <= 10 ? "Very High" : "Extreme";
  }
  WS.uvCat = uvCat;

  function renderObs() {
    const loc = WS.data.main;
    if (!loc || !loc.current) return;
    $("#lbar-loc span").textContent = loc.name;
    $("#lbar-obs .temp").textContent = WS.round(loc.current.temp);
    $("#lbar-obs .icon").innerHTML = WS.icon(loc.current.icon);
    const lines = obsLines(loc);
    renderStatus(loc);
    const sub = $("#lbar-obs .sub");
    sub.style.opacity = 0;
    setTimeout(() => {
      sub.textContent = lines[subIdx % lines.length];
      sub.style.opacity = 1;
      subIdx++;
    }, 250);
    const sev = (WS.data.alerts || []).find((a) => a.severe);
    const al = $("#lbar-obs .alert");
    al.hidden = !sev;
    sub.hidden = !!sev; // the warning replaces the rotating observation line
    if (sev) al.textContent = sev.event;
  }

  /* ---------- Lower forecast bar ---------- */
  function daypartPicks(loc) {
    const now = WS.locNow(loc.offset);
    const hr = now.getUTCHours();
    const day0 = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    let hours, title;
    if (hr < 5) { hours = [6, 12, 15, 17]; title = "TODAY'S FORECAST"; }
    else if (hr < 11) { hours = [12, 15, 17, 20]; title = "TODAY'S FORECAST"; }
    else if (hr < 17) { hours = [20, 24, 30, 36]; title = "TONIGHT'S FORECAST"; }
    else { hours = [30, 36, 39, 41]; title = WS.dayName(new Date(day0 + 86400000)).toUpperCase() + "'S FORECAST"; }
    const picks = hours.map((h) => {
      const t = day0 + h * 3600000;
      return (loc.hourly || []).find((x) => x.t.getTime() === t);
    }).filter(Boolean);
    return { picks, title };
  }

  function fbDaypart(loc) {
    const { picks, title } = daypartPicks(loc);
    const wrap = WS.el("div");
    if (!picks.length) return null;
    const temps = picks.map((p) => p.temp);
    const mn = Math.min(...temps), mx = Math.max(...temps);
    picks.forEach((p, i) => {
      const cell = WS.el("div", "fb-dp");
      cell.style.left = i * 237 + "px";
      const hpx = Math.round(mx === mn ? 30 : 14 + ((p.temp - mn) / (mx - mn)) * 32);
      cell.innerHTML = `<div class="icon">${WS.icon(WS.wx(p.code, p.isDay).icon)}</div><div class="bar" style="height:${hpx}px"></div><div class="temp" style="top:${58 - hpx}px">${WS.round(p.temp)}</div><div class="time">${WS.hourLabel(p.t)}</div>`;
      wrap.appendChild(cell);
    });
    return { title, el: wrap };
  }

  function fbExtended(loc) {
    const wrap = WS.el("div");
    const now = WS.locNow(loc.offset);
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const days = (loc.daily || []).filter((d) => d.date.getTime() >= today + (now.getUTCHours() >= 15 ? 86400000 : 0)).slice(0, 5);
    days.forEach((d, i) => {
      const cell = WS.el("div", "fb-day");
      cell.style.left = i * 188 + "px";
      cell.innerHTML = `<div class="dn">${WS.dayShort(d.date).toUpperCase()}</div><div class="icon">${WS.icon(WS.wxDaily(d.code).icon)}</div><div class="hi">${WS.round(d.hi)}</div><div class="lo">${WS.round(d.lo)}</div>`;
      wrap.appendChild(cell);
    });
    return days.length ? { title: "5 DAY FORECAST", el: wrap } : null;
  }

  function fbText(loc) {
    const p = (loc.periods || [])[0];
    if (!p) return null;
    const short = shortText(p.text);
    const el = WS.el("div", "fb-text", WS.esc(short));
    el.style.position = "absolute";
    el.style.inset = "0";
    return { title: p.name.toUpperCase() + "'S FORECAST", el, fit: true };
  }
  /** Keep the first sentences that fit the lower bar. */
  function shortText(t) {
    const parts = String(t).split(/(?<=\.)\s+/);
    let out = "";
    for (const s of parts) {
      if ((out + " " + s).length > 92) break;
      out = (out + " " + s).trim();
    }
    return out || String(t).slice(0, 90) + "...";
  }

  L.showForecastBar = function (force) {
    const loc = WS.currentLoc || WS.data.main;
    if (!loc) return;
    const builders = [fbDaypart, fbText, fbExtended];
    let tries = 0, res = null;
    while (!res && tries < 3) {
      const b = builders[(force !== undefined ? force : fbIdx) % 3];
      res = b(loc);
      fbIdx++;
      tries++;
    }
    if (!res) return;
    $("#fbar .head .loc").textContent = loc.name.toUpperCase() + ":";
    $("#fbar .head em").textContent = res.title;
    const body = $("#fbar .body");
    const old = [...body.children];
    body.appendChild(res.el);
    if (res.fit) WS.fitText(res.el, 26);
    void res.el.offsetWidth; setTimeout(() => res.el.classList.add("in"), 20);
    old.forEach((o) => { o.classList.remove("in"); setTimeout(() => o.remove(), 600); });
  };

  /* ---------- Mini radar ---------- */
  function startMiniRadar() {
    const loc = WS.data.main;
    if (mini) mini.destroy();
    const zoom = WS.config.radar.miniZoom;
    $("#mini-radar .unavailable").hidden = true;
    mini = WS.maps.create($("#mini-radar .map"), {
      center: [loc.lon + 0.35, loc.lat], zoom, kind: "radar", radar: true, isUS: loc.isUS,
      labels: [{ name: loc.name, lat: loc.lat, lon: loc.lon, cls: "mini" }],
      onUnavailable: () => { $("#mini-radar .unavailable").hidden = false; },
    });
    $("#lbar-radar-title").textContent = loc.isUS ? `PAST ${WS.config.radar.hours} HOURS` : "PAST 2 HOURS";
  }
  L.refreshMiniRadar = function () {
    if (mini && WS.data.main) WS.maps.refreshRadar(mini, WS.data.main.isUS).catch((e) => console.warn(e));
  };

  /* ---------- Marquees ---------- */
  function Marquee(container, speed) {
    this.c = container; this.speed = speed; this.x = 0; this.items = []; this.queue = [];
    this.track = container.querySelector(".track");
    this.last = performance.now();
    this.offset = parseFloat(getComputedStyle(this.track).left) || 0;
  }
  Marquee.prototype.setItems = function (items) { this.items = items.slice(); };
  Marquee.prototype.fill = function () {
    const width = this.c.clientWidth;
    let guard = 0;
    while (this.track.scrollWidth + this.x < width * 2 && this.items.length && guard++ < 50) {
      for (const it of this.items) this.track.appendChild(WS.el("span", "", WS.esc(it)));
    }
  };
  Marquee.prototype.step = function (now) {
    const dt = Math.min(100, now - this.last);
    this.last = now;
    if (!this.items.length) return;
    this.x -= (this.speed * dt) / 1000;
    // drop spans that have fully scrolled off
    let first = this.track.firstElementChild;
    while (first && first.offsetLeft + first.offsetWidth + this.x + this.offset < -50) {
      const w = first.offsetWidth + parseFloat(getComputedStyle(first).marginRight || 0);
      this.x += w;
      first.remove();
      first = this.track.firstElementChild;
    }
    this.fill();
    this.track.style.transform = `translate3d(${Math.round(this.x)}px,0,0)`;
  };
  Marquee.prototype.reset = function () { this.track.innerHTML = ""; this.x = 0; };

  let tick, crawl;
  function loop(now) {
    tick.step(now);
    crawl.step(now);
    requestAnimationFrame(loop);
  }

  L.updateCrawl = function () {
    const alerts = WS.data.alerts || [];
    const msgs = [];
    const lab = $("#crawl .label");
    const sev = alerts.filter((a) => a.severe);
    if (alerts.length) {
      for (const a of alerts) msgs.push(a.headline || a.event);
    }
    const list = alerts.length ? msgs : (WS.config.crawlMessages || []).filter(Boolean);
    const changed = JSON.stringify(list) !== JSON.stringify(crawl.items);
    $("#crawl").classList.toggle("severe", sev.length > 0);
    lab.hidden = !alerts.length;
    lab.textContent = sev.length ? "WARNING" : "ADVISORY";
    if (changed) { crawl.setItems(list); crawl.reset(); }
  };
  L.updateTicker = function () {
    const items = WS.data.ticker || [];
    if (JSON.stringify(items) !== JSON.stringify(tick.items)) tick.setItems(items);
  };

  L.renderProvider = function () {
    const p = $("#provider");
    if (WS.config.providerLogo) {
      p.innerHTML = `<img alt="" src="${WS.esc(WS.config.providerLogo)}">`;
      return;
    }
    const words = String(WS.config.providerName || "").trim().split(/\s+/);
    const big = words.shift() || "";
    const rest = words.join(" ");
    const half = Math.ceil(words.length / 2);
    const small = rest ? `<div class="small">${WS.esc(words.slice(0, half).join(" "))}<br>${WS.esc(words.slice(half).join(" "))}</div>` : "";
    p.innerHTML = `<div class="big">${WS.esc(big.toLowerCase())}</div>${small}`;
  };

  L.init = function () {
    tickClock();
    setInterval(tickClock, 1000);
    $("#wordmark").textContent = WS.config.wordmark || "";
    L.renderProvider();
    tick = new Marquee($("#ticker"), 120);
    crawl = new Marquee($("#crawl"), 150);
    requestAnimationFrame(loop);
  };

  L.start = function () {
    renderObs();
    setInterval(renderObs, 4500);
    L.showForecastBar(0);
    setInterval(() => L.showForecastBar(), 10000);
    startMiniRadar();
    setInterval(L.refreshMiniRadar, 6 * 60000);
    L.updateTicker();
    L.updateCrawl();
  };

  L.refresh = function () {
    renderObs();
    L.updateTicker();
    L.updateCrawl();
  };
})(window.WS);
