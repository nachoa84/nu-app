# LifePak Elements · revisión en development

Primer agregado después del piloto Colágeno/LifePak. Conserva Inicio → Suplementos, las tarjetas existentes, las acciones generales y Collagen+ de 30 días.

- Programa independiente `lifepak-elements-5`: cinco días con tres materiales ordenados por día. No se inventan tareas diarias; solo Prysm iO las tendrá.
- Se verificaron tamaño y SHA-256 de los 15 originales de Drive frente al inventario 05. Los originales permanecen en Drive.
- Se generaron 13 JPEG para móvil, dos MP4 H.264/AAC y dos portadas WebP. La nueva entrega ocupa alrededor de 5,4 MB frente a 137,7 MB originales.
- La portada usa el PNG transparente de LifePak Elements aportado para las tarjetas. El progreso de cada usuario y suplemento permanece separado.
- `schema.sql` y `migration-supplements-elements-v1.sql` agregan la identidad y el límite de cinco días de forma aditiva. La app enciende el esquema al iniciar contra su base configurada; esta revisión no aplica cambios a producción.
- El script de preparación acepta `--routine-id lifepak-elements-5 --append` para sumar el material verificado al contenido anterior.

Verificación local: tres pruebas específicas pasan; las 13 imágenes se abren y los dos videos informan H.264. Pendiente: recorrer visualmente todos los días, reproducción y progreso en el preview de Replit. No hubo publicación ni mezcla con main.
