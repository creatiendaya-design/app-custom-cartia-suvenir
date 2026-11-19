# Souvenir Made · Personalizador Shopify

Primera versión local del editor y del flujo de revisión del taller. Tienda prevista: `souvenir-made-xbc1wrvr.myshopify.com`.

## Probar en este equipo

Requiere Node.js 22.12 o superior y Chrome para las pruebas de navegador.

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

`preview:local` fuerza el modo demostración y escucha solo en loopback. No se utiliza para publicar la app.

- Panel: http://127.0.0.1:3000/app
- Editor: http://127.0.0.1:3000/studio/cap-patch
- Conexión: http://127.0.0.1:3000/app?tab=settings

El modo local requiere `LOCAL_DEMO=true`, dirección loopback y un entorno distinto de producción. No admite encabezados de proxy para evitar que se habilite por accidente detrás de un servidor público. El proceso de desarrollo escucha únicamente en `127.0.0.1`.

Los datos se guardan en `data/souvenir.sqlite`, no solo en el navegador. La recuperación del comprador utiliza una capacidad privada en su almacenamiento local. Conservar la base de datos y sus archivos WAL en los respaldos. No publicar esa carpeta ni incluirla en Git.

## Qué funciona

- Catálogo inicial de 16 familias con búsqueda y filtros. Sus medidas son ejemplos sin validar.
- Editor frontal: texto, tipografía, colores de tinta, PNG/JPEG, movimiento, escala proporcional, giro, capas, duplicación, centrado y deshacer/rehacer.
- Guardado automático, recuperación y revisiones inmutables. Un diseño asociado a pago/cotización requiere una copia para editar.
- Validación de límites y resolución efectiva de imágenes. Normalización de cargas con Sharp; límites de formato, peso y píxeles.
- Panel del taller: solicitar cambios, aprobar, registrar historial y autorizar producción únicamente con área/técnica validadas y pago confirmado.
- ZIP por revisión con SVG, PNG transparente a 300 ppp, imágenes normalizadas y ficha JSON.
- Autenticación integrada con el paquete oficial Shopify React Router, sesiones SQLite, consulta de productos, creación de pedido preliminar sin enviar correos y recepción de eventos firmados.
- Theme App Extension con botón que abre el editor y añade al carrito la variante configurada. Solo utiliza APIs compatibles con el alcance Basic descrito en la investigación.

Las fotos de gorras se extrajeron del catálogo proporcionado por el usuario. Los demás modelos son ilustraciones de referencia. La interfaz utiliza Manrope alojada localmente, con licencia OFL incluida.

## Conectar con la tienda real

1. Registrar o vincular una app en el **Dev Dashboard de Shopify**, con distribución personalizada para esta tienda. No usar el antiguo flujo de crear apps desde el administrador.
2. Instalar Shopify CLI cuando se necesite: `npx @shopify/cli app config link`. Vincular el proyecto y completar `client_id` en `shopify.app.toml` con la configuración devuelta por Shopify.
3. Configurar en **`.env`**, sin compartir secretos por chat:

```dotenv
LOCAL_DEMO=false
SHOPIFY_STORE_DOMAIN=souvenir-made-xbc1wrvr.myshopify.com
SHOPIFY_API_KEY=client_id_de_la_app
SHOPIFY_API_SECRET=secreto_de_la_app
SHOPIFY_APP_URL=https://dominio-del-servidor
SCOPES=read_products,read_orders,write_draft_orders
DATABASE_PATH=/ruta/persistente/souvenir.sqlite
```

4. Publicar el servidor con HTTPS, disco persistente, respaldo y un solo proceso para este piloto SQLite. Actualizar `application_url` y `redirect_urls` del TOML; el callback es `/auth/callback`. Ejecutar `npm run build` y `npm start` en el servidor. Shopify aloja la extensión del tema, no este servidor ni sus datos.
5. Desplegar la configuración/extensión con `npm run shopify:deploy` e instalar la app mediante su enlace de distribución personalizada. Estos pasos aún no se han ejecutado ni probado contra la tienda.
6. Desde el panel autenticado, consultar variantes reales y configurar un primer producto: color, ID de variante, técnica y área física. La variante debe incluir el precio de la personalización para la compra directa. Para precio revisado, crear un enlace de pago desde un diseño aprobado.
7. En una copia del tema, añadir el bloque **Personalizador Souvenir** a la plantilla de producto. Configurar la URL HTTPS y la clave de producto, por ejemplo `cap-patch`. Para distintas plantillas/productos se puede usar el metafield de producto `souvenir.personalizer_key`.
8. Hacer una compra de prueba, comprobar el evento de pago, revisar el diseño, exportar y fabricar una muestra. Confirmar el tema y los permisos/datos protegidos necesarios antes de activar ventas. La compra real está pendiente de esta validación.

Una configuración enlaza una variante/color. El selector de colores es libre solo en la demostración; en la tienda se conserva el color configurado. Una variante diferente necesita su propia configuración antes de habilitarse. El catálogo real empieza sin publicar para evitar mostrar ejemplos automáticamente.

No pegar el secreto en `.env.example` ni subir `.env` al repositorio. `SHOPIFY_API_KEY` es el Client ID; la contraseña de la tienda no se utiliza.

## Límites de esta etapa

Esta es una base funcional para probar el flujo, **no una instalación ya operativa en Shopify ni la implementación completa de todas las etapas del informe**.

- Una cara/área por configuración; aún faltan múltiples caras, sangrado avanzado, recorte de imágenes, subida de fotos propias de producto y biblioteca gráfica ampliada.
- El SVG mantiene texto editable; no lo convierte a contornos. Comprobar las fuentes en el equipo del taller. El PNG es sRGB y no configura RIP, blanco, separación de colores ni espejo.
- El ZIP no contiene ponchado de bordado ni instrucciones de máquina láser. Esos procesos requieren preparación y verificación del taller.
- Los originales almacenados son imágenes normalizadas a PNG; no se conserva el binario original previo a normalizar.
- Las solicitudes/confirmaciones se consultan en la sesión del comprador y en el panel; no hay envío automático de correo/WhatsApp, cuentas ni recuperación entre dispositivos.
- La simulación de pago existe únicamente en el espacio `demo`. En la tienda, el pago se determina por eventos Shopify y firmas que vinculan diseño, revisión, variante y cantidad. Los pedidos modificados o anulados requieren revisión.
- El piloto limita los archivos por solicitud y el almacenamiento de imágenes por tienda a 256 MB. Antes de publicación comercial se deben añadir cuotas por frecuencia, retención/limpieza y monitorización de cargas/exportaciones.
- La exportación se ejecuta en la petición y requiere disco/memoria adecuados; una cola y almacenamiento de objetos son la siguiente mejora al aumentar el volumen. No usar hosting efímero ni varios procesos sin revisar esa arquitectura.
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
