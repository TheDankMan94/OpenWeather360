"""Server tests: python3 -m unittest discover -s tests"""
import json
import os
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TMP = tempfile.mkdtemp(prefix="wsopen-test-")
os.environ["XDG_CONFIG_HOME"] = os.path.join(TMP, "config")
sys.path.insert(0, ROOT)
import weatherscan  # noqa: E402  (must import after XDG_CONFIG_HOME is set)


def get(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


class ServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.music = os.path.join(TMP, "music")
        os.makedirs(cls.music)
        with open(os.path.join(cls.music, "song.mp3"), "wb") as fh:
            fh.write(bytes(range(256)) * 4)
        with open(os.path.join(TMP, "secret.mp3"), "wb") as fh:
            fh.write(b"outside")
        weatherscan.save_config({"music": {"dir": cls.music}})
        cls.httpd = weatherscan.ThreadingHTTPServer(("127.0.0.1", 0), weatherscan.Handler)
        cls.base = "http://127.0.0.1:%d" % cls.httpd.server_address[1]
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()

    def test_static_index(self):
        status, _, body = get(self.base + "/")
        self.assertEqual(status, 200)
        self.assertIn(b"slide-frame", body)

    def test_config_roundtrip(self):
        data = {"music": {"dir": self.music}, "providerName": "Test Cable"}
        req = urllib.request.Request(self.base + "/api/config", data=json.dumps(data).encode(), headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req) as r:
            self.assertEqual(json.loads(r.read()), {"ok": True})
        status, _, body = get(self.base + "/api/config")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["providerName"], "Test Cable")

    def test_config_rejects_non_object(self):
        req = urllib.request.Request(self.base + "/api/config", data=b"[1,2]", headers={"Content-Type": "application/json"})
        with self.assertRaises(urllib.error.HTTPError) as cm:
            urllib.request.urlopen(req)
        self.assertEqual(cm.exception.code, 400)

    def test_proxy_blocks_other_hosts(self):
        for url in ("https://example.com/", "file:///etc/passwd", "http://127.0.0.1:22/"):
            status, _, _ = get(self.base + "/api/proxy?url=" + urllib.request.quote(url, safe=""))
            self.assertEqual(status, 403, url)

    def test_music_list_and_range(self):
        status, _, body = get(self.base + "/api/music")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["files"], ["/music/song.mp3"])
        status, headers, body = get(self.base + "/music/song.mp3", {"Range": "bytes=10-19"})
        self.assertEqual(status, 206)
        self.assertEqual(body, bytes(range(10, 20)))
        self.assertEqual(headers["Content-Range"], "bytes 10-19/1024")

    def test_music_path_traversal_blocked(self):
        for path in ("/music/..%2Fsecret.mp3", "/music/%2E%2E/secret.mp3", "/music/../secret.mp3"):
            status, _, body = get(self.base + path)
            self.assertNotEqual(body, b"outside", path)
            self.assertIn(status, (404, 200), path)  # 200 only if the static handler served something else


if __name__ == "__main__":
    unittest.main()
