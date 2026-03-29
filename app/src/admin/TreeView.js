import React, { useMemo, useState, useEffect } from "react";
import { adminFetch } from "./api";

const C = {
  blue: "#6366f1", red: "#ef4444", green: "#10b981", yellow: "#d97706",
  bg: "#ffffff", surface: "#f8fafc", border: "#e2e8f0", text: "#111827",
  muted: "#6b7280", mono: "'JetBrains Mono', 'Fira Code', monospace",
};

function Card({ children, style }) {
  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,.07)", overflow: "hidden", ...style }}>
      {children}
    </div>
  );
}
function Btn({ onClick, variant = "default", children, style, disabled }) {
  const base = { border: "none", borderRadius: 7, padding: "7px 12px", fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? .5 : 1, ...style };
  const v = {
    default: { background: C.blue, color: "#fff" }, ghost: { background: "#f8fafc", color: C.text, border: `1px solid ${C.border}` }, danger: { background: C.red, color: "#fff" }
  };
  return <button style={{ ...base, ...(v[variant] || v.default) }} onClick={onClick} disabled={disabled}>{children}</button>;
}

function JsonTextarea({ value, onChange, rows = 10 }) {
  const [err, setErr] = useState("");
  function handle(v) {
    onChange(v);
    if (!v.trim()) { setErr(""); return; }
    try { JSON.parse(v); setErr(""); } catch (e) { setErr(e.message); }
  }
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <textarea value={value} onChange={e => handle(e.target.value)} rows={rows} spellCheck={false}
        style={{ width: "100%", padding: 12, fontFamily: C.mono, borderRadius: 8, border: `1px solid ${err ? C.red : C.border}`, background: "#0f172a", color: "#e2e8f0" }} />
      {err && <div style={{ color: C.red, fontFamily: C.mono }}>{err}</div>}
    </div>
  );
}

// Fields helpers
const TYPES = ["string", "number", "boolean", "null"];
function toFields(rawJson) {
  try {
    const obj = JSON.parse(rawJson);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
    return Object.entries(obj).map(([k, v]) => {
      if (v === null) return { key: k, type: "null", rawVal: "" };
      if (typeof v === "boolean") return { key: k, type: "boolean", rawVal: v ? "true" : "false" };
      if (typeof v === "number") return { key: k, type: "number", rawVal: String(v) };
      if (typeof v === "object") return { key: k, type: "string", rawVal: JSON.stringify(v) };
      return { key: k, type: "string", rawVal: String(v) };
    });
  } catch { return null; }
}
function fromFields(fields) {
  const obj = {};
  for (const f of fields) {
    if (!f.key.trim()) continue;
    if (f.type === "null") obj[f.key] = null;
    else if (f.type === "boolean") obj[f.key] = f.rawVal === "true";
    else if (f.type === "number") obj[f.key] = Number(f.rawVal);
    else {
      // try parse JSON values that look like objects/arrays
      const v = f.rawVal;
      try { if ((v || "").trim().startsWith("{") || (v || "").trim().startsWith("[")) obj[f.key] = JSON.parse(v); else obj[f.key] = v; }
      catch { obj[f.key] = v; }
    }
  }
  return JSON.stringify(obj, null, 2);
}

