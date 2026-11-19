# Verificación de la primera versión

Fecha: 19 de noviembre de 2026.

- Comprobación de tipos: correcta.
- Compilación cliente y servidor: correcta.
- Pruebas unitarias e integración: 25 aprobadas.
- Cobertura de los módulos configurados (dominio, acceso, repositorio y exportación): 95,33 % de líneas, 81,33 % de ramas y 100 % de funciones. No representa cobertura de toda la interfaz.
- Navegador Chrome sobre la versión compilada: 3 recorridos aprobados. Incluyen edición, guardado, recuperación, envío, aprobación y bloqueo de producción; configuración persistente; vista móvil sin desbordamiento horizontal.
- Capturas revisadas en `output/previews/editor.png` y `output/previews/editor-mobile.png`.

Se detectó un problema de respuestas 504 de dependencias optimizadas en el servidor Vite durante las pruebas. Se añadió preoptimización explícita y un lanzador de previsualización local de la compilación, que evita esa caché. Los recorridos finales se ejecutaron sobre la compilación.

La generación PNG se completó, aunque Fontconfig informó que no pudo escribir su caché fuera del workspace. El taller debe verificar fuentes y medidas antes de producir, como indica el paquete exportado.

Pendiente de verificación real: instalación/OAuth de Shopify, tema, iframe, catálogo y variantes, carrito/checkout, permisos, cotización y eventos de pedido. No se han realizado compras ni cambios en la tienda. Ver `README.md` para configuración y límites del piloto.
