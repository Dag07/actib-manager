import React, { useMemo, useState } from "react";
import { adminFetch } from "./api";

/* ─── design tokens ─── */
const C = {
  blue:   "#6366f1",
  red:    "#ef4444",
  green:  "#10b981",
  yellow: "#d97706",
  bg:     "#ffffff",
  surface:"#f8fafc",
  border: "#e2e8f0",
  text:   "#111827",
  muted:  "#6b7280",
  mono:   "'JetBrains Mono', 'Fira Code', monospace",
};

function Card({ children, style }) {
  return (
    <div style={{
      background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10,
      boxShadow: "0 1px 3px rgba(0,0,0,.07)", overflow: "hidden", ...style,
    }}>{children}</div>
  );
}

function Btn({ onClick, disabled, variant = "default", style, children }) {
  const base = {
    border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 13,
    fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1, lineHeight: 1, ...style,
  };
  const variants = {
    default: { background: C.blue,  color: "#fff" },
    danger:  { background: C.red,   color: "#fff" },
    success: { background: C.green, color: "#fff" },
    ghost:   { background: "#f1f5f9", color: C.text, border: `1px solid ${C.border}` },
    icon:    { background: "transparent", color: C.muted, padding: "4px 8px", fontSize: 14 },
    iconRed: { background: "transparent", color: "#dc2626", padding: "4px 8px", fontSize: 14 },
    iconBlue:{ background: "transparent", color: C.blue,   padding: "4px 8px", fontSize: 14 },
  };
  return <button style={{ ...base, ...variants[variant] }} onClick={onClick} disabled={disabled}>{children}</button>;
}

/* ─── JSON textarea validator ─── */
function JsonEditor({ value, onChange, rows = 8, label }) {
  const [err, setErr] = useState("");
  function handle(v) {
    onChange(v);
    setErr("");
    if (v.trim()) {
      try { JSON.parse(v); }
      catch(e) { setErr(e.message); }
    }
  }
  return (
    <div>
      {label && <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</div>}
      <textarea
        value={value}
        onChange={e => handle(e.target.value)}
        rows={rows}
        style={{
          width: "100%", boxSizing: "border-box", padding: "10px 12px",
          fontSize: 12, fontFamily: C.mono,
          border: `1px solid ${err ? C.red : C.border}`, borderRadius: 7,
          background: "#1e293b", color: "#e2e8f0",
          resize: "vertical", outline: "none",
        }}
        spellCheck={false}
      />
      {err && <div style={{ fontSize: 11, color: C.red, marginTop: 3 }}>Invalid JSON: {err}</div>}
    </div>
  );
}

/* ─── helpers ─── */
function itemPath(source, basePath, keyOrId) {
  if (source === "rtdb") {
    const p = basePath.endsWith("/") ? basePath : basePath + "/";
    return p + keyOrId;
  } else {
    const p = basePath.replace(/\/$/, "");
    return p + "/" + keyOrId;
  }
}

function isValidJson(s) {
  try { JSON.parse(s); return true; } catch { return false; }
}

