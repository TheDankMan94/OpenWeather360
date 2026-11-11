/* Default settings. User settings (from the Settings page) are merged on top. */
(function (WS) {
  WS.DEFAULTS = {
    location: { auto: true, name: "", lat: null, lon: null },
    extraCities: [],            // [{name, lat, lon}] shown as extra "Your Local Forecast" segments
    autoExtraCities: 2,         // when extraCities is empty, pick this many nearby towns automatically
    units: "imperial",          // imperial | metric
    providerName: "Open Weather 360 Group",
    providerLogo: "",           // optional image URL (e.g. file in app/ or http URL)
    wordmark: "OpenWeather360",
    look: "v2",                 // v2 | v1 | local  (see WS.LOOKS)
    packages: ["forecast", "health", "extralocal", "travel", "airport", "garden", "international", "golf", "beach", "ski"],
    ski: [                      // resorts for the Ski & Snow segment (shown in season)
      { name: "Vail, CO", lat: 39.6403, lon: -106.3742 },
      { name: "Park City, UT", lat: 40.6514, lon: -111.508 },
      { name: "Jackson Hole, WY", lat: 43.5875, lon: -110.8279 },
      { name: "Mammoth Mountain, CA", lat: 37.6308, lon: -119.0326 },
      { name: "Killington, VT", lat: 43.6045, lon: -72.8201 },
    ],
    durationScale: 1,
    severeMode: true,           // switch to the red severe lineup during warnings
    crawlMessages: [
      "Thanks for watching OpenWeather360 - free and open source weather, built on open data.",
      "Forecast data by Open-Meteo.com, the National Weather Service, NOAA and the Iowa Environmental Mesonet.",
      "Know your weather before you go: check back for updated forecasts every 10 minutes.",
    ],
    tickerAirports: [
      { name: "Hartsfield-Jackson Atlanta Int'l", icao: "KATL", iata: "ATL" },
      { name: "Dallas/Fort Worth Int'l", icao: "KDFW", iata: "DFW" },
      { name: "Denver International", icao: "KDEN", iata: "DEN" },
      { name: "Chicago O'Hare Int'l", icao: "KORD", iata: "ORD" },
      { name: "Los Angeles Int'l", icao: "KLAX", iata: "LAX" },
      { name: "John F. Kennedy Int'l", icao: "KJFK", iata: "JFK" },
      { name: "Charlotte Douglas Int'l", icao: "KCLT", iata: "CLT" },
      { name: "Harry Reid Int'l", icao: "KLAS", iata: "LAS" },
      { name: "Orlando Int'l", icao: "KMCO", iata: "MCO" },
      { name: "Miami International", icao: "KMIA", iata: "MIA" },
    ],
    nationalAirports: [
      { name: "New York / LaGuardia", icao: "KLGA", iata: "LGA" },
      { name: "Chicago O'Hare", icao: "KORD", iata: "ORD" },
      { name: "Los Angeles Int'l", icao: "KLAX", iata: "LAX" },
      { name: "Atlanta Hartsfield", icao: "KATL", iata: "ATL" },
      { name: "Dallas / Ft. Worth", icao: "KDFW", iata: "DFW" },
      { name: "Denver International", icao: "KDEN", iata: "DEN" },
      { name: "Boston / Logan", icao: "KBOS", iata: "BOS" },
      { name: "Salt Lake City", icao: "KSLC", iata: "SLC" },
      { name: "Miami International", icao: "KMIA", iata: "MIA" },
      { name: "Phoenix / Sky Harbor", icao: "KPHX", iata: "PHX" },
      { name: "Minneapolis - St. Paul", icao: "KMSP", iata: "MSP" },
      { name: "Washington Dulles", icao: "KIAD", iata: "IAD" },
      { name: "San Francisco Int'l", icao: "KSFO", iata: "SFO" },
      { name: "Philadelphia Int'l", icao: "KPHL", iata: "PHL" },
      { name: "Seattle - Tacoma", icao: "KSEA", iata: "SEA" },
      { name: "St. Louis Lambert", icao: "KSTL", iata: "STL" },
    ],
    destinations: [
      { name: "New York City", lat: 40.71, lon: -74.01 },
      { name: "Chicago", lat: 41.88, lon: -87.63 },
      { name: "Los Angeles", lat: 34.05, lon: -118.24 },
      { name: "Atlanta", lat: 33.75, lon: -84.39 },
      { name: "Dallas", lat: 32.78, lon: -96.80 },
      { name: "Boston", lat: 42.36, lon: -71.06 },
      { name: "Orlando", lat: 28.54, lon: -81.38 },
      { name: "Washington, DC", lat: 38.90, lon: -77.04 },
      { name: "San Francisco", lat: 37.77, lon: -122.42 },
      { name: "Denver", lat: 39.74, lon: -104.99 },
      { name: "Seattle", lat: 47.61, lon: -122.33 },
      { name: "Las Vegas", lat: 36.17, lon: -115.14 },
    ],
    international: {
      maxMaps: 2,
      regions: [
        { id: "europe", name: "Europe", center: [15, 50], zoom: 2.6, cities: [["London", 51.51, -0.13], ["Paris", 48.86, 2.35], ["Berlin", 52.52, 13.40], ["Madrid", 40.42, -3.70], ["Rome", 41.90, 12.50], ["Moscow", 55.76, 37.62], ["Istanbul", 41.01, 28.98], ["Budapest", 47.50, 19.04]] },
        { id: "canada", name: "Canada", center: [-96, 57], zoom: 1.9, cities: [["Vancouver", 49.28, -123.12], ["Edmonton", 53.55, -113.49], ["Yellowknife", 62.45, -114.37], ["Winnipeg", 49.90, -97.14], ["Churchill", 58.77, -94.17], ["Toronto", 43.65, -79.38], ["Montreal", 45.50, -73.57]] },
        { id: "mexico", name: "Mexico & Caribbean", center: [-88, 20], zoom: 2.9, cities: [["Monterrey", 25.69, -100.32], ["Mexico City", 19.43, -99.13], ["Cancun", 21.16, -86.85], ["Nassau", 25.05, -77.35], ["Havana", 23.11, -82.37], ["Kingston", 17.97, -76.79], ["San Juan", 18.47, -66.11]] },
        { id: "southamerica", name: "South America", center: [-60, -18], zoom: 1.9, cities: [["Bogota", 4.71, -74.07], ["Manaus", -3.12, -60.02], ["Lima", -12.05, -77.04], ["Brasilia", -15.79, -47.88], ["Rio de Janeiro", -22.91, -43.17], ["Santiago", -33.45, -70.67], ["Buenos Aires", -34.60, -58.38]] },
        { id: "asia", name: "East Asia", center: [118, 33], zoom: 2.4, cities: [["Beijing", 39.90, 116.40], ["Seoul", 37.57, 126.98], ["Tokyo", 35.68, 139.69], ["Shanghai", 31.23, 121.47], ["Hong Kong", 22.32, 114.17], ["Chongqing", 29.56, 106.55]] },
        { id: "australia", name: "Australia", center: [134, -27], zoom: 2.4, cities: [["Perth", -31.95, 115.86], ["Darwin", -12.46, 130.84], ["Alice Springs", -23.70, 133.88], ["Brisbane", -27.47, 153.03], ["Sydney", -33.87, 151.21], ["Melbourne", -37.81, 144.96]] },
      ],
      forecast: [["Toronto", 43.65, -79.38], ["London", 51.51, -0.13], ["Paris", 48.86, 2.35], ["Cancun", 21.16, -86.85], ["Tokyo", 35.68, 139.69], ["Sydney", -33.87, 151.21], ["Rome", 41.90, 12.50], ["Hong Kong", 22.32, 114.17], ["Amsterdam", 52.37, 4.90], ["Buenos Aires", -34.60, -58.38]],
    },
    radar: { miniZoom: 6.3, mainZoom: 7.3, hours: 3, frames: 10 },
    beach: { tideStation: "", tideStationName: "" }, // blank = nearest NOAA station automatically
    music: { enabled: true, source: "folder", station: "smoothjazz", customStream: "", dir: "", volume: 0.6, shuffle: true },
  };

  // Optional internet radio (Settings > Music source). Free public jazz streams; please support the stations you enjoy.
  WS.RADIO_STATIONS = [
    { id: "smoothjazz", name: "SmoothJazz.com - Smooth Jazz", url: "https://smoothjazz.cdnstream1.com/2585_128.mp3" },
    { id: "wwoz", name: "WWOZ 90.7 New Orleans - Jazz & Heritage", url: "https://wwoz-sc.streamguys1.com/wwoz-hi.mp3" },
    { id: "tsfjazz", name: "TSF Jazz - Paris", url: "https://tsfjazz.ice.infomaniak.ch/tsfjazz-high.mp3" },
    { id: "jazzradio", name: "Jazz Radio - France", url: "https://jazz-wr01.ice.infomaniak.ch/jazz-wr01-128.mp3" },
    { id: "somafm-lounge", name: "SomaFM Secret Agent - Lounge", url: "https://ice2.somafm.com/secretagent-128-mp3" },
    { id: "somafm-sonic", name: "SomaFM Sonic Universe - Modern Jazz", url: "https://ice1.somafm.com/sonicuniverse-128-mp3" },
  ];

  function merge(base, over) {
    if (Array.isArray(base) || Array.isArray(over)) return over !== undefined ? over : base;
    if (typeof base === "object" && base && typeof over === "object" && over) {
      const out = Object.assign({}, base);
      for (const k of Object.keys(over)) out[k] = merge(base[k], over[k]);
      return out;
    }
    return over !== undefined && over !== null && over !== "" ? over : base;
  }
  WS.mergeConfig = merge;

  /** Looks: the three eras of the cable channel. w/h = stage size, scale = how much the slide content is enlarged to fill it. */
  WS.LOOKS = {
    v2: { id: "v2", name: "V2", era: "2005 - 2022", blurb: "Bold blue L-bar with radar, forecast bar and ticker", w: 1620, h: 1080, scale: 1 },
    v1: { id: "v1", name: "V1", era: "2003 - 2005", blurb: "4:3 blue ellipse, yellow swooshes, rotating status line", w: 1440, h: 1080, scale: 1.18,
      dur: { currently: 12, nearby: 16, radar: 16, localfc: 10.5, extended: 14, almanac: 10 } },
    local: { id: "local", name: "Local", era: "2000 - 2003", blurb: "4:3 dark scenic backdrops, Up Next menu, condensed titles", w: 1440, h: 1080, scale: 1.25,
      dur: { currently: 12, radar: 15, localfc: 12, extended: 12, almanac: 10 } },
  };

  WS.loadConfig = async function () {
    let user = {};
    try {
      const res = await fetch("/api/config", { cache: "no-store" });
      if (res.ok) user = await res.json();
    } catch (e) {
      user = WS.store.get("config") || {};
    }
    WS.userConfig = user;
    WS.config = merge(WS.DEFAULTS, user);
    // URL overrides for testing: ?lat=..&lon=..&name=..&units=metric
    const p = WS.params;
    if (p.get("lat") && p.get("lon")) WS.config.location = { auto: false, lat: +p.get("lat"), lon: +p.get("lon"), name: p.get("name") || "" };
    if (p.get("units")) WS.config.units = p.get("units");
    WS.look = WS.LOOKS[p.get("look") || WS.config.look] || WS.LOOKS.v2;
    if (p.get("fast")) WS.config.durationScale = +p.get("fast") || 0.3;
    return WS.config;
  };
})(window.WS);
