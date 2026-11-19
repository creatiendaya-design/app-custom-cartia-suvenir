# Verificación del piloto y almacenamiento en la nube

Fecha: 19 de noviembre de 2026.

- Comprobación de tipos: correcta.
- Compilación cliente y servidor: correcta.
- Pruebas unitarias e integración: 41 aprobadas.
- Cobertura de los módulos configurados (dominio, acceso, repositorio, adaptadores SQLite/Supabase, transacciones, URL del servidor y exportación): 94,76 % de líneas, 84,70 % de ramas y 97,67 % de funciones. No representa cobertura de toda la interfaz.
- Navegador Chrome sobre la versión compilada: 4 recorridos aprobados. Incluyen apertura desde la raíz conservando el contexto de Shopify, edición, guardado, recuperación, envío, aprobación y bloqueo de producción; configuración persistente; vista móvil sin desbordamiento horizontal. El recorrido de apertura utiliza la demostración local; no sustituye la prueba de OAuth en la tienda.
- Capturas revisadas en `output/previews/editor.png` y `output/previews/editor-mobile.png`.

La migración SQL se ejecutó en PostgreSQL mediante PGlite. Se verificaron confirmación y reversión de transacciones, conflictos de versiones, inmutabilidad de revisiones, deduplicación de eventos, restricción de lectura/ejecución al rol de servidor y depósito privado. El SDK real de Supabase se probó con un transporte local sobre ese esquema: persistencia entre instancias del repositorio, imágenes, sesiones, guardado simultáneo y eventos de pago/desinstalación. Estas pruebas no usan las credenciales ni el proyecto remoto del usuario.

También se comprobaron rechazo de claves públicas, errores sin detalles privados, compensación de una subida cuando se supera la cuota, importación del formato SQLite anterior y bloqueo de SQLite en producción. `preview:local` fuerza SQLite aunque existan credenciales Supabase en el entorno.

Se detectó un problema de respuestas 504 de dependencias optimizadas en el servidor Vite durante las pruebas. Se añadió preoptimización explícita y un lanzador de previsualización local de la compilación, que evita esa caché. Los recorridos finales se ejecutaron sobre la compilación.

La generación PNG se completó, aunque Fontconfig informó que no pudo escribir su caché fuera del workspace. El taller debe verificar fuentes y medidas antes de producir, como indica el paquete exportado.

Tras ejecutar la migración desde SQL Editor, `npm.cmd run storage:check` terminó correctamente contra el proyecto Supabase indicado en `.env`: tabla disponible, transacción vacía confirmada y depósito `souvenir-assets` privado. No se crearon diseños ni se mostraron claves. La comprobación de subida de imágenes y guardado completo desde el despliegue real sigue pendiente.

Render informó que el servicio está activo en `https://app-custom-cartia-suvenir.onrender.com`. Se verificó HTTP 200 en `/health`, con identificación de esta app, y en `/auth/login`, con el formulario de conexión. Esto verifica que el servidor responde; no demuestra todavía guardado remoto ni OAuth. El TOML local quedó preparado con la URL pública y su callback; esos cambios aún deben publicarse en Shopify.

Se reprodujo el bloqueo al abrir la app dentro de Shopify: la raíz pública redirigía a `/auth/login`, y esa ruta enviaba a `admin.shopify.com/.../oauth/install` dentro del iframe. Se corrigió la entrada para dirigir el contexto Shopify a `/app` conservando todos los parámetros, como la plantilla oficial, y se añadieron los encabezados del SDK a la ruta `auth/*`. Cinco pruebas nuevas cubren la apertura, el acceso directo, la demostración, los encabezados y la página App Bridge del SDK para renovar el token. La corrección debe llegar al servicio Render antes de repetir la apertura en la tienda.

Pendiente de verificación real: guardado y subida de imágenes desde el despliegue, variables y plan Free del servicio Render, instalación/OAuth de Shopify, tema, iframe, catálogo y variantes, carrito/checkout, permisos, cotización y eventos de pedido. No se han realizado compras ni cambios en la tienda. Ver [guía gratuita](despliegue-gratuito.md) y `README.md` para configuración y límites del piloto.
