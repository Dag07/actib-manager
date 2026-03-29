const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const cors = require("cors");

if (!admin.apps.length) {
  admin.initializeApp();
}

const corsHandler = cors({ origin: true });

async function verifyIdTokenOrThrow(req) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) throw new Error("Missing authorization");
  const idToken = authHeader.substring("Bearer ".length);
  const decoded = await admin.auth().verifyIdToken(idToken);
  req.auth = decoded;
  return decoded;
}

const ALLOWED_ADMIN_DOMAIN = "actib.app";

function requireAdminHeader(req) {
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

  const isAdmin = !!(
    decoded.admin === true ||
    decoded.superAdmin === true ||
    decoded.super_admin === true
  );
  if (!isAdmin) throw new Error("Access denied: requires @actib.app account or admin claim");
}

function sendJson(res, status, payload) {
  return res.status(status).json(payload);
}

function toIso(v) {
  try {
    if (!v) return null;
    if (typeof v.toDate === "function") return v.toDate().toISOString();
    if (v instanceof Date) return v.toISOString();
    return new Date(v).toISOString();
  } catch {
    return null;
  }
}

// Helper: truncate value for preview
function previewValue(v) {
  try {
    if (v === null || v === undefined) return null;
    if (typeof v === "object") {
      const s = JSON.stringify(v);
      return s.length > 300 ? s.slice(0, 300) + "..." : s;
    }
    const s = String(v);
    return s.length > 300 ? s.slice(0, 300) + "..." : s;
  } catch {
    return String(v).slice(0, 200);
  }
}

// RTDB preview: fetch first N children (safe for large nodes)
exports.admin_rtdb_preview = onRequest(async (req, res) =>
  corsHandler(req, res, async () => {
    try {
      if (req.method === "OPTIONS") return res.status(204).send("");
      if (req.method !== "GET") return sendJson(res, 405, { success: false, error: "Use GET" });

      await verifyIdTokenOrThrow(req);
      requireAdminHeader(req);

      const path = String(req.query.path || "/").trim();
      const limit = Math.min(Number(req.query.limit || 50), 1000);

      const ref = admin.database().ref(path);
      // fetch limit+1 to detect more
      const snap = await ref.orderByKey().limitToFirst(limit + 1).once("value");
      const data = snap.val() || {};
      const keys = Object.keys(data || {});
      const hasMore = keys.length > limit;
      const items = keys.slice(0, limit).map((k) => ({ key: k, preview: previewValue(data[k]) }));

      return sendJson(res, 200, { success: true, path, limit, items, hasMore });
    } catch (e) {
      console.error("[admin_rtdb_preview]", e);
      return sendJson(res, 500, { success: false, error: e.message || String(e) });
    }
  }),
);

// RTDB paginate: startAt key + limit
exports.admin_rtdb_paginate = onRequest(async (req, res) =>
  corsHandler(req, res, async () => {
    try {
      if (req.method === "OPTIONS") return res.status(204).send("");
      if (req.method !== "GET") return sendJson(res, 405, { success: false, error: "Use GET" });

      await verifyIdTokenOrThrow(req);
      requireAdminHeader(req);

      const path = String(req.query.path || "/").trim();
      const limit = Math.min(Number(req.query.limit || 100), 1000);
      const startAt = req.query.startAt || null;

      const ref = admin.database().ref(path).orderByKey();
      let snap;
      if (startAt) snap = await ref.startAt(startAt).limitToFirst(limit + 1).once("value");
      else snap = await ref.limitToFirst(limit + 1).once("value");

      const data = snap.val() || {};
      const keys = Object.keys(data || {});
      // if startAt provided, the first key could be equal to startAt; remove it
      let processedKeys = keys;
      if (startAt && keys[0] === startAt) processedKeys = keys.slice(1);
      const hasMore = processedKeys.length > limit;
      const items = processedKeys.slice(0, limit).map((k) => ({ key: k, preview: previewValue(data[k]) }));

      return sendJson(res, 200, { success: true, path, limit, startAt, items, hasMore });
    } catch (e) {
      console.error("[admin_rtdb_paginate]", e);
      return sendJson(res, 500, { success: false, error: e.message || String(e) });
    }
  }),
);

