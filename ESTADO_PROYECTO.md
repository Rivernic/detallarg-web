# Estado del proyecto

## Pendientes de revisión legal profesional

Los textos de `terminos.html` y `privacidad.html` son borradores de referencia, no redactados por un abogado o abogada, y llevan su propio aviso en la página ("Este texto es un borrador…"). Bajo ese mismo criterio, queda anotado acá:

- **Cláusula "Naturaleza de la firma de conformidad"** (`terminos.html`, sección 6) y su versión corta en el FAQ de `index.html`: agregada el 2026-08-27. Explica que la firma capturada en el check-in es una firma electrónica (Ley 25.506, art. 5) y no una firma digital certificada. Pendiente de revisión por alguien matriculado antes de considerarla definitiva, en particular la distinción legal entre firma electrónica y firma digital certificada y su valor probatorio ante un reclamo.
- Datos de clientes de terceros y venta de suscripciones online (ya señalado en el aviso de `terminos.html`).

## Estado al cierre de sesión — 15/09

### Hecho y verificado
- **Fase 1** — `login.html` + `panel.html` (login con `signInWithPassword`, manejo de credenciales inválidas y email no confirmado con reenvío, guard de sesión, logout). Commit `08fd098`. Confirmado sirviendo 200 en producción.
- **Fase 2** — `panel.html` con 4 pestañas de solo lectura (Resumen, Próximos turnos, Completados, Finanzas), usando los nombres reales de columnas de `turnos`, `cobros`, `gastos_variables`, `costos_fijos`, `clientes` (verificados en vivo, sin errores de columna). Commit `0fea3ce`. Confirmado sirviendo 200 en producción.

### Pendiente, sin empezar — Mercado Pago
Ninguno de los 4 pasos del flujo de MP se ejecutó todavía:
1. Crear los planes vía API.
2. Reemplazar los placeholders `TU_PLAN_ID_INDEPENDIENTE`, `TU_PLAN_ID_INTERMEDIO` y `TU_PLAN_ID_PRO` en `index.html` (confirmado presentes, sin tocar).
3. Edge Function del webhook (no existe carpeta `supabase/functions` en el repo).
4. `notification_url`.

Archivos de entorno: **`.env.mp-test` no existe. `.env.mp-production` no existe.**

### Pendiente, sin empezar — Fase 3 y Fase 4
- **Fase 3**: auditoría de seguridad.
- **Fase 4**: correcciones sobre lo que salga de la Fase 3.

### Pendiente — validar el panel con datos reales
El panel (Fase 2) solo se probó logueado con la cuenta de test **"Taller Prueba QA Login"** (`nicolas24martinez+logintest@gmail.com`), que no tiene turnos ni cobros cargados. Se verificó que las queries no fallan (200, nombres de columna correctos) y que los estados vacíos se ven bien, pero **todavía no se vio el panel funcionando con números reales** (agrupación por fecha con datos, sumas de facturación/gastos con montos reales, lista de completados con contenido). Falta repetir la prueba con una cuenta que tenga turnos y cobros cargados.
