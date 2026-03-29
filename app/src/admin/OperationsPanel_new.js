import React, { useEffect, useState } from "react";
import { adminFetch } from "./api";

const C = {
  blue:   "#6366f1",
  red:    "#ef4444",
  green:  "#10b981",
  bg:     "#ffffff",
  surface:"#f8fafc",
  border: "#e2e8f0",
  text:   "#111827",
  muted:  "#6b7280",
  mono:   "'JetBrains Mono', 'Fira Code', monospace",
};

function Card({ children, style }) {
  return <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,.07)", overflow: "hidden", ...style }}>{children}</div>;
}

function CardHeader({ title, subtitle }) {
  return (
    <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, background: C.surface }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{title}</div>
      {subtitle && <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{subtitle}</div>}
    </div>
  );
}

function Btn({ onClick, disabled, variant = "default", style, children }) {
  const base = {
    border: "none", borderRadius: 7, padding: "9px 18px", fontSize: 13,
    fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1, transition: "opacity .15s", ...style,
  };
  const variants = {
    default: { background: C.blue,  color: "#fff" },
    danger:  { background: C.red,   color: "#fff" },
    ghost:   { background: "#f1f5f9", color: C.text, border: `1px solid ${C.border}` },
  };
  return <button style={{ ...base, ...variants[variant] }} onClick={onClick} disabled={disabled}>{children}</button>;
}

function FInput({ value, onChange, placeholder, style }) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{
        width: "100%", padding: "8px 12px", fontSize: 13, border: `1px solid ${C.border}`,
        borderRadius: 7, fontFamily: C.mono, outline: "none", boxSizing: "border-box", ...style,
      }}
    />
  );
}

function StepBadge({ n, active, done }) {
  return (
    <div style={{
      width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center",
      justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0,
      background: done ? C.green : active ? C.blue : "#e2e8f0",
      color: done || active ? "#fff" : C.muted,
    }}>{done ? "✓" : n}</div>
  );
}

function StatusBadge({ status }) {
  const map = {
    pending:    { bg: "#fef9c3", text: "#92400e" },
    running:    { bg: "#eff6ff", text: "#1d4ed8" },
    completed:  { bg: "#f0fdf4", text: "#15803d" },
    failed:     { bg: "#fef2f2", text: "#b91c1c" },
    rolled_back:{ bg: "#f5f3ff", text: "#7c3aed" },
  };
  const c = map[status] || map.pending;
  return (
    <span style={{
      background: c.bg, color: c.text, border: `1px solid ${c.text}22`,
      borderRadius: 12, padding: "2px 10px", fontSize: 11, fontWeight: 600,
    }}>{status}</span>
  );
}

