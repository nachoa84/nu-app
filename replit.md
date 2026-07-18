# Collagen+ PWA — Prototipo v1

Prototipo de PWA estática (HTML + CSS + JS) para una rutina de 30 días con experiencia tipo chat.

## Cómo correrlo

El proyecto usa un servidor HTTP estático de Python. El workflow "Start application" lo levanta automáticamente.

```
python3 -m http.server 5000
```

Abrir en `http://localhost:5000` (o la URL de Replit en preview).

## Stack

- HTML / CSS / JavaScript puro (sin frameworks)
- Service Worker para soporte offline (Día 1 + imágenes)
- Web App Manifest para instalación como PWA
- localStorage para favoritos y progreso

## Estructura

```
index.html          → App principal
styles.css          → Estilos
app.js              → Lógica de la app
manifest.webmanifest→ Configuración PWA
service-worker.js   → Cache offline
assets/             → Imágenes y video del Día 1
```

## Próximos pasos sugeridos

- Migrar media a Cloudflare R2
- Agregar Días 2 a 7
- Incorporar usuarios y zonas horarias
- Activar push notifications reales
