# Arquitectura UX Web

WEB-03 materializa Products con búsqueda por form explícito/Enter autorizada en el ticket, keyset Cargar más y alta de siete campos incluyendo stock/costo inicial. Barcode teclado exacto y precarga por navigation state; incertidumbre bloquea edición/nuevo envío hasta resolución o descarte consciente. Detalle/edit/archive siguen WEB-04. [Detalle](WEB-03.md).

WEB-02 materializa identidad, shell y creación vacía. Anonymous→login; no Business→onboarding; disabled/DELETING/sin Inventory→estado seguro+refresh/logout; enabled con Inventory→shell. No import funcional (MIG-03) ni comercio WEB-03+. [Detalle](WEB-02.md).

SPA responsive optimizada para escritorio, usable con teclado y browser móvil. Paridad de capacidades
en PARITY_MATRIX; etiquetas/cálculos siguen UX canónica. No diseño pixel-perfect en esta fase.

| Ruta app | Propósito |
| --- | --- |
| /login, /signup, /verify-email, /reset-password | Identidad y recuperación |
| /onboarding | Crear vacío (WEB-02); import/consentimiento pendiente MIG-03 |
| / | Inicio: hoy, acciones +Venta/+Compra, stock bajo y recientes |
| /products | Lista/búsqueda de activos, stock, precio y código |
| /products/new, /products/:id, /products/:id/edit | Alta, detalle, editar/archivar |
| /sales/new, /sales/:id | Carrito y detalle/anulación |
| /purchases/new, /purchases/:id | Un producto, costo, resultado, margen/precio sugerido y anulación |
| /adjustments/new?productId=... | Conteo físico con motivo/costo aceptado |
| /history | Una cronología; 50 recientes, siguiente página API si necesaria |
| /settings | Cuenta, moneda visible, zona reportes, backup/import, sync y legal/soporte |
| /settings/privacy | Export/borrado; sesiones/confirmación reciente |

App shell tiene Inicio/Productos/Historial/Configuración, acciones de venta/compra visibles.
Desktop navegación lateral; narrow top/bottom accesibles; no veinte módulos de negocio.
Tablas compactas pueden convertirse en tarjetas en pantalla estrecha. No gráficos obligatorios.
Forms muestran campos actuales sin proveedores/categorías/impuestos; precio habitual precargado
no se redondea al guardar si no se editó. Compra permanece guardada aunque cambio de precio falle.

React Router gestiona rutas; TanStack Query maneja cache/query invalidation/loading/error,
keys incluyen businessId/inventoryId/session generation y se limpian al logout/cambio de cuenta.
React local state para forms/carrito y decimal input exacto; no store global persistente.
HTML forms y validadores contracts/domain bastan, sin librería de forms en foundation.
QueryClient no guarda tokens ni persistencia offline de inventario.

Mutaciones de inventario sin optimistic update: deshabilitar doble submit y esperar commit.
Transacción exitosa invalida detalle/lista/Home/History afectados y devuelve revisiones.
Mientras se envía, label `Registrando…`; nunca afirmar éxito solo porque request salió.
Timeout conserva key/intención y muestra `Estamos comprobando si se registró`; consulta receipt,
permite retry misma key. Mantener descriptor mínimo de envío incierto en sessionStorage
(operationId, inventoryId, commandKind), sin token ni payload comercial. Tras reload consultar
receipt antes de habilitar una nueva confirmación para esa intención. Si no fue aceptada y se
perdió payload, pedir reconstrucción consciente; no reenviar otro ID por defecto. Borrar descriptor
al resolver/logout. Esto no convierte browser en ledger offline ni guarda carrito completo.

Web V1 online-first, sin service worker/PWA ni cola offline de writes. Sin conexión: banner,
consultas en memoria etiquetadas como desactualizadas, forms pueden conservar texto en la pestaña,
confirmación deshabilitada; retorno de red refresca antes de submit. Mobile cubre trabajo offline.
No persistir dataset de otra cuenta en almacenamiento browser.

Estados: skeleton/load accesible, inventario vacío con alta de primer producto, sin resultados,
errores con retry, sesión caducada sin mensaje SQL, conflicto con datos propios actualizados y
elección explícita. Stock insuficiente advierte y permite registrar; costo desconocido muestra
No disponible. VOID_NOT_ELIGIBLE conserva detalle y explica movimientos posteriores.

Barcode manual y lector USB/Bluetooth como teclado: input enfocable, string exacto, Enter busca
en inventario cloud, duplicado incrementa cantidad, código no registrado permite alta con precarga.
Sin catálogo externo. Cámara browser LATER por soporte/permiso y costo de probar dispositivos;
no dependencia BarcodeDetector ni solicitud de cámara al inicio.

Labels visibles, foco de teclado, mensajes asociados a campos, live region para estado, targets
>=44px, contraste legible y estado no solo color. Mobile browser conserva operaciones MUST HAVE;
camera/share sheet nativas no se prometen en Web. Reporting timezone del Inventory evita que
dos dispositivos compartidos vean diferente 'hoy'; explicar zona en settings.
