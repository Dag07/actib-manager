const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const cors = require("cors");

if (!admin.apps.length) {
  admin.initializeApp();
}

const corsHandler = cors({ origin: true });

async function verifyIdTokenOrThrow(req) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    throw new Error("Missing or invalid authorization header");
  }
  const idToken = authHeader.substring("Bearer ".length);
  const decoded = await admin.auth().verifyIdToken(idToken);
  // attach decoded token to request for downstream checks
  try {
    req.auth = decoded;
  } catch {
    // ignore if can't attach
  }
  return { uid: decoded.uid, decoded };
}

function requireRid(req) {
  const rid = String(req.query.rid || "").trim();
  if (!rid) throw new Error("rid required");
  return rid;
}

async function getRestaurantWhatsappIntegrationOrThrow(rid) {
  const snap = await admin
    .firestore()
    .doc(`restaurants/${rid}/integrations/whatsapp`)
    .get();

  if (!snap.exists) {
    throw new Error("WhatsApp integration doc not found");
  }

  const data = snap.data() || {};

  // Accept both snake_case and camelCase field names (legacy vs current)
  const wabaId = String(data.wabaId || data.waba_id || "").trim();
  const phoneNumberId = String(
    data.phoneNumberId || data.phone_number_id || "",
  ).trim();

  // Optional: token stored on the integration doc (prefer environment variable)
  const accessTokenFromDoc = String(
    data.accessToken || data.access_token || data.whatsappAccessToken || "",
  ).trim();

  if (!wabaId || !phoneNumberId) {
    throw new Error(
      "Missing wabaId or phoneNumberId in WhatsApp integration doc",
    );
  }

  return { wabaId, phoneNumberId, accessTokenFromDoc };
}

function getMetaConfigOrThrow(accessTokenFallback) {
  const graphVersionRaw = String(
    process.env.META_GRAPH_VERSION || "v19.0",
  ).trim();
  const graphVersion = graphVersionRaw.startsWith("v")
    ? graphVersionRaw
    : `v${graphVersionRaw}`;

  const accessToken = String(
    accessTokenFallback || process.env.WHATSAPP_ACCESS_TOKEN || "",
  ).trim();
  if (!accessToken) {
    throw new Error("Missing WHATSAPP_ACCESS_TOKEN env var or integration access token");
  }

  return { graphVersion, accessToken };
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try {
    return JSON.parse(req.rawBody?.toString("utf8") || "{}");
  } catch {
    return {};
  }
}

async function metaGraphRequest({ method, url, accessToken, body }) {
  const options = {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  };
  if (body != null) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }

  const resp = await fetch(url, options);
  const text = await resp.text();

  let json = {};
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
  }

  return { ok: resp.ok, status: resp.status, json };
}

function sendJson(res, status, payload) {
  return res.status(status).json(payload);
}

function maskTokenLast4(token) {
  try {
    const s = String(token || "");
    if (s.length <= 8) return s.replace(/.(?=.{0,4})/g, "*");
    return `${s.slice(0, 4)}...${s.slice(-4)}`;
  } catch {
    return "(redacted)";
  }
}

const ALLOWED_ADMIN_DOMAIN = "actib.app";

function requireAdminHeader(req) {
  // Allow the existing header for local/dev testing
  const header = String(req.headers["x-actib-admin"] || "");
  if (header === "1") return;

  const decoded = req.auth || {};

  // Auto-accept all @actib.app email accounts
  if (
    typeof decoded.email === "string" &&
    decoded.email.toLowerCase().endsWith("@" + ALLOWED_ADMIN_DOMAIN)
  ) {
    return;
  }

  const isAdminClaim = !!(
    decoded.admin === true ||
    decoded.admin === "1" ||
    (decoded.claims && decoded.claims.admin === true)
  );
  if (!isAdminClaim) {
    throw new Error("Access denied: requires @actib.app account or admin claim");
  }
}

const DEFAULT_TEMPLATE_LANGUAGE = "es_ES";

