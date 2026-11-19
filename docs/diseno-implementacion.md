# Primera implementación

## Dirección visual

Un estudio de personalización de Souvenir Made: fondo gris azulado #F3F5F8, tinta azul #122D4E, acento magenta #BA2476, cian #00ACC8 y blanco #FFFFFF. Franja de color de la marca en el encabezado. Tipografía de interfaz Segoe UI con títulos de peso alto. El producto ocupa el centro; los controles de edición quedan a la izquierda y la configuración/revisión a la derecha. En móvil se apilan con acceso explícito a las herramientas. El panel del taller prioriza estado, producto y revisión, sin gráficos inventados.

## Recorridos que deben funcionar

1. Seleccionar producto del catálogo, editar texto/imagen, guardar y recuperar sin perder la revisión.
2. Enviar diseño para revisión; un cambio posterior produce otra revisión y no altera la enviada.
3. El taller solicita cambios o aprueba la revisión; solo prepara producción si el área está validada y el pago autorizado.
4. Descargar originales y arte por área a escala con identificación de revisión.
5. Configurar áreas y vincular productos/variantes de Shopify cuando estén disponibles.

## Entorno

Dominio recibido: souvenir-made-xbc1wrvr.myshopify.com. Tema y credenciales pendientes. El modo local usa catálogo demostrativo basado en las familias del PDF y medidas de prueba, no inventario ni precios reales. Las rutas comerciales reales requieren autenticación Shopify. No se configura un despliegue ni se modifica la tienda sin credenciales.

## Calidad

Pruebas primero para validación, aislamiento de diseños, revisiones, exportación y autorización. Luego integración del almacenamiento SQLite y recorrido de navegador. Mantener los límites conocidos documentados en README.
