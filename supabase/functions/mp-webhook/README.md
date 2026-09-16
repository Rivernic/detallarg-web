# mp-webhook

Edge Function que recibe las notificaciones de suscripción de Mercado Pago
(`subscription_preapproval` y `subscription_authorized_payment`), valida la
firma del webhook y activa el plan del taller correspondiente cuando un
preapproval queda `authorized`.

**Estado: escrita y revisada, NO desplegada.** No correr `supabase functions
deploy mp-webhook` hasta confirmar que los secrets de abajo ya están
cargados en Supabase.

## Secrets necesarios (Supabase → Edge Functions → Secrets)

Ninguno existe todavía. Sin ellos la función responde 500 con un mensaje
claro en vez de fallar en silencio.

- `MP_ACCESS_TOKEN` — access token server-side de la cuenta de MP.
- `MP_WEBHOOK_SECRET` — "Clave secreta" de *Tus integraciones → Webhooks*
  (**no** es el access token, es un secret aparte).
- `MP_PLAN_ID_INDEPENDIENTE`, `MP_PLAN_ID_INTERMEDIO`, `MP_PLAN_ID_PRO` — los
  mismos 3 `plan_id` que se cargan en `index.html` con
  `scripts/set-mp-plan-ids.sh`.

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta el runtime de Edge
Functions automáticamente.

## Checklist para esta noche (con datos reales)

1. Confirmar los valores reales que acepta `talleres.plan` más allá del
   default `'basico'` — hoy el código asume `'basico'/'intermedio'/'pro'`
   sin haberlo verificado contra la tabla real.
2. Confirmar si esta cuenta de MP manda las notificaciones en formato nuevo
   (`type`/`action`/`data.id` en el body) o en formato IPN viejo
   (`?topic=...&id=...` como query params). El código soporta los dos, pero
   hay que ver cuál llega en la práctica.
3. Confirmar que `external_reference` efectivamente trae el `id` del taller
   — depende de cómo se arme el link de suscripción cuando se implemente su
   creación (paso que todavía no existe). Hoy es una asunción documentada,
   no un hecho probado end-to-end.
4. Definir qué hacer con `subscription_authorized_payment` (cada cobro
   recurrente ya autorizado). El prompt original de esta fase no lo
   especificó — hoy solo se loguea, sin tocar `talleres` ni `cobros`.
5. Definir qué hacer si un preapproval pasa a `cancelled` o `paused` —
   ¿bajar el plan a `'basico'` automáticamente, o revisión manual? Hoy no se
   toca nada en esos estados, solo se loguea.
6. Probar la validación de firma con el simulador de webhooks de MP antes de
   confiar en notificaciones reales.

## Fuentes usadas para la validación de firma y el formato de notificaciones

- Documentación de Webhooks de Mercado Pago (manifest `id:...;request-id:...;ts:...;`,
  HMAC-SHA256, secret separado del access token).
- Documentación de Subscriptions/Preapproval (`external_reference`,
  `preapproval_plan_id`, estados `pending`/`authorized`/`paused`/`cancelled`).
- Referencia de la API (`GET /preapproval/{id}`) y del SDK oficial de Go
  (`github.com/mercadopago/sdk-go/pkg/preapproval`) para los nombres exactos
  de campos del objeto Preapproval.