const DEFAULT_WABA_TEMPLATES = [
  {
    name: "driver_delivery_assignment",
    body_text:
      "🚚 Nuevo delivery\nPedido: #{{1}}\nEntrega: {{2}}\nTotal: ${{3}}\nResponde: ACEPTAR o RECHAZAR.",
  },
  {
    name: "order_confirmed",
    body_text: "Recibimos tu pedido #{{1}}, te actualizaremos por aquí.",
  },
  {
    name: "order_in_progress",
    body_text: "Tu pedido #{{1}} está en preparación ✅",
  },
  {
    name: "order_ready_delivery",
    body_text:
      "Tu pedido #{{1}} ya estará listo, estamos coordinando la entrega.",
  },
  {
    name: "order_ready_pickup",
    body_text: "Tu pedido #{{1}} está listo para retirar en {{2}} ✅",
  },
  {
    name: "order_picked_up",
    body_text:
      "Registramos que retiraste tu pedido #{{1}}. ¡Gracias, vuelve pronto! ✅",
  },
  {
    name: "order_out_for_delivery",
    body_text: "El repartidor está en camino con tu pedido #{{1}} 🛵",
  },
  {
    name: "order_cancelled",
    body_text: "Tu pedido #{{1}} fue cancelado. Motivo: {{2}}",
  },
];

exports.whatsapp_templates_list = onRequest(
  { region: "us-central1", timeoutSeconds: 30, memory: "256MiB" },
  async (req, res) =>
    corsHandler(req, res, async () => {
      try {
        if (req.method === "OPTIONS") return res.status(204).send("");
        if (req.method !== "GET") {
          return sendJson(res, 405, { success: false, error: "Use GET" });
        }

        await verifyIdTokenOrThrow(req);
        requireAdminHeader(req);

        const rid = requireRid(req);
        const { wabaId, accessTokenFromDoc } = await getRestaurantWhatsappIntegrationOrThrow(rid);
        const { graphVersion, accessToken } = getMetaConfigOrThrow(accessTokenFromDoc);

        const { ok, status, json } = await metaGraphRequest({
          method: "GET",
          url: `https://graph.facebook.com/${graphVersion}/${wabaId}/message_templates?limit=100`,
          accessToken,
        });

        if (!ok) {
          return sendJson(res, 500, {
            success: false,
            error: "META_ERROR",
            status,
            details: json,
          });
        }

          const templates = (json.data || []).map((t) => ({
            name: t.name,
            language: t.language,
            category: t.category,
            status: t.status,
            raw: t,
          }));

          const requestInfo = { url: `https://graph.facebook.com/${graphVersion}/${wabaId}/message_templates?limit=100`, authMasked: maskTokenLast4(accessToken) };

          return sendJson(res, 200, { success: true, templates, requestInfo });
      } catch (e) {
        console.error("[whatsapp_templates_list]", e);
        return sendJson(res, 500, {
          success: false,
          error: e.message || "Internal error",
        });
      }
    }),
);

exports.whatsapp_templates_create = onRequest(
  { region: "us-central1", timeoutSeconds: 30, memory: "256MiB" },
  async (req, res) =>
    corsHandler(req, res, async () => {
      try {
        if (req.method === "OPTIONS") return res.status(204).send("");
        if (req.method !== "POST") {
          return sendJson(res, 405, { success: false, error: "Use POST" });
        }

        await verifyIdTokenOrThrow(req);
        requireAdminHeader(req);

        const rid = requireRid(req);
        const body = await readJsonBody(req);

        const name = String(body.name || "").trim();
        const category = String(body.category || "UTILITY").trim();
        const language = String(
          body.language || DEFAULT_TEMPLATE_LANGUAGE,
        ).trim();
        const bodyText = String(body.body_text || "").trim();

        if (!name || !bodyText) {
          return sendJson(res, 400, {
            success: false,
            error: "Missing name or body_text",
          });
        }

        if (!/^[a-z0-9_]+$/.test(name)) {
          return sendJson(res, 400, {
            success: false,
            error: "Invalid template name",
          });
        }

        const { wabaId, accessTokenFromDoc } = await getRestaurantWhatsappIntegrationOrThrow(rid);
        const { graphVersion, accessToken } = getMetaConfigOrThrow(accessTokenFromDoc);

        const payload = {
          name,
          category,
          language,
          components: [{ type: "BODY", text: bodyText }],
        };

        const { ok, status, json } = await metaGraphRequest({
          method: "POST",
          url: `https://graph.facebook.com/${graphVersion}/${wabaId}/message_templates`,
          accessToken,
          body: payload,
        });

        if (!ok) {
          return sendJson(res, 500, {
            success: false,
            error: "META_ERROR",
            status,
            details: json,
          });
        }

        return sendJson(res, 200, {
          success: true,
          meta: json,
        });
      } catch (e) {
        console.error("[whatsapp_templates_create]", e);
        return sendJson(res, 500, {
          success: false,
          error: e.message || "Internal error",
        });
      }
    }),
);

