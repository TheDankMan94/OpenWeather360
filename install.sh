#!/bin/sh
# Install OpenWeather360 for the current user (no root needed).
# Usage: ./install.sh            install to ~/.local
#        ./install.sh --system   install to /usr (run with sudo)
set -e
SRC=$(cd "$(dirname "$0")" && pwd)
if [ "$1" = "--system" ]; then
  PREFIX=/usr
else
  PREFIX="${PREFIX:-$HOME/.local}"
fi
SHARE="$PREFIX/share/openweather360"
BIN="$PREFIX/bin"

command -v python3 >/dev/null 2>&1 || { echo "python3 is required (sudo apt install python3)"; exit 1; }
if ! command -v chromium >/dev/null 2>&1 && ! command -v google-chrome >/dev/null 2>&1 && ! command -v firefox >/dev/null 2>&1; then
  echo "Note: no Chromium, Chrome or Firefox found. Install one: sudo apt install chromium"
fi

mkdir -p "$SHARE" "$BIN" "$PREFIX/share/applications" "$PREFIX/share/icons/hicolor/scalable/apps"
rm -rf "$SHARE/app"
cp -r "$SRC/app" "$SHARE/app"
install -m 755 "$SRC/openweather360.py" "$SHARE/openweather360.py"
cp "$SRC/README.md" "$SRC/LICENSE" "$SHARE/" 2>/dev/null || true
# personal builds can ship music: put audio files in ./bundled-music before installing
rm -rf "$SHARE/music"
[ -d "$SRC/bundled-music" ] && cp -r "$SRC/bundled-music" "$SHARE/music"
# remove files left by versions before 1.2.0 (the app was named weatherscan-open)
rm -rf "$PREFIX/share/weatherscan-open"
rm -f "$PREFIX/share/applications/weatherscan-open.desktop" "$PREFIX/share/icons/hicolor/scalable/apps/weatherscan-open.svg" "$BIN/weatherscan-open"
cat > "$BIN/openweather360" <<LAUNCH
#!/bin/sh
exec python3 "$SHARE/openweather360.py" "\$@"
LAUNCH
chmod 755 "$BIN/openweather360"
ln -s openweather360 "$BIN/weatherscan-open"   # old command name keeps working
install -m 644 "$SRC/packaging/openweather360.desktop" "$PREFIX/share/applications/openweather360.desktop"
install -m 644 "$SRC/packaging/openweather360.svg" "$PREFIX/share/icons/hicolor/scalable/apps/openweather360.svg"
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$PREFIX/share/applications" 2>/dev/null || true
command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -q "$PREFIX/share/icons/hicolor" 2>/dev/null || true
mkdir -p "$HOME/Music/weatherscan" 2>/dev/null || true

echo "Installed OpenWeather360 to $SHARE"
echo "Start it from the menu (Accessories > OpenWeather360) or run: openweather360"
case ":$PATH:" in *":$BIN:"*) ;; *) echo "Note: $BIN is not on your PATH yet; log out and back in, or use the menu entry.";; esac
