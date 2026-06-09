#!/usr/bin/env python3
"""
Smogon Data Preloader
Descarga y almacena datos de Smogon para acceso instantáneo
"""

import os
import json
import requests
import time
from datetime import datetime, timedelta
import gzip
import shutil

class SmogonDataPreloader:
    def __init__(self, data_dir="./data"):
        self.data_dir = data_dir
        self.base_url = "https://www.smogon.com/stats"
        
        # Crear directorio de datos si no existe
        os.makedirs(data_dir, exist_ok=True)
    
    def get_available_months(self, limit_months=12):
        """Obtiene los meses disponibles para descarga"""
        available_months = []
        current_date = datetime.now()
        
        for i in range(1, limit_months + 2):  # +2 para asegurar que obtenemos suficientes datos
            check_date = current_date - timedelta(days=30 * i)
            year = check_date.year
            month = check_date.month
            
            # Solo incluir datos si estamos después del día 5 del mes siguiente
            if current_date.day >= 5 or current_date.month != check_date.month:
                available_months.append(f"{year}-{month:02d}")
        
        return available_months[:limit_months]
    
    def download_month_data(self, year_month, elo_levels=["1760"], formats=["gen9ou"], battle_types=["", "-bo3"]):
        """Descarga datos para un mes específico"""
        print(f"🔄 Descargando datos para {year_month}...")
        
        month_data = {}
        
        for format_name in formats:
            for battle_type in battle_types:
                for elo in elo_levels:
                    # Construir URLs
                    chaos_url = f"{self.base_url}/{year_month}/{format_name}{battle_type}-{elo}.json"
                    
                    try:
                        print(f"  📥 Descargando: {format_name}{battle_type}-{elo}")
                        
                        # Descargar datos de chaos
                        response = requests.get(chaos_url, timeout=30)
                        response.raise_for_status()
                        
                        chaos_data = response.json()
                        
                        # Almacenar en estructura organizada
                        battle_format = "bo3" if battle_type else "bo1"
                        key = f"{format_name}_{battle_format}_{elo}"
                        
                        month_data[key] = chaos_data
                        
                        print(f"  ✅ Descargado: {key} ({len(chaos_data.get('data', {}))} Pokémon)")
                        
                        # Pequeña pausa para no sobrecargar el servidor
                        time.sleep(0.5)
                        
                    except requests.RequestException as e:
                        print(f"  ❌ Error descargando {key}: {e}")
                        continue
                    except json.JSONDecodeError as e:
                        print(f"  ❌ Error JSON para {key}: {e}")
                        continue
        
        return month_data
    
    def save_month_data(self, year_month, data):
        """Guarda los datos del mes en archivo comprimido"""
        if not data:
            print(f"  ⚠️  No hay datos para guardar para {year_month}")
            return
        
        # Archivo de datos comprimido
        file_path = os.path.join(self.data_dir, f"{year_month}.json.gz")
        
        try:
            with gzip.open(file_path, 'wt', encoding='utf-8') as f:
                json.dump(data, f, separators=(',', ':'))
            
            file_size = os.path.getsize(file_path) / (1024 * 1024)  # MB
            print(f"  💾 Guardado: {file_path} ({file_size:.1f} MB)")
            
        except Exception as e:
            print(f"  ❌ Error guardando {year_month}: {e}")
    
    def load_month_data(self, year_month):
        """Carga datos del mes desde archivo"""
        file_path = os.path.join(self.data_dir, f"{year_month}.json.gz")
        
        if not os.path.exists(file_path):
            return None
        
        try:
            with gzip.open(file_path, 'rt', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"❌ Error cargando {year_month}: {e}")
            return None
    
    def preload_all_data(self):
        """Descarga y guarda todos los datos disponibles"""
        print("🚀 Iniciando precarga de datos de Smogon...")
        
        available_months = self.get_available_months()
        print(f"📅 Meses a procesar: {', '.join(available_months)}")
        
        total_downloaded = 0
        
        for year_month in available_months:
            # Verificar si ya tenemos los datos
            if os.path.exists(os.path.join(self.data_dir, f"{year_month}.json.gz")):
                print(f"⏭️  Saltando {year_month} (ya existe)")
                continue
            
            # Descargar datos del mes
            month_data = self.download_month_data(year_month)
            
            if month_data:
                self.save_month_data(year_month, month_data)
                total_downloaded += 1
            
            print(f"  ⏸️  Pausa entre meses...")
            time.sleep(2)  # Pausa entre meses
        
        print(f"🎉 Precarga completada! {total_downloaded} meses procesados")
        self.create_index()
    
    def create_index(self):
        """Crea un índice de datos disponibles"""
        index = {
            "last_updated": datetime.now().isoformat(),
            "available_months": [],
            "total_files": 0,
            "total_size_mb": 0
        }
        
        for filename in os.listdir(self.data_dir):
            if filename.endswith('.json.gz'):
                year_month = filename.replace('.json.gz', '')
                file_path = os.path.join(self.data_dir, filename)
                file_size = os.path.getsize(file_path) / (1024 * 1024)
                
                index["available_months"].append({
                    "month": year_month,
                    "size_mb": round(file_size, 1)
                })
                index["total_size_mb"] += file_size
                index["total_files"] += 1
        
        index["total_size_mb"] = round(index["total_size_mb"], 1)
        index["available_months"].sort(key=lambda x: x["month"], reverse=True)
        
        # Guardar índice
        index_path = os.path.join(self.data_dir, "index.json")
        with open(index_path, 'w') as f:
            json.dump(index, f, indent=2)
        
        print(f"📋 Índice creado: {index['total_files']} archivos, {index['total_size_mb']} MB total")
    
    def get_cached_data(self, year_month, format_name="gen9ou", battle_type="bo1", elo="1760"):
        """Obtiene datos de la caché local"""
        month_data = self.load_month_data(year_month)
        
        if not month_data:
            return None
        
        key = f"{format_name}_{battle_type}_{elo}"
        return month_data.get(key)


def main():
    """Función principal para ejecutar la precarga"""
    preloader = SmogonDataPreloader()
    preloader.preload_all_data()


if __name__ == "__main__":
    main()