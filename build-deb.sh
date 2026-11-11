#!/bin/sh
# Build a .deb package for Linux Mint / Ubuntu / Debian: ./build-deb.sh
set -e
SRC=$(cd "$(dirname "$0")" && pwd)
VERSION=$(python3 -c "import re;print(re.search(r'VERSION = \"([^\"]+)\"', open('$SRC/weatherscan.py').read()).group(1))")
PKG="openweather360_${VERSION}_all"
BUILD="$SRC/build/$PKG"
rm -rf "$BUILD"
mkdir -p "$BUILD/DEBIAN"
PREFIX="$BUILD/usr" HOME="$SRC/build/fakehome" sh "$SRC/install.sh" >/dev/null
rm -rf "$SRC/build/fakehome"
# caches are generated on the target system by postinst; never ship them
rm -f "$BUILD/usr/share/applications/mimeinfo.cache" "$BUILD/usr/share/icons/hicolor/icon-theme.cache"
# the launcher must point at the final install location, not the build tree
cat > "$BUILD/usr/bin/openweather360" <<'LAUNCH'
#!/bin/sh
exec python3 /usr/share/openweather360/weatherscan.py "$@"
LAUNCH
chmod 755 "$BUILD/usr/bin/openweather360"
rm -f "$BUILD/usr/bin/weatherscan-open"
ln -s openweather360 "$BUILD/usr/bin/weatherscan-open"
SIZE=$(du -sk "$BUILD/usr" | cut -f1)
cat > "$BUILD/DEBIAN/control" <<CONTROL
Package: openweather360
Version: $VERSION
Section: misc
Priority: optional
Architecture: all
Depends: python3 (>= 3.8)
Replaces: weatherscan-open
Conflicts: weatherscan-open
Provides: weatherscan-open
Recommends: chromium | google-chrome-stable | firefox
Installed-Size: $SIZE
Maintainer: OpenWeather360 <noreply@localhost>
Description: Retro cable weather channel display built on open data
 A local weather channel window (fullscreen optional) in the style of 2000s cable
 weather channels: current conditions, local and extended forecasts,
 animated Doppler radar, almanac, health, travel, airport and international
 segments. Uses only free, keyless data (Open-Meteo, NWS, NOAA, IEM, NASA
 GIBS, OpenFreeMap) and open-source software.
CONTROL
cat > "$BUILD/DEBIAN/postinst" <<'POST'
#!/bin/sh
set -e
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database -q /usr/share/applications || true
command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -q /usr/share/icons/hicolor || true
exit 0
POST
chmod 755 "$BUILD/DEBIAN/postinst"
find "$BUILD/usr" -type d -exec chmod 755 {} +
find "$BUILD/usr/share" -type f -exec chmod 644 {} +
chmod 755 "$BUILD/usr/share/openweather360/weatherscan.py"
dpkg-deb -Zgzip -z1 --root-owner-group --build "$BUILD" "$SRC/build/$PKG.deb" >/dev/null
echo "Built $SRC/build/$PKG.deb"
echo "Install with: sudo apt install ./build/$PKG.deb"