exports.whatsapp_templates_generate_defaults = onRequest(
  { region: "us-central1", timeoutSeconds: 60, memory: "256MiB" },
  async (req, res) =>
    corsHandler(req, res, async () => {
      try {
        if (req.method === "OPTIONS") return res.status(204).send("");
        if (req.method !== "POST") {
          return sendJson(res, 405, { success: false, error: "Use POST" });
        }

        await verifyIdTokenOrThrow(req);
        requireAdminHeader(req);

        const rid = requireRid(req);
        const { wabaId, accessTokenFromDoc } = await getRestaurantWhatsappIntegrationOrThrow(rid);
        const { graphVersion, accessToken } = getMetaConfigOrThrow(accessTokenFromDoc);

        const results = [];

        for (const tpl of DEFAULT_WABA_TEMPLATES) {
          const payload = {
            name: tpl.name,
            category: "UTILITY",
            language: DEFAULT_TEMPLATE_LANGUAGE,
            components: [{ type: "BODY", text: tpl.body_text }],
          };

          const { ok, status, json } = await metaGraphRequest({
            method: "POST",
            url: `https://graph.facebook.com/${graphVersion}/${wabaId}/message_templates`,
            accessToken,
            body: payload,
          });

          results.push({ name: tpl.name, ok, status, meta: json });
        }

        return sendJson(res, 200, { success: true, results });
      } catch (e) {
        console.error("[whatsapp_templates_generate_defaults]", e);
        return sendJson(res, 500, {
          success: false,
          error: e.message || "Internal error",
        });
      }
    }),
);

