/* Maps: MapLibre GL (BSD) + OpenFreeMap vector tiles (OpenStreetMap data) + AWS Terrain
 * Tiles hillshade. Radar from the Iowa Environmental Mesonet NEXRAD mosaic (US) or
 * RainViewer (elsewhere); satellite from NASA GIBS GOES imagery. */
(function (WS) {
  const M = (WS.maps = {});

  const PALETTES = {
    radar: { land: "#4a5637", wood: "#3f4b2f", water: "#1b2f5e", state: "#e2e2e2", county: "#6b7658", road1: "#c3c3bb", road2: "#8f9286", shade: "#1e2416", light: "#86956a" },
    travel: { land: "#557a3a", wood: "#4c7034", water: "#1f3f86", state: "#f0f0f0", county: null, road1: null, road2: null, shade: "#253516", light: "#93b46c" },
  };

  function style(kind) {
    const p = PALETTES[kind] || PALETTES.radar;
    const layers = [
      { id: "bg", type: "background", paint: { "background-color": p.land } },
      { id: "wood", type: "fill", source: "omt", "source-layer": "landcover", filter: ["==", ["get", "class"], "wood"], paint: { "fill-color": p.wood, "fill-opacity": 0.55 } },
      { id: "hillshade", type: "hillshade", source: "dem", paint: { "hillshade-shadow-color": p.shade, "hillshade-highlight-color": p.light, "hillshade-accent-color": p.shade, "hillshade-exaggeration": 0.45 } },
      { id: "water", type: "fill", source: "omt", "source-layer": "water", filter: ["!=", ["get", "brunnel"], "tunnel"], paint: { "fill-color": p.water } },
    ];
    if (p.county) layers.push({ id: "county", type: "line", source: "omt", "source-layer": "boundary", minzoom: 6, filter: ["all", ["==", ["get", "admin_level"], 6], ["!=", ["get", "maritime"], 1]], paint: { "line-color": p.county, "line-width": 0.7 } });
    if (p.road2) layers.push({ id: "road2", type: "line", source: "omt", "source-layer": "transportation", minzoom: 6, filter: ["in", ["get", "class"], ["literal", ["primary", "trunk"]]], paint: { "line-color": p.road2, "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.5, 10, 1.4] } });
    if (p.road1) layers.push({ id: "road1", type: "line", source: "omt", "source-layer": "transportation", minzoom: 4, filter: ["==", ["get", "class"], "motorway"], paint: { "line-color": p.road1, "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.6, 10, 2.2] } });
    layers.push({ id: "state", type: "line", source: "omt", "source-layer": "boundary", filter: ["all", ["==", ["get", "admin_level"], 4], ["!=", ["get", "maritime"], 1]], paint: { "line-color": p.state, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.8, 8, 1.8] } });
    layers.push({ id: "country", type: "line", source: "omt", "source-layer": "boundary", filter: ["all", ["==", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1]], paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.8, 8, 2.4] } });
    return {
      version: 8,
      sources: {
        omt: { type: "vector", url: "https://tiles.openfreemap.org/planet", attribution: '<a href="https://openfreemap.org">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' },
        dem: { type: "raster-dem", tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"], encoding: "terrarium", tileSize: 256, maxzoom: 10, attribution: "Terrain Tiles (AWS Open Data)" },
      },
      layers,
    };
  }

  function pixelRatio() {
    const s = WS.stageScale || 1;
    return Math.max(1, Math.min(3, (window.devicePixelRatio || 1) * s));
  }

  /* ---------- radar clutter filter ----------
   * The NEXRAD n0q mosaic includes very light returns (birds, ground clutter, < ~15 dBZ),
   * drawn in blues/cyans. Like the TV channel did, hide those and keep green and up. */
  let protocolAdded = false;
  function addRadarProtocol() {
    if (protocolAdded) return;
    protocolAdded = true;
    maplibregl.addProtocol("wsradar", async (params, abort) => {
      const res = await fetch(params.url.replace("wsradar://", "https://"), { signal: abort.signal });
      if (!res.ok) throw new Error("radar tile " + res.status);
      const bmp = await createImageBitmap(await res.blob());
      const cv = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = cv.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(bmp, 0, 0);
      const img = ctx.getImageData(0, 0, bmp.width, bmp.height);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] && d[i + 2] > d[i + 1] && d[i + 2] > d[i]) d[i + 3] = 0; // blue-dominant = light returns
      }
      ctx.putImageData(img, 0, 0);
      const blob = await cv.convertToBlob({ type: "image/png" });
      return { data: await blob.arrayBuffer() };
    });
  }

  /* ---------- radar frame sources ---------- */
  async function radarFrames(isUS) {
    const cfg = WS.config.radar;
    if (typeof OffscreenCanvas !== "undefined") addRadarProtocol();
    const frames = Math.max(2, Math.min(20, cfg.frames || 10));
    if (isUS) {
      const step = Math.max(5, Math.round(((cfg.hours || 3) * 60) / (frames - 1) / 5) * 5);
      const end = Math.floor((Date.now() - 7 * 60000) / 300000) * 300000;
      const out = [];
      const scheme = typeof OffscreenCanvas !== "undefined" ? "wsradar://" : "https://";
      for (let i = frames - 1; i >= 0; i--) {
        const t = new Date(end - i * step * 60000);
        const stamp = t.toISOString().replace(/[-:T]/g, "").slice(0, 12);
        // IEM's pre-rendered, CDN-cached NEXRAD composite tiles (fast; the WMS-T endpoint renders each tile on demand)
        out.push({
          time: t,
          url: `${scheme}mesonet.agron.iastate.edu/c/tile.py/1.0.0/ridge::USCOMP-N0Q-${stamp}/{z}/{x}/{y}.png`,
          tileSize: 256, maxzoom: 9, attribution: "Radar: NOAA NEXRAD via Iowa Environmental Mesonet",
        });
      }
      return out;
    }
    const r = await WS.fetchJSON("https://api.rainviewer.com/public/weather-maps.json", { ttl: 5 * 60000 });
    const past = (r.radar && r.radar.past) || [];
    return past.slice(-frames).map((f) => ({ time: new Date(f.time * 1000), url: `${r.host}${f.path}/256/{z}/{x}/{y}/4/1_1.png`, tileSize: 256, maxzoom: 7, attribution: "Radar: RainViewer" }));
  }

  function satelliteSource(lon) {
    const sat = lon < -110 ? "GOES-West" : "GOES-East";
    return { type: "raster", tileSize: 256, maxzoom: 6, attribution: "Satellite: NASA GIBS", tiles: [`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${sat}_ABI_Band13_Clean_Infrared/default/default/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`] };
  }

  /**
   * Create a map.
   * opts: {center:[lon,lat], zoom, kind:'radar'|'travel', radar:bool, isUS:bool, satellite:bool,
   *        labels:[{name,lat,lon,cls}], markers:[{lat,lon,el}], onFrame(time)}
   */
  M.create = function (container, opts) {
    const map = new maplibregl.Map({
      container, style: style(opts.kind), center: opts.center, zoom: opts.zoom,
      interactive: false, attributionControl: { compact: true }, fadeDuration: 0,
      pixelRatio: pixelRatio(), renderWorldCopies: true, maxTileCacheSize: 400,
    });
    const handle = { map, frames: [], timer: null, markers: [], destroyed: false };
    M.last = handle;
    if (WS.params.has("forcedraw")) handle.drawTimer = setInterval(() => { try { map.redraw(); } catch (e) { /* removed */ } }, 400);

    (opts.labels || []).forEach((l) => {
      const el = WS.el("div", "map-label " + (l.cls || "main"), `<span class="dot"></span><span>${WS.esc(l.name)}</span>`);
      handle.markers.push(new maplibregl.Marker({ element: el, anchor: "left", offset: [-6, 0] }).setLngLat([l.lon, l.lat]).addTo(map));
    });
    (opts.markers || []).forEach((m) => {
      handle.markers.push(new maplibregl.Marker({ element: m.el, anchor: m.anchor || "center" }).setLngLat([m.lon, m.lat]).addTo(map));
    });

    map.on("error", (e) => WS.log("map error", e && e.error && e.error.message));

    map.on("load", async () => {
      if (handle.destroyed) return;
      if (opts.satellite) {
        map.addSource("sat", satelliteSource(opts.center[0]));
        map.addLayer({ id: "sat", type: "raster", source: "sat", paint: { "raster-saturation": -1, "raster-contrast": 0.35, "raster-brightness-min": 0.08, "raster-opacity": 0.72, "raster-fade-duration": 0 } }, "state");
      }
      if (!opts.radar) return;
      let frames;
      try {
        frames = await radarFrames(opts.isUS);
      } catch (e) {
        console.warn("radar frames failed", e);
        if (opts.onUnavailable) opts.onUnavailable();
        return;
      }
      if (handle.destroyed) return;
      frames.forEach((f, i) => {
        const src = { type: "raster", tiles: [f.url], tileSize: f.tileSize, maxzoom: f.maxzoom || 12 };
        if (i === 0) src.attribution = f.attribution;
        map.addSource("radar" + i, src);
        map.addLayer({ id: "radar" + i, type: "raster", source: "radar" + i, paint: { "raster-opacity": 0, "raster-fade-duration": 0, "raster-resampling": "nearest" } }, "state");
      });
      handle.frames = frames;
      M.animate(handle, opts.onFrame);
    });

    handle.destroy = () => {
      handle.destroyed = true;
      clearTimeout(handle.timer);
      clearInterval(handle.drawTimer);
      handle.markers.forEach((m) => m.remove());
      try { map.remove(); } catch (e) { /* already gone */ }
    };
    return handle;
  };

  M.animate = function (handle, onFrame) {
    const map = handle.map, n = handle.frames.length;
    let i = 0;
    const opacity = 0.85;
    const tick = () => {
      if (handle.destroyed) return;
      for (let k = 0; k < n; k++) {
        if (map.getLayer("radar" + k)) map.setPaintProperty("radar" + k, "raster-opacity", k === i ? opacity : 0);
      }
      if (onFrame) onFrame(handle.frames[i].time, i, n);
      const last = i === n - 1;
      i = (i + 1) % n;
      handle.timer = setTimeout(tick, last ? 1800 : 420);
    };
    tick();
  };

  /** Rebuild radar frames (e.g., every few minutes for the always-on mini radar). */
  M.refreshRadar = async function (handle, isUS, onFrame) {
    if (handle.destroyed || !handle.map.isStyleLoaded()) return;
    clearTimeout(handle.timer);
    const map = handle.map;
    handle.frames.forEach((f, i) => {
      if (map.getLayer("radar" + i)) map.removeLayer("radar" + i);
      if (map.getSource("radar" + i)) map.removeSource("radar" + i);
    });
    const frames = await radarFrames(isUS);
    frames.forEach((f, i) => {
      map.addSource("radar" + i, { type: "raster", tiles: [f.url], tileSize: f.tileSize, maxzoom: f.maxzoom || 12 });
      map.addLayer({ id: "radar" + i, type: "raster", source: "radar" + i, paint: { "raster-opacity": 0, "raster-fade-duration": 0, "raster-resampling": "nearest" } }, "state");
    });
    handle.frames = frames;
    M.animate(handle, onFrame);
  };

  /** Pick label cities around a point that fit in the map view. */
  M.labelCities = function (lat, lon, zoom, w, h, max, mainName) {
    const degPerPx = 360 / (512 * Math.pow(2, zoom));
    const halfW = (w / 2) * degPerPx * 0.9, halfH = (h / 2) * degPerPx * Math.cos((lat * Math.PI) / 180) * 0.85;
    const out = [];
    for (const c of WS_CITIES) {
      if (out.length >= max) break;
      if (Math.abs(c[1] - lat) > halfH || c[2] - lon > halfW * 0.75 || lon - c[2] > halfW) continue;
      if (mainName && c[0].toLowerCase() === mainName.toLowerCase()) continue;
      const tooClose = out.some((o) => Math.abs(o.lat - c[1]) < halfH * 0.32 && Math.abs(o.lon - c[2]) < halfW * 0.55);
      if (!tooClose && WS.distKm(lat, lon, c[1], c[2]) > 15) out.push({ name: c[0], lat: c[1], lon: c[2] });
    }
    return out;
  };
})(window.WS);