export default function BulkDelete() {
  const [source,     setSource]     = useState("rtdb");
  const [path,       setPath]       = useState("");
  const [keyPattern, setKeyPattern] = useState("");
  const [field,      setField]      = useState("");
  const [op,         setOp]         = useState("==");
  const [value,      setValue]      = useState("");
  const [step,       setStep]       = useState(1);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");
  const [dryResult,  setDryResult]  = useState(null);
  const [queuedId,   setQueuedId]   = useState(null);
  const [execResult, setExecResult] = useState(null);
  const [ops,        setOps]        = useState([]);
  const [opsLoading, setOpsLoading] = useState(false);
  const [rollbackId, setRollbackId] = useState("");
  const [rollbackMsg,setRollbackMsg]= useState("");
  const [showQueue,  setShowQueue]  = useState(false);

  useEffect(() => { if (showQueue) loadOps(); }, [showQueue]); // eslint-disable-line

  function reset() { setStep(1); setDryResult(null); setQueuedId(null); setExecResult(null); setError(""); }

  function parseVal(v) { try { return JSON.parse(v); } catch(e) { return v; } }

  async function runDryRun() {
    if (!path) return;
    setError(""); setLoading(true);
    try {
      let out;
      if (source === "rtdb") {
        out = await adminFetch("admin_rtdb_bulk_delete", { method: "POST", body: { path, keyPattern: keyPattern || undefined, dryRun: true } });
      } else {
        const w = field ? [{ field, op, value: parseVal(value) }] : undefined;
        out = await adminFetch("admin_firestore_bulk_delete", { method: "POST", body: { path, where: w, dryRun: true } });
      }
      setDryResult(out); setStep(2);
    } catch (e) { setError(String(e.message || e)); }
    finally { setLoading(false); }
  }

  async function queueDelete() {
    if (!path) return;
    setError(""); setLoading(true);
    try {
      const w = source === "firestore" && field ? [{ field, op, value: parseVal(value) }] : undefined;
      const out = await adminFetch("admin_ops_create", { method: "POST", body: {
        type: source === "rtdb" ? "rtdb_bulk_delete" : "firestore_bulk_delete",
        params: { path, keyPattern: source === "rtdb" ? (keyPattern || undefined) : undefined, where: w },
      }});
      setQueuedId(out.id); setStep(3);
    } catch (e) { setError(String(e.message || e)); }
    finally { setLoading(false); }
  }

  async function executeNow() {
    if (!queuedId) return;
    setError(""); setLoading(true);
    try { const out = await adminFetch("admin_ops_run", { method: "POST", body: { id: queuedId } }); setExecResult(out); }
    catch (e) { setError(String(e.message || e)); }
    finally { setLoading(false); }
  }

  async function loadOps() {
    setOpsLoading(true);
    try { const out = await adminFetch("admin_ops_list?limit=50"); setOps(out.ops || []); }
    catch(e) { /* ignore */ } finally { setOpsLoading(false); }
  }

  async function runById(id) {
    setError(""); setLoading(true);
    try { await adminFetch("admin_ops_run", { method: "POST", body: { id } }); await loadOps(); }
    catch (e) { setError(String(e.message || e)); } finally { setLoading(false); }
  }

  async function doRollback() {
    if (!rollbackId) return;
    setError(""); setRollbackMsg(""); setLoading(true);
    try {
      await adminFetch("admin_ops_rollback", { method: "POST", body: { backupId: rollbackId } });
      setRollbackMsg("✓ Rollback completed."); setRollbackId(""); await loadOps();
    } catch (e) { setError(String(e.message || e)); }
    finally { setLoading(false); }
  }

  const previewIds = dryResult ? (dryResult.previewDocs?.map(d => d.id) || dryResult.previewKeys || []) : [];

  return (
    <div style={{ display: "grid", gap: 16 }}>

      {/* Step progress */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
        {[{ n: 1, label: "Configure" }, { n: 2, label: "Preview" }, { n: 3, label: "Execute" }].map((s, i) => (
          <React.Fragment key={s.n}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <StepBadge n={s.n} active={step === s.n} done={step > s.n} />
              <span style={{ fontSize: 13, fontWeight: step === s.n ? 700 : 400, color: step >= s.n ? C.text : C.muted }}>{s.label}</span>
            </div>
            {i < 2 && <div style={{ flex: 1, height: 1, background: step > s.n ? C.green : C.border, maxWidth: 60 }} />}
          </React.Fragment>
        ))}
      </div>

      {/* Step 1: Configure */}
      {step === 1 && (
        <Card>
          <CardHeader title="Configure Delete Target" subtitle="Define what to delete. A dry-run is always run first." />
          <div style={{ padding: 20, display: "grid", gap: 14 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 }}>Database</div>
              <div style={{ display: "inline-flex", borderRadius: 8, overflow: "hidden", border: `1px solid ${C.border}` }}>
                {["rtdb", "firestore"].map(s => (
                  <button key={s} onClick={() => setSource(s)} style={{
                    padding: "8px 18px", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer",
                    background: source === s ? C.blue : "#f8fafc", color: source === s ? "#fff" : C.muted,
                  }}>{s === "rtdb" ? "Realtime DB" : "Firestore"}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 }}>
                {source === "rtdb" ? "RTDB Path" : "Collection Path"}
              </div>
              <FInput value={path} onChange={setPath} placeholder={source === "rtdb" ? "/orders/2024" : "orders"} />
            </div>
            {source === "rtdb" ? (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 }}>
                  Key Pattern <span style={{ fontWeight: 400, textTransform: "none" }}>(regex — leave blank for all children)</span>
                </div>
                <FInput value={keyPattern} onChange={setKeyPattern} placeholder="^old_.* or leave blank" />
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 }}>
                  Where <span style={{ fontWeight: 400, textTransform: "none" }}>(optional filter)</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 1fr", gap: 8 }}>
                  <FInput value={field} onChange={setField} placeholder="field" />
                  <select value={op} onChange={e => setOp(e.target.value)}
                    style={{ padding: "8px 10px", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 7, background: "#fff" }}>
                    {["==","!=","<","<=",">",">="].map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <FInput value={value} onChange={setValue} placeholder="value (text or JSON)" />
                </div>
              </div>
            )}
            {error && <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 7, padding: "10px 14px", color: "#b91c1c", fontSize: 13 }}>⚠ {error}</div>}
            <div>
              <Btn onClick={runDryRun} disabled={loading || !path}>{loading ? "Running dry-run…" : "🔍 Dry-run Preview →"}</Btn>
            </div>
          </div>
        </Card>
      )}

      {/* Step 2: Dry run preview */}
      {step === 2 && dryResult && (
        <Card>
          <CardHeader title="Dry-run Results" subtitle="No data has been changed. Review and confirm." />
          <div style={{ padding: 20, display: "grid", gap: 16 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 16,
              background: dryResult.total > 500 ? "#fff7ed" : "#f0fdf4",
              border: `1px solid ${dryResult.total > 500 ? "#fdba74" : "#86efac"}`,
              borderRadius: 8, padding: "14px 18px",
            }}>
              <div style={{ fontSize: 40, fontWeight: 800, color: dryResult.total > 0 ? C.red : C.green }}>{dryResult.total ?? 0}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>records will be deleted</div>
                <div style={{ fontSize: 12, color: C.muted }}>from <span style={{ fontFamily: C.mono, color: C.blue }}>{path}</span></div>
              </div>
            </div>
            {dryResult.warning && (
              <div style={{ background: "#fff7ed", border: "1px solid #fdba74", borderRadius: 7, padding: "10px 14px", color: "#92400e", fontSize: 13 }}>⚠ {dryResult.warning}</div>
            )}
            {previewIds.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.4 }}>Sample IDs</div>
                <div style={{ background: "#1e293b", borderRadius: 7, padding: 14, fontFamily: C.mono, fontSize: 12, color: "#94a3b8", maxHeight: 180, overflow: "auto" }}>
                  {previewIds.map(id => <div key={id} style={{ padding: "1px 0" }}>{id}</div>)}
                  {dryResult.total > previewIds.length && <div style={{ color: "#64748b", marginTop: 6 }}>…and {dryResult.total - previewIds.length} more</div>}
                </div>
              </div>
            )}
            {error && <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 7, padding: "10px 14px", color: "#b91c1c", fontSize: 13 }}>⚠ {error}</div>}
            <div style={{ display: "flex", gap: 10 }}>
              <Btn variant="ghost" onClick={reset}>← Back</Btn>
              {dryResult.total > 0 && (
                <Btn variant="danger" onClick={queueDelete} disabled={loading}>
                  {loading ? "Queuing…" : `Queue delete of ${dryResult.total} records →`}
                </Btn>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Step 3: Execute */}
      {step === 3 && (
        <Card>
          <CardHeader title="Execute Delete" subtitle="Job is queued. Click Execute to run it now." />
          <div style={{ padding: 20, display: "grid", gap: 16 }}>
            {queuedId && !execResult && (
              <div style={{ display: "flex", alignItems: "center", gap: 16, background: "#fff7ed", border: "1px solid #fdba74", borderRadius: 8, padding: "14px 18px" }}>
                <div style={{ fontSize: 24 }}>⚠️</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#92400e" }}>About to permanently delete {dryResult?.total ?? "?"} records</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                    A backup will be saved for rollback. Job: <span style={{ fontFamily: C.mono }}>{queuedId}</span>
                  </div>
                </div>
              </div>
            )}
            {execResult && (
              <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "14px 18px" }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#15803d" }}>✓ Delete completed</div>
                {execResult.backupId && (
                  <div style={{ marginTop: 6, fontSize: 12 }}>Backup ID for rollback: <strong style={{ fontFamily: C.mono }}>{execResult.backupId}</strong></div>
                )}
              </div>
            )}
            {error && <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 7, padding: "10px 14px", color: "#b91c1c", fontSize: 13 }}>⚠ {error}</div>}
            <div style={{ display: "flex", gap: 10 }}>
              <Btn variant="ghost" onClick={reset}>↩ Start Over</Btn>
              {!execResult && queuedId && (
                <Btn variant="danger" onClick={executeNow} disabled={loading}>
                  {loading ? "Executing…" : "🗑 Execute Delete Now"}
                </Btn>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Rollback */}
      <Card>
        <div style={{ padding: "12px 20px", background: C.surface, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: C.text }}>↩ Rollback a Backup</span>
          <span style={{ fontSize: 12, color: C.muted }}>Restore data from a previous delete</span>
        </div>
        <div style={{ padding: 16, display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.3 }}>Backup ID</div>
            <FInput value={rollbackId} onChange={setRollbackId} placeholder="backup_xxxx…" />
          </div>
          <Btn variant="ghost" onClick={doRollback} disabled={loading || !rollbackId}>
            {loading ? "Rolling back…" : "↩ Rollback"}
          </Btn>
        </div>
        {rollbackMsg && <div style={{ padding: "0 16px 12px", fontSize: 13, color: "#15803d", fontWeight: 600 }}>{rollbackMsg}</div>}
      </Card>

      {/* Queue log toggle */}
      <div>
        <button
          onClick={() => setShowQueue(v => !v)}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: C.blue, padding: 0, display: "flex", alignItems: "center", gap: 6 }}
        >{showQueue ? "▾" : "▸"} Operation Queue Log {ops.length > 0 ? `(${ops.length})` : ""}</button>

        {showQueue && (
          <Card style={{ marginTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderBottom: `1px solid ${C.border}`, background: C.surface }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Recent Operations</span>
              <Btn variant="ghost" onClick={loadOps} disabled={opsLoading} style={{ fontSize: 12, padding: "4px 12px" }}>
                {opsLoading ? "…" : "↻ Refresh"}
              </Btn>
            </div>
            {ops.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: C.muted }}>No operations yet</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: C.surface }}>
                      {["ID", "Type", "Status", "Created", "Result", ""].map(h => (
                        <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.4, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ops.map(item => (
                      <tr key={item.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: "8px 14px", fontFamily: C.mono, fontSize: 11, color: C.muted }}>{(item.id || "").substring(0, 10)}…</td>
                        <td style={{ padding: "8px 14px", fontSize: 12 }}>{item.type}</td>
                        <td style={{ padding: "8px 14px" }}><StatusBadge status={item.status} /></td>
                        <td style={{ padding: "8px 14px", fontSize: 11, color: C.muted }}>{item.createdAt ? new Date(item.createdAt).toLocaleString() : "–"}</td>
                        <td style={{ padding: "8px 14px", fontSize: 11, color: C.muted, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.error || (item.result ? JSON.stringify(item.result) : "–")}
                        </td>
                        <td style={{ padding: "8px 14px" }}>
                          {item.status === "pending" && (
                            <Btn variant="ghost" onClick={() => runById(item.id)} disabled={loading} style={{ fontSize: 11, padding: "4px 10px" }}>▶ Run</Btn>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
