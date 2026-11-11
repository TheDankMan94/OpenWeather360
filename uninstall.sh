#!/bin/sh
# Remove OpenWeather360. Your settings in ~/.config/openweather360 are kept.
set -e
if [ "$1" = "--system" ]; then PREFIX=/usr; else PREFIX="${PREFIX:-$HOME/.local}"; fi
rm -rf "$PREFIX/share/openweather360" "$PREFIX/share/weatherscan-open"
rm -f "$PREFIX/bin/openweather360" "$PREFIX/bin/weatherscan-open" "$PREFIX/share/applications/openweather360.desktop" "$PREFIX/share/applications/weatherscan-open.desktop" "$PREFIX/share/icons/hicolor/scalable/apps/openweather360.svg" "$PREFIX/share/icons/hicolor/scalable/apps/weatherscan-open.svg"
echo "OpenWeather360 removed. Settings remain in ~/.config/openweather360 (delete that folder to remove them)."
