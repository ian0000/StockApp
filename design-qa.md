# StockApp Web — revisión de la propuesta 3

final result: passed

Fecha: 2026-10-16, America/Guayaquil. Implementación sobre la aplicación React existente;
no se sustituyeron sus clientes, controllers, rutas, almacenamiento ni contratos financieros.
Publicación del cambio pendiente de revisión/merge y despliegue controlado.

## Referencia y evidencia

- Fuente visual elegida explícitamente por el usuario: tercer resultado mostrado,
  `C:/Users/USER/.codex/generated_images/01a0ffe7-78bd-7db2-a9d1-b840c8b6309d/exec-dd31080a-14b8-4ea5-b163-e946eae77f89.png`.
  Raster1487×1058, escritorio, Inicio vacío, USD, America/Guayaquil.
- Evidencia local fuera de Git: `C:/Users/USER/.codex/artifacts/`.
  `stockapp-ui-option-three-desktop-pass-one.jpg` y `desktop-pass-two.jpg` (mismo prefijo):
  viewport CSS1487×1058, raster1487×1000. Se comparó la región superior común sin estirar
  ni inferir precisión para las58 filas no capturadas. El botón de logout se comprobó
  adicionalmente dentro del viewport (bottom1024.42 <1058).
- Comparación final de composición: `stockapp-ui-option-three-desktop-final.jpg`,
  raster/viewport1487×1058. Contiene una compra y una venta sintéticas; esta diferencia
  de datos frente a la referencia vacía es intencional, no una diferencia de layout.
- Comparación focal: `stockapp-ui-option-three-header-final.jpg`,1100×390,
  recorte x248/y0 del encabezado, resumen y acciones. Se revisaron tipografía, separadores,
  contraste, alineación y botones, junto a la referencia completa legible.
- Móvil: `stockapp-ui-option-three-mobile-pass-one.jpg` y `mobile-final.jpg`
  (mismo prefijo). Viewport390×844; captura final completa375×1586, sin scrollbar lateral.
  Tablet: `stockapp-ui-home-tablet.jpg` y `stockapp-ui-home-tablet-final.jpg`;
  viewport834×1194, raster final819×1305. Capturas completas, sin reescalado;
  las anchuras excluyen el scrollbar de15px. Sin overflow horizontal observado.
- Flujos: `stockapp-ui-product-form-mobile.jpg`, `stockapp-ui-purchase-mobile-before-spacing.jpg`,
  `stockapp-ui-purchase-mobile-final.jpg` (375×1776), `stockapp-ui-sale-tablet.jpg`
  y `stockapp-ui-login-mobile.jpg`.

La referencia y los renders se abrieron juntos en la misma entrada de comparación visual;
no se dedujo fidelidad únicamente a partir de archivos, builds o screenshots aislados.

## Historial de comparación y correcciones

1. **P2 — escala y densidad en escritorio.** El primer render tenía texto menor,
   sidebar225px y resumen/acciones más compactos que la referencia. Se ajustaron base16px,
   sidebar248px, encabezado100px, valores, títulos, espacios y tamaño del icono vacío.
   La segunda captura vacía recupera proporciones y jerarquía; la captura final confirma
   que la composición se conserva con datos. Resultado resuelto.
2. **P2 — navegación móvil extensa.** El menú inicial envolvía Configuración a otra fila y
   relegaba los datos. Se compactó en cuatro accesos con iconos y logout superior, conservando
   los enlaces de compra/venta. Captura mobile-final: acciones y métricas legibles, sin overflow.
   Resultado resuelto.
3. **P2 — confirmación de compra sin márgenes.** Algunas rutas existentes renderizan secciones
   directamente, sin main. El estilo inicial no las cubría; había contenido pegado al borde y
   texto largo recortado. El espaciado se aplica ahora a app-content, con excepción explícita
   para el Inicio de ancho completo. Definitions y navegación comparten estilos. Captura posterior:
   heading x24 en390px y scrollWidth390; textos, controles y decisión de precio legibles.
   Resultado resuelto.