exports.whatsapp_send_template_test = onRequest(
  { region: "us-central1", timeoutSeconds: 30, memory: "256MiB" },
  async (req, res) =>
    corsHandler(req, res, async () => {
      try {
        if (req.method === "OPTIONS") return res.status(204).send("");
        if (req.method !== "POST") {
          return sendJson(res, 405, { success: false, error: "Use POST" });
        }

        await verifyIdTokenOrThrow(req);
        requireAdminHeader(req);

        const rid = requireRid(req);
        const body = await readJsonBody(req);

        const to = String(body.to || "").trim();
        const templateName = String(body.template_name || "").trim();
        const language = String(
          body.language || DEFAULT_TEMPLATE_LANGUAGE,
        ).trim();
        const variables = Array.isArray(body.variables) ? body.variables : [];

        if (!to || !templateName) {
          return sendJson(res, 400, {
            success: false,
            error: "Missing to or template_name",
          });
        }

        const { phoneNumberId, accessTokenFromDoc } =
          await getRestaurantWhatsappIntegrationOrThrow(rid);
        const { graphVersion, accessToken } = getMetaConfigOrThrow(accessTokenFromDoc);

        const components =
          variables.length > 0
            ? [
                {
                  type: "body",
                  parameters: variables.map((v) => ({
                    type: "text",
                    text: String(v),
                  })),
                },
              ]
            : undefined;

        const payload = {
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: templateName,
            language: { code: language },
            ...(components ? { components } : {}),
          },
        };

        const { ok, status, json } = await metaGraphRequest({
          method: "POST",
          url: `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`,
          accessToken,
          body: payload,
        });

        if (!ok) {
          return sendJson(res, 500, {
            success: false,
            error: "META_ERROR",
            status,
            details: json,
          });
        }

        const requestInfo = { url: `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, authMasked: maskTokenLast4(accessToken) };

        return sendJson(res, 200, { success: true, meta: json, requestInfo });
      } catch (e) {
        console.error("[whatsapp_send_template_test]", e);
        return sendJson(res, 500, {
          success: false,
          error: e.message || "Internal error",
        });
      }
    }),
);

exports.whatsapp_integration_get = onRequest(
  { region: "us-central1", timeoutSeconds: 30, memory: "128MiB" },
  async (req, res) =>
    corsHandler(req, res, async () => {
      try {
        if (req.method === "OPTIONS") return res.status(204).send("");
        if (req.method !== "GET") {
          return sendJson(res, 405, { success: false, error: "Use GET" });
        }

        await verifyIdTokenOrThrow(req);
        requireAdminHeader(req);

        const rid = requireRid(req);
        const snap = await admin
          .firestore()
          .doc(`restaurants/${rid}/integrations/whatsapp`)
          .get();

        if (!snap.exists) {
          return sendJson(res, 404, {
            success: false,
            error: "WhatsApp integration doc not found",
          });
        }

        const data = snap.data() || {};
        // Normalize keys to camelCase for the client
        function tsToIso(v) {
          if (!v) return null;
          try {
            if (typeof v.toDate === "function") return v.toDate().toISOString();
            if (v instanceof Date) return v.toISOString();
            return new Date(v).toISOString();
          } catch {
            return null;
          }
        }

        const resp = {
          wabaId: data.wabaId || data.waba_id || "",
          phoneNumberId: data.phoneNumberId || data.phone_number_id || "",
          provider: data.provider || null,
          enabled: data.enabled || false,
          businessAccountId: data.businessAccountId || data.business_account_id || null,
          accessTokenPresent: !!(
            data.accessToken || data.access_token || data.whatsappAccessToken
          ),
          lastSync: tsToIso(data.updatedAt || data.connectedAt || null),
          // Do NOT return full access token unless explicitly required
        };

        return sendJson(res, 200, { success: true, integration: resp });
      } catch (e) {
        console.error("[whatsapp_integration_get]", e);
        return sendJson(res, 500, {
          success: false,
          error: e.message || "Internal error",
        });
      }
    }),
);

exports.whatsapp_integration_update = onRequest(
  { region: "us-central1", timeoutSeconds: 30, memory: "128MiB" },
  async (req, res) =>
    corsHandler(req, res, async () => {
      try {
        if (req.method === "OPTIONS") return res.status(204).send("");
        if (req.method !== "POST") {
          return sendJson(res, 405, { success: false, error: "Use POST" });
        }

        await verifyIdTokenOrThrow(req);
        requireAdminHeader(req);

        const rid = requireRid(req);
        const body = await readJsonBody(req);

        const updates = {};
        if (body.wabaId != null) updates.wabaId = String(body.wabaId || "").trim();
        if (body.phoneNumberId != null)
          updates.phoneNumberId = String(body.phoneNumberId || "").trim();
        if (body.enabled != null) updates.enabled = !!body.enabled;
        // Optionally allow setting access token (be careful)
        if (body.accessToken != null)
          updates.accessToken = String(body.accessToken || "").trim();

        if (Object.keys(updates).length === 0) {
          return sendJson(res, 400, { success: false, error: "No updates provided" });
        }

        await admin
          .firestore()
          .doc(`restaurants/${rid}/integrations/whatsapp`)
          .set(updates, { merge: true });

        return sendJson(res, 200, { success: true });
      } catch (e) {
        console.error("[whatsapp_integration_update]", e);
        return sendJson(res, 500, {
          success: false,
          error: e.message || "Internal error",
        });
      }
    }),
);

// Load additional admin endpoints (admin_api.js)
try {
  Object.assign(exports, require("./admin_api"));
} catch (e) {
  // If admin_api is missing during local edits, fail silently here.
  console.warn("admin_api not loaded:", e && e.message);
}
