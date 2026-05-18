#!/usr/bin/env python3
import http.server
import socketserver
import urllib.request
import urllib.parse
import json
import os
import gzip
import re
from datetime import datetime, timedelta
from urllib.error import HTTPError, URLError

class SmogonProxyHandler(http.server.SimpleHTTPRequestHandler):
    # Security allowlists and validation patterns
    VALID_REGULATIONS = {'regf', 'regg', 'regh', 'regi', 'regj', 'regk', 'regl', 'regm', 'regn', 'rego', 'regp', 'regq', 'regma'}
    VALID_FORMATS = {'bo1', 'bo3'}
    
    # Champions Series regulations that use a different URL prefix on Smogon
    CHAMPIONS_REGULATIONS = {'regma'}
    MONTH_PATTERN = re.compile(r'^\d{4}-\d{2}$')
    ELO_PATTERN = re.compile(r'^\d+$')
    
    def __init__(self, *args, **kwargs):
        self.data_dir = "./data"
        super().__init__(*args, **kwargs)
    
    def validate_input_parameters(self, month, format_type, regulation, elo):
        """Validates all input parameters for security and correctness"""
        errors = []
        
        # Validate month format (YYYY-MM) and sanitize for path safety
        if not self.MONTH_PATTERN.match(month):
            errors.append("Month must be in YYYY-MM format")
        else:
            # Additional path traversal protection
            if '../' in month or '\\' in month or month.startswith('/'):
                errors.append("Invalid characters in month parameter")
        
        # Validate format type
        if format_type not in self.VALID_FORMATS:
            errors.append(f"Format must be one of: {', '.join(self.VALID_FORMATS)}")
        
        # Validate regulation
        if regulation not in self.VALID_REGULATIONS:
            errors.append(f"Regulation must be one of: {', '.join(self.VALID_REGULATIONS)}")
        
        # Validate elo
        if not self.ELO_PATTERN.match(elo):
            errors.append("Elo must be numeric")
        elif not (1000 <= int(elo) <= 2000):
            errors.append("Elo must be between 1000 and 2000")
        
        return errors
    
    def extract_year_from_month(self, month):
        """Safely extract year from validated month string"""
        return month.split('-')[0]
    
    def get_correct_year_for_regulation(self, month, regulation):
        """
        Get the correct year for a regulation.
        Automatically detects current season and adjusts year if needed.
        For example: if requesting regf data from 2025-11, 
        it returns 2026 since we're now in the 2026 VGC season.
        """
        year = int(self.extract_year_from_month(month))
        current_year = datetime.now().year
        
        # Map regulations to their respective years
        # regf, regg are 2025 regulations (but we're now in 2026)
        # regh, regi, regj, regk, etc. are 2026+ regulations
        # Champions Series (regma) always uses 2026
        regulations_2025 = {'regf', 'regg'}
        
        # Champions regulations don't follow year pattern
        if regulation in self.CHAMPIONS_REGULATIONS:
            return '2026'
        
        # If requesting old regulation data from past year,
        # but current year is different, use current year
        if regulation in regulations_2025 and year < current_year:
            year = current_year
            print(f"Auto-adjusting year for {regulation}: using {year}")
        
        return str(year)
    
    def sanitize_filename(self, filename):
        """Sanitize filename to prevent path traversal attacks"""
        # Remove any path components and only keep the base filename
        sanitized = os.path.basename(filename)
        # Additional check for valid characters
        if not re.match(r'^[a-zA-Z0-9\-_.]+$', sanitized):
            raise ValueError(f"Invalid filename: {filename}")
        return sanitized

    def do_GET(self):
        # Handle different API endpoints
        if self.path.startswith('/api/cached/'):
            self.handle_cached_data()
        elif self.path == '/api/available-months':
            self.handle_available_months()
        elif self.path == '/api/available-regulations':
            self.handle_available_regulations()
        elif self.path.startswith('/api/smogon/'):
            self.handle_smogon_proxy()
        else:
            # Serve static files normally
            super().do_GET()
    
    def handle_cached_data(self):
        """Maneja solicitudes de datos precargados"""
        try:
            # Parse URL: /api/cached/2024-06/gen9ou/bo1/regi/1760
            path_parts = self.path.split('/')
            if len(path_parts) < 8:
                self.send_error_response(400, "Invalid cached data URL format")
                return
            
            year_month = path_parts[3]
            format_name = path_parts[4]
            battle_type = path_parts[5]
            regulation = path_parts[6]
            elo = path_parts[7]
            
            # Validate all input parameters for security
            validation_errors = self.validate_input_parameters(year_month, battle_type, regulation, elo)
            if validation_errors:
                error_msg = f"Invalid parameters: {'; '.join(validation_errors)}"
                self.send_error_response(400, error_msg)
                return
            
            # Cargar datos del archivo con parámetros validados
            cached_data = self.load_cached_data(year_month, format_name, battle_type, regulation, elo)
            
            if cached_data:
                self.send_json_response(cached_data)
                print(f"✅ Served cached data: {year_month}/{format_name}/{battle_type}/{regulation}/{elo}")
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
    
    def handle_available_regulations(self):
        """Scrape Smogon to get available VGC regulations and ELO levels"""
        try:
            # Try recent months (current and up to 3 months back) until one works
            today = datetime.now()
            html = None
            month = None
            for months_back in range(0, 4):
                candidate = today.replace(day=1) - timedelta(days=months_back * 30)
                candidate_month = f"{candidate.year}-{candidate.month:02d}"
                smogon_url = f"https://www.smogon.com/stats/{candidate_month}/"
                req = urllib.request.Request(smogon_url)
                req.add_header('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
                try:
                    with urllib.request.urlopen(req, timeout=10) as response:
                        html = response.read().decode('utf-8')
                        month = candidate_month
                        print(f"Successfully fetched regulations from {candidate_month}")
                        break
                except Exception:
                    print(f"No data for {candidate_month}, trying earlier month...")
            
            if not html:
                raise Exception("No stats data found in the last 4 months")
            
            # Parse available regulations and ELO levels from filenames
            regulations = set()
            elo_levels = set()
            
            # Match standard VGC: gen9vgc2026regfbo3-1630.txt
            import re
            pattern = r'gen9vgc\d{4}(reg[a-z])(bo3)?-(\d+)\.txt'
            for match in re.finditer(pattern, html):
                regulation = match.group(1)
                elo = match.group(3)
                regulations.add(regulation)
                elo_levels.add(elo)
            
            # Match Champions Series VGC: gen9championsvgc2026regmabo3-1630.txt
            champions_pattern = r'gen9championsvgc\d{4}(reg[a-z]+)(bo3)?-(\d+)\.txt'
            for match in re.finditer(champions_pattern, html):
                regulation = match.group(1)
                elo = match.group(3)
                regulations.add(regulation)
                elo_levels.add(elo)
            
            # Sort results
            sorted_regs = sorted(list(regulations))
            sorted_elos = sorted(list(elo_levels), key=int)
            
            response_data = {
                "regulations": sorted_regs,
                "elo_levels": sorted_elos,
                "month": month
            }
            
            self.send_json_response(response_data)
            print(f"Found regulations: {sorted_regs}, ELO levels: {sorted_elos}")
            
        except Exception as e:
            print(f"Error scraping regulations: {e}")
            # Return default values if scraping fails
            self.send_json_response({
                "regulations": ["regf", "regh", "regi", "regj", "regma"],
                "elo_levels": ["0", "1500", "1630", "1760"],
                "error": str(e)
            })
    
    def load_cached_data(self, year_month, format_name="gen9ou", battle_type="bo1", regulation="regi", elo="1760"):
        """Carga datos desde caché local con compatibilidad hacia atrás"""
        # Sanitize the filename to prevent path traversal attacks
        try:
            sanitized_filename = self.sanitize_filename(f"{year_month}.json.gz")
            file_path = os.path.join(self.data_dir, sanitized_filename)
        except ValueError as e:
            print(f"Invalid filename detected: {e}")
            return None
        
        if not os.path.exists(file_path):
            return None
        
        try:
            with gzip.open(file_path, 'rt', encoding='utf-8') as f:
                month_data = json.load(f)
            
            # Try new cache key format first
            key = f"{format_name}_{battle_type}_{regulation}_{elo}"
            cached_data = month_data.get(key)
            
            # Fallback to legacy cache key format for backward compatibility
            if cached_data is None:
                legacy_key = f"{format_name}_{battle_type}_{elo}"
                cached_data = month_data.get(legacy_key)
                if cached_data:
                    print(f"Using legacy cache key: {legacy_key}")
            
            return cached_data
            
        except Exception as e:
            print(f"Error loading cached data from {file_path}: {e}")
            return None

    def handle_smogon_proxy(self):
        """Maneja solicitudes directas a la API de Smogon (fallback)"""
        try:
            # Extract parameters from URL
            path_parts = self.path.split('/')
            if len(path_parts) < 7:
                self.send_error(400, "Invalid URL format. Expected: /api/smogon/{month}/{format}/{regulation}/{elo}")
                return
            
            month = path_parts[3]   # e.g., "2024-06"
            format_type = path_parts[4]  # "bo1" or "bo3"
            regulation = path_parts[5]  # e.g., "regi", "regj", etc.
            elo = path_parts[6]     # e.g., "1630"
            
            # Validate all input parameters for security
            validation_errors = self.validate_input_parameters(month, format_type, regulation, elo)
            if validation_errors:
                error_msg = f"Invalid parameters: {'; '.join(validation_errors)}"
                self.send_error(400, error_msg)
                return
            
            # Extract year and auto-correct for current season
            year = self.get_correct_year_for_regulation(month, regulation)
            
            # Build Smogon URL - Champions Series uses a different prefix
            if regulation in self.CHAMPIONS_REGULATIONS:
                if format_type == "bo1":
                    smogon_url = f"https://www.smogon.com/stats/{month}/chaos/gen9championsvgc{year}{regulation}-{elo}.json"
                elif format_type == "bo3":
                    smogon_url = f"https://www.smogon.com/stats/{month}/chaos/gen9championsvgc{year}{regulation}bo3-{elo}.json"
                else:
                    self.send_error(400, "Invalid format. Use 'bo1' or 'bo3'")
                    return
            elif format_type == "bo1":
                smogon_url = f"https://www.smogon.com/stats/{month}/chaos/gen9vgc{year}{regulation}-{elo}.json"
            elif format_type == "bo3":
                smogon_url = f"https://www.smogon.com/stats/{month}/chaos/gen9vgc{year}{regulation}bo3-{elo}.json"
            else:
                # This should never happen due to validation, but included for safety
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
    
    # Allow reusing the socket address to avoid "Address already in use" errors
    socketserver.TCPServer.allow_reuse_address = True
    
    with socketserver.TCPServer(("0.0.0.0", PORT), SmogonProxyHandler) as httpd:
        print(f"Server running on port {PORT}")
        print(f"Access the app at: http://localhost:{PORT}")
        httpd.serve_forever()