import React, { useMemo, useState } from "react";
import { adminFetch } from "./api";

export default function OperationsPanel() {
  const [source, setSource] = useState("firestore");
  const [collectionPath, setCollectionPath] = useState("");
  const [field, setField] = useState("");
  const [op, setOp] = useState("==");
  const [value, setValue] = useState("");
  const [keyPattern, setKeyPattern] = useState("");
  const [dryRunResult, setDryRunResult] = useState(null);
  const [ops, setOps] = useState([]);
  const [rollbackId, setRollbackId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const parsedValue = useMemo(() => {
    if (value === "") return "";
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }, [value]);

  const where = useMemo(() => {
    if (!field) return null;
    return { field, op, value: parsedValue };
  }, [field, op, parsedValue]);

  async function runDryPreview() {
    setError("");
    setLoading(true);
    try {
      let out;
      if (source === "rtdb") {
        out = await adminFetch("admin_rtdb_bulk_delete", {
          method: "POST",
          body: {
            path: collectionPath,
            keyPattern: keyPattern || null,
            dryRun: true,
          },
        });
      } else {
        out = await adminFetch("admin_firestore_bulk_delete", {
          method: "POST",
          body: {
            path: collectionPath,
            where,
            dryRun: true,
            previewLimit: 50,
          },
        });
      }
      setDryRunResult(out);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function queueDelete() {
    setError("");
    setLoading(true);
    try {
      const opType = source === "rtdb" ? "rtdb_bulk_delete" : "firestore_bulk_delete";
      const params =
        source === "rtdb"
          ? {
              path: collectionPath,
              keyPattern: keyPattern || null,
              exportBeforeDelete: true,
            }
          : {
              path: collectionPath,
              where,
              exportBeforeDelete: true,
              previewLimit: 50,
            };

      await adminFetch("admin_ops_create", {
        method: "POST",
        body: {
          type: opType,
          dryRun: false,
          params,
          requiresConfirmation: true,
        },
      });
      await refreshOps();
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function refreshOps() {
    setError("");
    setLoading(true);
    try {
      const out = await adminFetch("admin_ops_list?limit=100");
      setOps(out.ops || []);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function runNext() {
    setError("");
    setLoading(true);
    try {
      await adminFetch("admin_ops_run_next", { method: "POST", body: {} });
      await refreshOps();
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function runById(id) {
    if (!id) return;
    setError("");
    setLoading(true);
    try {
      await adminFetch("admin_ops_run", { method: "POST", body: { id } });
      await refreshOps();
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function rollback() {
    setError("");
    setLoading(true);
    try {
      await adminFetch("admin_ops_rollback", { method: "POST", body: { backupId: rollbackId } });
      setRollbackId("");
      await refreshOps();
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ border: "1px solid #eee", padding: 12 }}>
      <h3>Operations Queue</h3>

      <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="rtdb">Realtime DB</option>
            <option value="firestore">Firestore</option>
          </select>
          <input
            placeholder={source === "rtdb" ? "RTDB path (e.g. /orders)" : "Collection path (e.g. orders)"}
            value={collectionPath}
            onChange={(e) => setCollectionPath(e.target.value)}
            style={{ flex: 1 }}
          />
        </div>
        {source === "rtdb" ? (
          <input
            placeholder="Key pattern (regex, optional)"
            value={keyPattern}
            onChange={(e) => setKeyPattern(e.target.value)}
          />
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <input
              placeholder="where field"
              value={field}
              onChange={(e) => setField(e.target.value)}
            />
            <select value={op} onChange={(e) => setOp(e.target.value)}>
              <option value="==">==</option>
              <option value="<">&lt;</option>
              <option value="<=">&lt;=</option>
              <option value=">">&gt;</option>
              <option value=">=">&gt;=</option>
            </select>
            <input
              placeholder="where value (JSON or text)"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={runDryPreview} disabled={loading || !collectionPath}>Dry run preview</button>
          <button onClick={queueDelete} disabled={loading || !collectionPath}>Queue delete op</button>
          <button onClick={runNext} disabled={loading}>Run next pending</button>
          <button onClick={refreshOps} disabled={loading}>Refresh logs</button>
        </div>
      </div>

      {dryRunResult ? (
        <div style={{ background: "#fafafa", padding: 8, marginBottom: 10 }}>
          <div><strong>Dry run total:</strong> {dryRunResult.total || 0}</div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            {dryRunResult.previewDocs
              ? `Preview IDs: ${(dryRunResult.previewDocs || []).map((d) => d.id).join(", ") || "(none)"}`
              : dryRunResult.previewKeys
              ? `Preview Keys: ${(dryRunResult.previewKeys || []).join(", ") || "(none)"}`
              : ""}
          </div>
          {dryRunResult.warning ? <div style={{ color: "#b45309", marginTop: 4 }}>{dryRunResult.warning}</div> : null}
        </div>
      ) : null}

      <div style={{ marginBottom: 10, display: "flex", gap: 8 }}>
        <input
          placeholder="backupId for rollback"
          value={rollbackId}
          onChange={(e) => setRollbackId(e.target.value)}
        />
        <button onClick={rollback} disabled={loading || !rollbackId}>Rollback backup</button>
      </div>

      {error ? <div style={{ color: "#b91c1c", marginBottom: 8 }}>{error}</div> : null}

      <div style={{ maxHeight: 280, overflow: "auto", border: "1px solid #f5f5f5" }}>
        {(ops || []).length === 0 ? (
          <div style={{ opacity: 0.7, padding: 8 }}>No operations loaded</div>
        ) : (
          <table width="100%" cellPadding={6} style={{ borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                <th>ID</th>
                <th>Type</th>
                <th>Status</th>
                <th>Created</th>
                <th>Result</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {ops.map((item) => (
                <tr key={item.id} style={{ borderBottom: "1px solid #f8f8f8" }}>
                  <td>{item.id}</td>
                  <td>{item.type}</td>
                  <td>{item.status}</td>
                  <td>{item.createdAt || "-"}</td>
                  <td style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.error || (item.result ? JSON.stringify(item.result) : "-")}
                  </td>
                  <td>
                    <button onClick={() => runById(item.id)} disabled={loading || item.status === "running"}>
                      Run
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