export default function Explorer() {
  /* ── browse state ── */
  const [source,         setSource]        = useState("rtdb");
  const [path,           setPath]          = useState("/");
  const [limit,          setLimit]         = useState(50);
  const [items,          setItems]         = useState([]);
  const [hasMore,        setHasMore]       = useState(false);
  const [nextStartAt,    setNextStartAt]   = useState("");
  const [nextStartAfter, setNextStartAfter]= useState("");
  const [loading,        setLoading]       = useState(false);
  const [error,          setError]         = useState("");

  /* ── virtual scroll ── */
  const [scrollTop, setScrollTop] = useState(0);
  const rowHeight      = 44;
  const viewportHeight = 440;
  const overscan       = 10;

  /* ── selection / actions ── */
  const [selected,  setSelected]  = useState(new Set());
  const [deleting,  setDeleting]  = useState(false);
  const [deleteResult, setDeleteResult] = useState(null);

  /* ── inline edit state ── */
  // editState = null | { key: string, rawJson: string, loading: bool, error: string }
  const [editState, setEditState] = useState(null);

  /* ── create panel state ── */
  // createState = null | { key: string, rawJson: string, loading: bool, error: string }
  const [createState, setCreateState] = useState(null);

  /* ── expand (view full value) ── */
  const [expanded, setExpanded] = useState(new Set());

  /* ── status messages ── */
  const [successMsg, setSuccessMsg] = useState("");

  const virtual = useMemo(() => {
    const total   = items.length;
    const start   = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const visible = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
    const end     = Math.min(total, start + visible);
    return { start, end, offsetY: start * rowHeight, totalHeight: total * rowHeight, slice: items.slice(start, end) };
  }, [items, scrollTop]);

  /* ── browse ── */
  async function browse() {
    setError(""); setDeleteResult(null); setSuccessMsg("");
    setSelected(new Set()); setEditState(null); setCreateState(null);
    setLoading(true);
    try {
      let out;
      if (source === "rtdb") {
        out = await adminFetch(`admin_rtdb_preview?path=${encodeURIComponent(path)}&limit=${limit}`);
        setNextStartAt(out.items?.length ? out.items[out.items.length - 1].key : "");
        setNextStartAfter("");
      } else {
        out = await adminFetch(`admin_firestore_preview?path=${encodeURIComponent(path)}&limit=${limit}`);
        setNextStartAt("");
        setNextStartAfter(out.items?.length ? out.items[out.items.length - 1].id : "");
      }
      setItems(out.items || []);
      setHasMore(!!out.hasMore);
      setExpanded(new Set());
    } catch (e) {
      setError(String(e.message || e));
    } finally { setLoading(false); }
  }

  async function loadMore() {
    if (!hasMore) return;
    setError(""); setLoading(true);
    try {
      let out;
      if (source === "rtdb") {
        out = await adminFetch(`admin_rtdb_paginate?path=${encodeURIComponent(path)}&limit=${limit}&startAt=${encodeURIComponent(nextStartAt)}`);
        setNextStartAt(out.items?.length ? out.items[out.items.length - 1].key : "");
      } else {
        out = await adminFetch(`admin_firestore_paginate?path=${encodeURIComponent(path)}&limit=${limit}&startAfter=${encodeURIComponent(nextStartAfter)}`);
        setNextStartAfter(out.items?.length ? out.items[out.items.length - 1].id : "");
      }
      setItems(prev => [...prev, ...(out.items || [])]);
      setHasMore(!!out.hasMore);
    } catch (e) {
      setError(String(e.message || e));
    } finally { setLoading(false); }
  }

  /* ── open edit (fetch full value) ── */
  async function openEdit(key) {
    setEditState({ key, rawJson: "", loading: true, error: "" });
    setCreateState(null);
    try {
      const fullPath = itemPath(source, path, key);
      let raw;
      if (source === "rtdb") {
        const out = await adminFetch(`admin_rtdb_get?path=${encodeURIComponent(fullPath)}`);
        raw = JSON.stringify(out.value, null, 2);
      } else {
        const out = await adminFetch(`admin_firestore_get?path=${encodeURIComponent(fullPath)}`);
        raw = JSON.stringify(out.data, null, 2);
      }
      setEditState({ key, rawJson: raw, loading: false, error: "" });
    } catch (e) {
      setEditState({ key, rawJson: "", loading: false, error: String(e.message || e) });
    }
  }

  /* ── save edit ── */
  async function saveEdit() {
    if (!editState) return;
    const { key, rawJson } = editState;
    if (!isValidJson(rawJson)) {
      setEditState(s => ({ ...s, error: "Fix JSON errors before saving" }));
      return;
    }
    setEditState(s => ({ ...s, loading: true, error: "" }));
    try {
      const fullPath = itemPath(source, path, key);
      const parsed = JSON.parse(rawJson);
      if (source === "rtdb") {
        await adminFetch("admin_rtdb_set", { method: "POST", body: { path: fullPath, value: parsed } });
      } else {
        await adminFetch("admin_firestore_set", { method: "POST", body: { path: fullPath, data: parsed, merge: false } });
      }
      setSuccessMsg(`✓ Saved "${key}"`);
      setEditState(null);
      // refresh the row in place (re-browse is simplest)
      await browse();
    } catch (e) {
      setEditState(s => ({ ...s, loading: false, error: String(e.message || e) }));
    }
  }

  /* ── delete single ── */
  async function deleteSingle(key) {
    if (!window.confirm(`Delete "${key}" from ${path}?`)) return;
    setDeleting(true);
    try {
      const fullPath = itemPath(source, path, key);
      if (source === "rtdb") {
        await adminFetch("admin_rtdb_node_delete", { method: "POST", body: { path: fullPath } });
      } else {
        await adminFetch("admin_firestore_doc_delete", { method: "POST", body: { path: fullPath } });
      }
      setSuccessMsg(`✓ Deleted "${key}"`);
      setItems(prev => prev.filter(it => (it.key || it.id) !== key));
      setSelected(prev => { const n = new Set(prev); n.delete(key); return n; });
    } catch (e) {
      setError(String(e.message || e));
    } finally { setDeleting(false); }
  }

  /* ── delete selected (multi) ── */
  async function deleteSelected() {
    if (selected.size === 0) return;
    if (!window.confirm(`Delete ${selected.size} selected items from ${path}?`)) return;
    setDeleting(true); setDeleteResult(null);
    let deleted = 0; const errors = [];
    for (const key of selected) {
      try {
        const fullPath = itemPath(source, path, key);
        if (source === "rtdb") {
          await adminFetch("admin_rtdb_node_delete", { method: "POST", body: { path: fullPath } });
        } else {
          await adminFetch("admin_firestore_doc_delete", { method: "POST", body: { path: fullPath } });
        }
        deleted++;
      } catch (e) { errors.push(`${key}: ${e.message}`); }
    }
    setDeleteResult({ deleted, errors });
    setSelected(new Set());
    setItems(prev => prev.filter(it => !selected.has(it.key || it.id)));
    setDeleting(false);
  }

  /* ── create new ── */
  function openCreate() {
    setCreateState({ key: "", rawJson: source === "rtdb" ? "null" : "{}", loading: false, error: "" });
    setEditState(null);
  }

  async function saveCreate() {
    if (!createState) return;
    const { key, rawJson } = createState;
    if (!key.trim()) {
      setCreateState(s => ({ ...s, error: source === "rtdb" ? "Key is required" : "Document ID is required" }));
      return;
    }
    if (!isValidJson(rawJson)) {
      setCreateState(s => ({ ...s, error: "Fix JSON errors before saving" }));
      return;
    }
    setCreateState(s => ({ ...s, loading: true, error: "" }));
    try {
      const fullPath = itemPath(source, path, key.trim());
      const parsed = JSON.parse(rawJson);
      if (source === "rtdb") {
        await adminFetch("admin_rtdb_set", { method: "POST", body: { path: fullPath, value: parsed } });
      } else {
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          setCreateState(s => ({ ...s, loading: false, error: "Firestore data must be a JSON object { ... }" }));
          return;
        }
        await adminFetch("admin_firestore_set", { method: "POST", body: { path: fullPath, data: parsed, merge: false } });
      }
      setSuccessMsg(`✓ Created "${key.trim()}"`);
      setCreateState(null);
      await browse();
    } catch (e) {
      setCreateState(s => ({ ...s, loading: false, error: String(e.message || e) }));
    }
  }

  /* ── toggle select/expand ── */
  function toggleSelect(key) {
    setSelected(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }
  function toggleExpand(key) {
    setExpanded(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }
  function toggleAll() {
    setSelected(items.length > 0 && selected.size === items.length ? new Set() : new Set(items.map(i => i.key || i.id)));
  }

  const allSelected = items.length > 0 && selected.size === items.length;

  /* ── render ── */
  return (
    <div style={{ display: "grid", gap: 16 }}>

      {/* ── Toolbar ── */}
      <Card style={{ padding: 16 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {/* Source toggle */}
          <div style={{ display: "inline-flex", borderRadius: 8, overflow: "hidden", border: `1px solid ${C.border}`, flexShrink: 0 }}>
            {["rtdb", "firestore"].map(s => (
              <button key={s} onClick={() => { setSource(s); setItems([]); setEditState(null); setCreateState(null); }}
                style={{
                  padding: "7px 14px", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer",
                  background: source === s ? C.blue : "#f8fafc", color: source === s ? "#fff" : C.muted,
                }}>
                {s === "rtdb" ? "Realtime DB" : "Firestore"}
              </button>
            ))}
          </div>

          {/* Path */}
          <input
            value={path}
            onChange={e => setPath(e.target.value)}
            onKeyDown={e => e.key === "Enter" && browse()}
            placeholder={source === "rtdb" ? "/path/to/node" : "collection"}
            style={{
              flex: 1, minWidth: 200, padding: "8px 12px", fontSize: 13,
              fontFamily: C.mono, border: `1px solid ${C.border}`, borderRadius: 7, outline: "none",
            }}
          />

          {/* Limit */}
          <select value={limit} onChange={e => setLimit(Number(e.target.value))} style={{
            padding: "8px 10px", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 7, background: "#fff", cursor: "pointer", flexShrink: 0,
          }}>
            {[20, 50, 100, 250, 500].map(n => <option key={n} value={n}>{n} rows</option>)}
          </select>

          <Btn onClick={browse} disabled={loading}>{loading ? "Loading…" : "Browse →"}</Btn>

          {/* New entry button (only when browsed) */}
          {items.length > 0 && (
            <Btn variant="success" onClick={openCreate} style={{ flexShrink: 0 }}>+ New</Btn>
          )}
        </div>
      </Card>

      {/* ── Error ── */}
      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 16px", color: "#b91c1c", fontSize: 13 }}>
          ⚠ {error}
        </div>
      )}

      {/* ── Success flash ── */}
      {successMsg && (
        <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "10px 16px", color: "#15803d", fontSize: 13, fontWeight: 600 }}>
          {successMsg}
        </div>
      )}

      {/* ── Delete result ── */}
      {deleteResult && (
        <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "10px 16px", fontSize: 13 }}>
          <strong style={{ color: "#15803d" }}>✓ Deleted {deleteResult.deleted} items.</strong>
          {deleteResult.errors.length > 0 && (
            <div style={{ color: "#b91c1c", marginTop: 4 }}>Errors: {deleteResult.errors.join(" | ")}</div>
          )}
        </div>
      )}

      {/* ── Create panel ── */}
      {createState && (
        <Card>
          <div style={{ padding: "12px 20px", borderBottom: `1px solid ${C.border}`, background: "#f0fdf4", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: "#15803d" }}>
              + Create new {source === "rtdb" ? "node" : "document"} in <span style={{ fontFamily: C.mono }}>{path}</span>
            </span>
            <Btn variant="icon" onClick={() => setCreateState(null)}>✕</Btn>
          </div>
          <div style={{ padding: 20, display: "grid", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.3 }}>
                {source === "rtdb" ? "Key (child name)" : "Document ID"}
              </div>
              <input
                value={createState.key}
                onChange={e => setCreateState(s => ({ ...s, key: e.target.value, error: "" }))}
                placeholder={source === "rtdb" ? "myNewKey" : "newDocId"}
                autoFocus
                style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", fontSize: 13, fontFamily: C.mono, border: `1px solid ${C.border}`, borderRadius: 7, outline: "none" }}
              />
            </div>
            <JsonEditor
              label={source === "rtdb" ? "Value (any JSON, or null)" : "Document data (JSON object)"}
              value={createState.rawJson}
              onChange={v => setCreateState(s => ({ ...s, rawJson: v }))}
              rows={8}
            />
            {createState.error && (
              <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 7, padding: "10px 14px", color: "#b91c1c", fontSize: 13 }}>⚠ {createState.error}</div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <Btn variant="success" onClick={saveCreate} disabled={createState.loading}>
                {createState.loading ? "Saving…" : "✓ Create"}
              </Btn>
              <Btn variant="ghost" onClick={() => setCreateState(null)}>Cancel</Btn>
            </div>
          </div>
        </Card>
      )}

      {/* ── Results table ── */}
      {items.length > 0 && (
        <Card>
          {/* Stats bar */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 16px", borderBottom: `1px solid ${C.border}`,
            background: C.surface, borderRadius: "10px 10px 0 0",
          }}>
            <div style={{ fontSize: 13, color: C.muted }}>
              <span style={{ fontWeight: 600, color: C.text }}>{items.length}</span> records from{" "}
              <span style={{ fontFamily: C.mono, color: C.blue }}>{path}</span>
              {hasMore && <span style={{ color: C.yellow, marginLeft: 8 }}>· more available</span>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {selected.size > 0 && (
                <Btn variant="danger" onClick={deleteSelected} disabled={deleting} style={{ fontSize: 12, padding: "6px 14px" }}>
                  {deleting ? "Deleting…" : `🗑 Delete ${selected.size}`}
                </Btn>
              )}
            </div>
          </div>

          {/* Column headers */}
          <div style={{
            display: "grid", gridTemplateColumns: "40px 1fr 2fr 90px",
            padding: "6px 16px", borderBottom: `1px solid ${C.border}`,
            background: "#f8fafc", fontSize: 11, fontWeight: 700, color: C.muted,
            textTransform: "uppercase", letterSpacing: 0.5,
          }}>
            <label style={{ cursor: "pointer", display: "flex", alignItems: "center" }}>
              <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ cursor: "pointer" }} />
            </label>
            <div>Key / ID</div>
            <div>Preview</div>
            <div>Actions</div>
          </div>

          {/* Virtual scroll body */}
          <div
            style={{ maxHeight: viewportHeight, overflow: "auto" }}
            onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
          >
            <div style={{ height: virtual.totalHeight, position: "relative" }}>
              <div style={{ transform: `translateY(${virtual.offsetY}px)` }}>
                {virtual.slice.map(it => {
                  const key = it.key || it.id;
                  const isSelected = selected.has(key);
                  const isExpanded = expanded.has(key);
                  const isEditing  = editState?.key === key;
                  const preview    = String(it.preview || "");

                  return (
                    <div key={key}>
                      {/* Main row */}
                      <div style={{
                        display: "grid", gridTemplateColumns: "40px 1fr 2fr 90px",
                        padding: "0 16px", height: rowHeight, alignItems: "center",
                        borderBottom: `1px solid ${C.border}`,
                        background: isEditing ? "#eff6ff" : isSelected ? "#f0fdf4" : "#fff",
                      }}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(key)} style={{ cursor: "pointer" }} />

                        <div
                          style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 600, color: "#1d4ed8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }}
                          title={key}
                          onClick={() => toggleExpand(key)}
                        >
                          {isExpanded ? "▾ " : "▸ "}{key}
                        </div>

                        <div style={{ fontFamily: C.mono, fontSize: 12, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={preview}>
                          {preview}
                        </div>

                        {/* Action buttons */}
                        <div style={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
                          <Btn variant="iconBlue" onClick={() => openEdit(key)} title="Edit">✏️</Btn>
                          <Btn variant="iconRed"  onClick={() => deleteSingle(key)} title="Delete">🗑</Btn>
                        </div>
                      </div>

                      {/* Expanded preview */}
                      {isExpanded && !isEditing && (
                        <div style={{ padding: "10px 16px 10px 56px", background: "#1e293b", borderBottom: `1px solid ${C.border}` }}>
                          <pre style={{ margin: 0, fontSize: 12, fontFamily: C.mono, color: "#a5f3fc", whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: 220, overflow: "auto" }}>
                            {typeof it.preview === "object" ? JSON.stringify(it.preview, null, 2) : it.preview}
                          </pre>
                        </div>
                      )}

                      {/* Inline edit panel */}
                      {isEditing && (
                        <div style={{ padding: 16, background: "#eff6ff", borderBottom: `1px solid ${C.border}` }}>
                          {editState.loading && <div style={{ fontSize: 13, color: C.muted, marginBottom: 8 }}>Loading full value…</div>}
                          {!editState.loading && (
                            <div style={{ display: "grid", gap: 10 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#1d4ed8" }}>
                                Editing: <span style={{ fontFamily: C.mono }}>{itemPath(source, path, key)}</span>
                              </div>
                              <JsonEditor
                                value={editState.rawJson}
                                onChange={v => setEditState(s => ({ ...s, rawJson: v, error: "" }))}
                                rows={10}
                              />
                              {editState.error && (
                                <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 7, padding: "8px 12px", color: "#b91c1c", fontSize: 12 }}>⚠ {editState.error}</div>
                              )}
                              <div style={{ display: "flex", gap: 8 }}>
                                <Btn variant="default" onClick={saveEdit} disabled={editState.loading}>
                                  {editState.loading ? "Saving…" : "✓ Save"}
                                </Btn>
                                <Btn variant="ghost" onClick={() => setEditState(null)}>Cancel</Btn>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{
            padding: "10px 16px", borderTop: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: C.surface, borderRadius: "0 0 10px 10px",
          }}>
            <span style={{ fontSize: 12, color: C.muted }}>
              {selected.size > 0 ? `${selected.size} of ${items.length} selected` : `${items.length} rows loaded`}
            </span>
            {hasMore && (
              <Btn variant="ghost" onClick={loadMore} disabled={loading} style={{ fontSize: 12, padding: "6px 14px" }}>
                {loading ? "Loading…" : "Load more ↓"}
              </Btn>
            )}
          </div>
        </Card>
      )}

      {/* ── empty state ── */}
      {!loading && items.length === 0 && !error && (
        <Card style={{ padding: 48, textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🗄</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 6 }}>No data loaded</div>
          <div style={{ fontSize: 13, color: C.muted }}>Enter a path and click <strong>Browse →</strong> to explore your database</div>
        </Card>
      )}

    </div>
  );
}
