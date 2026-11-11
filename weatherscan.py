#!/usr/bin/env python3
"""OpenWeather360 - local server and launcher.

Serves the web app from ./app, stores settings in ~/.config/weatherscan-open,
and proxies the few free data feeds that do not allow browser (CORS) access.
Uses only the Python standard library.
"""
import argparse
import json
import mimetypes
import os
import shutil
import signal
import socket
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

VERSION = "1.1.0"
APP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "app")
CONFIG_DIR = os.path.join(os.environ.get("XDG_CONFIG_HOME") or os.path.expanduser("~/.config"), "weatherscan-open")
CONFIG_FILE = os.path.join(CONFIG_DIR, "config.json")
DEFAULT_MUSIC_DIR = os.path.expanduser("~/Music/weatherscan")
BUNDLED_MUSIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "music")  # music shipped with a personal build
USER_AGENT = "weatherscan-open/%s (local weather display; https://github.com/)" % VERSION

# Hosts the browser may reach through /api/proxy. Everything else is refused.
PROXY_HOSTS = {
    "nasstatus.faa.gov",
    "aviationweather.gov",
    "api.weather.gov",
    "ip-api.com",
    "api.tidesandcurrents.noaa.gov",
}
PROXY_TTL = 240  # seconds
AUDIO_EXT = (".mp3", ".ogg", ".oga", ".wav", ".flac", ".m4a", ".opus", ".webm")

_cache = {}
_cache_lock = threading.Lock()


def load_config():
    try:
        with open(CONFIG_FILE, encoding="utf-8") as fh:
            data = json.load(fh)
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def save_config(data):
    os.makedirs(CONFIG_DIR, exist_ok=True)
    tmp = CONFIG_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2)
    os.replace(tmp, CONFIG_FILE)


def music_dir():
    cfg = load_config()
    d = ((cfg.get("music") or {}).get("dir") or "").strip() or DEFAULT_MUSIC_DIR
    return os.path.abspath(os.path.expanduser(d))


def music_dirs():
    """Your music folder first, then the music bundled with the install (if any)."""
    dirs = [music_dir()]
    if os.path.isdir(BUNDLED_MUSIC_DIR) and BUNDLED_MUSIC_DIR not in dirs:
        dirs.append(BUNDLED_MUSIC_DIR)
    return dirs


def fetch_remote(url):
    """GET a whitelisted URL with a small in-memory cache. Returns (status, ctype, body)."""
    now = time.time()
    with _cache_lock:
        hit = _cache.get(url)
        if hit and now - hit[0] < PROXY_TTL:
            return hit[1]
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json, */*"})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            result = (resp.status, resp.headers.get("Content-Type", "application/octet-stream"), resp.read())
    except urllib.error.HTTPError as err:
        result = (err.code, "application/json", json.dumps({"error": "upstream %d" % err.code}).encode())
    except (urllib.error.URLError, socket.timeout, OSError) as err:
        return (502, "application/json", json.dumps({"error": str(err)}).encode())
    if result[0] == 200:
        with _cache_lock:
            if len(_cache) > 200:
                _cache.clear()
            _cache[url] = (now, result)
    return result


class Handler(SimpleHTTPRequestHandler):
    server_version = "WeatherscanOpen/" + VERSION

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=APP_DIR, **kwargs)

    def log_message(self, fmt, *args):
        if os.environ.get("WEATHERSCAN_DEBUG"):
            super().log_message(fmt, *args)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def _send(self, status, ctype, body):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status, obj):
        self._send(status, "application/json", json.dumps(obj).encode())

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if path == "/api/config":
            return self._json(200, load_config())
        if path == "/api/version":
            return self._json(200, {"version": VERSION, "configFile": CONFIG_FILE, "musicDir": music_dir()})
        if path == "/api/proxy":
            return self._proxy(urllib.parse.parse_qs(parsed.query).get("url", [""])[0])
        if path == "/api/music":
            return self._music_list()
        if path.startswith("/music/"):
            return self._music_file(urllib.parse.unquote(path[len("/music/"):]))
        return super().do_GET()

    def do_POST(self):
        if urllib.parse.urlparse(self.path).path != "/api/config":
            return self._json(404, {"error": "not found"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > 1_000_000:
                return self._json(413, {"error": "too large"})
            data = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(data, dict):
                raise ValueError("config must be an object")
            save_config(data)
            return self._json(200, {"ok": True})
        except (ValueError, OSError) as err:
            return self._json(400, {"error": str(err)})

    def _proxy(self, url):
        try:
            u = urllib.parse.urlparse(url)
        except ValueError:
            return self._json(400, {"error": "bad url"})
        if u.scheme not in ("http", "https") or u.hostname not in PROXY_HOSTS:
            return self._json(403, {"error": "host not allowed"})
        status, ctype, body = fetch_remote(url)
        self._send(status, ctype, body)

    def _music_list(self):
        files, seen = [], set()
        for d in music_dirs():
            if not os.path.isdir(d):
                continue
            for name in sorted(os.listdir(d)):
                if name not in seen and name.lower().endswith(AUDIO_EXT) and os.path.isfile(os.path.join(d, name)):
                    seen.add(name)
                    files.append("/music/" + urllib.parse.quote(name))
        self._json(200, {"dir": music_dir(), "files": files})

    def _music_file(self, name):
        full = None
        for d in music_dirs():
            cand = os.path.abspath(os.path.join(d, name))
            if os.path.dirname(cand) == d and name.lower().endswith(AUDIO_EXT) and os.path.isfile(cand):
                full = cand
                break
        if not full:
            return self._json(404, {"error": "not found"})
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        size = os.path.getsize(full)
        start, end = 0, size - 1
        rng = self.headers.get("Range")
        if rng and rng.startswith("bytes="):
            a, _, b = rng[6:].partition("-")
            try:
                start = int(a) if a else size - int(b)
                end = int(b) if a and b else size - 1
            except ValueError:
                start, end = 0, size - 1
            end = min(end, size - 1)
            if start > end or start < 0:
                self.send_response(416)
                self.send_header("Content-Range", "bytes */%d" % size)
                self.end_headers()
                return
            self.send_response(206)
            self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end, size))
        else:
            self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        with open(full, "rb") as fh:
            fh.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                chunk = fh.read(min(65536, remaining))
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                except (BrokenPipeError, ConnectionResetError):
                    return
                remaining -= len(chunk)


