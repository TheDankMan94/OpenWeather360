#!/bin/sh
# Remove OpenWeather360. Your settings in ~/.config/weatherscan-open are kept.
set -e
if [ "$1" = "--system" ]; then PREFIX=/usr; else PREFIX="${PREFIX:-$HOME/.local}"; fi
rm -rf "$PREFIX/share/weatherscan-open"
rm -f "$PREFIX/bin/weatherscan-open" "$PREFIX/share/applications/weatherscan-open.desktop" "$PREFIX/share/icons/hicolor/scalable/apps/weatherscan-open.svg"
echo "OpenWeather360 removed. Settings remain in ~/.config/weatherscan-open (delete that folder to remove them)."
