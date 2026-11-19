# Personalizadores y productos de Shopify

El catálogo contiene plantillas visuales. Un personalizador es una configuración creada a partir de una plantilla y aplicada a uno o varios productos reales. Los diseños enviados por compradores siguen en **Revisión del taller**.

## Crear y asignar

1. Abre **Personalizadores → Crear personalizador**.
2. En **Plantillas**, elige la base y pulsa **Usar plantilla**.
3. Pon un nombre al personalizador y ajusta su área y técnica.
4. Pulsa **Asignar productos**. Busca y selecciona uno o varios productos; la selección se conserva al cambiar la búsqueda. **Seleccionar los productos mostrados** afecta a los resultados cargados, no a todo el catálogo.
5. Guarda la asignación. Activa el personalizador si quieres habilitarlo y pulsa **Crear personalizador**.

También puedes crear primero y asignar después desde la lista. Se admiten hasta 100 productos por personalizador; el selector carga 50 por página y permite cargar más. Al guardar, el servidor consulta Shopify y carga todas las páginas de variantes, hasta 2048 por producto. Solo se usan productos de la tienda autenticada. No hacen falta IDs escritos a mano.

La lista muestra el estado, productos asignados, búsqueda, filtros, configuración y vista previa. Los contadores se calculan con las asignaciones guardadas; los productos se cuentan una sola vez aunque aparezcan en configuraciones inactivas distintas. La demostración local muestra productos de prueba identificados como tales.

## Activación y cambios

Un producto puede estar en varios personalizadores inactivos, pero solo uno puede estar activo para ese producto. La comprobación se realiza en una transacción y protege activaciones simultáneas. Para cambiar el personalizador de un producto, desactiva primero el anterior o quita su asignación.

Al quitar todos los productos, el personalizador se desactiva. Editar nombre o medidas no sobrescribe una asignación realizada en otra ventana. Los diseños y las revisiones ya guardados conservan su producto/variante original. Para otro producto o variante se crea un diseño nuevo.

Si Shopify cambia variantes o elimina productos, vuelve a guardar la asignación para refrescar sus datos. El botón de vista previa usa la primera variante asignada. La vista, el color de referencia y el área son compartidos; hay que confirmar que corresponden a todos los productos elegidos. Productos con zonas o técnicas diferentes necesitan personalizadores distintos.

## Mostrarlo en la tienda

El servidor y la extensión del tema se publican por separado. Render aloja el servidor; `npm.cmd run shopify:deploy` publica la extensión. Asignar productos en el panel no añade por sí solo el bloque a un tema.

Después de publicar la extensión:

1. Abre una copia del tema en Shopify y añade **Personalizador Souvenir** en la plantilla de producto.
2. Configura la URL HTTPS de la app y usa `auto` en **Personalizador**. Los bloques añadidos antes de este cambio pueden conservar `cap-patch`; hay que cambiarlo a `auto` y revisar posibles valores del metafield `souvenir.personalizer_key`, que tiene prioridad.
3. Guarda el tema y prueba con un producto asignado. El bloque envía su producto y variante seleccionada; la app abre el personalizador activo correspondiente.

El precio de compra directa se mantiene en las variantes de Shopify. Esta etapa no añade recargos por texto, imágenes ni reglas de precios. El taller sigue revisando antes de fabricar y validando medidas/técnica, pago y revisión aprobada.

El modelo se guarda en los registros JSON existentes de Supabase; no requiere ejecutar otro SQL. Las configuraciones anteriores de una sola variante siguen siendo legibles. Las plantillas iniciales sin configurar no se muestran como personalizadores publicados ni se borran de la base.
