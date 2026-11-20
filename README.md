# Souvenir Made · Personalizador Shopify

Editor y flujo de revisión del taller, preparados para Render Free con datos e imágenes en Supabase. Tienda prevista: `souvenir-made-xbc1wrvr.myshopify.com`. El despliegue y la instalación real siguen pendientes.

Guía paso a paso: [publicar con Render Free y Supabase](docs/despliegue-gratuito.md).

## Probar en este equipo

Requiere Node.js 22 (22.12 o superior dentro de esa versión mayor) y Chrome para las pruebas de navegador.

```powershell
npm.cmd install
# Si .env todavía no existe: Copy-Item .env.example .env
npm.cmd run dev
```

Para probar la versión compilada sin la caché de desarrollo de Vite:

```powershell
npm.cmd run build
npm.cmd run preview:local
```

`preview:local` fuerza demostración y SQLite, y escucha solo en loopback. No se utiliza para publicar la app ni conecta con Supabase.

- Panel: http://127.0.0.1:3000/app
- Editor: http://127.0.0.1:3000/studio/cap-patch
- Conexión: http://127.0.0.1:3000/app?tab=settings

El modo local requiere `LOCAL_DEMO=true`, dirección loopback y un entorno distinto de producción. No admite encabezados de proxy para evitar que se habilite por accidente detrás de un servidor público. El proceso de desarrollo escucha únicamente en `127.0.0.1`.

Con `STORAGE_PROVIDER=sqlite`, los datos locales se guardan en `data/souvenir.sqlite`. El formato anterior se importa automáticamente sin borrar sus tablas. Conservar la base y sus archivos WAL en los respaldos; no publicar esa carpeta en Git. Esta importación local no transfiere diseños a Supabase.

En Render, `STORAGE_PROVIDER=supabase` guarda productos, diseños, revisiones, sesiones Shopify e historial en PostgreSQL, y las imágenes en un depósito privado. Los cambios se confirman mediante una transacción con comprobación de versiones y deduplicación de eventos. La app rechaza SQLite en producción para evitar perder datos al reiniciar Render. La recuperación del comprador utiliza una capacidad privada en su almacenamiento local.

## Qué funciona

- Biblioteca de 16 plantillas con búsqueda y filtros. Sus medidas son ejemplos sin validar. Desde una plantilla se pueden crear varios personalizadores independientes.
- Panel de personalizadores con búsqueda, filtros de estado, activación y asignación de uno o varios productos reales de Shopify. Un producto admite un personalizador activo; las asignaciones incluyen sus variantes y se comprueban contra la tienda en el servidor.
- Modo de compra por personalizador: precio de la variante en Shopify o revisión y cotización. Las cotizaciones actualizan su pedido preliminar y solo muestran el enlace después de verificar el precio aplicado por Shopify.
- Imagen propia del lienzo por personalizador: PNG/JPEG/WebP, encajar o cubrir, sustitución y restauración de la plantilla. Se guarda en Supabase; las revisiones anteriores conservan su imagen de referencia y el arte de impresión excluye el fondo.
- Editor frontal: texto, tipografía, colores de tinta, PNG/JPEG, movimiento, escala proporcional, giro, capas, duplicación, centrado y deshacer/rehacer.
- Guardado automático, recuperación y revisiones inmutables. Un diseño asociado a pago/cotización requiere una copia para editar.
- Validación de límites y resolución efectiva de imágenes. Normalización de cargas con Sharp; límites de formato, peso y píxeles.
- Panel del taller: solicitar cambios, aprobar, registrar historial y autorizar producción únicamente con área/técnica validadas y pago confirmado.
- ZIP por revisión con SVG, PNG transparente a 300 ppp, imágenes normalizadas y ficha JSON.
- Autenticación integrada con el paquete oficial Shopify React Router, sesiones persistentes, consulta de productos, creación de pedido preliminar sin enviar correos y recepción de eventos firmados.
- Theme App Extension con botón que abre el editor y añade al carrito la variante configurada. Solo utiliza APIs compatibles con el alcance Basic descrito en la investigación.

Las fotos de gorras se extrajeron del catálogo proporcionado por el usuario. Los demás modelos son ilustraciones de referencia. La interfaz utiliza Manrope alojada localmente, con licencia OFL incluida.

## Conectar con la tienda real

1. Registrar o vincular una app en el **Dev Dashboard de Shopify**, con distribución personalizada para esta tienda. No usar el antiguo flujo de crear apps desde el administrador.
2. Instalar Shopify CLI cuando se necesite: `npx @shopify/cli app config link`. Vincular el proyecto y completar `client_id` en `shopify.app.toml` con la configuración devuelta por Shopify.
3. Preparar las tablas y el depósito privado en Supabase con [la migración SQL](supabase/migrations/202611190001_storage.sql), desde **SQL Editor → New query → Run**. Configurar en **`.env`** para comprobar la conexión, sin compartir secretos por chat:

```dotenv
LOCAL_DEMO=false
SHOPIFY_STORE_DOMAIN=souvenir-made-xbc1wrvr.myshopify.com
SHOPIFY_API_KEY=client_id_de_la_app
SHOPIFY_API_SECRET=secreto_de_la_app
SHOPIFY_APP_URL=https://dominio-del-servidor
SCOPES=read_products,read_orders,write_draft_orders
STORAGE_PROVIDER=supabase
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SECRET_KEY=sb_secret_tu_clave
SUPABASE_STORAGE_BUCKET=souvenir-assets
```

