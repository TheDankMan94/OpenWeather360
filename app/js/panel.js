/* In-app quick panel (press P, or use the gear that appears when the mouse moves):
 * switch the look (V2 / V1 / Local) and change the location by ZIP code or "City, ST". */
(function (WS) {
  const P = (WS.panel = {});
  let root = null, hideTimer = null, results = [];

  const US = { AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", PR: "Puerto Rico" };

  /** ZIP code, "City, ST" or plain city name -> [{name, state, cc, lat, lon}] */
  async function lookup(q) {
    q = q.trim();
    if (!q) return [];
    if (/^\d{5}(-\d{4})?$/.test(q)) {
      const r = await WS.fetchJSON("https://api.zippopotam.us/us/" + q.slice(0, 5), { timeout: 10000 });
      return (r.places || []).map((p) => ({ name: p["place name"], state: p["state abbreviation"], cc: "US", lat: +p.latitude, lon: +p.longitude }));
    }
    if (/^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/.test(q)) {
      const r = await WS.fetchJSON("https://api.zippopotam.us/ca/" + q.replace(/[ -]/g, "").slice(0, 3).toUpperCase(), { timeout: 10000 });
      return (r.places || []).map((p) => ({ name: p["place name"], state: p["state abbreviation"], cc: "CA", lat: +p.latitude, lon: +p.longitude }));
    }
    const parts = q.split(",").map((s) => s.trim()).filter(Boolean);
    const city = parts[0], region = (parts[1] || "").toLowerCase();
    const r = await WS.fetchJSON(`https://geocoding-api.open-meteo.com/v1/search?count=30&language=en&format=json&name=${encodeURIComponent(city)}`, { timeout: 10000 });
    let list = r.results || [];
    if (region) {
      const abbr = region.toUpperCase();
      const full = (US[abbr] || "").toLowerCase();
      list = list.filter((x) => {
        const a1 = (x.admin1 || "").toLowerCase();
        return a1 === region || a1 === full || a1.startsWith(region) || (x.country || "").toLowerCase().startsWith(region) || (x.country_code || "").toLowerCase() === region;
      });
    }
    list.sort((a, b) => (b.population || 0) - (a.population || 0));
    return list.slice(0, 8).map((x) => {
      const st = Object.keys(US).find((k) => US[k] === x.admin1);
      return { name: x.name, state: st || x.admin1 || "", cc: x.country_code, lat: x.latitude, lon: x.longitude };
    });
  }

  async function save(patch) {
    const cfg = JSON.parse(JSON.stringify(WS.userConfig || {}));
    Object.assign(cfg, patch);
    const res = await fetch("/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cfg) });
    if (!res.ok) throw new Error("save failed");
    WS.store.set("config", cfg);
    WS.store.set("autoloc", null);
    // reload without test overrides
    const u = new URL(location.href);
    ["look", "lat", "lon", "name", "only"].forEach((k) => u.searchParams.delete(k));
    location.href = u.toString();
  }

  function build() {
    root = document.createElement("div");
    root.id = "qp";
    root.hidden = true;
    const looks = Object.values(WS.LOOKS);
    root.innerHTML = `
      <div class="qp-card">
        <button class="qp-x" title="Close (Esc)">×</button>
        <h2>${WS.esc(WS.config.wordmark || "OpenWeather360")}</h2>
        <h3>Look</h3>
        <div class="qp-looks">${looks.map((l) => `<button class="qp-look ${l.id === WS.look.id ? "on" : ""}" data-look="${l.id}"><b>${l.name}</b><span>${l.era}</span><em>${WS.esc(l.blurb)}</em></button>`).join("")}</div>
        <h3>Location</h3>
        <div class="qp-cur">Now showing: <b></b></div>
        <form class="qp-form"><input type="text" placeholder="ZIP code, or City, ST (e.g. Springfield, IL)" autocomplete="off"><button type="submit">Search</button></form>
        <ul class="qp-res"></ul>
        <button class="qp-auto">Use my current location</button>
        <div class="qp-foot"><button class="qp-mute">Mute / unmute radio (M)</button><a href="settings.html">All settings… (S)</a></div>
      </div>`;
    document.body.appendChild(root);
    const $ = (s) => root.querySelector(s);
    $(".qp-cur b").textContent = (WS.data.main && WS.data.main.name) || "";
    $(".qp-x").onclick = () => P.toggle(false);
    root.addEventListener("mousedown", (e) => { if (e.target === root) P.toggle(false); });
    root.querySelectorAll(".qp-look").forEach((b) => (b.onclick = () => save({ look: b.dataset.look }).catch(msg)));
    $(".qp-mute").onclick = () => WS.audio && WS.audio.toggle();
    $(".qp-auto").onclick = () => save({ location: { auto: true, name: "", lat: null, lon: null } }).catch(msg);
    const msg = (e) => { $(".qp-res").innerHTML = `<li class="note">${WS.esc(e && e.message || "Something went wrong")}</li>`; };
    $(".qp-form").onsubmit = async (e) => {
      e.preventDefault();
      const ul = $(".qp-res");
      ul.innerHTML = '<li class="note">Searching…</li>';
      try {
        results = await lookup($(".qp-form input").value);
        ul.innerHTML = results.length ? results.map((r, i) => `<li data-i="${i}"><b>${WS.esc(r.name)}</b>${r.state ? ", " + WS.esc(r.state) : ""} <span>${WS.esc(r.cc || "")}</span></li>`).join("") : '<li class="note">No matches. Try a ZIP code, or "City, ST".</li>';
        ul.querySelectorAll("li[data-i]").forEach((li) => (li.onclick = () => {
          const r = results[+li.dataset.i];
          save({ location: { auto: false, name: r.name, lat: r.lat, lon: r.lon, cc: r.cc } }).catch(msg);
        }));
      } catch (err) {
        ul.innerHTML = '<li class="note">Search failed. Check your internet connection, or try "City, ST".</li>';
      }
    };
    root.addEventListener("keydown", (e) => { if (e.key === "Escape") P.toggle(false); e.stopPropagation(); });
  }

  P.toggle = function (force) {
    if (!root) build();
    const show = force === undefined ? root.hidden : force;
    root.hidden = !show;
    document.body.classList.toggle("qp-open", show);
    if (show) { root.querySelector(".qp-form input").focus(); document.body.classList.add("show-cursor"); }
    else document.body.classList.remove("show-cursor");
  };

  P.init = function () {
    // gear button: appears when the mouse moves, fades after a few seconds
    const gear = document.createElement("button");
    gear.id = "qp-gear";
    gear.title = "Look and location (P)";
    gear.innerHTML = "⚙";
    gear.onclick = () => P.toggle(true);
    document.body.appendChild(gear);
    window.addEventListener("mousemove", () => {
      gear.classList.add("show");
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => gear.classList.remove("show"), 3000);
    });
  };
})(window.WS);
