import React, { useState } from "react";
import { adminFetch } from "./api";

const C = {
  blue:   "#6366f1",
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

export default function Search() {
  const [source,   setSource]   = useState("rtdb");
  const [path,     setPath]     = useState("/");
  const [pattern,  setPattern]  = useState("");
  const [results,  setResults]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [searched, setSearched] = useState(false);

  async function search() {
    if (!pattern) return;
    setError(""); setLoading(true); setSearched(false);
    try {
      const endpoint = source === "rtdb"
        ? `admin_rtdb_search?path=${encodeURIComponent(path)}&pattern=${encodeURIComponent(pattern)}&limit=200`
        : `admin_firestore_search?path=${encodeURIComponent(path)}&pattern=${encodeURIComponent(pattern)}&limit=200`;
      const out = await adminFetch(endpoint);
      setResults(out.matches || []);
      setSearched(true);
    } catch (e) {
      setError(String(e.message || e));
    } finally { setLoading(false); }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, background: C.surface }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>Search by Key / Document ID</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Regex patterns to find matching keys or document IDs within a path</div>
        </div>
        <div style={{ padding: 20, display: "grid", gap: 12 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "inline-flex", borderRadius: 8, overflow: "hidden", border: `1px solid ${C.border}`, flexShrink: 0 }}>
              {["rtdb", "firestore"].map(s => (
                <button key={s} onClick={() => setSource(s)} style={{
                  padding: "8px 16px", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer",
                  background: source === s ? C.blue : "#f8fafc", color: source === s ? "#fff" : C.muted,
                }}>{s === "rtdb" ? "Realtime DB" : "Firestore"}</button>
              ))}
            </div>
            <input value={path} onChange={e => setPath(e.target.value)}
              placeholder={source === "rtdb" ? "/path/to/search" : "collection"}
              style={{ flex: 1, minWidth: 140, padding: "8px 12px", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 7, fontFamily: C.mono, outline: "none" }}
            />
            <input value={pattern} onChange={e => setPattern(e.target.value)}
              onKeyDown={e => e.key === "Enter" && search()}
              placeholder="Regex (e.g. ^order_.*2024$)"
              style={{ flex: 2, minWidth: 200, padding: "8px 12px", fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 7, fontFamily: C.mono, outline: "none" }}
            />
            <button onClick={search} disabled={loading || !pattern} style={{
              background: C.blue, color: "#fff", border: "none", borderRadius: 7, padding: "9px 18px",
              fontSize: 13, fontWeight: 600, cursor: loading || !pattern ? "not-allowed" : "pointer",
              opacity: loading || !pattern ? 0.5 : 1, flexShrink: 0,
            }}>{loading ? "Searching…" : "Search"}</button>
          </div>
          {error && <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 7, padding: "10px 14px", color: "#b91c1c", fontSize: 13 }}>⚠ {error}</div>}
        </div>
      </Card>

      {searched && (
        <Card>
          <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.border}`, background: C.surface, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
              {results.length === 0 ? "No matches found" : `${results.length} match${results.length !== 1 ? "es" : ""}`}
            </span>
            <span style={{ fontSize: 12, color: C.muted, fontFamily: C.mono }}>{pattern}</span>
          </div>
          {results.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", fontSize: 14, color: C.muted }}>No records matched the pattern</div>
          ) : (
            <div style={{ maxHeight: 420, overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: C.surface }}>
                    {["Key / ID", "Preview"].map(h => (
                      <th key={h} style={{ padding: "8px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.4, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: "10px 16px", fontFamily: C.mono, fontSize: 12, fontWeight: 600, color: "#1d4ed8", whiteSpace: "nowrap" }}>{item.key || item.id}</td>
                      <td style={{ padding: "10px 16px", fontFamily: C.mono, fontSize: 12, color: C.muted, maxWidth: 480, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(item.preview)}</td>
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
