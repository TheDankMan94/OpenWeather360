/* Data layer. Every source here is free and needs no API key:
 *  Open-Meteo (forecast, archive, air quality, marine), NWS api.weather.gov (US text
 *  forecasts and alerts), aviationweather.gov METARs, FAA NAS status, NOAA CO-OPS tides. */
(function (WS) {
  const OM = "https://api.open-meteo.com/v1/forecast";
  const D = (WS.data = { alerts: [], extras: [], nearby: [], ticker: [], updated: 0 });

  /* ---------------- Open-Meteo ---------------- */
  const CURRENT = "precipitation,cloud_cover,temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,is_day,weather_code,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility,uv_index";
  const HOURLY = "cloud_cover,temperature_2m,weather_code,precipitation_probability,wind_speed_10m,wind_direction_10m,is_day,pressure_msl,uv_index,relative_humidity_2m,soil_temperature_6cm,soil_moisture_3_to_9cm";
  const DAILY = "cloud_cover_mean,sunshine_duration,daylight_duration,weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,precipitation_sum,snowfall_sum,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,uv_index_max,et0_fao_evapotranspiration";
  const LIGHT_DAILY = "cloud_cover_mean,sunshine_duration,daylight_duration,weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max";

  function unitParams() {
    const u = WS.units();
    return `&temperature_unit=${u.temp}&wind_speed_unit=${u.wind}&precipitation_unit=${u.precip}&timezone=auto`;
  }

  /** Open-Meteo's own code says "Cloudy" for anything above ~50% cover; re-derive the sky from cloud cover. */
  const refine = (code, cover, dry) => (code != null && cover != null && (code <= 3 || (code >= 51 && dry)) ? WS.skyCode(cover) : code);
  /** One code for a whole day: the model's worst-case code is demoted when the precipitation chance is low. */
  function dayCode(code, cover, sunshine, daylight, pop) {
    if (code >= 51 && !(pop != null && pop < 30)) return code;
    let c = cover;
    if (sunshine != null && daylight) c = c != null ? (c + 100 * (1 - sunshine / daylight)) / 2 : 100 * (1 - sunshine / daylight);
    return c != null ? WS.skyCode(c) : code <= 3 ? code : 2;
  }

  function parseOM(r) {
    const out = { offset: r.utc_offset_seconds || 0, tz: r.timezone, elevation: r.elevation };
    if (r.current) {
      const c = r.current;
      out.current = {
        time: WS.parseLocal(c.time), temp: c.temperature_2m, rh: c.relative_humidity_2m, dew: c.dew_point_2m,
        feels: c.apparent_temperature, isDay: c.is_day, code: refine(c.weather_code, c.cloud_cover, !(c.precipitation >= (WS.units().metric ? 0.2 : 0.01))), cover: c.cloud_cover, pressure: c.pressure_msl,
        windSpd: c.wind_speed_10m, windDir: c.wind_direction_10m, gust: c.wind_gusts_10m, vis: c.visibility, uv: c.uv_index,
      };
      Object.assign(out.current, WS.wx(out.current.code, c.is_day));
    }
    if (r.hourly) {
      const h = r.hourly;
      out.hourly = h.time.map((t, i) => ({
        t: WS.parseLocal(t), temp: h.temperature_2m && h.temperature_2m[i], code: h.weather_code && refine(h.weather_code[i], h.cloud_cover && h.cloud_cover[i], h.precipitation_probability && h.precipitation_probability[i] < 25),
        pop: h.precipitation_probability && h.precipitation_probability[i], ws: h.wind_speed_10m && h.wind_speed_10m[i],
        wd: h.wind_direction_10m && h.wind_direction_10m[i], isDay: h.is_day && h.is_day[i], p: h.pressure_msl && h.pressure_msl[i],
        uv: h.uv_index && h.uv_index[i], rh: h.relative_humidity_2m && h.relative_humidity_2m[i],
        soilT: h.soil_temperature_6cm && h.soil_temperature_6cm[i], soilM: h.soil_moisture_3_to_9cm && h.soil_moisture_3_to_9cm[i],
        snowDepth: h.snow_depth && h.snow_depth[i], snowfall: h.snowfall && h.snowfall[i],
      }));
    }
    if (r.daily) {
      const d = r.daily, g = (k, i) => (d[k] ? d[k][i] : null);
      out.daily = d.time.map((t, i) => ({
        date: WS.parseLocal(t), code: dayCode(g("weather_code", i), g("cloud_cover_mean", i), g("sunshine_duration", i), g("daylight_duration", i), g("precipitation_probability_max", i)), hi: g("temperature_2m_max", i), lo: g("temperature_2m_min", i),
        sunrise: WS.parseLocal(g("sunrise", i)), sunset: WS.parseLocal(g("sunset", i)), pop: g("precipitation_probability_max", i),
        precip: g("precipitation_sum", i), snow: g("snowfall_sum", i), wmax: g("wind_speed_10m_max", i), gust: g("wind_gusts_10m_max", i),
        wdir: g("wind_direction_10m_dominant", i), uv: g("uv_index_max", i), et0: g("et0_fao_evapotranspiration", i),
      }));
    }
    return out;
  }

  /* NOAA's National Blend of Models (the guidance NWS forecasts are built from) is far closer to the
   * official forecast than Open-Meteo's default blend. It lacks pressure/UV/soil, so it is laid over
   * the default response wherever it has values. */
  const NBM = "ncep_nbm_conus";
  const inConus = (p) => p.lat > 24.5 && p.lat < 49.5 && p.lon > -125 && p.lon < -66.5;
  function overlay(base, nbm) {
    if (!nbm || nbm.error) return base;
    if (nbm.current && base.current) for (const k in nbm.current) if (k !== "time" && k !== "interval" && nbm.current[k] != null) base.current[k] = nbm.current[k];
    for (const sec of ["hourly", "daily"]) {
      if (!nbm[sec] || !base[sec]) continue;
      const at = new Map(nbm[sec].time.map((t, i) => [t, i]));
      base[sec].time.forEach((t, i) => {
        const j = at.get(t);
        if (j === undefined) return;
        for (const k in nbm[sec]) if (k !== "time" && base[sec][k] && nbm[sec][k][j] != null) base[sec][k][i] = nbm[sec][k][j];
      });
    }
    return base;
  }

  /** Fetch Open-Meteo for many points in one request. Returns array aligned with points. */
  async function omMulti(points, fields, ttl, nbm) {
    if (!points.length) return [];
    const lat = points.map((p) => (+p.lat).toFixed(3)).join(",");
    const lon = points.map((p) => (+p.lon).toFixed(3)).join(",");
    const url = `${OM}?latitude=${lat}&longitude=${lon}${fields}${unitParams()}`;
    const opts = { ttl: ttl || 9 * 60000, persist: 6 * 3600000 };
    const list = (r) => (Array.isArray(r) ? r : [r]);
    let r = list(await WS.fetchJSON(url, opts));
    if (nbm && points.every(inConus)) {
      const n = await WS.fetchJSON(url + "&models=" + NBM, opts).catch(() => null);
      if (n) { const nl = list(n); r = r.map((b, i) => overlay(b, nl[i])); }
    }
    return r.map(parseOM);
  }

  async function fullForecast(p) {
    const [r] = await omMulti([p], `&current=${CURRENT}&hourly=${HOURLY}&daily=${DAILY}&forecast_days=8&past_days=1`, 0, true);
    // pressure tendency from the last 3 hours
    const now = r.current && r.current.time;
    if (now && r.hourly) {
      const idx = r.hourly.findIndex((h) => h.t >= now);
      const prev = r.hourly[Math.max(0, idx - 3)];
      if (prev && prev.p != null && r.current.pressure != null) {
        const diff = r.current.pressure - prev.p;
        r.current.pressTrend = diff > 0.6 ? "rising" : diff < -0.6 ? "falling" : "steady";
      }
    }
    return r;
  }

  /* ---------------- Location ---------------- */
  function nearestCity(lat, lon, maxKm) {
    let best = null, bd = Infinity;
    for (const c of WS_CITIES) {
      if (Math.abs(c[1] - lat) > 2 || Math.abs(c[2] - lon) > 3) continue;
      const d = WS.distKm(lat, lon, c[1], c[2]);
      if (d < bd) { bd = d; best = c; }
    }
    return best && bd <= (maxKm || 40) ? { name: best[0], cc: best[4], dist: bd } : null;
  }
  WS.nearestCity = nearestCity;

  async function resolveLocation() {
    const cfg = WS.config.location;
    if (!cfg.auto && cfg.lat != null && cfg.lon != null && cfg.lat !== "" && cfg.lon !== "") {
      return { name: cfg.name, lat: +cfg.lat, lon: +cfg.lon, cc: cfg.cc || "" };
    }
    const cached = WS.store.get("autoloc");
    if (cached && Date.now() - cached.t < 86400000) return cached.v;
    const ip = await WS.fetchJSON(WS.proxy("http://ip-api.com/json/?fields=status,city,regionName,countryCode,lat,lon"), { timeout: 10000 });
    if (ip.status !== "success") throw new Error("Could not determine location automatically. Set it in Settings.");
    const v = { name: ip.city, lat: ip.lat, lon: ip.lon, cc: ip.countryCode };
    WS.store.set("autoloc", { t: Date.now(), v });
    return v;
  }

  /* ---------------- NWS (United States) ---------------- */
  async function nwsPoint(lat, lon) {
    const key = `nwspt:${lat.toFixed(3)},${lon.toFixed(3)}`;
    const c = WS.store.get(key);
    if (c && Date.now() - c.t < 7 * 86400000) return c.v;
    const r = await WS.fetchJSON(WS.proxy(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`), { timeout: 12000 });
    const p = r.properties;
    const v = { forecast: p.forecast, city: p.relativeLocation && p.relativeLocation.properties.city, state: p.relativeLocation && p.relativeLocation.properties.state, office: p.cwa, radar: p.radarStation };
    WS.store.set(key, { t: Date.now(), v });
    return v;
  }

  async function nwsPeriods(pt) {
    const r = await WS.fetchJSON(WS.proxy(pt.forecast), { ttl: 15 * 60000, timeout: 15000, persist: 12 * 3600000 });
    return r.properties.periods.map((p) => ({ name: p.name, text: p.detailedForecast, short: p.shortForecast, isDay: p.isDaytime, temp: p.temperature, date: String(p.startTime).slice(0, 10), pop: p.probabilityOfPrecipitation && p.probabilityOfPrecipitation.value }));
  }

  /** NWS short forecast ("Patchy Frost then Partly Sunny") to our condition code, or null. */
  function nwsCode(short, pop) {
    const segs = String(short || "").toLowerCase().split(/\s+then\s+/);
    const wet = (s) => {
      if (/slight chance/.test(s) || (pop != null && pop < 30)) return null;
      if (/thunder|t-storm/.test(s)) return 95;
      if (/freezing rain|freezing drizzle|sleet|wintry mix|ice pellets/.test(s)) return 66;
      if (/blizzard|heavy snow/.test(s)) return 75;
      if (/snow showers/.test(s)) return 85;
      if (/flurries/.test(s)) return 77;
      if (/snow/.test(s)) return 73;
      if (/heavy rain/.test(s)) return 65;
      if (/showers/.test(s)) return 80;
      if (/drizzle/.test(s)) return 53;
      if (/rain/.test(s)) return 63;
      return null;
    };
    for (const s of segs) { const c = wet(s); if (c) return c; }
    for (let i = segs.length - 1; i >= 0; i--) {
      const s = segs[i];
      if (/mostly cloudy|considerable cloudiness/.test(s)) return 4;
      if (/partly (cloudy|sunny)/.test(s)) return 2;
      if (/mostly (sunny|clear)/.test(s)) return 1;
      if (/sunny|clear/.test(s)) return 0;
      if (/cloudy|overcast/.test(s)) return 3;
      if (/fog/.test(s) && !/patchy|areas of/.test(s)) return 45;
    }
    return null;
  }

  /** The official wording wins over the model: daily icons follow the NWS daytime period. */
  function applyNws(loc) {
    for (const d of loc.daily || []) {
      const key = d.date.toISOString().slice(0, 10);
      const p = (loc.periods || []).find((x) => x.isDay && x.date === key);
      const c = p ? nwsCode(p.short, p.pop) : null;
      if (c != null) d.code = c;
    }
    const now = loc.periods && loc.periods[0];
    if (now && now.isDay === false && loc.current && loc.current.isDay === 0) {
      const c = nwsCode(now.short, now.pop);
      if (c != null && c !== 45) { loc.current.code = c; Object.assign(loc.current, WS.wx(c, 0)); }
    }
  }

  /* ---------------- Observations (nearest METAR, worldwide) ---------------- */
  async function observe(loc) {
    const b = [loc.lat - 0.7, loc.lon - 0.9, loc.lat + 0.7, loc.lon + 0.9].map((v) => v.toFixed(2)).join(",");
    const list = await WS.fetchJSON(WS.proxy(`https://aviationweather.gov/api/data/metar?bbox=${b}&format=json`), { ttl: 5 * 60000, timeout: 12000 });
    const now = Date.now() / 1000;
    const m = (list || [])
      .filter((x) => x.temp != null && x.lat != null && now - x.obsTime < 3 * 3600)
      .map((x) => Object.assign({ d: WS.distKm(loc.lat, loc.lon, x.lat, x.lon) }, x))
      .sort((p, q) => p.d - q.d)[0];
    return m && m.d < 60 ? m : null;
  }
  function applyObs(loc, m) {
    const c = loc.current;
    if (!c || !m) return;
    const metric = WS.units().metric;
    const word = metarWord(m);
    c.code = metarCode(word);
    Object.assign(c, WS.wx(c.code, c.isDay));
    c.temp = metric ? m.temp : m.temp * 9 / 5 + 32;
    if (m.dewp != null) {
      c.dew = metric ? m.dewp : m.dewp * 9 / 5 + 32;
      const e = (t) => Math.exp(17.625 * t / (243.04 + t));
      c.rh = Math.round(Math.min(100, 100 * e(m.dewp) / e(m.temp)));
    }
    if (m.wspd != null) { c.windSpd = m.wspd * (metric ? 1.852 : 1.15078); if (typeof m.wdir === "number") c.windDir = m.wdir; }
    c.gust = m.wgst != null ? m.wgst * (metric ? 1.852 : 1.15078) : null;
    if (m.altim != null) c.pressure = m.altim;
    if (m.visib != null) { const mi = parseFloat(m.visib); if (!isNaN(mi)) c.vis = mi * (metric ? 1609.34 : 5280); }
    c.station = m.icaoId;
  }

  const SEVERE_EVENTS = /(Tornado|Severe Thunderstorm|Flash Flood|Hurricane|Tropical Storm|Blizzard|Ice Storm|Winter Storm|Extreme Wind|Storm Surge|Dust Storm|Excessive Heat|Extreme Heat|Extreme Cold|Tsunami|Special Marine) Warning|Emergency/;
  async function nwsAlerts(lat, lon) {
    const r = await WS.fetchJSON(WS.proxy(`https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`), { ttl: 60000, timeout: 12000 });
    return (r.features || []).map((f) => {
      const p = f.properties;
      return {
        event: p.event, headline: p.headline, severity: p.severity, ends: p.ends || p.expires, sender: p.senderName,
        description: p.description || "", instruction: p.instruction || "", area: p.areaDesc,
        severe: SEVERE_EVENTS.test(p.event),
      };
    });
  }

  /* ---------------- Text forecast generator (used outside the US) ---------------- */
  const PHRASE_DAY = { 0: "Sunny skies", 1: "Mostly sunny", 2: "Partly cloudy", 3: "Cloudy", 45: "Areas of fog", 48: "Areas of freezing fog", 51: "Periods of drizzle", 53: "Drizzle", 55: "Drizzle", 56: "Freezing drizzle", 57: "Freezing drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Freezing rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Flurries", 80: "Scattered showers", 81: "Showers", 82: "Heavy showers", 85: "Snow showers", 86: "Snow showers", 95: "Thunderstorms", 96: "Strong thunderstorms", 99: "Strong thunderstorms" };
  const PHRASE_NIGHT = Object.assign({}, PHRASE_DAY, { 0: "Clear skies", 1: "Mostly clear", 80: "A few showers" });
  function windPhrase(spdLo, spdHi, dir) {
    const u = WS.units().windLbl;
    if (spdHi == null || spdHi < 5) return "Winds light and variable.";
    const lo = Math.max(0, Math.floor(spdLo / 5) * 5), hi = Math.max(lo + 5, Math.ceil(spdHi / 5) * 5);
    return `Winds ${WS.compass(dir)} at ${lo} to ${hi} ${u}.`;
  }
  function dominant(codes) {
    // weight wet codes higher so a few hours of rain is mentioned
    const score = {};
    for (const c of codes) score[c] = (score[c] || 0) + (c >= 51 ? 2.2 : 1);
    return +Object.keys(score).sort((a, b) => score[b] - score[a])[0];
  }
  function genPeriods(loc) {
    const out = [];
    const now = WS.locNow(loc.offset);
    const hours = loc.hourly || [];
    const span = (from, to) => hours.filter((h) => h.t >= from && h.t < to);
    const hr = now.getUTCHours();
    const day0 = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    for (let i = 0; i < 4; i++) {
      const dStart = new Date(day0 + i * 86400000);
      const dayRow = (loc.daily || []).find((d) => d.date.getTime() === dStart.getTime());
      if (!dayRow) continue;
      const dayHours = span(new Date(dStart.getTime() + 7 * 3600000), new Date(dStart.getTime() + 19 * 3600000));
      const nightHours = span(new Date(dStart.getTime() + 19 * 3600000), new Date(dStart.getTime() + 31 * 3600000));
      const nightLo = nightHours.length ? Math.min(...nightHours.map((h) => h.temp)) : dayRow.lo;
      const mk = (hrs, isDay, name) => {
        if (!hrs.length) return;
        const code = isDay ? dayRow.code : dominant(hrs.map((h) => h.code));
        const ws = hrs.map((h) => h.ws || 0);
        const wdir = hrs[Math.floor(hrs.length / 2)].wd;
        const pop = Math.max(...hrs.map((h) => h.pop || 0));
        let t = (isDay ? PHRASE_DAY : PHRASE_NIGHT)[code] || "Cloudy";
        t += isDay ? `. High ${WS.round(dayRow.hi)}. ` : `. Low ${WS.round(nightLo)}. `;
        t += windPhrase(Math.min(...ws), Math.max(...ws), wdir);
        if (pop >= 30) t += ` Chance of precip ${Math.round(pop / 10) * 10}%.`;
        out.push({ name, text: t, isDay });
      };
      if (i === 0) {
        if (hr < 15) mk(dayHours.filter((h) => h.t >= now).length ? dayHours.filter((h) => h.t >= now) : dayHours, true, "Today");
        mk(nightHours, false, "Tonight");
      } else {
        mk(dayHours, true, WS.dayName(dStart));
        mk(nightHours, false, WS.dayName(dStart) + " Night");
      }
    }
    return out;
  }
  WS.genPeriods = genPeriods;

  /* ---------------- Almanac from the Open-Meteo archive ---------------- */
  async function almanac(loc) {
    const now = WS.locNow(loc.offset);
    const md = String(now.getUTCMonth() + 1).padStart(2, "0") + "-" + String(now.getUTCDate()).padStart(2, "0");
    const key = `alm:${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}:${md}:${WS.units().temp}`;
    const c = WS.store.get(key);
    if (c) return c;
    const end = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${loc.lat.toFixed(3)}&longitude=${loc.lon.toFixed(3)}&start_date=1940-01-01&end_date=${end}&daily=temperature_2m_max,temperature_2m_min${unitParams()}`;
    const r = await WS.fetchJSON(url, { timeout: 45000 });
    const t = r.daily.time, hi = r.daily.temperature_2m_max, lo = r.daily.temperature_2m_min;
    let rh = -Infinity, rhy = 0, rl = Infinity, rly = 0, sh = 0, sl = 0, n = 0;
    for (let i = 0; i < t.length; i++) {
      if (t[i].slice(5) !== md || hi[i] == null || lo[i] == null) continue;
      const y = +t[i].slice(0, 4);
      if (hi[i] > rh) { rh = hi[i]; rhy = y; }
      if (lo[i] < rl) { rl = lo[i]; rly = y; }
      if (y >= 1991 && y <= 2020) { sh += hi[i]; sl += lo[i]; n++; }
    }
    const v = { avgHi: n ? sh / n : null, avgLo: n ? sl / n : null, recHi: rh, recHiYear: rhy, recLo: rl, recLoYear: rly };
    WS.store.set(key, v);
    return v;
  }

  /* ---------------- Air quality / pollen ---------------- */
  async function airQuality(loc) {
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${loc.lat.toFixed(3)}&longitude=${loc.lon.toFixed(3)}&current=us_aqi,pm2_5,ozone,alder_pollen,birch_pollen,grass_pollen,ragweed_pollen,olive_pollen,mugwort_pollen&hourly=us_aqi&forecast_days=2&timezone=auto`;
    const r = await WS.fetchJSON(url, { ttl: 30 * 60000, persist: 6 * 3600000 });
    const c = r.current || {};
    const tomorrow = WS.locNow(r.utc_offset_seconds).getUTCDate() + 1;
    let fmax = null;
    (r.hourly ? r.hourly.time : []).forEach((t, i) => {
      if (WS.parseLocal(t).getUTCDate() === tomorrow && r.hourly.us_aqi[i] != null) fmax = Math.max(fmax || 0, r.hourly.us_aqi[i]);
    });
    const pollen = {};
    ["grass", "birch", "alder", "ragweed", "olive", "mugwort"].forEach((k) => { if (c[k + "_pollen"] != null) pollen[k] = c[k + "_pollen"]; });
    return { aqi: c.us_aqi, pm25: c.pm2_5, ozone: c.ozone, tomorrow: fmax, pollen: Object.keys(pollen).length ? pollen : null };
  }

  /* ---------------- Marine / tides ---------------- */
  async function marine(loc) {
    const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${loc.lat.toFixed(3)}&longitude=${loc.lon.toFixed(3)}&current=wave_height,wave_direction,wave_period,sea_surface_temperature&daily=wave_height_max&forecast_days=3&timezone=auto&length_unit=${WS.units().metric ? "metric" : "imperial"}&temperature_unit=${WS.units().temp}`;
    const r = await WS.fetchJSON(url, { ttl: 60 * 60000 });
    const c = r.current || {};
    if (c.wave_height == null && c.sea_surface_temperature == null) return null;
    return { wave: c.wave_height, waveDir: c.wave_direction, period: c.wave_period, sst: c.sea_surface_temperature, maxWaves: r.daily ? r.daily.wave_height_max : [] };
  }

  async function tides(loc) {
    let id = WS.config.beach.tideStation, name = WS.config.beach.tideStationName;
    if (!id) {
      let list = WS.store.get("tidestations");
      if (!list || Date.now() - list.t > 30 * 86400000) {
        const r = await WS.fetchJSON(WS.proxy("https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions"), { timeout: 30000 });
        list = { t: Date.now(), v: r.stations.map((s) => [s.id, s.name, +s.lat, +s.lng]) };
        WS.store.set("tidestations", list);
      }
      let best = null, bd = Infinity;
      for (const s of list.v) {
        const d = WS.distKm(loc.lat, loc.lon, s[2], s[3]);
        if (d < bd) { bd = d; best = s; }
      }
      if (!best || bd > 60) return null;
      id = best[0]; name = WS.titleCase(best[1]).replace(/\s*\(.*\)\s*/g, "");
    }
    const n = WS.locNow(loc.offset);
    const begin = `${n.getUTCFullYear()}${String(n.getUTCMonth() + 1).padStart(2, "0")}${String(n.getUTCDate()).padStart(2, "0")}`;
    const r = await WS.fetchJSON(WS.proxy(`https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=predictions&station=${id}&begin_date=${begin}&range=48&datum=MLLW&units=${WS.units().metric ? "metric" : "english"}&time_zone=lst_ldt&interval=hilo&format=json`), { ttl: 3 * 3600000 });
    if (!r.predictions) return null;
    return { name, events: r.predictions.map((p) => ({ t: WS.parseLocal(p.t.replace(" ", "T")), type: p.type === "H" ? "High" : "Low", v: +p.v })) };
  }

  /* ---------------- Nearby towns ---------------- */
  function pickCities(lat, lon, minKm, maxKm, count, sepKm, exclude, country) {
    const cands = [];
    for (const c of WS_CITIES) {
      if (Math.abs(c[1] - lat) > maxKm / 100 + 0.5 || Math.abs(c[2] - lon) > maxKm / 70 + 0.5) continue;
      const d = WS.distKm(lat, lon, c[1], c[2]);
      if (country && c[4] !== country) continue;
      if (d >= minKm && d <= maxKm) cands.push({ name: c[0], lat: c[1], lon: c[2], pop: c[3], cc: c[4], d });
    }
    cands.sort((a, b) => b.pop - a.pop);
    const out = [];
    const ex = (exclude || []).map((n) => String(n).toLowerCase());
    for (const c of cands) {
      if (out.length >= count) break;
      if (ex.includes(c.name.toLowerCase())) continue;
      if (out.some((o) => WS.distKm(o.lat, o.lon, c.lat, c.lon) < sepKm)) continue;
      out.push(c);
    }
    return out;
  }
  WS.pickCities = pickCities;

  /* ---------------- Airports ---------------- */
  function metarWord(m) {
    const wx = m.wxString || "";
    if (/TS/.test(wx)) return "t-storm";
    if (/FZRA|FZDZ/.test(wx)) return "frz rain";
    if (/SN/.test(wx)) return /-/.test(wx) ? "light snow" : "snow";
    if (/RA|DZ/.test(wx)) return /-/.test(wx) ? "light rain" : /\+/.test(wx) ? "heavy rain" : "rain";
    if (/FG/.test(wx)) return "fog";
    if (/BR|HZ/.test(wx)) return wx.includes("HZ") ? "haze" : "mist";
    const cov = m.cover || (m.clouds && m.clouds[0] && m.clouds[0].cover) || "";
    return { CLR: "clear", SKC: "clear", CAVOK: "clear", FEW: "fair", SCT: "partly cloudy", BKN: "mostly cloudy", OVC: "cloudy", OVX: "obscured" }[cov] || "fair";
  }
  function metarCode(word) {
    return { "t-storm": 95, "frz rain": 66, "light snow": 71, snow: 73, "light rain": 61, rain: 63, "heavy rain": 65, fog: 45, haze: 45, mist: 45, clear: 0, fair: 1, "partly cloudy": 2, "mostly cloudy": 4, cloudy: 3, obscured: 45 }[word];
  }
  function faaStatus(ev) {
    if (!ev) return { text: "No Delay", bad: false };
    if (ev.airportClosure) return { text: "Closed", bad: true };
    if (ev.groundStop) return { text: "Ground Stop", bad: true };
    if (ev.groundDelay) return { text: `Delays ~${Math.round(ev.groundDelay.avgDelay || 0)} min`, bad: true };
    const ad = ev.arrivalDelay || ev.departureDelay;
    if (ad && ad.arrivalDeparture) {
      const mn = parseInt(ad.arrivalDeparture.min, 10), mx = parseInt(ad.arrivalDeparture.max, 10);
      return { text: `Delays ${mn}-${mx} min`, bad: true };
    }
    return { text: "No Delay", bad: false };
  }
  async function airports(list) {
    const ids = list.map((a) => a.icao).join(",");
    const [metars, events] = await Promise.all([
      WS.fetchJSON(WS.proxy(`https://aviationweather.gov/api/data/metar?ids=${ids}&format=json`), { ttl: 8 * 60000 }).catch(() => []),
      WS.fetchJSON(WS.proxy("https://nasstatus.faa.gov/api/airport-events"), { ttl: 4 * 60000 }).catch(() => []),
    ]);
    const metric = WS.units().metric;
    return list.map((a) => {
      const m = (metars || []).find((x) => x.icaoId === a.icao);
      const ev = (events || []).find((x) => x.airportId === a.iata);
      const word = m ? metarWord(m) : null;
      return Object.assign({}, a, {
        temp: m && m.temp != null ? (metric ? m.temp : m.temp * 9 / 5 + 32) : null,
        word, code: word ? metarCode(word) : null, status: faaStatus(ev),
        lat: m ? m.lat : null, lon: m ? m.lon : null,
      });
    });
  }

  /** Nearest major airports to the location: from the national list plus METAR station lookup. */
  async function localAirports(loc) {
    try {
      const b = [loc.lat - 1.2, loc.lon - 1.6, loc.lat + 1.2, loc.lon + 1.6].map((v) => v.toFixed(2)).join(",");
      const r = await WS.fetchJSON(WS.proxy(`https://aviationweather.gov/api/data/stationinfo?bbox=${b}&format=json`), { ttl: 24 * 3600000, timeout: 15000 });
      const ok = (r || []).filter((s) => s.iataId && s.icaoId && /^K|^P|^C|^T/.test(s.icaoId) && (s.siteType || []).includes("METAR"));
      ok.forEach((s) => (s.d = WS.distKm(loc.lat, loc.lon, s.lat, s.lon)));
      // prefer stations that FAA tracks (larger airports have TAF too)
      ok.sort((a, b) => ((b.siteType || []).includes("TAF") - (a.siteType || []).includes("TAF")) || a.d - b.d);
      return ok.slice(0, 3).map((s) => ({ name: s.site.replace(/ (Intl|International) .*$/, " Int'l").replace(/\/.*$/, ""), icao: s.icaoId, iata: s.iataId }));
    } catch (e) {
      return [];
    }
  }

  /* ---------------- Public loaders ---------------- */
  async function safe(label, fn, fallback) {
    try {
      return await fn();
    } catch (e) {
      console.warn("[data] " + label + " failed:", e.message || e);
      return fallback;
    }
  }

  async function loadLocation(p, opts) {
    const loc = Object.assign({}, p);
    const wantObs = !opts || opts.full !== false;
    const obsP = wantObs ? safe("observation", () => observe(p), null) : null;
    Object.assign(loc, await fullForecast(p));
    loc.isUS = loc.cc ? ["US", "PR", "GU", "VI", "AS", "MP"].includes(loc.cc) : null;
    if (loc.isUS !== false && !WS.units().metric) {
      const pt = await safe("nws point", () => nwsPoint(loc.lat, loc.lon), null);
      if (pt) {
        loc.isUS = true;
        if (!loc.name && pt.city) loc.name = pt.city;
        loc.periods = await safe("nws forecast", () => nwsPeriods(pt), null);
      } else if (loc.isUS === null) loc.isUS = false;
    } else if (loc.isUS === null) {
      loc.isUS = !!(await safe("nws point", () => nwsPoint(loc.lat, loc.lon), null));
    }
    if (!loc.periods || !loc.periods.length) loc.periods = genPeriods(loc);
    else applyNws(loc);
    if (obsP) applyObs(loc, await obsP);
    if (!loc.name) {
      const nc = nearestCity(loc.lat, loc.lon, 60);
      loc.name = nc ? nc.name : `${loc.lat.toFixed(2)}, ${loc.lon.toFixed(2)}`;
    }
    return loc;
  }

  WS.loadAll = async function (status) {
    const say = (s) => status && status(s);
    if (!D.place) {
      say("Locating...");
      D.place = await resolveLocation();
      if (!D.place.cc) {
        const nc = nearestCity(D.place.lat, D.place.lon, 200);
        D.place.cc = nc ? nc.cc : "";
      }
    }
    say("Loading forecast...");
    const main = await loadLocation(D.place);
    // keep extras from the previous load (almanac etc.) until the background phase replaces them
    if (D.main) ["almanac", "air", "marine", "tides"].forEach((k) => { if (main[k] === undefined) main[k] = D.main[k]; });
    D.main = main;
    D.alerts = main.isUS ? await safe("alerts", () => nwsAlerts(main.lat, main.lon), D.alerts || []) : [];
    if (WS.params.get("severe") === "test") {
      D.alerts = [{ event: "Severe Thunderstorm Warning", headline: "Severe Thunderstorm Warning issued for " + main.name + " (TEST)", severity: "Severe", ends: new Date(Date.now() + 3600000).toISOString(), description: "THIS IS A TEST MESSAGE. At 9:45 PM, a severe thunderstorm was located near " + main.name + ", moving east at 35 mph.\n\nHAZARD...60 mph wind gusts and quarter size hail.\n\nIMPACT...Expect damage to roofs, siding, and trees.", instruction: "For your protection move to an interior room on the lowest floor of a building.", area: main.name, severe: true }];
    }

    say("Loading area conditions...");
    const nearbyPts = pickCities(main.lat, main.lon, 6, 70, 8, 14, [main.name]);
    const nearbyWx = await safe("nearby", () => omMulti(nearbyPts, `&current=${CURRENT}`, 0, true), []);
    D.nearby = nearbyPts.map((p, i) => Object.assign({}, p, nearbyWx[i] ? nearbyWx[i].current : {})).filter((n) => n.temp != null);
    D.ticker = buildTicker();
    D.updated = Date.now();
    // Everything else loads in the background so the channel starts quickly.
    D.pending = loadSecondary(main).catch((e) => console.warn("[data] background load failed", e)).finally(() => { D.pending = null; });
    return D;
  };

  async function loadSecondary(main) {
    const extrasP = (async () => {
      const [alm, aq, mar] = await Promise.all([
        safe("almanac", () => almanac(main), null),
        safe("air quality", () => airQuality(main), null),
        safe("marine", () => marine(main), null),
      ]);
      main.almanac = alm; main.air = aq; main.marine = mar;
      main.tides = mar ? await safe("tides", () => tides(main), null) : null;
    })();
    const extraCfg = (WS.config.extraCities || []).filter((c) => c && c.lat != null && c.lon != null);
    const autoExtra = extraCfg.length ? [] : pickCities(main.lat, main.lon, 25, 130, WS.config.autoExtraCities || 0, 40, [main.name]);
    const extraPts = (extraCfg.length ? extraCfg : autoExtra).map((c) => ({ name: c.name, lat: +c.lat, lon: +c.lon, cc: c.cc || D.place.cc }));

    const [, extras, tick, natAir, locAirList] = await Promise.all([
      extrasP,
      Promise.all(extraPts.map((p) => safe("extra " + p.name, () => loadLocation(p, { full: false }), null))),
      main.isUS ? safe("ticker airports", () => airports(WS.config.tickerAirports), []) : [],
      main.isUS ? safe("national airports", () => airports(WS.config.nationalAirports), []) : [],
      main.isUS ? localAirports(main) : [],
    ]);
    D.extras = extras.filter(Boolean);
    D.tickerAirports = tick;
    D.nationalAirports = natAir;
    D.localAirports = locAirList.length ? await safe("local airports", () => airports(locAirList), []) : [];

    const travelPts = pickCities(main.lat, main.lon, 60, 700, 7, 230, [main.name], D.place.cc || null);
    const dests = WS.config.destinations || [];
    const intl = WS.config.international;
    const intlRegions = rotateRegions(intl.regions, intl.maxMaps);
    const intlPts = intlRegions.flatMap((r) => r.cities.map((c) => ({ name: c[0], lat: c[1], lon: c[2] })));
    const intlFc = (intl.forecast || []).map((c) => ({ name: c[0], lat: c[1], lon: c[2] }));
    const light = `&daily=${LIGHT_DAILY}&current=temperature_2m,weather_code,precipitation,cloud_cover,is_day&forecast_days=3`;
    const [travelWx, destWx, intlWx, intlFcWx] = await Promise.all([
      safe("travel", () => omMulti(travelPts, light, 30 * 60000, true), []),
      safe("destinations", () => omMulti(dests, light, 30 * 60000, true), []),
      safe("international maps", () => omMulti(intlPts, light, 60 * 60000), []),
      safe("international", () => omMulti(intlFc, light, 60 * 60000), []),
    ]);
    const join = (pts, wx) => pts.map((p, i) => Object.assign({}, p, wx[i] || {})).filter((p) => p.daily);
    D.travel = join(travelPts, travelWx);
    D.destinations = join(dests, destWx);
    let k = 0;
    D.intlRegions = intlRegions.map((r) => Object.assign({}, r, { cities: r.cities.map((c) => Object.assign({ name: c[0], lat: c[1], lon: c[2] }, intlWx[k++] || {})).filter((c) => c.daily) }));
    D.intlForecast = join(intlFc, intlFcWx);

    D.ski = await safe("ski", skiReport, []);
    D.ticker = buildTicker();
    D.secondaryAt = Date.now();
  }

  /* ---------------- Ski resorts (Open-Meteo snow depth / snowfall) ---------------- */
  async function skiReport() {
    const pts = (WS.config.ski || []).filter((p) => p && p.lat != null);
    if (!pts.length) return [];
    const metric = WS.units().metric;
    const fields = "&hourly=snow_depth,snowfall&daily=snowfall_sum,temperature_2m_max&past_days=1&forecast_days=4";
    const r = await omMulti(pts, fields, 30 * 60000);
    const k = metric ? 100 : 12; // snow_depth comes back in m (metric) or ft (imperial); snowfall in cm or inches
    const sn = 1;
    return pts.map((p, i) => {
      const w = r[i];
      if (!w || !w.hourly) return null;
      const now = WS.locNow(w.offset).getTime();
      const hrs = w.hourly;
      const idx = Math.max(0, hrs.findIndex((h) => h.t.getTime() >= now));
      return Object.assign({}, p, {
        base: (hrs[idx].snowDepth || 0) * k,
        new24: hrs.slice(Math.max(0, idx - 24), idx + 1).reduce((a, h) => a + (h.snowfall || 0), 0) * sn,
        next3: hrs.slice(idx + 1, idx + 73).reduce((a, h) => a + (h.snowfall || 0), 0) * sn,
        temp: w.hourly[idx].temp,
      });
    }).filter(Boolean);
  }

  let regionCursor = 0;
  function rotateRegions(regions, n) {
    if (!regions || !regions.length) return [];
    const out = [];
    for (let i = 0; i < Math.min(n || 1, regions.length); i++) out.push(regions[(regionCursor + i) % regions.length]);
    regionCursor = (regionCursor + out.length) % regions.length;
    return out;
  }

  function buildTicker() {
    const items = [];
    for (const n of D.nearby) items.push(`${n.name}: ${WS.round(n.temp)} ${WS.wx(n.code, n.isDay).word}`);
    for (const a of D.tickerAirports || []) {
      if (a.temp == null && !a.status) continue;
      items.push(`${a.name}: ${a.temp != null ? WS.round(a.temp) + " " : ""}${a.word || ""}, ${a.status.text}`);
    }
    for (const d of D.destinations || []) if (d.current) items.push(`${d.name}: ${WS.round(d.current.temperature_2m != null ? d.current.temperature_2m : d.current.temp)} ${WS.wx(d.current.code, d.current.isDay).word}`);
    return items;
  }
})(window.WS);
