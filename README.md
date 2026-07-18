# Prototipo PWA Collagen+ v1

Este prototipo incluye:

- Día 1 completo.
- Experiencia progresiva tipo chat.
- Botón "Mostrar todo".
- Material en el orden confirmado:
  1. A partir de los 25...
  2. La mejor forma de revertirlo...
  3. Si querés resultados...
  4. Video
- Compartir mediante Web Share API cuando el dispositivo lo permite.
- Fallback a abrir/descargar el archivo.
- Favoritos guardados en localStorage.
- Rutina visual de 7 días.
- Preguntar al Bot con 4 comandos demostrativos.
- PWA instalable con service worker.
- Día 1 e imágenes disponibles offline después de la primera carga.
  El video no se precachea inicialmente para evitar una descarga pesada automática.

## Cómo probarlo en Replit

1. Crear un Repl de HTML/CSS/JS o un proyecto estático.
2. Subir todo el contenido de esta carpeta respetando la estructura.
3. Ejecutar/publicar el proyecto.
4. Abrir la URL HTTPS desde un teléfono.
5. Probar:
   - Ver mi acción
   - Mostrar todo
   - Favoritos
   - Compartir imágenes/video
   - Completar Día 1
   - Preguntar al Bot
   - Instalar PWA (cuando el navegador lo ofrezca)

## Próximo paso técnico

Después de validar esta experiencia:
- Migrar media a Cloudflare R2.
- Agregar Días 2 a 7.
- Incorporar usuarios y zonas horarias.
- Activar push notifications reales.