// Firestore preview (collection or query by passing where params)
exports.admin_firestore_preview = onRequest(async (req, res) =>
  corsHandler(req, res, async () => {
    try {
      if (req.method === "OPTIONS") return res.status(204).send("");
      if (req.method !== "GET") return sendJson(res, 405, { success: false, error: "Use GET" });

      await verifyIdTokenOrThrow(req);
      requireAdminHeader(req);

      const path = String(req.query.path || "").trim();
      if (!path) return sendJson(res, 400, { success: false, error: "path required" });
      const limit = Math.min(Number(req.query.limit || 50), 1000);

      const coll = admin.firestore().collection(path);
      const q = coll.orderBy(admin.firestore.FieldPath.documentId()).limit(limit + 1);
      const snap = await q.get();
      const docs = [];
      snap.forEach((d) => docs.push({ id: d.id, preview: previewValue(d.data()) }));
      const hasMore = docs.length > limit;
      const items = docs.slice(0, limit);

      return sendJson(res, 200, { success: true, path, limit, items, hasMore });
    } catch (e) {
      console.error("[admin_firestore_preview]", e);
      return sendJson(res, 500, { success: false, error: e.message || String(e) });
    }
  }),
);

// Firestore bulk delete (supports dryRun). Body: { path, where: { field, op, value }, dryRun }
exports.admin_firestore_bulk_delete = onRequest(async (req, res) =>
  corsHandler(req, res, async () => {
    try {
      if (req.method === "OPTIONS") return res.status(204).send("");
      if (req.method !== "POST") return sendJson(res, 405, { success: false, error: "Use POST" });

      await verifyIdTokenOrThrow(req);
      requireAdminHeader(req);

      const body = req.body || {};
      const path = String(body.path || "").trim();
      if (!path) return sendJson(res, 400, { success: false, error: "path required" });

      const dryRun = !!body.dryRun;
      const batchSize = Math.min(Number(body.batchSize || 500), 500);
      const previewLimit = Math.min(Number(body.previewLimit || 50), 200);
      const exportBeforeDelete = body.exportBeforeDelete !== false;

      let query = admin.firestore().collection(path);
      if (body.where && body.where.field) {
        const op = String(body.where.op || "==");
        query = query.where(body.where.field, op, body.where.value);
      }

      // Count + collect ids (streaming via pagination)
      const snapshot = await query.get();
      const docs = snapshot.docs;
      const total = docs.length;
      const previewDocs = docs.slice(0, previewLimit).map((d) => ({ id: d.id }));

      if (dryRun) {
        return sendJson(res, 200, {
          success: true,
          dryRun: true,
          total,
          previewDocs,
          warning:
            total > 1000
              ? "Large delete detected. Use background operation mode."
              : null,
        });
      }

      let backupRef = null;
      if (exportBeforeDelete && total > 0) {
        const backupPayload = {
          type: "firestore_bulk_delete_backup",
          path,
          where: body.where || null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          createdBy: req.auth ? req.auth.uid : null,
          docs: docs.map((d) => ({ id: d.id, data: d.data() })),
        };
        backupRef = await admin.firestore().collection("admin_ops_backups").add(backupPayload);
      }

      // Perform batched deletes
      let deleted = 0;
      while (docs.length) {
        const batch = admin.firestore().batch();
        const chunk = docs.splice(0, batchSize);
        chunk.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        deleted += chunk.length;
      }

      return sendJson(res, 200, {
        success: true,
        total,
        deleted,
        backupId: backupRef ? backupRef.id : null,
      });
    } catch (e) {
      console.error("[admin_firestore_bulk_delete]", e);
      return sendJson(res, 500, { success: false, error: e.message || String(e) });
    }
  }),
);

