# DOCS-ALPHA-001 — Procedencia y revisión de capturas

## Fuente

- Fecha: 2026-09-13; base Git `8888d80` (PR #67 integrado en main).
- APK real: StockApp `0.1.0 (1)`, `com.iankexpo.stockapp`.
- EAS build `735f4448-71eb-40a2-a2ea-8e8667b8a5da`, commit fuente `64d0c71`.
- SHA-256 comprobado antes de instalar:
  `AFE03D905B94F47E2D705B3C1BDC708A087444938E3ED92535D83447CA56A79C`.
- Sin diferencias de código en `apps/mobile` ni `packages` entre ese commit y la base utilizada.
- Emulador dedicado `StockApp_Tester_Demo`, Android 15 / API 35, configuración de pantalla
  Pixel 9: 1080 × 2424, densidad 420. No se reutilizaron ni borraron los datos del AVD de QA anterior.
- Instalación del APK firmado mediante ADB; arranque independiente de Expo Go/Metro.
- PNG obtenidos directamente con `adb shell screencap -p` y copiados con `adb pull`.
  Sin recortes, retoques, mockups, montajes ni cambios en resolución.

## Datos ficticios y secuencia real

Inventario **Tienda La Esquina**, moneda USD, creado desde la configuración inicial.
No se añadió un seed al repositorio ni se insertaron filas directamente en SQLite.

| Producto | Variante | Stock inicial | Costo inicial | Precio de venta | Stock mínimo | Stock final |
| --- | --- | --- | --- | --- | --- | --- |
| Agua | 600 ml | 24 | USD 0.40 | USD 0.75 | 6 | 23 |
| Gaseosa | 500 ml | 18 | USD 0.80 | USD 1.25 | 5 | 28 |
| Galletas | 120 g | 8 | USD 0.60 | USD 1.00 | 4 | 8 |
| Papas | 45 g | 3 | USD 0.50 | USD 0.85 | 4 | 2 |

1. Alta de los cuatro productos mediante el formulario real, sin códigos ni datos personales.
2. Compra de Gaseosa: 12 unidades a USD 0.85, total USD 10.20. Stock 18 → 30;
   costo promedio mostrado USD 0.80 → USD 0.82. Se conservó el precio de venta de USD 1.25.
3. Venta: 2 Gaseosas y 1 Agua, total USD 3.25, ganancia estimada USD 1.21.
   `04-sale.png` se tomó **antes de confirmar esa venta**; por eso muestra disponibilidad 30 y 24.
4. Ajuste de Papas: conteo físico 2 frente a 3 registradas, diferencia -1, motivo
   `Conteo incorrecto`. Se confirmó desde la UI.
5. Capturas de Inicio, Productos, Detalle de Gaseosa e Historial con las operaciones ya guardadas.

La numeración organiza la presentación, no el orden temporal de captura. Los datos de demostración
permanecen en el emulador dedicado y no forman parte de la app distribuida.

## Selección y revisión visual

| Archivo | Qué muestra |
| --- | --- |
| `01-home.png` | Ventas USD 3.25, ganancia estimada USD 1.21, 3 unidades vendidas, Papas con stock bajo y Gaseosa como más vendido; inicio de Recientes y navegación |
| `02-products.png` | Los cuatro productos, variantes, precios, stock y aviso de stock bajo |
| `03-product-detail.png` | Gaseosa: 28 unidades, precio USD 1.25, costo promedio USD 0.82, ganancia/unidad USD 0.43, margen 34.40% y markup 52.44% |
| `04-sale.png` | Carrito real con dos productos, cantidades, precios y total USD 3.25, antes de confirmar |
| `05-history.png` | Ajuste, venta y compra de la misma sesión en cronología unificada |

Se revisaron visualmente las cinco imágenes: contenido legible y ficticio, sin cuentas ni datos
personales. Los enlaces de imagen de `TESTER_INTRO.md` son relativos a `screenshots/` para GitHub.
Para una invitación inicial, usar las imágenes 01, 02 y 03 con el mensaje corto del documento.

Inicio y Nueva venta son pantallas desplazables: Recientes no cabe completo en Inicio; en la toma
del carrito queda visible un fragmento de la lista anterior. Se conserva el encuadre real, sin
recomponer pantallas; Historial muestra las operaciones completas por separado.

## Hallazgos observados, sin corrección en esta tarea

- **Contraste de la barra de estado Android:** hora e iconos claros sobre fondo claro, poco
  legibles en este emulador. Evidencia en las capturas. Revisar en una tarea de compatibilidad/UX.
- **Separación de navegación inferior:** la barra de gestos queda muy próxima a las etiquetas de
  los tabs, especialmente Historial. El cambio entre tabs funcionó, pero conviene revisar los
  márgenes seguros en Android. No se ajustó el layout para las capturas.
- **Concordancia de texto en ajuste:** con diferencia -1, la vista previa muestra
  `Se retirarán 1 unidades del inventario.` Reproducido al ajustar Papas de 3 a 2.
  El ajuste se registró correctamente; la observación es de redacción, no de cálculo.

No se encontraron bloqueos funcionales durante la preparación. Esto no sustituye una regresión
física completa ni certifica disponibilidad en Google Play Closed Testing o Apple TestFlight.