4. **P2 — tablet demasiado estrecha.** Dos columnas comprimían los avisos y los títulos de
   métricas tenían alturas distintas. Bajo1000px el contenido pasa a una columna y los
   avisos se agrupan debajo; las etiquetas reservan altura uniforme. Captura tablet-final:
   contenido legible y sin overflow. Resultado resuelto.
5. **P2 — contraste de texto auxiliar.** Muted sobre blanco4.28:1 y placeholder3.55:1.
   Se ajustaron a #61748c (4.79:1); borde de inputs #8193a8 (3.15:1).
   Botón primario #0672ce/blanco4.88:1. Resultado resuelto.
6. **P1 — export de icono inexistente durante iteración.** IconCubeFilled no era un export
   disponible y rompía la carga de Configuración. Se restauró IconCube oficial, se recargó
   y se verificó la página, logout/login y los gates Web completos. Consola posterior sin
   nuevos errores/warnings. Resultado resuelto; no se desplegó el estado fallido.

## Superficies de fidelidad

- **Fuentes/tipografía:** Segoe UI/system-ui local como fallback, base16px, títulos y cifras
  con jerarquía coherente; importes tabulares sin modificar su formato/precisión.
  Se conserva el salto de línea legible y no se cargan fuentes remotas.
- **Ritmo/layout:** sidebar clara, barra diaria navy, acciones y composición asimétrica,
  superficies abiertas y separadores. Responsive explícito para desktop/tablet/móvil;
  foco y controles persistentes accesibles.
- **Colores/tokens:** blanco/gris azul claro, navy #193149 y azul #0672ce; contraste corregido,
  estados destructivos diferenciados y foco visible. Sin nuevos gradientes.
- **Imágenes/iconos:** todos son iconos estándar de Tabler React3.49.0, familia consistente.
  Sin SVG artesanal, CSS art, imágenes estiradas, iconos hechos con texto ni avatars ficticios.
  El cubo outline y el documento de librería son alternativas deliberadas al dibujo del mock.
- **Copy/contenido:** etiquetas españolas, estados vacíos concretos y solo funciones existentes.
  Moneda, metadata, null/zero y zona horaria se obtienen de los datos actuales. Sin plan de pago
  ni sincronización Mobile implícitos.

## Interacciones y límites

QA real en navegador contra API compilada y PostgreSQL18.6 locales desechables; correo de QA
capturado localmente, sin entrega externa ni acceso a datos Railway/UAT. Login, menú, actualización,
crear producto, comprar10 unidades a2.00, conservar precio4.50, vender1 unidad a4.50, detalles,
historial, Configuración y logout/relogin PASS. Tras reingreso: venta4.50, ganancia2.50,
unidades1 y operaciones persistentes. Los otros casos financieros conservan sus tests existentes.

No se probaron aquí eliminación de cuenta, envíos de reset a buzón real, restauración,
aislamiento remoto ni todos los estados posibles de red. No equivalen a aceptación remota completa.
CSS respeta reduced-motion; no se hizo auditoría formal con lector de pantalla.

## Checklist de implementación

- Layout y controles probados en las tres anchuras.
- Formularios, detalles y navegación de cuenta integrados al mismo lenguaje visual.
- Sin cambios de semántica en Domain/Application/Mobile, schemas/migrations o CI.
- Activación automática separada: política API opt-in exclusiva UAT, con pruebas de seguridad.
- pnpm check:2609PASS; API DB:1049PASS/0fail/skip; Web final:997PASS y62validators.
- Build conserva warning de tamaño (~1738.28kB /239.69kB gzip), sin elevar límites.

## Pulido opcional

P3: pequeñas diferencias de fuente e iconografía frente al raster y pluralización preexistente
de cantidades unitarias. No impiden la navegación ni la lectura de resultados.