function FieldsEditor({ rawJson, onChange }) {
  const fields = useMemo(() => toFields(rawJson), [rawJson]);
  const [modalIdx, setModalIdx] = useState(null);
  const [modalVal, setModalVal] = useState("");

  if (fields === null) {
    return (
      <div style={{ padding: 16, borderRadius: 8, background: "#fff7ed", border: `1px solid #fcd34d`, color: "#92400e" }}>
        ⚠ Not an object — switch to JSON mode or reset to an empty object.
        <div style={{ marginTop: 8 }}><Btn variant="ghost" onClick={() => onChange("{}")}>Start empty {"{}"}</Btn></div>
      </div>
    );
  }

  function emitChange(next) { onChange(fromFields(next)); }
  function setKey(i, key) { const n = fields.map((f, idx) => idx === i ? { ...f, key } : f); emitChange(n); }
  function setType(i, type) { const f = fields[i]; const raw = type === "null" ? "" : type === "boolean" ? "true" : f.rawVal; const n = fields.map((f2, idx) => idx === i ? { ...f2, type, rawVal: raw } : f2); emitChange(n); }
  function setVal(i, val) { const n = fields.map((f2, idx) => idx === i ? { ...f2, rawVal: val } : f2); emitChange(n); }
  function addField() { let n = 1; while (fields.some(f => f.key === "field" + n)) n++; emitChange([...fields, { key: "field" + n, type: "string", rawVal: "" }]); }
  function removeField(i) { emitChange(fields.filter((_, idx) => idx !== i)); }

  function openModal(i) {
    const f = fields[i];
    let seed = f.rawVal || "";
    try { if (seed && (seed.trim().startsWith("{") || seed.trim().startsWith("["))) seed = JSON.stringify(JSON.parse(seed), null, 2); } catch {}
    setModalIdx(i); setModalVal(seed);
  }
  function saveModal() { if (modalIdx === null) return; setVal(modalIdx, modalVal); setModalIdx(null); setModalVal(""); }

  return (
    <div style={{ display: "grid", gap: 0 }}>
      <div style={{ display: "grid", gridTemplateColumns: "36px 1fr 120px 1fr 36px", padding: 8, background: C.surface, borderRadius: 6 }}>
        <div /> <div style={{ fontWeight: 700, color: C.muted }}>Field</div> <div style={{ fontWeight: 700, color: C.muted }}>Type</div> <div style={{ fontWeight: 700, color: C.muted }}>Value</div> <div />
      </div>

      {fields.map((f, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "36px 1fr 120px 1fr 36px", gap: 8, alignItems: "center", padding: "8px 8px", background: i % 2 === 0 ? "#fff" : "#fbfbfb", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ textAlign: "center", color: "#94a3b8", fontFamily: C.mono }}>{i + 1}</div>

          <div>
            <input value={f.key} onChange={e => setKey(i, e.target.value)} style={{ width: "100%", padding: 8, border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: C.mono }} />
          </div>

          <div>
            <select value={f.type} onChange={e => setType(i, e.target.value)} style={{ width: "100%", padding: 8, border: `1px solid ${C.border}`, borderRadius: 6, fontFamily: C.mono }}>
              {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {f.type === "null" ? (
              <div style={{ color: C.muted, fontFamily: C.mono }}>null</div>
            ) : f.type === "boolean" ? (
              <select value={f.rawVal} onChange={e => setVal(i, e.target.value)} style={{ padding: 8, border: `1px solid ${C.border}`, borderRadius: 6 }}>
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            ) : f.type === "number" ? (
              <input type="number" value={f.rawVal} onChange={e => setVal(i, e.target.value)} style={{ padding: 8, border: `1px solid ${C.border}`, borderRadius: 6, width: "100%" }} />
            ) : (
              <>
                <input value={f.rawVal} onChange={e => setVal(i, e.target.value)} placeholder="value…" style={{ padding: 8, border: `1px solid ${C.border}`, borderRadius: 6, width: "100%", fontFamily: C.mono }} />
                <button title="Open JSON editor" onClick={() => openModal(i)} style={{ marginLeft: 6, padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 6, background: "#f8fafc" }}>⤢</button>
              </>
            )}
          </div>

          <div style={{ textAlign: "center" }}><button onClick={() => removeField(i)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "#94a3b8" }}>✕</button></div>
        </div>
      ))}

      <div style={{ padding: 10, background: C.surface }}>
        <Btn variant="ghost" onClick={addField}>+ Add field</Btn>
      </div>

      {modalIdx !== null && (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(2,6,23,0.6)", zIndex: 9999 }}>
          <div style={{ width: 800, maxWidth: "96%", background: C.bg, borderRadius: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: 12, borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontWeight: 800 }}>Edit JSON value</div>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn variant="ghost" onClick={() => { setModalIdx(null); setModalVal(""); }}>Cancel</Btn>
                <Btn onClick={saveModal}>Save</Btn>
              </div>
            </div>
            <div style={{ padding: 12 }}>
              <JsonTextarea value={modalVal} onChange={setModalVal} rows={12} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Simple Explorer with canvas-first editor
export default function Explorer() {
  const [source, setSource] = useState("rtdb");
  const [path, setPath] = useState("/");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const [canvasMode, setCanvasMode] = useState(null); // "edit" | "create"
  const [editorKey, setEditorKey] = useState("");
  const [editorJson, setEditorJson] = useState("{}");
  const [editorMode, setEditorMode] = useState("fields");
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorErr, setEditorErr] = useState("");

  async function browse() {
    setLoading(true); setItems([]);
    try {
      const out = source === "rtdb"
        ? await adminFetch(`admin_rtdb_preview?path=${encodeURIComponent(path)}&limit=100`)
        : await adminFetch(`admin_firestore_preview?path=${encodeURIComponent(path)}&limit=100`);
      setItems(out.items || []);
    } catch (e) {
      console.error(e); alert(String(e));
    } finally { setLoading(false); }
  }

  async function openEdit(key) {
    setCanvasMode("edit"); setEditorKey(key); setEditorLoading(true); setEditorErr("");
    try {
      const fp = source === "rtdb" ? `${path.replace(/\/$/, "")}/${key}` : `${path.replace(/\/$/, "")}/${key}`;
      const out = source === "rtdb"
        ? await adminFetch(`admin_rtdb_get?path=${encodeURIComponent(fp)}`)
        : await adminFetch(`admin_firestore_get?path=${encodeURIComponent(fp)}`);
      const v = out.value ?? out.data ?? null;
      if (source === "rtdb") {
        if (v === null) { setEditorJson("null"); setEditorMode("json"); }
        else if (typeof v === "object") { setEditorJson(JSON.stringify(v, null, 2)); setEditorMode("fields"); }
        else if (typeof v === "string") {
          try { const p = JSON.parse(v); if (p && typeof p === "object") { setEditorJson(JSON.stringify(p, null, 2)); setEditorMode("fields"); } else { setEditorJson(v); setEditorMode("json"); } }
          catch { setEditorJson(v); setEditorMode("json"); }
        } else { setEditorJson(JSON.stringify(v, null, 2)); setEditorMode("json"); }
      } else {
        setEditorJson(JSON.stringify(v ?? {}, null, 2)); setEditorMode("fields");
      }
    } catch (e) { setEditorErr(String(e)); }
    finally { setEditorLoading(false); }
  }

  async function saveEdit() {
    setEditorLoading(true); setEditorErr("");
    try {
      const fp = `${path.replace(/\/$/, "")}/${editorKey}`;
      const payload = editorMode === "fields" ? JSON.parse(editorJson) : (() => { try { return JSON.parse(editorJson); } catch { return editorJson; } })();
      if (source === "rtdb") await adminFetch("admin_rtdb_set", { method: "POST", body: { path: fp, value: payload } });
      else await adminFetch("admin_firestore_set", { method: "POST", body: { path: fp, data: payload, merge: false } });
      setCanvasMode(null); await browse();
    } catch (e) { setEditorErr(String(e)); }
    finally { setEditorLoading(false); }
  }

  function openCreate() { setCanvasMode("create"); setEditorKey(""); setEditorJson("{}"); setEditorMode("fields"); }
  async function saveCreate() {
    setEditorLoading(true); setEditorErr("");
    try {
      const payload = editorMode === "fields" ? JSON.parse(editorJson) : JSON.parse(editorJson);
      const fp = `${path.replace(/\/$/, "")}/${editorKey || ""}`;
      if (source === "rtdb") {
        if (!editorKey.trim()) { setEditorErr("Key required"); setEditorLoading(false); return; }
        await adminFetch("admin_rtdb_set", { method: "POST", body: { path: fp, value: payload } });
      } else {
        await adminFetch("admin_firestore_set", { method: "POST", body: { path: fp || path.replace(/\/$/, ""), data: payload, merge: false } });
      }
      setCanvasMode(null); await browse();
    } catch (e) { setEditorErr(String(e)); }
    finally { setEditorLoading(false); }
  }

  useEffect(() => { /* initial load */ }, []);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Card style={{ padding: 12 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <select value={source} onChange={e => setSource(e.target.value)} style={{ padding: 8 }}>
            <option value="rtdb">Realtime DB</option>
            <option value="firestore">Firestore</option>
          </select>
          <input value={path} onChange={e => setPath(e.target.value)} placeholder={source === "rtdb" ? "/path" : "collection"} style={{ flex: 1, padding: 8, fontFamily: C.mono }} />
          <Btn onClick={browse} disabled={loading}>{loading ? "Browse…" : "Browse →"}</Btn>
          <Btn variant="success" onClick={openCreate}>+ New</Btn>
        </div>
      </Card>

      {canvasMode && (
        <Card>
          <div style={{ padding: 12, borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 800 }}>{canvasMode === "create" ? "Create" : `Edit: ${editorKey}`}</div>
            <div style={{ display: "flex", gap: 8 }}>
              {source === "rtdb" && (
                <div style={{ display: "inline-flex", border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
                  <button onClick={() => setEditorMode("fields")} style={{ padding: "6px 10px", background: editorMode === "fields" ? C.blue : "#f8fafc", color: editorMode === "fields" ? "#fff" : C.muted }}>⊞ Fields</button>
                  <button onClick={() => setEditorMode("json")} style={{ padding: "6px 10px", background: editorMode === "json" ? C.blue : "#f8fafc", color: editorMode === "json" ? "#fff" : C.muted }}>{"{ } JSON"}</button>
                </div>
              )}
              <Btn variant="ghost" onClick={() => setCanvasMode(null)}>Close</Btn>
            </div>
          </div>

          <div style={{ padding: 12 }}>
            {canvasMode === "create" && (
              <div style={{ marginBottom: 8 }}>
                <input value={editorKey} onChange={e => setEditorKey(e.target.value)} placeholder={source === "rtdb" ? "key" : "doc id (optional)"} style={{ padding: 8, width: "100%", fontFamily: C.mono }} />
              </div>
            )}

            {editorMode === "fields" ? (
              <FieldsEditor rawJson={editorJson} onChange={setEditorJson} />
            ) : (
              <JsonTextarea value={editorJson} onChange={setEditorJson} rows={12} />
            )}

            {editorErr && <div style={{ marginTop: 8, color: C.red }}>{editorErr}</div>}

            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <Btn onClick={canvasMode === "edit" ? saveEdit : saveCreate} disabled={editorLoading}>{editorLoading ? "Saving…" : "Save"}</Btn>
              <Btn variant="ghost" onClick={() => setCanvasMode(null)}>Cancel</Btn>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <div style={{ padding: 12, fontWeight: 700 }}>Results</div>
        <div style={{ display: "grid", gap: 6, padding: 12 }}>
          {items.length === 0 && <div style={{ color: C.muted }}>No rows</div>}
          {items.map(it => (
            <div key={(it.key || it.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 8, border: `1px solid ${C.border}`, borderRadius: 6 }}>
              <div style={{ fontFamily: C.mono }}>{it.key || it.id}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn variant="ghost" onClick={() => openEdit(it.key || it.id)}>Edit</Btn>
                <Btn variant="danger" onClick={async () => { if (!confirm('Delete?')) return; await adminFetch(source === 'rtdb' ? 'admin_rtdb_node_delete' : 'admin_firestore_doc_delete', { method: 'POST', body: { path: `${path.replace(/\/$/,'')}/${it.key || it.id}` } }); await browse(); }}>Delete</Btn>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
