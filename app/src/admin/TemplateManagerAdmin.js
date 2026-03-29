import React, { useState } from "react";
import { adminFetch } from "./api";

export default function TemplateManagerAdmin() {
  const [rid, setRid] = useState("");
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function listTemplates() {
    setError("");
    setLoading(true);
    try {
      const out = await adminFetch(`whatsapp_templates_list?rid=${encodeURIComponent(rid)}`);
      setTemplates(out.templates || []);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ border: '1px solid #eee', padding: 12 }}>
      <h3>Template Manager (admin)</h3>
      <div style={{ display: 'flex', gap: 8 }}>
        <input placeholder="rid" value={rid} onChange={(e) => setRid(e.target.value)} />
        <button onClick={listTemplates} disabled={loading || !rid}>{loading ? 'Loading...' : 'List'}</button>
      </div>
      {error ? <div style={{ color: '#b91c1c' }}>{error}</div> : null}
      <div style={{ marginTop: 8 }}>
        {templates.map((t) => (
          <div key={`${t.name}-${t.language}`} style={{ borderBottom: '1px solid #f5f5f5', padding: 6 }}>
            <div><strong>{t.name}</strong> — {t.language} — {t.status}</div>
            <div style={{ fontSize: 13, color: '#444' }}>{t.raw && JSON.stringify(t.raw)}</div>
          </div>
        ))}
        {templates.length === 0 ? <div style={{ opacity: 0.7, marginTop: 8 }}>No templates loaded</div> : null}
      </div>
    </div>
  );
}
