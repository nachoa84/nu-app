# Nu App — PWA

Aplicación PWA para rutinas diarias, con una interfaz HTML/CSS/JavaScript y un backend Node/Express.

## Cómo ejecutarla en Replit

El workflow **Start application** inicia el proyecto automáticamente con:

```sh
npm start
```

El servidor escucha en el puerto 5000 y sirve la aplicación en el Preview de Replit.

## Servicios opcionales

- **PostgreSQL:** habilita la persistencia de datos del backend mediante `DATABASE_URL`.
- **Web Push:** requiere `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT`. Sin estas variables, la aplicación sigue funcionando, pero no envía notificaciones push.

## Stack

- Node.js y Express
- HTML, CSS y JavaScript sin framework
- PostgreSQL para datos del backend
- Service Worker y Web App Manifest para instalación y uso offline
- Replit Object Storage para recursos multimedia
