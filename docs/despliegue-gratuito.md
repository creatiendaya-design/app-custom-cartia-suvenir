# Publicar el piloto con Render Free y Supabase Free

Configuración preparada el 19 de noviembre de 2026. Render ejecuta la app; Supabase guarda diseños, sesiones e imágenes. El código está adaptado, pero el proyecto remoto y Shopify necesitan completar estos pasos.

## 1. Localizar las credenciales de Supabase

Abre [Supabase Dashboard](https://supabase.com/dashboard), entra en tu proyecto y pulsa **Connect** arriba. Copia **Project URL**, con formato `https://…supabase.co`. No uses la cadena PostgreSQL que empieza por `postgresql://`.

Abre **Settings → API Keys** y copia una clave de **Secret keys**, que empieza por `sb_secret_`. Si no existe, créala allí. La clave antigua `service_role` también es compatible; esta app necesita una clave de servidor. [Documentación oficial de claves](https://supabase.com/docs/guides/getting-started/api-keys).

En el archivo `.env` de este proyecto, añade estas líneas y guarda con Ctrl+S:

```dotenv
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SECRET_KEY=sb_secret_tu_clave
SUPABASE_STORAGE_BUCKET=souvenir-assets
```

Conserva las variables Shopify que ya tengas. La Secret key se utiliza únicamente en el servidor; no debe ir en el tema, el navegador, `.env.example`, Git ni el chat.

## 2. Crear las tablas y el depósito privado

En Supabase entra en **SQL Editor → New query**. Abre [202611190001_storage.sql](../supabase/migrations/202611190001_storage.sql), copia todo su contenido en la consulta y pulsa **Run**.

El SQL crea `sm_records`, la función transaccional `sm_commit` y el depósito privado `souvenir-assets`. Restringe el acceso a la clave de servidor. Puede ejecutarse otra vez sin borrar diseños. No hace falta abrir el depósito al público ni añadir políticas públicas.

En la terminal de este proyecto ejecuta:

```powershell
npm.cmd run storage:check
```

La comprobación lee la tabla, ejecuta una transacción vacía y comprueba que el depósito es privado. No crea diseños ni imprime claves. Si falla, revisa que `.env` esté guardado, que las dos credenciales pertenezcan al mismo proyecto, que el proyecto esté activo y que el SQL haya terminado correctamente.

La demostración local conserva SQLite. Para probar los datos de Supabase desde el servidor de desarrollo, utiliza `STORAGE_PROVIDER=supabase` en `.env`. `preview:local` siempre fuerza SQLite para las pruebas sin conexión.

## 3. Preparar el repositorio

Los cambios nuevos deben estar publicados en el repositorio que usa Render: adaptadores de almacenamiento, migración, dependencias y `render.yaml`. `.env` y `data/` están excluidos de Git y deben seguir así. Los diseños locales anteriores no se suben automáticamente a Supabase.

## 4. Crear el servicio gratuito en Render

Si ya estás en el formulario de **Web Service**, continúa allí. Selecciona el repositorio y completa:

| Campo | Valor |
| --- | --- |
| Language / Runtime | Node |
| Root Directory | Vacío si `package.json` está en la raíz |
| Build Command | `npm ci --include=dev && npm run build` |
| Start Command | `npm start` |
| Instance Type / Compute | **Free — $0/month** |
| Health Check Path | `/health` |

En **Environment**, configura:

```dotenv
NODE_ENV=production
LOCAL_DEMO=false
HOST=0.0.0.0
STORAGE_PROVIDER=supabase
SUPABASE_STORAGE_BUCKET=souvenir-assets
SHOPIFY_STORE_DOMAIN=souvenir-made-xbc1wrvr.myshopify.com
SCOPES=read_products,read_orders,write_draft_orders
```

Añade también `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SHOPIFY_API_KEY` (Client ID) y `SHOPIFY_API_SECRET`, copiando sus valores privados en Render. No subas `.env`. No configures `DATABASE_PATH` ni un disco persistente.

Puedes omitir `SHOPIFY_APP_URL`: la app utiliza la URL HTTPS que Render asigna mediante `RENDER_EXTERNAL_URL`. Si ya existe esa variable con `http://localhost:3000`, elimínala de Render o sustitúyela por la URL HTTPS real.

Otra opción es **New → Blueprint**, seleccionando el repositorio y el archivo `render.yaml` incluido. El blueprint declara el mismo servicio Free y solicita las cuatro credenciales; no crea recursos de pago adicionales. Utiliza una sola de las dos opciones para evitar servicios duplicados.

Al terminar, pulsa **Deploy web service**. Guarda la URL `https://…onrender.com`. [Guía oficial de instancias gratuitas](https://render.com/docs/free).

## 5. Conectar Shopify

Actualiza la URL de la app y el callback `https://…onrender.com/auth/callback` en la configuración Shopify. Vincula la app existente mediante Shopify CLI y publica su configuración y la extensión del tema. `shopify app deploy` publica esa configuración/extensión; el servidor se despliega por Render.

Instala la app con su enlace de distribución personalizada. Después, en el panel autenticado, configura un producto real y su variante, verifica medidas/técnica y añade el bloque **Personalizador Souvenir** en una copia del tema. Sigue [los pasos de conexión](../README.md#conectar-con-la-tienda-real).

Antes de abrirlo a compradores hay que verificar OAuth/iframe, guardado tras reinicio del servidor, carga y descarga de imágenes, revisión del taller, carrito, pago, eventos y exportación. Esas pruebas reales siguen pendientes.

## Límites del modo gratuito

Render suspende el servicio tras 15 minutos sin tráfico y el siguiente arranque puede tardar aproximadamente un minuto. Su documentación desaconseja Free para aplicaciones de producción. Esto puede interrumpir la autenticación y retrasar eventos Shopify, por lo que esta configuración permite validar el piloto. [Límites de Render Free](https://render.com/docs/free).

Supabase Free incluye actualmente 500 MB de base de datos y 1 GB de archivos; puede pausar proyectos tras una semana de inactividad. Los límites de transferencia también cuentan. El piloto limita imágenes a 256 MB por tienda, pero revisiones, sesiones e historial consumen base de datos por separado. [Planes y límites de Supabase](https://supabase.com/pricing).

La persistencia ya no depende del disco temporal de Render. Siguen pendientes una política de retención, respaldos verificados y monitorización para operar comercialmente.