4. Ejecutar `npm.cmd run storage:check`. Publicar el servidor según [la guía gratuita](docs/despliegue-gratuito.md): `render.yaml` selecciona **Free**, sin disco ni base de datos de Render. Las variables se configuran también en Render; `.env` no se sube. Si se omite `SHOPIFY_APP_URL`, se utiliza `RENDER_EXTERNAL_URL` automáticamente. Actualizar `application_url` y `redirect_urls` del TOML; el callback es `/auth/callback`. Shopify aloja la extensión del tema; Render ejecuta este servidor y Supabase conserva los datos.
5. Desplegar la configuración/extensión con `npm run shopify:deploy` e instalar la app mediante su enlace de distribución personalizada. Estos pasos aún no se han ejecutado ni probado contra la tienda.
6. Desde **Personalizadores → Crear personalizador**, elegir una plantilla, ponerle nombre y usar **Asignar productos** para seleccionar productos reales. Verificar color, técnica y área física antes de vender. La compra directa conserva el precio de cada variante en Shopify; para precio revisado, crear un enlace de pago desde un diseño aprobado.
7. Publicar la extensión mediante Shopify CLI y, en una copia del tema, añadir el bloque **Personalizador Souvenir** a la plantilla de producto. Dejar la URL vacía para utilizar `https://app-custom-cartia-suvenir.onrender.com` y el campo **Personalizador** en `auto`. Una URL HTTPS explícita permite cambiar de servidor. El bloque enviará producto y variante al servidor, que resolverá el personalizador activo. También admite una clave específica o el metafield `souvenir.personalizer_key` para configuraciones heredadas. Los documentos del editor permiten el iframe en `https://souvenirmade.shop`; el panel administrativo conserva la política de Shopify. Si se cambia el dominio de la tienda, actualizar la lista explícita en `app/lib/storefront-headers.server.ts`.
8. Hacer una compra de prueba, comprobar el evento de pago, revisar el diseño, exportar y fabricar una muestra. Confirmar el tema y los permisos/datos protegidos necesarios antes de activar ventas. La compra real está pendiente de esta validación.

Un personalizador comparte su vista, color de referencia, técnica y área entre los productos asignados. El selector de colores es libre solo en la demostración; no se infieren colores o medidas físicas de las opciones de Shopify. Cada diseño del comprador conserva su producto/variante y revisión; la recuperación se separa por variante. Las configuraciones existentes se mantienen. Ver [gestión de personalizadores](docs/personalizadores.md).

No pegar el secreto en `.env.example` ni subir `.env` al repositorio. `SHOPIFY_API_KEY` es el Client ID; la contraseña de la tienda no se utiliza.

## Límites de esta etapa

Esta es una base funcional para probar el flujo, **no una instalación ya operativa en Shopify ni la implementación completa de todas las etapas del informe**.

- Una cara/área por configuración; aún faltan múltiples caras, sangrado avanzado, recorte libre de imágenes y biblioteca gráfica ampliada.
- El SVG mantiene texto editable; no lo convierte a contornos. Comprobar las fuentes en el equipo del taller. El PNG es sRGB y no configura RIP, blanco, separación de colores ni espejo.
- El ZIP no contiene ponchado de bordado ni instrucciones de máquina láser. Esos procesos requieren preparación y verificación del taller.
- Los originales almacenados son imágenes normalizadas a PNG; no se conserva el binario original previo a normalizar.
- Las solicitudes/confirmaciones se consultan en la sesión del comprador y en el panel; no hay envío automático de correo/WhatsApp, cuentas ni recuperación entre dispositivos.
- La simulación de pago existe únicamente en el espacio `demo`. En la tienda, el pago se determina por eventos Shopify y firmas que vinculan diseño, revisión, variante y cantidad. Los pedidos modificados o anulados requieren revisión.
- El piloto limita los archivos por solicitud y el almacenamiento de imágenes por tienda a 256 MB. Antes de publicación comercial se deben añadir cuotas por frecuencia, retención/limpieza y monitorización de cargas/exportaciones.
- La exportación se ejecuta en la petición y requiere memoria suficiente; una cola es la siguiente mejora al aumentar el volumen. Las imágenes y los datos persistentes ya se guardan fuera de Render. Falta medir las exportaciones grandes en los recursos del plan gratuito.
- Render Free se suspende por inactividad y tarda en arrancar. Puede afectar OAuth, carga del editor y recepción oportuna de eventos; el modo gratuito sirve para validar el piloto, con las limitaciones descritas en la guía.
- No se ha verificado todavía el iframe, OAuth, permisos, cotización o eventos con la tienda real. El dominio por sí solo no permite instalarlos.

## Verificación

```powershell
npm.cmd run typecheck
npm.cmd run test:coverage
npm.cmd run build
npm.cmd run test:e2e
```

Las pruebas de navegador utilizan por defecto una base separada en `tmp/e2e.sqlite` y el puerto 3001. Para utilizar un servidor local existente:

```powershell
$env:E2E_BASE_URL='http://127.0.0.1:3000'
npm.cmd run test:e2e
```

La cobertura configurada se refiere a dominio, acceso, almacenamiento y exportación; no representa la cobertura total de la interfaz. Las pruebas de navegador verifican guardado/recuperación, revisión del taller, configuración persistente y vista móvil. Las capturas se escriben en `output/previews`.

Investigación previa y fases: [requisitos](docs/investigacion-personalizador-shopify.md). Dirección visual y recorridos: [implementación](docs/diseno-implementacion.md).
