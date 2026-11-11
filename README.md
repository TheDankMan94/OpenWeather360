# OpenWeather360

A retro cable weather channel for Linux, modelled on the look and slide lineup of the 2000s-era
"Weatherscan" cable service, as described in public information such as the
[TWC Archive wiki](https://www.twcarchive.com/wiki/Weatherscan). Other fan recreations of the channel
were only used as a visual reference, not as a source: no code, images or audio from them or from the
original service are included, and everything here was written from scratch.
Everything here is free and open source, and **no API keys are needed**.

## Install on Linux Mint

The easiest way is to build the `.deb` package and install it:

```bash
./build-deb.sh
```

```bash
sudo apt install ./build/openweather360_1.2.0_all.deb
```

You can also install just for your user, without `sudo`:

```bash
./install.sh
```

Then open **Menu → Accessories → OpenWeather360**, or run `openweather360`.
It needs `python3`, which Mint already has, and a browser. Firefox ships with Mint;
Chromium gives smoother maps:

```bash
sudo apt install chromium
```

To remove it, use `sudo apt remove openweather360`, or `./uninstall.sh` for the per-user install.

## Using it

- Opens in a normal window you can resize and minimize (press **F** for fullscreen). On first run it finds your location from your internet address.
- Press **S** for Settings (location search by city or ZIP, extra cities, segments, provider
  name, crawl messages, radar zoom, music). **F** toggles fullscreen, **M** mutes music,
  **C** shows the cursor, **Alt+F4** exits.
- `openweather360 --fullscreen` starts in kiosk fullscreen, `--settings` opens settings,
  `--server-only` serves it at http://127.0.0.1:8642 for any browser, and `--lan` lets
  other devices on your network (a TV or Raspberry Pi) open it.
- Settings are stored in `~/.config/openweather360/config.json`.

## Looks and the quick panel

Press **P** (or click the gear that appears when you move the mouse) to open the quick panel:

- **Look** - switch between three eras of the cable channel (the page reloads with the new look):
  - **V2 (2005-2022)**: the L-bar with mini radar, forecast bar and NOW ticker.
  - **V1 (2003-2005)**: 4:3 with a blue ellipse and yellow swooshes, a rotating status line at the top
    ("Forecast for ...", "Today's High ..."), date/time and wordmark at the bottom, and the V1 slide
    order and timings (Currently 12 s, Nearby 16 s, Radar 16 s, Local Forecast 42 s, Extended 14 s, Almanac 10 s).
  - **Local (2000-2003)**: 4:3 with scenic backdrops, condensed titles, translucent panels, and an
    **Up Next...** menu before every segment.
- **Location** - type a **ZIP code** (US, or a Canadian postal code) or **City, ST** (e.g. `Springfield, IL`),
  pick a match, and the channel reloads on that place. "Use my current location" goes back to automatic.
- Mute the radio, or open all settings.

You can also pick the look in Settings, or try one with `?look=v1` / `?look=local` in the URL.
There is also a **Ski & snow** segment (in season, from Open-Meteo snow data) in all looks.
Not included: the original photos, logos and narration, and the traffic segment (live traffic data
needs a paid key). Fonts are open substitutes for the originals.

## Music

By default the app plays the audio files in its music folder on a loop in random order. The order is
reshuffled each time the folder loops, and the track that just played never starts the next pass.
Put your own MP3/OGG/FLAC/WAV/M4A files in `~/Music/weatherscan` (or the folder set in Settings).
**This repository includes no music.** If you build a personal package, any files in `bundled-music/`
are installed to the app's `music` folder and play too; only bundle audio you have the right to use.
Press **M** to mute.

**Internet radio is optional.** In Settings > Music, switch the source to *Internet radio* and pick
a jazz station (SmoothJazz, WWOZ, TSF Jazz, Jazz Radio, SomaFM) or paste any MP3/AAC stream URL.
It fails over to the next station and reconnects on its own.

## What's on screen

The left bar has a clock, current conditions (with a rotating line for wind, humidity, dew
point, visibility, UV and pressure), a looping mini radar and the provider name. Along the
bottom are a rotating forecast bar (daypart temperatures, text forecast, 5-day), the
**NOW** ticker of nearby towns and airports, and the crawl.

Slides by segment:

| Segment | Slides |
| --- | --- |
| Local forecast | City intro, Currently, Nearby cities, Local Doppler Radar (3-hour loop), Local Forecast text, Extended Forecast, Almanac (normals, records, sun, moon phases), Radar/Satellite, Tomorrow's Forecast |
| Health | Outdoor Activity, UV Index, Air Quality, Pollen (where available), Health Tip |
| Extra cities | Currently, Local Forecast, Extended Forecast |
| Travel | Regional Travel Forecast map, Destination Forecast |
| Airport | Local airport conditions, National Airport Conditions (FAA delays + METAR weather) |
| International | Regional maps with highs, International Forecast table |
| Garden / Golf | Watering needs, frost outlook, soil conditions / golf index |
| Boat & Beach | Water temp, waves, NOAA tides (shown automatically near the coast) |
| Severe | Red severe theme with NWS warning bulletins and a warning crawl during active warnings |

## Data and software (all free, no keys)

- Forecast numbers: [Open-Meteo](https://open-meteo.com) (CC BY 4.0), using NOAA's National Blend of Models across the lower 48 and cloud-cover-based sky conditions elsewhere; history (almanac), air quality, marine also from Open-Meteo
- US forecast wording, icons and alerts: [National Weather Service API](https://www.weather.gov/documentation/services-web-api)
- Current conditions: nearest [aviationweather.gov](https://aviationweather.gov) METAR observation
- Radar: NOAA NEXRAD composite via [Iowa Environmental Mesonet](https://mesonet.agron.iastate.edu) cached tiles (US), [RainViewer](https://www.rainviewer.com) elsewhere
- Satellite: NASA [GIBS](https://earthdata.nasa.gov/gibs) GOES imagery
- Airports: [aviationweather.gov](https://aviationweather.gov) METARs, [FAA NAS Status](https://nasstatus.faa.gov)
- Tides: [NOAA CO-OPS](https://tidesandcurrents.noaa.gov)
- Maps: [MapLibre GL JS](https://maplibre.org) (BSD), [OpenFreeMap](https://openfreemap.org) tiles of [OpenStreetMap](https://www.openstreetmap.org/copyright) data, AWS Terrain Tiles
- City names: [GeoNames](https://www.geonames.org) (CC BY 4.0)
- Fonts: Fira Sans and Overpass (SIL Open Font License)

Weather icons, backgrounds and layout artwork are original CSS/SVG. No Weather Channel logos or images
are included. "Weatherscan" is a trademark of its owner, and this project is not affiliated with it.

## Privacy

Nothing is collected or sent to any server run by this project. With automatic location the app asks
ip-api.com for your approximate location from your IP address (turn it off by choosing a location in
Settings), and weather data is requested directly from the services listed above. Your settings stay in
`~/.config/openweather360/config.json` on your machine.

## Development

```bash
python3 weatherscan.py --server-only
```

```bash
python3 -m unittest discover -s tests
```

Test URL parameters: `?lat=..&lon=..&name=..`, `?only=radar` (repeat one slide; also `almanac`,
`travel`, `beach`, ...), `?fast=0.3` (shorter slides), `?severe=test` (fake warning),
`?units=metric`, `?debug`.

License: GPL-3.0 (see LICENSE).
