// Webhook de Mercado Pago para suscripciones (Preapproval).
//
// Recibe subscription_preapproval y subscription_authorized_payment, valida
// la firma (x-signature) contra la documentación oficial de MP, y cuando un
// preapproval queda "authorized" vincula/activa el plan del taller.
//
// Secrets requeridos (Supabase → Edge Functions → Secrets), TODAVÍA NO
// CONFIGURADOS — se resuelven esta noche con credenciales reales:
//   - MP_ACCESS_TOKEN         → access token de la cuenta de MP (server-side).
//   - MP_WEBHOOK_SECRET       → "Clave secreta" de Tus integraciones → Webhooks
//                               (NO es el access token, es un secret aparte).
//   - MP_PLAN_ID_INDEPENDIENTE, MP_PLAN_ID_INTERMEDIO, MP_PLAN_ID_PRO
//                               → los mismos 3 plan_id que se van a pisar en
//                               index.html con scripts/set-mp-plan-ids.sh.
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta el runtime de Edge
// Functions automáticamente, no hace falta configurarlos a mano.
//
// DUDAS ABIERTAS A RESOLVER ESTA NOCHE CON DATOS REALES (no inventadas acá):
//   1. Los valores reales que acepta la columna talleres.plan más allá del
//      default 'basico' (¿'intermedio'/'pro' tal cual, u otra convención?).
//      Confirmar con: select distinct plan from talleres; o el check
//      constraint de la tabla.
//   2. Si esta cuenta de MP entrega las notificaciones en el formato nuevo
//      (type/action/data.id en el body) o en el formato IPN viejo
//      (?topic=...&id=... como query params). El código soporta los dos,
//      pero hay que confirmar cuál llega realmente con la primera prueba.
//   3. Que external_reference efectivamente traiga el id del taller
//      (auth.uid()) — depende de cómo se arme el link de suscripción cuando
//      se implemente la creación del preapproval (paso que todavía no
//      existe). Hoy es una asunción basada en cómo MP documenta el campo,
//      no un hecho probado end-to-end.
//   4. Qué hacer con subscription_authorized_payment (cada cobro recurrente
//      ya autorizado): el prompt original no lo especificó. Por ahora solo
//      se loguea, sin tocar `talleres` ni `cobros`.
//   5. Qué hacer si un preapproval pasa a "cancelled" o "paused": ¿bajar el
//      plan del taller automáticamente a 'basico', o dejarlo para revisión
//      manual? Por ahora no se toca nada en esos estados, solo se loguea.

import { createClient } from "npm:@supabase/supabase-js@2";

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(
      `Falta configurar el secret "${name}" en Supabase (Edge Functions → Secrets). ` +
        `El webhook no puede procesar notificaciones sin esto.`,
    );
  }
  return value;
}

// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY los pone el runtime siempre; si
// faltaran sería un problema de plataforma, no de configuración pendiente,
// así que acá sí falla duro al cargar el módulo.
const supabaseAdmin = createClient(
  requireEnv("SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
);

/* ---------- Validación de x-signature (HMAC-SHA256) ---------- */
// Manifest oficial: "id:{data.id en minúsculas};request-id:{x-request-id};ts:{ts};"
// omitiendo por completo (no en blanco) el segmento id:/request-id: cuando
// data.id o x-request-id no vienen. Secret = "Clave secreta" del dashboard
// (Tus integraciones → Webhooks), distinta del access token.

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function parseXSignature(header: string | null): { ts: string; v1: string } | null {
  if (!header) return null;
  let ts: string | undefined;
  let v1: string | undefined;
  for (const part of header.split(",")) {
    const [key, value] = part.trim().split("=");
    if (key === "ts") ts = value;
    if (key === "v1") v1 = value;
  }
  if (!ts || !v1) return null;
  return { ts, v1 };
}

function buildManifest(dataId: string | null, requestId: string | null, ts: string): string {
  let manifest = "";
  if (dataId) manifest += `id:${dataId.toLowerCase()};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${ts};`;
  return manifest;
}

async function verifySignature(req: Request, url: URL, secret: string): Promise<boolean> {
  const parsed = parseXSignature(req.headers.get("x-signature"));
  if (!parsed) return false;
  const dataId = url.searchParams.get("data.id") ?? url.searchParams.get("id");
  const requestId = req.headers.get("x-request-id");
  const manifest = buildManifest(dataId, requestId, parsed.ts);
  const expected = await hmacSha256Hex(secret, manifest);
  return timingSafeEqual(expected, parsed.v1);
}

/* ---------- API de Mercado Pago ---------- */

async function fetchPreapproval(id: string, accessToken: string): Promise<any> {
  const res = await fetch(`https://api.mercadopago.com/preapproval/${id}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`No se pudo obtener el preapproval ${id} (HTTP ${res.status}): ${body}`);
  }
  return res.json();
}

/* ---------- Mapeo plan_id de MP -> valor de talleres.plan ---------- */
// TODO (resolver esta noche): confirmar que 'basico'/'intermedio'/'pro' son
// los valores reales que acepta la columna, ver duda abierta #1 arriba.

function resolvePlanValue(preapprovalPlanId: string | null): string {
  const map: Record<string, string> = {};
  const independiente = Deno.env.get("MP_PLAN_ID_INDEPENDIENTE");
  const intermedio = Deno.env.get("MP_PLAN_ID_INTERMEDIO");
  const pro = Deno.env.get("MP_PLAN_ID_PRO");
  if (independiente) map[independiente] = "basico";
  if (intermedio) map[intermedio] = "intermedio";
  if (pro) map[pro] = "pro";

  if (!preapprovalPlanId || !(preapprovalPlanId in map)) {
    throw new Error(
      `No se pudo mapear preapproval_plan_id="${preapprovalPlanId}" a un plan conocido. ` +
        `Revisar los secrets MP_PLAN_ID_INDEPENDIENTE/INTERMEDIO/PRO y los valores reales de talleres.plan.`,
    );
  }
  return map[preapprovalPlanId];
}

/* ---------- Activar suscripción ---------- */
// Primero intenta por mp_preapproval_id (ya vinculado antes: updates,
// renovaciones). Si no hay match, es la primera vez: usa external_reference
// (ver duda abierta #3) para encontrar el taller y vincularlo.

async function activateSubscription(preapproval: any): Promise<void> {
  const planValue = resolvePlanValue(preapproval.preapproval_plan_id ?? null);

  const { data: byPreapprovalId, error: err1 } = await supabaseAdmin
    .from("talleres")
    .update({ plan: planValue, mp_preapproval_id: preapproval.id })
    .eq("mp_preapproval_id", preapproval.id)
    .select("id");
  if (err1) throw err1;
  if (byPreapprovalId && byPreapprovalId.length > 0) return;

  const externalReference = preapproval.external_reference ?? null;
  if (!externalReference) {
    throw new Error(
      `Preapproval ${preapproval.id} autorizado pero sin external_reference y sin match previo ` +
        `por mp_preapproval_id. No hay forma de saber a qué taller pertenece.`,
    );
  }

  const { data: byExternalRef, error: err2 } = await supabaseAdmin
    .from("talleres")
    .update({ plan: planValue, mp_preapproval_id: preapproval.id })
    .eq("id", externalReference)
    .is("mp_preapproval_id", null)
    .select("id");
  if (err2) throw err2;
  if (!byExternalRef || byExternalRef.length === 0) {
    throw new Error(
      `No se encontró taller con id="${externalReference}" (external_reference) y mp_preapproval_id ` +
        `nulo para vincular el preapproval ${preapproval.id}.`,
    );
  }
}

/* ---------- Handler ---------- */

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // MP hace pings de validación de URL al guardar la config del webhook.
  // No son notificaciones reales: no hay nada que procesar, solo confirmar
  // que el endpoint responde.
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: true, note: "mp-webhook activo" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  let webhookSecret: string;
  let accessToken: string;
  try {
    webhookSecret = requireEnv("MP_WEBHOOK_SECRET");
    accessToken = requireEnv("MP_ACCESS_TOKEN");
  } catch (err) {
    console.error("[mp-webhook]", (err as Error).message);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const validSignature = await verifySignature(req, url, webhookSecret);
  if (!validSignature) {
    console.error("[mp-webhook] firma inválida o ausente. x-signature:", req.headers.get("x-signature"));
    return new Response(JSON.stringify({ error: "Firma inválida" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: any = {};
  try {
    const rawBody = await req.text();
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch (err) {
    console.error("[mp-webhook] body no es JSON válido:", err);
    return new Response(JSON.stringify({ error: "Body inválido" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Soporta el formato nuevo (type/action/data.id en el body) y el viejo
  // estilo IPN (topic/id como query params) — ver duda abierta #2.
  const type = body?.type ?? url.searchParams.get("topic") ?? url.searchParams.get("type");
  const dataId = body?.data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id");

  console.log(`[mp-webhook] notificación: type=${type} data.id=${dataId} action=${body?.action ?? "?"}`);

  try {
    if (type === "subscription_preapproval") {
      const preapproval = await fetchPreapproval(String(dataId), accessToken);
      console.log(
        `[mp-webhook] preapproval ${preapproval.id} status=${preapproval.status} ` +
          `plan_id=${preapproval.preapproval_plan_id} external_reference=${preapproval.external_reference}`,
      );

      if (preapproval.status === "authorized") {
        await activateSubscription(preapproval);
      } else {
        // pending / paused / cancelled — ver duda abierta #5.
        console.log(`[mp-webhook] preapproval ${preapproval.id} en estado "${preapproval.status}", sin acción.`);
      }
    } else if (type === "subscription_authorized_payment") {
      // Ver duda abierta #4 — todavía sin acción definida.
      console.log(`[mp-webhook] subscription_authorized_payment recibido (data.id=${dataId}), sin acción implementada.`);
    } else {
      console.log(`[mp-webhook] tipo de notificación no manejado: "${type}"`);
    }
  } catch (err) {
    console.error("[mp-webhook] error procesando la notificación:", (err as Error).message);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
