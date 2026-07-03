# EV Spread Analyzer

Aplicación estática para explorar spreads de EV de Smogon VGC desde datos predescargados.

## Qué incluye

- Página web estática para GitHub Pages: [index.html](index.html)
- Lógica de análisis y filtros: [script.js](script.js)
- Estilos: [styles.css](styles.css)
- Datos descargados automáticamente en [data/](data/)
- Workflow de actualización mensual: [.github/workflows/update-data.yml](.github/workflows/update-data.yml)
- Workflow de despliegue a GitHub Pages: [.github/workflows/deploy.yml](.github/workflows/deploy.yml)

## Estructura principal

- [data/](data/) — archivos JSON del mes actual y manifest
- [scripts/download_data.py](scripts/download_data.py) — descarga los datos de Smogon y actualiza el manifest
- [index.html](index.html), [script.js](script.js), [styles.css](styles.css) — frontend

## Despliegue

El sitio está preparado para GitHub Pages usando la rama `gh-pages` generada por el workflow de despliegue.

## Actualización de datos

El workflow mensual ejecuta:

```bash
python scripts/download_data.py
```

Y publica los cambios automáticamente cuando termina con éxito.
