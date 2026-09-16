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

### Pendiente, sin empezar — Fase 4
- **Fase 4**: correcciones sobre lo que salga de la Fase 3. Ver sección "Fase 3 — Auditoría de seguridad" más abajo: no hay ningún hallazgo CRÍTICO ni IMPORTANTE, así que por ahora la Fase 4 no tiene nada urgente que corregir.

### Pendiente — validar el panel con datos reales
El panel (Fase 2) solo se probó logueado con la cuenta de test **"Taller Prueba QA Login"** (`nicolas24martinez+logintest@gmail.com`), que no tiene turnos ni cobros cargados. Se verificó que las queries no fallan (200, nombres de columna correctos) y que los estados vacíos se ven bien, pero **todavía no se vio el panel funcionando con números reales** (agrupación por fecha con datos, sumas de facturación/gastos con montos reales, lista de completados con contenido). Falta repetir la prueba con una cuenta que tenga turnos y cobros cargados.

## Fase 3 — Auditoría de seguridad (15/09)

Auditoría pesada con evidencia real (no lectura de `pg_policies`), sobre detallarg-web y el proyecto de Supabase compartido con la app. **Ningún hallazgo CRÍTICO ni IMPORTANTE — la Fase 4 no tiene nada urgente que corregir en esta ronda.**

### Punto 1 — RLS probado empíricamente con la anon key — sin hallazgos
`curl` contra las 20 tablas del schema `public`, usando solo la anon key pública (sin token de sesión). **Las 20 devolvieron HTTP 200 con `[]`** — ninguna filtró filas reales.

- **Certeza fuerte** (confirmado contra tablas con datos reales persistidos, no vacías): `talleres`, `cobros`, `gastos_variables`.
- **Certeza débil — seguimiento liviano, no bloqueante** (RLS correctamente configurado según política leída + mecanismo ya probado en las tablas de certeza fuerte, pero sin confirmación directa por ausencia de filas de prueba en estas puntuales): `insumos`, `servicios`, `horarios_atencion`, `vehiculos`, `empleados`, `comisiones_tarjeta_cuotas`, `servicio_receta_items`, `turno_danios`, `turno_empleados`, `turno_fotos_danio`, `turno_medicion_micrones`, `turno_ppf_paneles`, `turno_ppf_seleccion`, `turno_receta_aplicada`. Acción sugerida (no urgente): la primera vez que cualquiera de estas tenga datos reales de un taller real, repetir el `curl` puntual contra esa tabla nada más.

### Punto 2 — Configuración de Auth (Dashboard) — sin hallazgos
- **Confirm email:** ON.
- **Rate limit de sign-ins:** 30 requests/5 min por IP (360/hora) — evaluado, correcto, sin cambios.
- **Leaked password protection + longitud mínima de contraseña (6 caracteres):** evaluado y **aceptado explícitamente** — no disponible sin plan Pro de Supabase, y dado que las cuentas son de dueños de taller (no público masivo), el riesgo se acepta conscientemente por ahora. No es un pendiente abierto.

### Punto 3 — Escaneo de secretos en todo el historial de git — limpio
`gitleaks detect --source . --log-opts="--all"` sobre los 62 commits del historial completo (no solo HEAD). 3 coincidencias, las 3 la misma `SUPABASE_ANON_KEY` (JWT) en `index.html`, `login.html` y `panel.html`. No es un hallazgo real: es la clave pública/"publishable" de Supabase, diseñada para vivir en el cliente y protegida por RLS, no por secreto (gitleaks la marca por su regla genérica de entropía de JWT, sin distinguir anon key de service_role). **Sin `service_role` key, contraseñas de DB, tokens de Mercado Pago ni ningún otro secreto real en todo el historial.** No hace falta reescribir nada.

### Punto 4 — Rutas del panel dependen de RLS real, no de ocultar un link — correcto por diseño
Revisado `login.html` y `panel.html`: solo usan la anon key pública (nunca `service_role`), y no hay ningún filtro manual de `taller_id` en el JavaScript — las queries de `turnos`, `cobros`, `gastos_variables` y `costos_fijos` dependen 100% de la política RLS del servidor. El único `.eq()` de todo el panel es `eq('id', session.user.id)` sobre `talleres`. El guard de sesión en `panel.html` es solo UX (evita pantalla vacía / rebota a login); la barrera de seguridad real es RLS.

### Punto 5 — CORS — no aplica
La Data API de Supabase es abierta por diseño (`Access-Control-Allow-Origin: *`, confirmado en headers reales); Supabase no expone configuración de CORS/orígenes para la Data API en el dashboard, y la seguridad la da RLS, no el origen. No es un hallazgo. El único lugar donde CORS sería configurable de verdad es en una futura Edge Function propia (ej. el webhook de Mercado Pago), que define sus propios headers en el código.