def free_port(preferred):
    for port in [preferred] + list(range(preferred + 1, preferred + 20)):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise SystemExit("No free port found near %d" % preferred)


def find_browser(preference):
    chromium_like = ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable", "brave-browser", "microsoft-edge"]
    order = (["firefox"] + chromium_like) if preference == "firefox" else (chromium_like + ["firefox"])
    for name in order:
        exe = shutil.which(name)
        if exe:
            return name, exe
    return None, None


def launch_browser(url, preference, fullscreen):
    name, exe = find_browser(preference)
    if not exe:
        print("No supported browser found. Open %s manually." % url)
        return None
    profile = os.path.join(CONFIG_DIR, "browser-profile-" + ("firefox" if name == "firefox" else "chromium"))
    os.makedirs(profile, exist_ok=True)
    if name == "firefox":
        args = [exe, "--new-instance", "--profile", profile]
        args += ["--kiosk", url] if fullscreen else [url]
    else:
        args = [exe, "--user-data-dir=" + profile, "--no-first-run", "--no-default-browser-check",
                "--autoplay-policy=no-user-gesture-required", "--disable-features=Translate",
                "--app=" + url, "--window-size=1280,720"]
        if fullscreen:
            args.append("--kiosk")
    print("Launching %s" % name)
    return subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def main():
    ap = argparse.ArgumentParser(description="OpenWeather360 - retro cable weather channel display")
    ap.add_argument("--port", type=int, default=int(os.environ.get("WEATHERSCAN_PORT", 8642)))
    ap.add_argument("--server-only", action="store_true", help="only run the web server")
    ap.add_argument("--fullscreen", action="store_true", help="start in fullscreen kiosk mode (default is a normal resizable window; F toggles fullscreen)")
    ap.add_argument("--windowed", action="store_true", help="normal window (this is now the default)")
    ap.add_argument("--settings", action="store_true", help="open the settings page")
    ap.add_argument("--browser", choices=["auto", "chromium", "firefox"], default="auto")
    ap.add_argument("--lan", action="store_true", help="listen on all interfaces (view from other devices)")
    ap.add_argument("--version", action="version", version=VERSION)
    args = ap.parse_args()

    os.makedirs(CONFIG_DIR, exist_ok=True)
    port = free_port(args.port)
    host = "0.0.0.0" if args.lan else "127.0.0.1"
    httpd = ThreadingHTTPServer((host, port), Handler)
    httpd.daemon_threads = True
    url = "http://127.0.0.1:%d/%s" % (port, "settings.html" if args.settings else "")
    print("OpenWeather360 %s serving on %s" % (VERSION, url))
    print("Settings: %s   Config file: %s" % (url.rsplit("/", 1)[0] + "/settings.html", CONFIG_FILE))

    if args.server_only:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
        return

    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    proc = launch_browser(url, args.browser, args.fullscreen and not args.settings)
    stop = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    try:
        if proc is None:
            stop.wait()
        else:
            while not stop.is_set() and proc.poll() is None:
                stop.wait(1)
            # Firefox may hand off to an existing process and exit at once; keep serving then.
            if proc.returncode == 0 and not stop.is_set() and time.time() - _started < 5:
                print("Browser handed off to an existing window; server keeps running (Ctrl+C to stop).")
                stop.wait()
    except KeyboardInterrupt:
        pass
    finally:
        if proc and proc.poll() is None:
            proc.terminate()
        httpd.shutdown()


_started = time.time()

if __name__ == "__main__":
    main()
