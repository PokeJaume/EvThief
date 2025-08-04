#!/usr/bin/env python3
import http.server
import socketserver
import urllib.request
import urllib.parse
import json
import os
import gzip
from datetime import datetime, timedelta
from urllib.error import HTTPError, URLError

class SmogonProxyHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        self.data_dir = "./data"
        super().__init__(*args, **kwargs)
    
    def do_GET(self):
        # Handle different API endpoints
        if self.path.startswith('/api/cached/'):
            self.handle_cached_data()
        elif self.path == '/api/available-months':
            self.handle_available_months()
        elif self.path.startswith('/api/smogon/'):
            self.handle_smogon_proxy()
        else:
            # Serve static files normally
            super().do_GET()
    
    def handle_cached_data(self):
        """Maneja solicitudes de datos precargados"""
        try:
            # Parse URL: /api/cached/2024-06/gen9ou/bo1/1760
            path_parts = self.path.split('/')
            if len(path_parts) < 7:
                self.send_error_response(400, "Invalid cached data URL format")
                return
            
            year_month = path_parts[3]
            format_name = path_parts[4]
            battle_type = path_parts[5]
            elo = path_parts[6]
            
            # Cargar datos del archivo
            cached_data = self.load_cached_data(year_month, format_name, battle_type, elo)
            
            if cached_data:
                self.send_json_response(cached_data)
                print(f"✅ Served cached data: {year_month}/{format_name}/{battle_type}/{elo}")
            else:
                self.send_error_response(404, f"No cached data found for {year_month}")
                
        except Exception as e:
            print(f"Error serving cached data: {e}")
            self.send_error_response(500, f"Error loading cached data: {str(e)}")
    
    def handle_available_months(self):
        """Devuelve los meses disponibles en caché"""
        try:
            index_path = os.path.join(self.data_dir, "index.json")
            
            if os.path.exists(index_path):
                with open(index_path, 'r') as f:
                    index_data = json.load(f)
                self.send_json_response(index_data)
            else:
                # Generar lista básica si no hay índice
                available_months = []
                if os.path.exists(self.data_dir):
                    for filename in os.listdir(self.data_dir):
                        if filename.endswith('.json.gz'):
                            month = filename.replace('.json.gz', '')
                            available_months.append({"month": month, "size_mb": 0})
                
                response = {
                    "available_months": sorted(available_months, key=lambda x: x["month"], reverse=True),
                    "total_files": len(available_months),
                    "last_updated": datetime.now().isoformat()
                }
                self.send_json_response(response)
                
        except Exception as e:
            print(f"Error getting available months: {e}")
            self.send_error_response(500, f"Error: {str(e)}")
    
    def load_cached_data(self, year_month, format_name="gen9ou", battle_type="bo1", elo="1760"):
        """Carga datos desde caché local"""
        file_path = os.path.join(self.data_dir, f"{year_month}.json.gz")
        
        if not os.path.exists(file_path):
            return None
        
        try:
            with gzip.open(file_path, 'rt', encoding='utf-8') as f:
                month_data = json.load(f)
            
            key = f"{format_name}_{battle_type}_{elo}"
            return month_data.get(key)
            
        except Exception as e:
            print(f"Error loading cached data from {file_path}: {e}")
            return None

    def handle_smogon_proxy(self):
        """Maneja solicitudes directas a la API de Smogon (fallback)"""
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
    
    def send_json_response(self, data):
        """Envía una respuesta JSON con headers CORS"""
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        
        json_data = json.dumps(data)
        self.wfile.write(json_data.encode())
    
    def send_error_response(self, status_code, message):
        """Envía una respuesta de error JSON"""
        self.send_response(status_code)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        
        error_response = json.dumps({
            'error': message,
            'status': status_code
        })
        self.wfile.write(error_response.encode())
    
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