import React, { useState } from "react";
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

export default function Analyze() {
  const [source,       setSource]       = useState("rtdb");
  const [path,         setPath]         = useState("/");
  const [analysisType, setAnalysisType] = useState("empty");
  const [results,      setResults]      = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");

  async function analyze() {
    setError(""); setLoading(true); setResults(null);
    try {
      let out;
      if (source === "rtdb") {
        if (analysisType === "empty") {
          out = await adminFetch(`admin_rtdb_analyze_empty?path=${encodeURIComponent(path)}&limit=200`);
          setResults({ type: "empty", items: out.emptyNodes || [], total: out.total || 0 });
        } else {
          out = await adminFetch(`admin_rtdb_analyze_size?path=${encodeURIComponent(path)}&limit=100`);
          setResults({ type: "size", items: out.topSizes || [], totalNodes: out.totalNodes || 0 });
        }
      } else {
        out = await adminFetch(`admin_firestore_analyze_empty?path=${encodeURIComponent(path)}&limit=200`);
        setResults({ type: "empty", items: out.emptyDocs || [], total: out.total || 0 });
      }
    } catch (e) {
      setError(String(e.message || e));
    } finally { setLoading(false); }
  }

  function formatBytes(b) {
    if (b >= 1048576) return (b / 1048576).toFixed(2) + " MB";
    if (b >= 1024)    return (b / 1024).toFixed(1) + " KB";
    return b + " B";
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, background: C.surface }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>Database Analyzer</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Find empty documents/nodes, or rank nodes by size</div>
        </div>
        <div style={{ padding: 20, display: "grid", gap: 14 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ display: "inline-flex", borderRadius: 8, overflow: "hidden", border: `1px solid ${C.border}`, flexShrink: 0 }}>
              {["rtdb", "firestore"].map(s => (
                <button key={s} onClick={() => { setSource(s); setAnalysisType("empty"); }} style={{
                  padding: "8px 16px", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer",
                  background: source === s ? C.blue : "#f8fafc", color: source === s ? "#fff" : C.muted,
                }}>{s === "rtdb" ? "Realtime DB" : "Firestore"}</button>
              ))}
            </div>
            <input value={path} onChange={e => setPath(e.target.value)}
              placeholder={source === "rtdb" ? "/path/to/analyze" : "collection"}
              style={{ flex: 1, minWidth: 160, padding: "8px 12px", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 7, fontFamily: C.mono, outline: "none" }}
            />
            <select value={analysisType} onChange={e => setAnalysisType(e.target.value)}
              style={{ padding: "8px 12px", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 7, background: "#fff", cursor: "pointer", flexShrink: 0 }}>
              <option value="empty">🗑 Find empty nodes/docs</option>
              {source === "rtdb" && <option value="size">📊 Rank by size</option>}
            </select>
            <button onClick={analyze} disabled={loading} style={{
              background: C.blue, color: "#fff", border: "none", borderRadius: 7,
              padding: "9px 18px", fontSize: 13, fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.5 : 1, flexShrink: 0,
            }}>{loading ? "Analyzing…" : "Analyze"}</button>
          </div>
          {error && <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 7, padding: "10px 14px", color: "#b91c1c", fontSize: 13 }}>⚠ {error}</div>}
        </div>
      </Card>

      {results && (
        <Card>
          <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.border}`, background: C.surface, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
              {results.type === "empty"
                ? `${results.total} empty ${source === "rtdb" ? "node(s)" : "doc(s)"} found`
                : `Top ${results.items.length} largest nodes (of ${results.totalNodes} total)`}
            </span>
            <span style={{ fontSize: 11, color: C.muted, fontFamily: C.mono }}>{path}</span>
          </div>

          {results.items.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center" }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>✨</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.green }}>All clean!</div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>No empty {source === "rtdb" ? "nodes" : "documents"} found</div>
            </div>
          ) : (
            <div style={{ maxHeight: 400, overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: C.surface }}>
                    <th style={{ padding: "8px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.4, borderBottom: `1px solid ${C.border}` }}>
                      {source === "rtdb" ? "Key" : "Document ID"}
                    </th>
                    {results.type === "size" && (
                      <th style={{ padding: "8px 16px", textAlign: "right", fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.4, borderBottom: `1px solid ${C.border}` }}>Size</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {results.items.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: "10px 16px", fontFamily: C.mono, fontSize: 12, fontWeight: 600, color: "#1d4ed8" }}>
                        {item.key || item.id}
                      </td>
                      {results.type === "size" && (
                        <td style={{ padding: "10px 16px", textAlign: "right", fontSize: 12, fontFamily: C.mono, color: C.muted }}>
                          <span style={{
                            background: item.size > 1048576 ? "#fef2f2" : item.size > 102400 ? "#fff7ed" : "#f0fdf4",
                            color:      item.size > 1048576 ? C.red : item.size > 102400 ? "#92400e" : "#15803d",
                            padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 600,
                          }}>{formatBytes(item.size)}</span>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
