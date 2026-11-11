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
SHARE="$PREFIX/share/weatherscan-open"
BIN="$PREFIX/bin"

command -v python3 >/dev/null 2>&1 || { echo "python3 is required (sudo apt install python3)"; exit 1; }
if ! command -v chromium >/dev/null 2>&1 && ! command -v google-chrome >/dev/null 2>&1 && ! command -v firefox >/dev/null 2>&1; then
  echo "Note: no Chromium, Chrome or Firefox found. Install one: sudo apt install chromium"
fi

mkdir -p "$SHARE" "$BIN" "$PREFIX/share/applications" "$PREFIX/share/icons/hicolor/scalable/apps"
rm -rf "$SHARE/app"
cp -r "$SRC/app" "$SHARE/app"
install -m 755 "$SRC/weatherscan.py" "$SHARE/weatherscan.py"
cp "$SRC/README.md" "$SRC/LICENSE" "$SHARE/" 2>/dev/null || true
# personal builds can ship music: put audio files in ./bundled-music before installing
rm -rf "$SHARE/music"
[ -d "$SRC/bundled-music" ] && cp -r "$SRC/bundled-music" "$SHARE/music"
cat > "$BIN/weatherscan-open" <<LAUNCH
#!/bin/sh
exec python3 "$SHARE/weatherscan.py" "\$@"
LAUNCH
chmod 755 "$BIN/weatherscan-open"
install -m 644 "$SRC/packaging/weatherscan-open.desktop" "$PREFIX/share/applications/weatherscan-open.desktop"
install -m 644 "$SRC/packaging/weatherscan-open.svg" "$PREFIX/share/icons/hicolor/scalable/apps/weatherscan-open.svg"
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$PREFIX/share/applications" 2>/dev/null || true
command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -q "$PREFIX/share/icons/hicolor" 2>/dev/null || true
mkdir -p "$HOME/Music/weatherscan" 2>/dev/null || true

echo "Installed OpenWeather360 to $SHARE"
echo "Start it from the menu (Accessories > OpenWeather360) or run: weatherscan-open"
case ":$PATH:" in *":$BIN:"*) ;; *) echo "Note: $BIN is not on your PATH yet; log out and back in, or use the menu entry.";; esac
