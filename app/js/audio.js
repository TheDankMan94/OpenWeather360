/* Background music. Default: the Weatherscan tracks / your music folder on a random loop
 * (reshuffled every pass, never repeating the last track). Optional: internet radio from a
 * built-in station list or your own stream URL, with failover and automatic reconnect. */
(function (WS) {
  const A = (WS.audio = {});
  let files = [], idx = 0, player = null, muted = false, shuffleOn = false, mode = "folder";
  let stations = [], stIdx = 0, retryTimer = null, stallTimer = null;

  function playNow() {
    player.play().catch(() => {
      // Autoplay blocked: start on the first key press or click.
      const resume = () => { player.play().catch(() => {}); window.removeEventListener("keydown", resume); window.removeEventListener("click", resume); };
      window.addEventListener("keydown", resume);
      window.addEventListener("click", resume);
    });
  }

  /* ---------- music folder ---------- */
  function shuffleFiles(avoid) {
    for (let i = files.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [files[i], files[j]] = [files[j], files[i]]; }
    if (avoid && files.length > 1 && files[0] === avoid) [files[0], files[1]] = [files[1], files[0]];
  }
  function nextFile() {
    if (!files.length || muted) return;
    // random loop: reshuffle every time the folder wraps, never repeating the track that just played
    if (idx > 0 && idx % files.length === 0 && shuffleOn) shuffleFiles(files[files.length - 1]);
    player.src = files[idx % files.length];
    idx++;
    playNow();
  }

  /* ---------- internet radio (optional) ---------- */
  function tuneStation(advance) {
    if (muted || !stations.length) return;
    clearTimeout(retryTimer);
    if (advance) stIdx = (stIdx + 1) % stations.length;
    const st = stations[stIdx];
    WS.log("radio:", st.name);
    // cache-buster so a reconnect never resumes a stale buffered stream
    player.src = st.url + (st.url.includes("?") ? "&" : "?") + "_=" + Date.now();
    playNow();
  }
  function radioTrouble() {
    if (mode !== "radio" || muted) return;
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => tuneStation(true), 4000); // try the next station, keep cycling slowly if all fail
  }
  function watchStall() {
    clearTimeout(stallTimer);
    if (mode === "radio" && !muted) stallTimer = setTimeout(() => tuneStation(false), 15000);
  }

  A.start = async function () {
    const cfg = WS.config.music || {};
    if (!cfg.enabled) return;
    player = new Audio();
    player.preload = "none";
    player.volume = Math.max(0, Math.min(1, cfg.volume == null ? 0.6 : cfg.volume));

    if (cfg.source === "radio") {
      mode = "radio";
      const custom = (cfg.customStream || "").trim();
      const list = WS.RADIO_STATIONS || [];
      const chosen = list.find((s) => s.id === cfg.station);
      stations = (custom ? [{ name: "Custom stream", url: custom }] : []).concat(chosen ? [chosen] : [], list.filter((s) => s !== chosen));
      player.addEventListener("error", radioTrouble);
      player.addEventListener("ended", radioTrouble);
      player.addEventListener("stalled", watchStall);
      player.addEventListener("waiting", watchStall);
      player.addEventListener("playing", () => clearTimeout(stallTimer));
      tuneStation(false);
      return;
    }

    mode = "folder";
    try {
      const r = await WS.fetchJSON("/api/music", { timeout: 5000 });
      files = r.files || [];
    } catch (e) {
      return;
    }
    if (!files.length) return;
    shuffleOn = !!cfg.shuffle;
    if (shuffleOn) shuffleFiles();
    player.addEventListener("ended", nextFile);
    player.addEventListener("error", () => setTimeout(nextFile, 1000));
    nextFile();
  };

  /** Status for debugging: WS.audio.state() in the console. */
  A.state = () => (player ? { mode, src: player.currentSrc, paused: player.paused, time: +player.currentTime.toFixed(1), tracks: files.length, station: stations[stIdx] && stations[stIdx].name } : null);

  A.toggle = function () {
    if (!player) return;
    muted = !muted;
    if (muted) {
      clearTimeout(retryTimer); clearTimeout(stallTimer);
      player.pause();
      if (mode === "radio") player.removeAttribute("src"); // drop the live connection while muted
    } else if (mode === "radio") tuneStation(false);
    else if (player.src) player.play().catch(() => {});
    else nextFile();
  };
})(window.WS);
