#!/usr/bin/env python3
import http.server
import socketserver
import urllib.request
import urllib.parse
import json
from urllib.error import HTTPError, URLError

class SmogonProxyHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # Handle proxy requests to Smogon
        if self.path.startswith('/api/smogon/'):
            self.handle_smogon_proxy()
        else:
            # Serve static files normally
            super().do_GET()
    
    def handle_smogon_proxy(self):
        try:
            # Extract parameters from URL
            path_parts = self.path.split('/')
            if len(path_parts) < 6:
                self.send_error(400, "Invalid URL format. Expected: /api/smogon/{month}/{format}/{elo}")
                return
            
            month = path_parts[3]   # e.g., "2025-06"
            format_type = path_parts[4]  # "bo1" or "bo3"
            elo = path_parts[5]     # e.g., "1630"
            
            # Build Smogon URL based on format
            if format_type == "bo1":
                smogon_url = f"https://www.smogon.com/stats/{month}/chaos/gen9vgc2025regi-{elo}.json"
            elif format_type == "bo3":
                smogon_url = f"https://www.smogon.com/stats/{month}/chaos/gen9vgc2025regibo3-{elo}.json"
            else:
                self.send_error(400, "Invalid format. Use 'bo1' or 'bo3'")
                return
            
            print(f"Fetching data from: {smogon_url}")
            
            # Make request to Smogon
            req = urllib.request.Request(smogon_url)
            req.add_header('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
            
            with urllib.request.urlopen(req, timeout=30) as response:
                data = response.read()
                
                # Send successful response
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
                self.send_header('Access-Control-Allow-Headers', 'Content-Type')
                self.end_headers()
                
                self.wfile.write(data)
                print(f"Successfully proxied data from Smogon ({len(data)} bytes)")
                
        except HTTPError as e:
            print(f"HTTP Error: {e.code} - {e.reason}")
            self.send_error(e.code, f"Smogon server error: {e.reason}")
        except URLError as e:
            print(f"URL Error: {e.reason}")
            self.send_error(503, f"Connection error: {e.reason}")
        except Exception as e:
            print(f"Unexpected error: {e}")
            self.send_error(500, f"Server error: {str(e)}")
    
    def do_OPTIONS(self):
        # Handle CORS preflight requests
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

if __name__ == "__main__":
    PORT = 5000
    
    with socketserver.TCPServer(("0.0.0.0", PORT), SmogonProxyHandler) as httpd:
        print(f"Server running on port {PORT}")
        print(f"Access the app at: http://localhost:{PORT}")
        httpd.serve_forever()