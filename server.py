#!/usr/bin/env python3
"""
Local development server for VGC EV Spread Analyzer.
On GitHub Pages the Python server is not used — the frontend reads
pre-downloaded JSON files from data/ and data/manifest.json directly.

Run:  python server.py
Then: open http://localhost:5000
Tip:  run 'python scripts/download_data.py' first to populate data/
"""

import json, re, urllib.request
from http.server import HTTPServer, SimpleHTTPRequestHandler
from datetime import datetime, timedelta

PORT = 5000
CHAMPIONS_REGS = {"regma", "regmb", "regmc"}
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; VGC-EV-Analyzer/1.0)"}


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"  {self.address_string()} {fmt % args}")

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_GET(self):
        path = self.path.split("?")[0]
        if path.startswith("/api/smogon/"):
            self.handle_proxy()
        elif path == "/api/available-regulations":
            self.handle_regulations()
        else:
            super().do_GET()

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_proxy(self):
        """Proxy a request to Smogon stats (fallback when data/ files are absent)."""
        parts = self.path.split("?")[0].split("/")
        if len(parts) < 7:
            self.send_json({"error": "Bad URL — expected /api/smogon/{month}/{format}/{regulation}/{elo}"}, 400)
            return

        month = parts[3]      # e.g. "2026-05"
        fmt = parts[4]        # "bo1" or "bo3"
        regulation = parts[5] # e.g. "regi" or "regma"
        elo = parts[6]        # e.g. "1500"
        year = month.split("-")[0]

        suffix = "bo3" if fmt == "bo3" else ""
        if regulation in CHAMPIONS_REGS:
            prefix = f"gen9championsvgc{year}{regulation}"
        else:
            prefix = f"gen9vgc{year}{regulation}"

        url = f"https://www.smogon.com/stats/{month}/chaos/{prefix}{suffix}-{elo}.json"
        print(f"  Fetching from Smogon: {url}")

        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as r:
                raw = r.read()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
            print(f"  OK ({len(raw):,} bytes)")
        except urllib.request.HTTPError as e:
            self.send_json({"error": f"Smogon returned {e.code}: {e.reason}"}, e.code)
        except Exception as e:
            self.send_json({"error": str(e)}, 502)

    def handle_regulations(self):
        """Scrape Smogon index to detect available regulations (local dev fallback)."""
        today = datetime.utcnow()
        for months_back in range(5):
            d = today.replace(day=1) - timedelta(days=months_back * 30)
            ym = f"{d.year}-{d.month:02d}"
            try:
                req = urllib.request.Request(
                    f"https://www.smogon.com/stats/{ym}/", headers=HEADERS
                )
                with urllib.request.urlopen(req, timeout=10) as r:
                    html = r.read().decode("utf-8")
                regs, elos = set(), set()
                for m in re.finditer(r"gen9vgc\d{4}(reg[a-z])(bo[13])?-(\d+)\.txt", html):
                    regs.add(m.group(1)); elos.add(m.group(3))
                for m in re.finditer(r"gen9championsvgc\d{4}(reg[a-z]+)(bo[13])?-(\d+)\.txt", html):
                    regs.add(m.group(1)); elos.add(m.group(3))
                if regs:
                    print(f"  Regulations from {ym}: {sorted(regs)}")
                    self.send_json({
                        "regulations": sorted(regs),
                        "elo_levels": sorted(elos, key=int),
                    })
                    return
            except Exception:
                pass
        self.send_json({
            "regulations": ["regi", "regma"],
            "elo_levels": ["0", "1500", "1630", "1760"],
        })


if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Server running on port {PORT}")
    print(f"Access the app at: http://localhost:{PORT}")
    print(f"Tip: run 'python scripts/download_data.py' to pre-download data/")
    server.serve_forever()
