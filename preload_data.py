#!/usr/bin/env python3
"""
Script para precargar datos de Smogon para acceso instantáneo
Ejecutar con: python preload_data.py
"""

import os
import sys
from data_preloader import SmogonDataPreloader

def main():
    print("🚀 Iniciando precarga de datos de Smogon...")
    print("Este proceso descargará datos históricos para acceso instantáneo")
    print()
    
    # Crear preloader
    preloader = SmogonDataPreloader()
    
    # Verificar si ya existen datos
    existing_files = []
    if os.path.exists(preloader.data_dir):
        existing_files = [f for f in os.listdir(preloader.data_dir) if f.endswith('.json.gz')]
    
    if existing_files:
        print(f"📁 Se encontraron {len(existing_files)} archivos de datos existentes:")
        for filename in sorted(existing_files):
            month = filename.replace('.json.gz', '')
            file_path = os.path.join(preloader.data_dir, filename)
            size_mb = os.path.getsize(file_path) / (1024 * 1024)
            print(f"  - {month} ({size_mb:.1f} MB)")
        print()
        
        response = input("¿Deseas continuar y actualizar los datos? (s/n): ").lower().strip()
        if response not in ['s', 'si', 'sí', 'y', 'yes']:
            print("❌ Cancelado por el usuario")
            return
        print()
    
    # Ejecutar precarga
    try:
        preloader.preload_all_data()
        
        print()
        print("🎉 ¡Precarga completada exitosamente!")
        print()
        print("Ahora puedes:")
        print("1. Iniciar el servidor: python server.py")
        print("2. Acceder a la aplicación en http://localhost:5000")
        print("3. Los datos se cargarán instantáneamente desde caché local")
        print()
        
        # Mostrar estadísticas finales
        if os.path.exists(os.path.join(preloader.data_dir, "index.json")):
            import json
            with open(os.path.join(preloader.data_dir, "index.json"), 'r') as f:
                index = json.load(f)
            
            print(f"📊 Estadísticas:")
            print(f"  • Total archivos: {index['total_files']}")
            print(f"  • Espacio total: {index['total_size_mb']} MB")
            print(f"  • Última actualización: {index['last_updated'][:19].replace('T', ' ')}")
        
    except KeyboardInterrupt:
        print("\n❌ Proceso interrumpido por el usuario")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Error durante la precarga: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()