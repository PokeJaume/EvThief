#!/usr/bin/env python3
import http.server
import socketserver
import os

PORT = 5000

class SimpleHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

if __name__ == "__main__":
    # Kill any existing processes
    os.system("pkill -f python 2>/dev/null || true")
    
    class ReusableServer(socketserver.TCPServer):
        allow_reuse_address = True
    
    with ReusableServer(("0.0.0.0", PORT), SimpleHandler) as httpd:
        print(f"Simple server running on port {PORT}")
        httpd.serve_forever()