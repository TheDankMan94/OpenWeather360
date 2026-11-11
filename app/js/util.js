/* Shared helpers: fetching, formatting, weather codes, astronomy. */
window.WS = window.WS || {};

(function (WS) {
  const params = new URLSearchParams(location.search);
  WS.params = params;
  WS.debug = params.has("debug");
  if (params.has("notrans")) document.documentElement.classList.add("notrans");

  WS.log = (...a) => { if (WS.debug) console.log("[ws]", ...a); };

  // Collected errors/warnings, handy for diagnostics: WS.errors in the browser console.
  WS.errors = [];
  window.addEventListener("error", (e) => WS.errors.push("error: " + e.message));
  window.addEventListener("unhandledrejection", (e) => WS.errors.push("rejection: " + (e.reason && e.reason.message || e.reason)));
  const warn = console.warn.bind(console);
  console.warn = (...a) => { WS.errors.push("warn: " + a.map(String).join(" ").slice(0, 200)); warn(...a); };

  WS.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const memo = new Map();
  /** GET JSON with timeout, optional in-memory TTL cache and localStorage fallback. */
  WS.fetchJSON = async function (url, opts = {}) {
    const ttl = opts.ttl || 0;
    const key = opts.key || url;
    const hit = memo.get(key);
    if (ttl && hit && Date.now() - hit.t < ttl) return hit.v;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), opts.timeout || 20000);
    try {
      const res = await fetch(url, { signal: ctl.signal, headers: opts.headers || {} });
      if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
      const v = await res.json();
      if (ttl) memo.set(key, { t: Date.now(), v });
      if (opts.persist) WS.store.set("cache:" + key, { t: Date.now(), v });
      return v;
    } catch (err) {
      if (opts.persist) {
        const old = WS.store.get("cache:" + key);
        if (old && Date.now() - old.t < opts.persist) return old.v;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  };

  WS.proxy = (url) => "/api/proxy?url=" + encodeURIComponent(url);

  WS.store = {
    get(k) { try { const s = localStorage.getItem("ws:" + k); return s ? JSON.parse(s) : null; } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem("ws:" + k, JSON.stringify(v)); } catch (e) { /* quota or disabled */ } },
  };

  WS.el = function (tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  };

  WS.esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  WS.round = (v) => (v == null || isNaN(v) ? "--" : Math.round(v));

  WS.compass = function (deg) {
    if (deg == null || isNaN(deg)) return "";
    const pts = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    return pts[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
  };

  /** Wind text in the style "NW 13" or "Calm". */
  WS.windText = function (dir, spd) {
    if (spd == null || isNaN(spd)) return "N/A";
    const s = Math.round(spd);
    if (s < 1) return "Calm";
    return (WS.compass(dir) + " " + s).trim();
  };

  WS.distKm = function (lat1, lon1, lat2, lon2) {
    const r = Math.PI / 180;
    const a = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2;
    return 12742 * Math.asin(Math.min(1, Math.sqrt(a)));
  };

  /* ---------- Location-local time ----------
   * Open-Meteo returns local wall-clock strings ("2026-10-29T18:00").  We turn
   * them into "shifted" Date objects whose UTC fields equal the local wall
   * time, and read them with getUTC*.  locNow(offset) gives "now" the same way. */
  WS.parseLocal = function (s) {
    const m = /^(\d{4})-(\d\d)-(\d\d)(?:T(\d\d):(\d\d))?/.exec(s || "");
    if (!m) return null;
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)));
  };
  WS.locNow = (offsetSec) => new Date(Date.now() + (offsetSec || 0) * 1000);

  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  WS.DAYS = DAYS;
  WS.MONTHS = MONTHS;
  WS.dayName = (d) => DAYS[d.getUTCDay()];
  WS.dayShort = (d) => DAYS[d.getUTCDay()].slice(0, 3);
  WS.monShort = (d) => MONTHS[d.getUTCMonth()].slice(0, 3);
  /** "6 am", "noon", "midnight" from a shifted date or hour number. */
  WS.hourLabel = function (h, style) {
    if (h instanceof Date) h = h.getUTCHours();
    if (h === 12) return style === "cap" ? "Noon" : "noon";
    if (h === 0) return style === "cap" ? "Midnight" : "midnight";
    return (h % 12) + (h < 12 ? " am" : " pm").replace(" ", style === "cap" ? "" : " ");
  };
  WS.clockTime = function (d) {
    let h = d.getUTCHours();
    const m = String(d.getUTCMinutes()).padStart(2, "0");
    const ap = h < 12 ? "am" : "pm";
    h = h % 12 || 12;
    return h + ":" + m + " " + ap;
  };

  /* ---------- Units ---------- */
  WS.units = function () {
    const metric = WS.config && WS.config.units === "metric";
    return {
      metric,
      temp: metric ? "celsius" : "fahrenheit",
      wind: metric ? "kmh" : "mph",
      precip: metric ? "mm" : "inch",
      windLbl: metric ? "km/h" : "mph",
      deg: metric ? "°C" : "°F",
    };
  };
  WS.pressure = function (hpa) {
    if (hpa == null) return "--";
    return WS.units().metric ? Math.round(hpa) + " mb" : (hpa * 0.0295300).toFixed(2);
  };
  /** Open-Meteo visibility comes in feet (imperial) or metres (metric). */
  WS.visibility = function (v) {
    if (v == null) return "--";
    if (WS.units().metric) return Math.min(16, Math.round(v / 1000)) + " km";
    const mi = v / 5280;
    return (mi >= 10 ? 10 : mi >= 1 ? Math.round(mi) : mi.toFixed(1)) + " mi";
  };

  /* ---------- WMO weather codes ---------- */
  // [day text, night text, day icon, night icon, ticker word]
  const W = {
    0: ["Sunny", "Clear", "sunny", "clear-night", "clear"],
    1: ["Mostly Sunny", "Mostly Clear", "mostly-sunny", "mostly-clear-night", "fair"],
    2: ["Partly Cloudy", "Partly Cloudy", "partly-cloudy-day", "partly-cloudy-night", "partly cloudy"],
    3: ["Cloudy", "Cloudy", "cloudy", "cloudy", "cloudy"],
    4: ["Mostly Cloudy", "Mostly Cloudy", "mostly-cloudy", "mostly-cloudy-night", "mostly cloudy"],
    45: ["Fog", "Fog", "fog", "fog", "fog"],
    48: ["Freezing Fog", "Freezing Fog", "fog", "fog", "fog"],
    51: ["Light Drizzle", "Light Drizzle", "drizzle", "drizzle", "drizzle"],
    53: ["Drizzle", "Drizzle", "drizzle", "drizzle", "drizzle"],
    55: ["Heavy Drizzle", "Heavy Drizzle", "drizzle", "drizzle", "drizzle"],
    56: ["Freezing Drizzle", "Freezing Drizzle", "freezing-rain", "freezing-rain", "frz drizzle"],
    57: ["Freezing Drizzle", "Freezing Drizzle", "freezing-rain", "freezing-rain", "frz drizzle"],
    61: ["Light Rain", "Light Rain", "rain", "rain", "light rain"],
    63: ["Rain", "Rain", "rain", "rain", "rain"],
    65: ["Heavy Rain", "Heavy Rain", "heavy-rain", "heavy-rain", "heavy rain"],
    66: ["Freezing Rain", "Freezing Rain", "freezing-rain", "freezing-rain", "frz rain"],
    67: ["Freezing Rain", "Freezing Rain", "freezing-rain", "freezing-rain", "frz rain"],
    71: ["Light Snow", "Light Snow", "snow", "snow", "light snow"],
    73: ["Snow", "Snow", "snow", "snow", "snow"],
    75: ["Heavy Snow", "Heavy Snow", "heavy-snow", "heavy-snow", "heavy snow"],
    77: ["Flurries", "Flurries", "flurries", "flurries", "flurries"],
    80: ["Showers", "Showers", "showers-day", "showers-night", "showers"],
    81: ["Showers", "Showers", "showers-day", "showers-night", "showers"],
    82: ["Heavy Showers", "Heavy Showers", "heavy-rain", "heavy-rain", "heavy showers"],
    85: ["Snow Showers", "Snow Showers", "snow-showers", "snow-showers", "snow showers"],
    86: ["Snow Showers", "Snow Showers", "heavy-snow", "heavy-snow", "snow showers"],
    95: ["T-Storms", "T-Storms", "thunder", "thunder", "t-storms"],
    96: ["Strong Storms", "Strong Storms", "thunder", "thunder", "strong storms"],
    99: ["Strong Storms", "Strong Storms", "thunder", "thunder", "strong storms"],
  };
  /** Sky condition from cloud cover %: 0 sunny, 1 mostly sunny, 2 partly cloudy, 4 mostly cloudy, 3 cloudy. */
  WS.skyCode = (cover) => (cover < 12 ? 0 : cover < 37 ? 1 : cover < 62 ? 2 : cover < 87 ? 4 : 3);
  WS.wx = function (code, isDay) {
    const row = W[code] || W[3];
    const day = isDay === undefined || isDay === null ? true : !!isDay;
    return { text: day ? row[0] : row[1], icon: day ? row[2] : row[3], word: row[4] };
  };
  /** Daily forecasts use the day text but "Sunny" reads oddly for multi-day; keep it as TWC did. */
  WS.wxDaily = (code) => WS.wx(code, true);

  /* ---------- Moon ---------- */
  const SYNODIC = 29.530588853;
  const NEW_MOON_REF = Date.UTC(2000, 0, 6, 18, 14) / 86400000; // days since epoch
  WS.moonAge = (date) => ((((date.getTime() / 86400000 - NEW_MOON_REF) % SYNODIC) + SYNODIC) % SYNODIC);
  /** Next four principal phases from a real Date: [{name, date}] (mean-phase approximation, ±1 day). */
  WS.moonPhases = function (from) {
    const names = ["NEW", "FIRST", "FULL", "LAST"];
    const out = [];
    const nowDays = from.getTime() / 86400000;
    let lunation = Math.floor((nowDays - NEW_MOON_REF) / SYNODIC);
    while (out.length < 4) {
      for (let q = 0; q < 4 && out.length < 4; q++) {
        const t = NEW_MOON_REF + (lunation + q / 4) * SYNODIC;
        if (t >= nowDays - 0.5) out.push({ name: names[q], frac: q / 4, date: new Date(t * 86400000) });
      }
      lunation++;
    }
    return out;
  };

  /* ---------- Text helpers ---------- */
  WS.titleCase = (s) => String(s || "").toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());

  /** Shrink font-size of el until it fits its box. */
  WS.fitText = function (el, minPx) {
    let size = parseFloat(getComputedStyle(el).fontSize);
    const min = minPx || 18;
    let guard = 40;
    while (guard-- > 0 && size > min && (el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2)) {
      size -= 2;
      el.style.fontSize = size + "px";
      el.style.lineHeight = Math.round(size * 1.22) + "px";
    }
  };
})(window.WS);
