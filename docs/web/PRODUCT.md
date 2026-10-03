# Producto Cloud + Web

StockApp Web App es un espacio autenticado para trabajar con el mismo inventario compartido
desde computadora o navegador móvil. Mantiene el loop crear → comprar → vender → consultar
y estimaciones de producto, sin convertirse en POS, ERP ni sistema fiscal.

La landing pública continúa en `https://ian-k.dev/stockapp/`, repo independiente `ian0000/ian-k.dev`.
La app objetivo es `https://stockapp.ian-k.dev`; la API `https://api-stockapp.ian-k.dev`.
Son destinos de diseño sin DNS, proyectos ni servicios creados por esta tarea.

Mobile sigue utilizable sin cuenta e Internet. Un usuario elige conectar un inventario
al servicio cloud; la cuenta es requisito del servicio compartido y de Web.
No se sube el inventario por instalar una actualización ni por crear una cuenta.
La incorporación requiere consentimiento y elección explícita del flujo en MIGRATION.

V1 usa un propietario, un negocio y un inventario por cuenta; varios dispositivos del mismo
propietario pueden conectarse. No hay invitaciones, empleados, equipo ni selector multinegocio.
Propiedad y aislamiento técnico no significan un sistema de roles empresarial.

Las reglas financieras siguen siendo las del dominio actual. Web muestra el estado aceptado
en cloud; Mobile puede tener operaciones guardadas localmente pendientes de aceptación.
La interfaz explica esa diferencia y cualquier conflicto sin prometer coincidencia instantánea.

Web/sync siguen siendo capacidades Pro conforme a MONETIZATION. Esta baseline no fija precios,
trials ni billing. La primera integración será piloto controlado con habilitación manual del
servicio a cuentas autorizadas; no es un lanzamiento gratuito público ni una suscripción nueva.
El acceso comercial público requiere un ticket de monetización formal posterior.
