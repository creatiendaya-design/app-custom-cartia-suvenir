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

## Cambiar la imagen del lienzo

En **Personalizadores → Configurar**, o al crear uno desde una plantilla, pulsa **Subir imagen del lienzo** junto a la vista previa. Se admiten PNG, JPG y WebP de hasta 8 MB y 16 millones de píxeles. La imagen se orienta automáticamente, se normaliza a PNG y se reduce a un máximo de 2000 píxeles por lado.

Puedes **encajar la imagen completa**, **cubrir todo el lienzo**, cambiarla o **restaurar la imagen de plantilla**. Ajusta la posición y las medidas del área de personalización y pulsa **Guardar configuración**. Cambiar la imagen o su ajuste desmarca la validación del taller; confirma de nuevo las medidas cuando corresponda.

La foto se comparte entre los productos de ese personalizador. El cliente puede añadir su texto o logo sobre ella. La foto base no se incluye en el SVG/PNG de impresión; las revisiones guardadas conservan su referencia anterior. Solo el comerciante puede subir imágenes base; los archivos del cliente no se pueden consultar mediante el enlace de vista previa del lienzo. Las fotos base son recursos de presentación públicos a través de su URL de imagen.

## Activación y cambios

Un producto puede estar en varios personalizadores inactivos, pero solo uno puede estar activo para ese producto. La comprobación se realiza en una transacción y protege activaciones simultáneas. Para cambiar el personalizador de un producto, desactiva primero el anterior o quita su asignación.

Al quitar todos los productos, el personalizador se desactiva. Editar nombre o medidas no sobrescribe una asignación realizada en otra ventana. Los diseños y las revisiones ya guardados conservan su producto/variante original. Para otro producto o variante se crea un diseño nuevo.

Si Shopify cambia variantes o elimina productos, vuelve a guardar la asignación para refrescar sus datos. El botón de vista previa usa la primera variante asignada. La vista, el color de referencia y el área son compartidos; hay que confirmar que corresponden a todos los productos elegidos. Productos con zonas o técnicas diferentes necesitan personalizadores distintos.

## Elegir precio del producto o cotización

Al crear o configurar un personalizador, elige **Modo de compra**:

- **Precio del producto de Shopify**: el editor consulta el precio actual de la variante y muestra el total según la cantidad. Al confirmar, el diseño se añade al carrito de la tienda y Shopify aplica su precio. La validación de medidas no cambia esta elección; la producción sigue requiriendo revisión del taller, pago y medidas verificadas.
- **Revisión y cotización**: el cliente envía una solicitud. Tras aprobar el diseño, el taller introduce el precio unitario y genera el enlace de pago. Las configuraciones anteriores conservan este modo por defecto.

Para corregir un enlace ya creado, abre el diseño en **Revisión del taller**, introduce el nuevo precio y pulsa **Actualizar precio y enlace**. Se actualiza el mismo pedido preliminar y se comprueban importe unitario, moneda, variante y cantidad en la respuesta de Shopify antes de mostrar el enlace. El panel muestra precio unitario, cantidad y subtotal; impuestos y envío se calculan en Shopify. Se deben abrir los enlaces devueltos después de actualizar, en lugar de reutilizar una pantalla de checkout que ya estaba abierta.

No se permite modificar una cotización pagada o vinculada a un pedido. Las actualizaciones simultáneas del mismo diseño se bloquean mientras una está en curso. Esta función no envía correos automáticamente.

## Mostrarlo en la tienda

El servidor y la extensión del tema se publican por separado. Render aloja el servidor; `npm.cmd run shopify:deploy` publica la extensión. Asignar productos en el panel no añade por sí solo el bloque a un tema.

Después de publicar la extensión:

1. Abre una copia del tema en Shopify y añade **Personalizador Souvenir** en la plantilla de producto.
2. Configura la URL HTTPS de la app y usa `auto` en **Personalizador**. Los bloques añadidos antes de este cambio pueden conservar `cap-patch`; hay que cambiarlo a `auto` y revisar posibles valores del metafield `souvenir.personalizer_key`, que tiene prioridad.
3. Guarda el tema y prueba con un producto asignado. El bloque envía su producto y variante seleccionada; la app abre el personalizador activo correspondiente.

El precio de compra directa se mantiene en las variantes de Shopify. Esta etapa no añade recargos por texto, imágenes ni reglas de precios. El taller sigue revisando antes de fabricar y validando medidas/técnica, pago y revisión aprobada.

El modelo se guarda en los registros JSON existentes de Supabase; no requiere ejecutar otro SQL. Las configuraciones anteriores de una sola variante siguen siendo legibles. Las plantillas iniciales sin configurar no se muestran como personalizadores publicados ni se borran de la base.
