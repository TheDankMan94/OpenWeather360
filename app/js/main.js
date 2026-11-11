/* Startup, stage scaling and the slide sequencer. */
(function (WS) {
  const $ = (s) => document.querySelector(s);
  const REFRESH_MS = 10 * 60000;

  function applyLook() {
    const L = WS.look || WS.LOOKS.v2, st = $("#stage");
    st.className = "look-" + L.id;
    st.style.width = L.w + "px";
    st.style.height = L.h + "px";
    st.style.setProperty("--ss", L.scale);
  }

  function fitStage() {
    const L = WS.look || { w: 1620, h: 1080 };
    const s = Math.min(window.innerWidth / L.w, window.innerHeight / L.h);
    WS.stageScale = s;
    $("#stage").style.transform = `scale(${s})`;
  }

  /* ---------- Header scroller ---------- */
  let headerSegs = [];
  function renderHeader(segs, idx) {
    const track = $("#header-scroller .track");
    const order = segs.slice(idx).concat(segs.slice(0, idx));
    headerSegs = order;
    track.style.transition = "none";
    track.style.transform = "translateX(0)";
    track.innerHTML = order.map((s, i) => `<span class="item ${i === 0 ? "current" : ""}">${i ? '<span class="sep">‹</span>' : ""}${WS.esc(s.label)}</span>`).join("");
  }
  function advanceHeader(segs, idx) {
    const track = $("#header-scroller .track");
    const first = track.firstElementChild;
    if (!first || segs.length < 2) return renderHeader(segs, idx);
    track.style.transition = "";
    track.style.transform = `translateX(${-first.offsetWidth}px)`;
    setTimeout(() => renderHeader(segs, idx), 1250);
  }

  /* ---------- Slide display ---------- */
  function setGroup(group) {
    const a = $("#slide-area");
    a.className = "group-" + group;
    $("#stage").dataset.group = group;
  }
  WS.runtime = { segs: [], idx: 0 };

  async function showSlide(slide, seg) {
    const ctx = { loc: seg.loc, group: seg.group, seg, segs: WS.runtime.segs, idx: WS.runtime.idx };
    const titleEl = $("#slide-title .t"), locEl = $("#slide-title .loc");
    const area = $("#slide-area");
    let extra = $("#slide-title .extra");
    if (extra) extra.remove();
    ctx.setTitle = (t) => (titleEl.textContent = t);
    ctx.titleExtra = (html) => {
      const e = WS.el("div", "extra", html);
      $("#slide-title").appendChild(e);
      locEl.textContent = "";
    };
    if (slide.when && !slide.when(ctx)) return false;
    let content;
    try {
      content = slide.build(ctx);
    } catch (e) {
      console.error("slide build failed", slide.title, e);
      return false;
    }
    if (!content) return false;

    titleEl.textContent = slide.title;
    locEl.textContent = slide.locLabel ? slide.locLabel() || "" : seg.loc.name;
    area.classList.toggle("fullbleed", !!slide.fullBleed);
    area.dataset.slide = slide.id || "";

    const body = $("#slide-body");
    const node = WS.el("div", "slide");
    if (typeof content === "string") node.innerHTML = content;
    else node.appendChild(content);
    const old = [...body.children];
    body.appendChild(node);
    if (slide.fit) node.querySelectorAll(slide.fit).forEach((e) => WS.fitText(e, 24));
    try { if (ctx.afterInsert) ctx.afterInsert(); } catch (e) { console.error("slide init failed", slide.title, e); }
    void node.offsetWidth; setTimeout(() => node.classList.add("in"), 20);
    old.forEach((o) => { o.classList.remove("in"); setTimeout(() => { if (o._cleanup) o._cleanup(); o.remove(); }, 500); });
    node._cleanup = () => { try { if (ctx.cleanup) ctx.cleanup(); } catch (e) { /* ignore */ } };

    const dur = (WS.look.dur && slide.id && WS.look.dur[slide.id]) || slide.dur;
    await WS.sleep(dur * 1000 * (WS.config.durationScale || 1));
    return true;
  }

  /* ---------- Data refresh ---------- */
  let refreshing = null;
  async function refresh() {
    if (refreshing) return refreshing;
    refreshing = WS.loadAll().then(() => {
      WS.lbar.refresh();
      if (WS.data.pending) WS.data.pending.then(() => WS.lbar.refresh());
    }).catch((e) => console.warn("refresh failed", e)).finally(() => { refreshing = null; });
    return refreshing;
  }

  /* ---------- Main loop ---------- */
  async function run() {
    let first = true;
    const only = WS.params.get("only");
    for (;;) {
      if (Date.now() - WS.data.updated > REFRESH_MS) await refresh();
      if (only) {
        if (WS.data.pending) await WS.data.pending;
        const sl = WS.slides.all[only];
        const seg = { group: WS.params.get("group") || "forecast", label: WS.data.main.name, loc: WS.data.main, slides: [sl] };
        setGroup(seg.group);
        WS.runtime.segs = WS.slides.buildSegments(false); WS.runtime.idx = Math.min(1, WS.runtime.segs.length - 1);
        renderHeader([seg], 0);
        if (!sl || !(await showSlide(sl, seg))) await WS.sleep(3000);
        continue;
      }
      let segs = WS.slides.buildSegments(first);
      WS.runtime.segs = segs;
      let builtAt = Date.now();
      first = false;
      renderHeader(segs, 0);
      for (let i = 0; i < segs.length; i++) {
        // Background data (extra cities, travel, airports...) must be ready before the first
        // segment that needs it; rebuild the rest of the lineup whenever it has changed.
        if (!["severe", "forecast"].includes(segs[i].group)) {
          if (WS.data.pending) await Promise.race([WS.data.pending, WS.sleep(30000)]);
        }
        if (!["severe", "forecast"].includes(segs[i].group) && (WS.data.secondaryAt || 0) > builtAt) {
          builtAt = Date.now();
          const aired = new Set(segs.slice(0, i).map((s) => s.group + ":" + s.label));
          const rest = WS.slides.buildSegments(false).filter((s) => !["severe", "forecast"].includes(s.group) && !aired.has(s.group + ":" + s.label));
          segs = segs.slice(0, i).concat(rest);
          if (i >= segs.length) break;
        }
        const seg = segs[i];
        WS.runtime.segs = segs; WS.runtime.idx = i;
        if (i > 0) advanceHeader(segs, i);
        setGroup(seg.group);
        let shown = 0;
        for (const sl of seg.slides) if (await showSlide(sl, seg)) shown++;
        if (!shown) WS.log("segment had no slides", seg.label);
        if (Date.now() - WS.data.updated > REFRESH_MS) refresh();
      }
    }
  }

  async function boot() {
    fitStage();
    window.addEventListener("resize", fitStage);
    document.addEventListener("keydown", (e) => {
      if (e.key === "s" || e.key === "S") location.href = "settings.html";
      if (e.key === "p" || e.key === "P") WS.panel && WS.panel.toggle();
      if (e.key === "f" || e.key === "F") (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {});
      if (e.key === "m" || e.key === "M") WS.audio && WS.audio.toggle();
      if (e.key === "c" || e.key === "C") document.body.classList.toggle("show-cursor");
    });
    const status = (s) => ($("#boot .boot-status").textContent = s);
    await WS.loadConfig();
    applyLook();
    fitStage();
    if (WS.panel) WS.panel.init();
    WS.lbar.init();
    $("#boot .boot-title").textContent = WS.config.wordmark || "OpenWeather360";
    for (let attempt = 1; ; attempt++) {
      try {
        await WS.loadAll(status);
        break;
      } catch (e) {
        console.error(e);
        status((e.message || "Data unavailable") + " - retrying... (press S for Settings)");
        await WS.sleep(Math.min(60000, 5000 * attempt));
      }
    }
    WS.currentLoc = WS.data.main;
    WS.lbar.start();
    if (WS.data.pending) WS.data.pending.then(() => WS.lbar.refresh());
    if (WS.audio) WS.audio.start();
    setTimeout(() => $("#boot").classList.add("hide"), 600);
    setTimeout(() => $("#boot").remove(), 1800);
    run();
  }

  window.addEventListener("DOMContentLoaded", boot);
})(window.WS);