// Admin operation logs / background job creation
exports.admin_ops_create = onRequest(async (req, res) =>
  corsHandler(req, res, async () => {
    try {
      if (req.method === "OPTIONS") return res.status(204).send("");
      if (req.method !== "POST") return sendJson(res, 405, { success: false, error: "Use POST" });

      await verifyIdTokenOrThrow(req);
      requireAdminHeader(req);

      const body = req.body || {};
      const op = {
        type: body.type || "generic",
        params: body.params || {},
        status: "pending",
        dryRun: !!body.dryRun,
        requiresConfirmation: body.requiresConfirmation !== false,
        createdBy: req.auth ? req.auth.uid : null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      const ref = await admin.firestore().collection("admin_ops").add(op);
      return sendJson(res, 200, { success: true, id: ref.id });
    } catch (e) {
      console.error("[admin_ops_create]", e);
      return sendJson(res, 500, { success: false, error: e.message || String(e) });
    }
  }),
);

exports.admin_ops_list = onRequest(async (req, res) =>
  corsHandler(req, res, async () => {
    try {
      if (req.method === "OPTIONS") return res.status(204).send("");
      if (req.method !== "GET") return sendJson(res, 405, { success: false, error: "Use GET" });

      await verifyIdTokenOrThrow(req);
      requireAdminHeader(req);

      const limit = Math.min(Number(req.query.limit || 50), 200);
      const snap = await admin
        .firestore()
        .collection("admin_ops")
        .orderBy("createdAt", "desc")
        .limit(limit)
        .get();

      const ops = [];
      snap.forEach((d) => {
        const data = d.data() || {};
        ops.push({
          id: d.id,
          type: data.type || "generic",
          status: data.status || "unknown",
          createdBy: data.createdBy || null,
          createdAt: toIso(data.createdAt),
          startedAt: toIso(data.startedAt),
          finishedAt: toIso(data.finishedAt),
          result: data.result || null,
          error: data.error || null,
          dryRun: !!data.dryRun,
        });
      });

      return sendJson(res, 200, { success: true, ops });
    } catch (e) {
      console.error("[admin_ops_list]", e);
      return sendJson(res, 500, { success: false, error: e.message || String(e) });
    }
  }),
);

async function runFirestoreBulkDeleteOp(opDoc, opData) {
  const params = opData.params || {};
  const path = String(params.path || "").trim();
  if (!path) throw new Error("Operation missing params.path");

  const dryRun = !!opData.dryRun;
  const batchSize = Math.min(Number(params.batchSize || 500), 500);
  const previewLimit = Math.min(Number(params.previewLimit || 50), 200);
  const exportBeforeDelete = params.exportBeforeDelete !== false;

  let query = admin.firestore().collection(path);
  if (params.where && params.where.field) {
    const op = String(params.where.op || "==");
    query = query.where(params.where.field, op, params.where.value);
  }

  const snapshot = await query.get();
  const docs = snapshot.docs;
  const total = docs.length;
  const previewDocs = docs.slice(0, previewLimit).map((d) => ({ id: d.id }));

  if (dryRun) {
    return { dryRun: true, total, previewDocs };
  }

  let backupId = null;
  if (exportBeforeDelete && total > 0) {
    const backupRef = await admin.firestore().collection("admin_ops_backups").add({
      type: "firestore_bulk_delete_backup",
      path,
      where: params.where || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: opData.createdBy || null,
      sourceOpId: opDoc.id,
      docs: docs.map((d) => ({ id: d.id, data: d.data() })),
    });
    backupId = backupRef.id;
  }

  let deleted = 0;
  while (docs.length) {
    const batch = admin.firestore().batch();
    const chunk = docs.splice(0, batchSize);
    chunk.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += chunk.length;
  }

  return { dryRun: false, total, deleted, backupId, previewDocs };
}

async function runRTDBBulkDeleteOp(opDoc, opData) {
  const params = opData.params || {};
  const path = String(params.path || "").trim();
  if (!path) throw new Error("Operation missing params.path");

  const dryRun = !!opData.dryRun;
  const keyPattern = params.keyPattern || null;
  const previewLimit = Math.min(Number(params.previewLimit || 50), 200);
  const exportBeforeDelete = params.exportBeforeDelete !== false;

  const ref = admin.database().ref(path);
  const snap = await ref.once("value");
  const data = snap.val() || {};
  const keys = Object.keys(data || {});

  let matchingKeys = keys;
  if (keyPattern) {
    const regex = new RegExp(keyPattern, "i");
    matchingKeys = keys.filter((k) => regex.test(k));
  }

  const total = matchingKeys.length;
  const previewKeys = matchingKeys.slice(0, previewLimit);

  if (dryRun) {
    return { dryRun: true, total, previewKeys };
  }

  let backupId = null;
  if (exportBeforeDelete && total > 0) {
    const backupData = {};
    matchingKeys.forEach((k) => {
      backupData[k] = data[k];
    });
    const backupRef = await admin.firestore().collection("admin_ops_backups").add({
      type: "rtdb_bulk_delete_backup",
      path,
      keyPattern: keyPattern || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: opData.createdBy || null,
      sourceOpId: opDoc.id,
      data: backupData,
    });
    backupId = backupRef.id;
  }

  // Perform deletes
  const updates = {};
  matchingKeys.forEach((k) => {
    updates[k] = null;
  });
  await ref.update(updates);

  return { dryRun: false, total, deleted: total, backupId, previewKeys };
}

async function executeOperationById(id, actorUid) {
  const opRef = admin.firestore().collection("admin_ops").doc(id);
  const opSnap = await opRef.get();
  if (!opSnap.exists) {
    const e = new Error("not found");
    e.status = 404;
    throw e;
  }

  const opData = opSnap.data() || {};
  if (opData.status === "running") {
    const e = new Error("operation already running");
    e.status = 409;
    throw e;
  }

  await opRef.set(
    {
      status: "running",
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
      startedBy: actorUid || null,
      error: null,
    },
    { merge: true },
  );

  let result;
  if (opData.type === "firestore_bulk_delete") {
    result = await runFirestoreBulkDeleteOp(opSnap, opData);
  } else if (opData.type === "rtdb_bulk_delete") {
    result = await runRTDBBulkDeleteOp(opSnap, opData);
  } else {
    throw new Error(`Unsupported operation type: ${opData.type}`);
  }

  await opRef.set(
    {
      status: "completed",
      result,
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return result;
}

exports.admin_ops_run = onRequest(async (req, res) =>
  corsHandler(req, res, async () => {
    try {
      if (req.method === "OPTIONS") return res.status(204).send("");
      if (req.method !== "POST") return sendJson(res, 405, { success: false, error: "Use POST" });

      await verifyIdTokenOrThrow(req);
      requireAdminHeader(req);

      const body = req.body || {};
      const id = String(body.id || "").trim();
      if (!id) return sendJson(res, 400, { success: false, error: "id required" });
      const result = await executeOperationById(id, req.auth ? req.auth.uid : null);

      return sendJson(res, 200, { success: true, result });
    } catch (e) {
      console.error("[admin_ops_run]", e);
      try {
        const id = String((req.body || {}).id || "").trim();
        if (id) {
          await admin
            .firestore()
            .collection("admin_ops")
            .doc(id)
            .set(
              {
                status: "failed",
                error: e.message || String(e),
                finishedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
              { merge: true },
            );
        }
      } catch {
        // ignore secondary error
      }
      return sendJson(res, e.status || 500, { success: false, error: e.message || String(e) });
    }
  }),
);

exports.admin_ops_run_next = onRequest(async (req, res) =>
  corsHandler(req, res, async () => {
    try {
      if (req.method === "OPTIONS") return res.status(204).send("");
      if (req.method !== "POST") return sendJson(res, 405, { success: false, error: "Use POST" });

      await verifyIdTokenOrThrow(req);
      requireAdminHeader(req);

      const pendingSnap = await admin
        .firestore()
        .collection("admin_ops")
        .where("status", "==", "pending")
        .limit(20)
        .get();

      if (pendingSnap.empty) return sendJson(res, 200, { success: true, message: "no pending operations" });

      let selected = pendingSnap.docs[0];
      pendingSnap.docs.forEach((d) => {
        const a = d.data() || {};
        const b = selected.data() || {};
        const at = a.createdAt && typeof a.createdAt.toMillis === "function" ? a.createdAt.toMillis() : Number.MAX_SAFE_INTEGER;
        const bt = b.createdAt && typeof b.createdAt.toMillis === "function" ? b.createdAt.toMillis() : Number.MAX_SAFE_INTEGER;
        if (at < bt) selected = d;
      });

      const result = await executeOperationById(selected.id, req.auth ? req.auth.uid : null);
      return sendJson(res, 200, { success: true, id: selected.id, result });
    } catch (e) {
      console.error("[admin_ops_run_next]", e);
      return sendJson(res, e.status || 500, { success: false, error: e.message || String(e) });
    }
  }),
);

exports.admin_ops_rollback = onRequest(async (req, res) =>
  corsHandler(req, res, async () => {
    try {
      if (req.method === "OPTIONS") return res.status(204).send("");
      if (req.method !== "POST") return sendJson(res, 405, { success: false, error: "Use POST" });

      await verifyIdTokenOrThrow(req);
      requireAdminHeader(req);

      const body = req.body || {};
      const backupId = String(body.backupId || "").trim();
      if (!backupId) return sendJson(res, 400, { success: false, error: "backupId required" });

      const backupSnap = await admin.firestore().collection("admin_ops_backups").doc(backupId).get();
      if (!backupSnap.exists) return sendJson(res, 404, { success: false, error: "backup not found" });

      const backup = backupSnap.data() || {};
      const backupType = backup.type || "";
      const path = String(backup.path || "").trim();
      if (!path) return sendJson(res, 400, { success: false, error: "invalid backup path" });

      let restored = 0;

      if (backupType === "rtdb_bulk_delete_backup") {
        // Restore RTDB backup
        const data = backup.data || {};
        const ref = admin.database().ref(path);
        await ref.update(data);
        restored = Object.keys(data).length;
      } else if (backupType === "firestore_bulk_delete_backup") {
        // Restore Firestore backup
        const docs = Array.isArray(backup.docs) ? backup.docs : [];
        const batchSize = 500;
        for (let i = 0; i < docs.length; i += batchSize) {
          const chunk = docs.slice(i, i + batchSize);
          const batch = admin.firestore().batch();
          chunk.forEach((item) => {
            const docRef = admin.firestore().collection(path).doc(String(item.id));
            batch.set(docRef, item.data || {}, { merge: false });
          });
          await batch.commit();
          restored += chunk.length;
        }
      } else {
        return sendJson(res, 400, { success: false, error: "unsupported backup type" });
      }

      return sendJson(res, 200, { success: true, restored, backupId });
    } catch (e) {
      console.error("[admin_ops_rollback]", e);
      return sendJson(res, 500, { success: false, error: e.message || String(e) });
    }
  }),
);

exports.admin_ops_status = onRequest(async (req, res) =>
  corsHandler(req, res, async () => {
    try {
      if (req.method === "OPTIONS") return res.status(204).send("");
      if (req.method !== "GET") return sendJson(res, 405, { success: false, error: "Use GET" });

      await verifyIdTokenOrThrow(req);
      requireAdminHeader(req);

      const id = String(req.query.id || "").trim();
      if (!id) return sendJson(res, 400, { success: false, error: "id required" });
      const snap = await admin.firestore().collection("admin_ops").doc(id).get();
      if (!snap.exists) return sendJson(res, 404, { success: false, error: "not found" });
      return sendJson(res, 200, { success: true, op: snap.data() });
    } catch (e) {
      console.error("[admin_ops_status]", e);
      return sendJson(res, 500, { success: false, error: e.message || String(e) });
    }
  }),
);

// === Search Endpoints ===

// RTDB search by key pattern (regex)
exports.admin_rtdb_search = onRequest(async (req, res) =>
  corsHandler(req, res, async () => {
    try {
      if (req.method === "OPTIONS") return res.status(204).send("");
      if (req.method !== "GET") return sendJson(res, 405, { success: false, error: "Use GET" });

      await verifyIdTokenOrThrow(req);
      requireAdminHeader(req);

      const path = String(req.query.path || "/").trim();
      const pattern = String(req.query.pattern || "").trim();
      const limit = Math.min(Number(req.query.limit || 100), 1000);

      if (!pattern) return sendJson(res, 400, { success: false, error: "pattern required" });

      const regex = new RegExp(pattern, "i");
      const ref = admin.database().ref(path);
      const snap = await ref.once("value");
      const data = snap.val() || {};

      const matches = [];
      for (const key of Object.keys(data)) {
        if (regex.test(key)) {
          matches.push({ key, preview: previewValue(data[key]) });
          if (matches.length >= limit) break;
        }
      }

      return sendJson(res, 200, { success: true, path, pattern, matches, total: matches.length });
    } catch (e) {
      console.error("[admin_rtdb_search]", e);
      return sendJson(res, 500, { success: false, error: e.message || String(e) });
    }
  }),
);

// Firestore search by doc ID pattern (regex)
exports.admin_firestore_search = onRequest(async (req, res) =>
  corsHandler(req, res, async () => {
    try {
      if (req.method === "OPTIONS") return res.status(204).send("");
      if (req.method !== "GET") return sendJson(res, 405, { success: false, error: "Use GET" });

      await verifyIdTokenOrThrow(req);
      requireAdminHeader(req);

      const path = String(req.query.path || "").trim();
      const pattern = String(req.query.pattern || "").trim();
      const limit = Math.min(Number(req.query.limit || 100), 500);

      if (!path) return sendJson(res, 400, { success: false, error: "path required" });
      if (!pattern) return sendJson(res, 400, { success: false, error: "pattern required" });

      const regex = new RegExp(pattern, "i");
      const coll = admin.firestore().collection(path);
      const snap = await coll.limit(limit * 2).get();

      const matches = [];
      snap.forEach((d) => {
        if (regex.test(d.id)) {
          matches.push({ id: d.id, preview: previewValue(d.data()) });
        }
        if (matches.length >= limit) return;
      });

      return sendJson(res, 200, { success: true, path, pattern, matches, total: matches.length });
    } catch (e) {
      console.error("[admin_firestore_search]", e);
      return sendJson(res, 500, { success: false, error: e.message || String(e) });
    }
  }),
);

// === Cleanup Analyzers ===

// RTDB find empty nodes
exports.admin_rtdb_analyze_empty = onRequest(async (req, res) =>
  corsHandler(req, res, async () => {
    try {
      if (req.method === "OPTIONS") return res.status(204).send("");
      if (req.method !== "GET") return sendJson(res, 405, { success: false, error: "Use GET" });

      await verifyIdTokenOrThrow(req);
      requireAdminHeader(req);

      const path = String(req.query.path || "/").trim();
      const limit = Math.min(Number(req.query.limit || 100), 1000);

      const ref = admin.database().ref(path);
      const snap = await ref.once("value");
      const data = snap.val() || {};

      const emptyNodes = [];
      for (const key of Object.keys(data)) {
        const val = data[key];
        const isEmpty =
          val === null ||
          val === undefined ||
          val === "" ||
          (typeof val === "object" && Object.keys(val).length === 0);
        if (isEmpty) {
          emptyNodes.push({ key, value: val });
          if (emptyNodes.length >= limit) break;
        }
      }

      return sendJson(res, 200, {
        success: true,
        path,
        emptyNodes,
        total: emptyNodes.length,
      });
    } catch (e) {
      console.error("[admin_rtdb_analyze_empty]", e);
      return sendJson(res, 500, { success: false, error: e.message || String(e) });
    }
  }),
);

// Firestore find empty docs
exports.admin_firestore_analyze_empty = onRequest(async (req, res) =>
  corsHandler(req, res, async () => {
    try {
      if (req.method === "OPTIONS") return res.status(204).send("");
      if (req.method !== "GET") return sendJson(res, 405, { success: false, error: "Use GET" });

      await verifyIdTokenOrThrow(req);
      requireAdminHeader(req);

      const path = String(req.query.path || "").trim();
      const limit = Math.min(Number(req.query.limit || 100), 500);

      if (!path) return sendJson(res, 400, { success: false, error: "path required" });

      const coll = admin.firestore().collection(path);
      const snap = await coll.limit(limit * 2).get();

      const emptyDocs = [];
      snap.forEach((d) => {
        const data = d.data() || {};
        if (Object.keys(data).length === 0) {
          emptyDocs.push({ id: d.id });
          if (emptyDocs.length >= limit) return;
        }
      });

      return sendJson(res, 200, {
        success: true,
        path,
        emptyDocs,
        total: emptyDocs.length,
      });
    } catch (e) {
      console.error("[admin_firestore_analyze_empty]", e);
      return sendJson(res, 500, { success: false, error: e.message || String(e) });
    }
  }),
);

// RTDB analyze node sizes
exports.admin_rtdb_analyze_size = onRequest(async (req, res) =>
  corsHandler(req, res, async () => {
    try {
      if (req.method === "OPTIONS") return res.status(204).send("");
      if (req.method !== "GET") return sendJson(res, 405, { success: false, error: "Use GET" });

      await verifyIdTokenOrThrow(req);
      requireAdminHeader(req);

      const path = String(req.query.path || "/").trim();
      const limit = Math.min(Number(req.query.limit || 100), 1000);

      const ref = admin.database().ref(path);
      const snap = await ref.once("value");
      const data = snap.val() || {};

      const sizes = [];
      for (const key of Object.keys(data)) {
        try {
          const size = JSON.stringify(data[key]).length;
          sizes.push({ key, size });
        } catch {
          sizes.push({ key, size: 0 });
        }
      }

      sizes.sort((a, b) => b.size - a.size);
      const topSizes = sizes.slice(0, limit);

      return sendJson(res, 200, {
        success: true,
        path,
        topSizes,
        totalNodes: sizes.length,
      });
    } catch (e) {
      console.error("[admin_rtdb_analyze_size]", e);
      return sendJson(res, 500, { success: false, error: e.message || String(e) });
    }
  }),
);

// === RTDB Bulk Delete ===

exports.admin_rtdb_bulk_delete = onRequest(async (req, res) =>
  corsHandler(req, res, async () => {
    try {
      if (req.method === "OPTIONS") return res.status(204).send("");
      if (req.method !== "POST") return sendJson(res, 405, { success: false, error: "Use POST" });

      await verifyIdTokenOrThrow(req);
      requireAdminHeader(req);

      const body = req.body || {};
      const path = String(body.path || "").trim();
      if (!path) return sendJson(res, 400, { success: false, error: "path required" });

      const dryRun = !!body.dryRun;
      const keyPattern = body.keyPattern || null;
      const exportBeforeDelete = body.exportBeforeDelete !== false;

      const ref = admin.database().ref(path);
      const snap = await ref.once("value");
      const data = snap.val() || {};
      const keys = Object.keys(data || {});

      let matchingKeys = keys;
      if (keyPattern) {
        const regex = new RegExp(keyPattern, "i");
        matchingKeys = keys.filter((k) => regex.test(k));
      }

      const total = matchingKeys.length;
      const previewKeys = matchingKeys.slice(0, 50);

      if (dryRun) {
        return sendJson(res, 200, {
          success: true,
          dryRun: true,
          total,
          previewKeys,
          warning: total > 1000 ? "Large delete detected. Use background operation mode." : null,
        });
      }

      let backupId = null;
      if (exportBeforeDelete && total > 0) {
        const backupData = {};
        matchingKeys.forEach((k) => {
          backupData[k] = data[k];
        });
        const backupRef = await admin.firestore().collection("admin_ops_backups").add({
          type: "rtdb_bulk_delete_backup",
          path,
          keyPattern: keyPattern || null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          createdBy: req.auth ? req.auth.uid : null,
          data: backupData,
        });
        backupId = backupRef.id;
      }

      // Perform deletes
      const updates = {};
      matchingKeys.forEach((k) => {
        updates[k] = null;
      });
      await ref.update(updates);

      return sendJson(res, 200, {
        success: true,
        total,
        deleted: total,
        backupId,
      });
    } catch (e) {
      console.error("[admin_rtdb_bulk_delete]", e);
      return sendJson(res, 500, { success: false, error: e.message || String(e) });
    }
  }),
);

// Firestore paginate with startAfter support
exports.admin_firestore_paginate = onRequest(async (req, res) =>
  corsHandler(req, res, async () => {
    try {
      if (req.method === "OPTIONS") return res.status(204).send("");
      if (req.method !== "GET") return sendJson(res, 405, { success: false, error: "Use GET" });

      await verifyIdTokenOrThrow(req);
      requireAdminHeader(req);

      const path = String(req.query.path || "").trim();
      if (!path) return sendJson(res, 400, { success: false, error: "path required" });
      const limit = Math.min(Number(req.query.limit || 100), 1000);
      const startAfter = req.query.startAfter || null;

      const coll = admin.firestore().collection(path);
      let q = coll.orderBy(admin.firestore.FieldPath.documentId());
      if (startAfter) q = q.startAfter(startAfter);
      q = q.limit(limit + 1);

      const snap = await q.get();
      const docs = [];
      snap.forEach((d) => docs.push({ id: d.id, preview: previewValue(d.data()) }));

      const hasMore = docs.length > limit;
      const items = docs.slice(0, limit);

      return sendJson(res, 200, { success: true, path, limit, startAfter, items, hasMore });
    } catch (e) {
      console.error("[admin_firestore_paginate]", e);
      return sendJson(res, 500, { success: false, error: e.message || String(e) });
    }
  }),
);

// ─── Write: set / overwrite a value at an RTDB path ─────────────────────────
exports.admin_rtdb_set = onRequest(async (req, res) =>
  corsHandler(req, res, async () => {
    try {
      if (req.method === "OPTIONS") return res.status(204).send("");
      if (req.method !== "POST") return sendJson(res, 405, { success: false, error: "Use POST" });

      await verifyIdTokenOrThrow(req);
      requireAdminHeader(req);

      const { path, value } = req.body || {};
      if (!path) return sendJson(res, 400, { success: false, error: "path required" });
      // value can be null (to delete), a primitive, or an object

      await admin.database().ref(path).set(value !== undefined ? value : null);

      return sendJson(res, 200, { success: true, path });
    } catch (e) {
      console.error("[admin_rtdb_set]", e);
      return sendJson(res, 500, { success: false, error: e.message || String(e) });
    }
  }),
);

// ─── Write: update (merge) child keys at an RTDB path ───────────────────────
exports.admin_rtdb_update = onRequest(async (req, res) =>
  corsHandler(req, res, async () => {
    try {
      if (req.method === "OPTIONS") return res.status(204).send("");
      if (req.method !== "POST") return sendJson(res, 405, { success: false, error: "Use POST" });

      await verifyIdTokenOrThrow(req);
      requireAdminHeader(req);

      const { path, value } = req.body || {};
      if (!path) return sendJson(res, 400, { success: false, error: "path required" });
      if (typeof value !== "object" || value === null)
        return sendJson(res, 400, { success: false, error: "value must be an object for update" });

      await admin.database().ref(path).update(value);

      return sendJson(res, 200, { success: true, path });
    } catch (e) {
      console.error("[admin_rtdb_update]", e);
      return sendJson(res, 500, { success: false, error: e.message || String(e) });
    }
  }),
);

// ─── Write: set / merge a Firestore document ────────────────────────────────
// path must be a full doc path: "collection/docId" or "col/doc/sub/doc2"
exports.admin_firestore_set = onRequest(async (req, res) =>
  corsHandler(req, res, async () => {
    try {
      if (req.method === "OPTIONS") return res.status(204).send("");
      if (req.method !== "POST") return sendJson(res, 405, { success: false, error: "Use POST" });

      await verifyIdTokenOrThrow(req);
      requireAdminHeader(req);

      const { path, data, merge = false } = req.body || {};
      if (!path) return sendJson(res, 400, { success: false, error: "path required" });
      if (typeof data !== "object" || data === null)
        return sendJson(res, 400, { success: false, error: "data must be an object" });

      await admin.firestore().doc(path).set(data, { merge: !!merge });

      return sendJson(res, 200, { success: true, path });
    } catch (e) {
      console.error("[admin_firestore_set]", e);
      return sendJson(res, 500, { success: false, error: e.message || String(e) });
    }
  }),
);

// ─── Write: delete a single RTDB path ───────────────────────────────────────
exports.admin_rtdb_node_delete = onRequest(async (req, res) =>
  corsHandler(req, res, async () => {
    try {
      if (req.method === "OPTIONS") return res.status(204).send("");
      if (req.method !== "POST") return sendJson(res, 405, { success: false, error: "Use POST" });

      await verifyIdTokenOrThrow(req);
      requireAdminHeader(req);

      const { path } = req.body || {};
      if (!path) return sendJson(res, 400, { success: false, error: "path required" });

      await admin.database().ref(path).remove();

      return sendJson(res, 200, { success: true, path });
    } catch (e) {
      console.error("[admin_rtdb_node_delete]", e);
      return sendJson(res, 500, { success: false, error: e.message || String(e) });
    }
  }),
);

// ─── Write: delete a single Firestore document ──────────────────────────────
exports.admin_firestore_doc_delete = onRequest(async (req, res) =>
  corsHandler(req, res, async () => {
    try {
      if (req.method === "OPTIONS") return res.status(204).send("");
      if (req.method !== "POST") return sendJson(res, 405, { success: false, error: "Use POST" });

      await verifyIdTokenOrThrow(req);
      requireAdminHeader(req);

      const { path } = req.body || {};
      if (!path) return sendJson(res, 400, { success: false, error: "path required" });

      await admin.firestore().doc(path).delete();

      return sendJson(res, 200, { success: true, path });
    } catch (e) {
      console.error("[admin_firestore_doc_delete]", e);
      return sendJson(res, 500, { success: false, error: e.message || String(e) });
    }
  }),
);

// ─── Read: get full value of a single RTDB path ─────────────────────────────
exports.admin_rtdb_get = onRequest(async (req, res) =>
  corsHandler(req, res, async () => {
    try {
      if (req.method === "OPTIONS") return res.status(204).send("");
      if (req.method !== "GET") return sendJson(res, 405, { success: false, error: "Use GET" });

      await verifyIdTokenOrThrow(req);
      requireAdminHeader(req);

      const path = String(req.query.path || "").trim();
      if (!path) return sendJson(res, 400, { success: false, error: "path required" });

      const snap = await admin.database().ref(path).once("value");
      return sendJson(res, 200, { success: true, path, value: snap.val() });
    } catch (e) {
      console.error("[admin_rtdb_get]", e);
      return sendJson(res, 500, { success: false, error: e.message || String(e) });
    }
  }),
);

// ─── Read: get full data of a single Firestore document ─────────────────────
exports.admin_firestore_get = onRequest(async (req, res) =>
  corsHandler(req, res, async () => {
    try {
      if (req.method === "OPTIONS") return res.status(204).send("");
      if (req.method !== "GET") return sendJson(res, 405, { success: false, error: "Use GET" });

      await verifyIdTokenOrThrow(req);
      requireAdminHeader(req);

      const path = String(req.query.path || "").trim();
      if (!path) return sendJson(res, 400, { success: false, error: "path required" });

      const snap = await admin.firestore().doc(path).get();
      if (!snap.exists) return sendJson(res, 404, { success: false, error: "Document not found" });
      return sendJson(res, 200, { success: true, path, data: snap.data() });
    } catch (e) {
      console.error("[admin_firestore_get]", e);
      return sendJson(res, 500, { success: false, error: e.message || String(e) });
    }
  }),
);


