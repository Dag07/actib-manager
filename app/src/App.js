import React, { useEffect, useMemo, useState, useContext, createContext } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Link,
  useLocation,
} from "react-router-dom";
import { auth } from "./firebase";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { firebaseConfig } from "./firebaseConfig";

const ALLOWED_DOMAIN = "actib.app";

function isAllowedEmail(email) {
  return typeof email === "string" && email.toLowerCase().endsWith("@" + ALLOWED_DOMAIN);
}
import AdminRoot from "./admin/AdminRoot";

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

function functionsBase() {
  // Explicit override always wins (e.g. local emulator in .env.development.local)
  if (process.env.REACT_APP_FUNCTIONS_BASE_URL)
    return process.env.REACT_APP_FUNCTIONS_BASE_URL;

  // Fall back to the project ID from firebaseConfig — never undefined
  const project = firebaseConfig.projectId;
  return `https://us-central1-${project}.cloudfunctions.net`;
}

async function authedFetch(path, { method = "GET", body } = {}) {
  const token = await auth.currentUser.getIdToken();
  const url = `${functionsBase()}/${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-actib-admin": "1",
    },
    ...(body != null ? { body: JSON.stringify(body) } : {}),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false) {
    const baseMsg = json?.error || `HTTP ${res.status}`;
    const detailsMsg =
      json?.details?.error?.message ||
      json?.details?.error?.error_user_msg ||
      json?.details?.raw ||
      "";
    const msg = detailsMsg ? `${baseMsg}: ${detailsMsg}` : baseMsg;
    const err = new Error(msg);
    err.data = json;
    throw err;
  }
  return json;
}

const RidContext = createContext({ rid: "", setRid: () => {} });

function Layout({ children }) {
  const { rid, setRid } = useContext(RidContext);
  const user = auth.currentUser;
  return (
    <div
      style={{
        maxWidth: 980,
        margin: "0 auto",
        padding: 16,
        fontFamily: "system-ui",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <div style={{ fontWeight: 700 }}>Actib Manager</div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link to="/templates">Templates</Link>
          <Link to="/create">Create</Link>
          <Link to="/send">Send Test</Link>
          <Link to="/assets">Assets</Link>
          <Link to="/admin">Admin</Link>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, opacity: 0.8 }}>rid</span>
            <input
              value={rid}
              onChange={(e) => setRid(e.target.value)}
              placeholder="dev-rest"
              style={{ width: 140, padding: 6 }}
            />
          </label>
          {user ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#6b7280" }}>{user.email}</span>
              <button
                onClick={() => signOut(auth)}
                style={{
                  fontSize: 12,
                  padding: "4px 10px",
                  border: "1px solid #e5e7eb",
                  borderRadius: 4,
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  );
}

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onLogin(e) {
    e.preventDefault();
    setError("");
    if (!isAllowedEmail(email)) {
      setError(`Only @${ALLOWED_DOMAIN} accounts are allowed.`);
      return;
    }
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        background: "#f8f9fa",
        fontFamily: "system-ui",
      }}
    >
      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          padding: 32,
          width: 360,
          boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Actib Admin</div>
        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 20 }}>
          Access restricted to <strong>@{ALLOWED_DOMAIN}</strong> accounts
        </div>
        <form onSubmit={onLogin} style={{ display: "grid", gap: 12 }}>
          <input
            type="email"
            placeholder="you@actib.app"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            style={{ padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 14 }}
          />
          <input
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            style={{ padding: "8px 12px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 14 }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "9px 0",
              background: loading ? "#93c5fd" : "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? "default" : "pointer",
            }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
          {error ? (
            <div style={{ color: "#b91c1c", fontSize: 13, background: "#fef2f2", borderRadius: 4, padding: "8px 10px" }}>
              {error}
            </div>
          ) : null}
        </form>
      </div>
    </div>
  );
}

function TemplatesPage() {
  const { rid } = useContext(RidContext);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [templates, setTemplates] = useState([]);

  async function refresh() {
    setError("");
    setLoading(true);
    try {
      const r = await authedFetch(
        `whatsapp_templates_list?rid=${encodeURIComponent(rid)}`,
      );
      setTemplates(r.templates || []);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function generateDefaults() {
    setError("");
    setLoading(true);
    try {
      await authedFetch(
        `whatsapp_templates_generate_defaults?rid=${encodeURIComponent(rid)}`,
        { method: "POST", body: {} },
      );
      await refresh();
      alert("Submitted to Meta. Check results table/status in Meta.");
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (rid) refresh();
    // eslint-disable-next-line
  }, [rid]);

  return (
    <Layout>
      <h2>Templates</h2>
      <div style={{ marginBottom: 8 }}>
        rid: <code>{rid || "(missing)"}</code>
      </div>
      {!rid ? (
        <div>
          Open with <code>?rid=RID_DEMO</code>
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
        <button onClick={refresh} disabled={loading || !rid}>
          {loading ? "Loading..." : "Refresh"}
        </button>
        <button onClick={generateDefaults} disabled={loading || !rid}>
          Generate default templates
        </button>
      </div>

      {error ? (
        <div style={{ color: "#b91c1c", marginBottom: 8 }}>{error}</div>
      ) : null}

      <table
        width="100%"
        cellPadding="8"
        style={{ borderCollapse: "collapse" }}
      >
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
            <th>Name</th>
            <th>Language</th>
            <th>Category</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {templates.map((t) => (
            <tr
              key={`${t.name}-${t.language}`}
              style={{ borderBottom: "1px solid #f0f0f0" }}
            >
              <td>{t.name}</td>
              <td>{t.language}</td>
              <td>{t.category}</td>
              <td>{t.status}</td>
            </tr>
          ))}
          {templates.length === 0 ? (
            <tr>
              <td colSpan={4} style={{ opacity: 0.7 }}>
                No templates.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </Layout>
  );
}

function AssetsPage() {
  const { rid } = useContext(RidContext);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [integration, setIntegration] = useState(null);

  async function refresh() {
    setError("");
    setLoading(true);
    try {
      const r = await authedFetch(`whatsapp_integration_get?rid=${encodeURIComponent(rid)}`);
      setIntegration(r.integration || null);
      return r.integration || null;
    } catch (e) {
      setError(e.message || String(e));
      return null;
    } finally {
      setLoading(false);
    }
  }

  const [templates, setTemplates] = useState([]);
  const [requestInfo, setRequestInfo] = useState(null);

  async function fetchTemplates() {
    setError("");
    setLoading(true);
    try {
      const r = await authedFetch(`whatsapp_templates_list?rid=${encodeURIComponent(rid)}`);
      setTemplates(r.templates || []);
      setRequestInfo(r.requestInfo || null);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function save(updates) {
    setError("");
    setLoading(true);
    try {
      await authedFetch(`whatsapp_integration_update?rid=${encodeURIComponent(rid)}`, {
        method: "POST",
        body: updates,
      });
      await refresh();
      alert("Saved");
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!rid) return;
    // refresh integration then fetch templates
    refresh().then(() => fetchTemplates()).catch(() => undefined);
    // eslint-disable-next-line
  }, [rid]);

  if (!rid) return (
    <Layout>
      <div>Open with rid set in the header</div>
    </Layout>
  );

  return (
    <Layout>
      <h2>WhatsApp Assets</h2>
      <div style={{ marginBottom: 8 }}>rid: <code>{rid}</code></div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <div><strong>WABA ID:</strong> {integration?.wabaId || '(missing)'}</div>
        <div><strong>Phone Number ID:</strong> {integration?.phoneNumberId || '(missing)'}</div>
        <div><strong>Templates:</strong> {templates.length}</div>
        <div><strong>Last sync:</strong> {integration?.lastSync || '-'}</div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <button onClick={refresh} disabled={loading}>Refresh</button>
      </div>
      {error ? <div style={{ color: '#b91c1c' }}>{error}</div> : null}

      {integration ? (
        <div style={{ display: 'grid', gap: 8, maxWidth: 680 }}>
          <div><strong>WABA ID:</strong> {integration.wabaId || '(missing)'}</div>
          <div><strong>Phone Number ID:</strong> {integration.phoneNumberId || '(missing)'}</div>
          <div><strong>Provider:</strong> {integration.provider || '-'}</div>
          <div><strong>Enabled:</strong> {String(!!integration.enabled)}</div>
          <div><strong>Business Account ID:</strong> {integration.businessAccountId || '-'}</div>

          <div style={{ marginTop: 12 }}>
            <h4>Edit</h4>
            <form onSubmit={e => { e.preventDefault(); save({ wabaId: e.target.wabaId.value, phoneNumberId: e.target.phoneNumberId.value }); }} style={{ display: 'grid', gap: 8 }}>
              <input name="wabaId" defaultValue={integration.wabaId || ''} placeholder="wabaId" />
              <input name="phoneNumberId" defaultValue={integration.phoneNumberId || ''} placeholder="phoneNumberId" />
              <button type="submit" disabled={loading}>Save</button>
            </form>
          </div>

          <div style={{ marginTop: 12 }}>
            <h4>Actions</h4>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => window.location.assign(`/templates`)} disabled={loading}>Open Templates</button>
              <button onClick={() => fetchTemplates()} disabled={loading}>List Templates (details)</button>
              <button onClick={() => authedFetch(`whatsapp_templates_generate_defaults?rid=${encodeURIComponent(rid)}`, { method: 'POST', body: {} }).then(() => alert('Submitted')).catch(e => alert(String(e)))} disabled={loading}>Generate Default Templates</button>
            </div>
          </div>
        </div>
      ) : (
        <div>No integration document found.</div>
      )}
      {templates.length > 0 ? (
        <div style={{ marginTop: 16 }}>
          <h3>Templates</h3>
          <div style={{ fontSize: 13, color: '#666' }}>Request: {requestInfo ? requestInfo.url : '(none)'} — Auth: {requestInfo ? requestInfo.authMasked : '(none)'}</div>
          <table width="100%" cellPadding={8} style={{ borderCollapse: 'collapse', marginTop: 8 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                <th>Name</th>
                <th>Language</th>
                <th>Category</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {templates.map(t => (
                <tr key={`${t.name}-${t.language}`} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td>{t.name}</td>
                  <td>{t.language}</td>
                  <td>{t.category}</td>
                  <td>{t.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Layout>
  );
}

function CreatePage() {
  const { rid } = useContext(RidContext);
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("es_ES");
  const [category, setCategory] = useState("UTILITY");
  const [bodyText, setBodyText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await authedFetch(
        `whatsapp_templates_create?rid=${encodeURIComponent(rid)}`,
        {
          method: "POST",
          body: { name, language, category, body_text: bodyText },
        },
      );
      alert("Submitted to Meta.");
    } catch (e2) {
      setError(e2.message || String(e2));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout>
      <h2>Create Template</h2>
      <div style={{ marginBottom: 8 }}>
        rid: <code>{rid || "(missing)"}</code>
      </div>
      {error ? (
        <div style={{ color: "#b91c1c", marginBottom: 8 }}>{error}</div>
      ) : null}
      <form
        onSubmit={onSubmit}
        style={{ display: "grid", gap: 12, maxWidth: 640 }}
      >
        <input
          placeholder="template_name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={loading}
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          disabled={loading}
        >
          <option value="UTILITY">UTILITY</option>
        </select>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          disabled={loading}
        >
          <option value="es_ES">es_ES</option>
          <option value="es_MX">es_MX</option>
          <option value="es_AR">es_AR</option>
        </select>
        <textarea
          rows={6}
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          disabled={loading}
        />
        <button type="submit" disabled={loading || !rid}>
          {loading ? "Submitting..." : "Submit"}
        </button>
      </form>
    </Layout>
  );
}

function SendTestPage() {
  const { rid } = useContext(RidContext);
  const [templates, setTemplates] = useState([]);
  const [to, setTo] = useState("+50763215906");
  const [templateName, setTemplateName] = useState("");
  const [language, setLanguage] = useState("es_ES");
  const [varsRaw, setVarsRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadTemplates() {
    if (!rid) return;
    const r = await authedFetch(
      `whatsapp_templates_list?rid=${encodeURIComponent(rid)}`,
    );
    setTemplates(r.templates || []);
    if (!templateName && (r.templates || []).length > 0) {
      setTemplateName(r.templates[0].name);
      setLanguage(r.templates[0].language || "es_ES");
    }
  }

  useEffect(() => {
    const selected = templates.find((t) => t.name === templateName);
    if (selected?.language) {
      setLanguage(selected.language);
    } else if (templateName === "hello_world") {
      setLanguage("en_US");
    }
  }, [templateName, templates]);

  useEffect(() => {
    loadTemplates().catch(() => undefined);
    // eslint-disable-next-line
  }, [rid]);

  async function onSend(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const variables = varsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      await authedFetch(
        `whatsapp_send_template_test?rid=${encodeURIComponent(rid)}`,
        {
          method: "POST",
          body: { to, template_name: templateName, language, variables },
        },
      );
      alert("Test message sent");
    } catch (e2) {
      setError(e2.message || String(e2));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout>
      <h2>Send Test</h2>
      <div style={{ marginBottom: 8 }}>
        rid: <code>{rid || "(missing)"}</code>
      </div>
      {error ? (
        <div style={{ color: "#b91c1c", marginBottom: 8 }}>{error}</div>
      ) : null}
      <form
        onSubmit={onSend}
        style={{ display: "grid", gap: 12, maxWidth: 640 }}
      >
        <select
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
          disabled={loading}
        >
          <option value="">Select template</option>
          {templates.map((t) => (
            <option key={`${t.name}-${t.language}`} value={t.name}>
              {t.name} ({t.language})
            </option>
          ))}
        </select>
        <input
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          disabled={loading}
        />
        <input
          placeholder="to (+E.164)"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          disabled={loading}
        />
        <input
          placeholder="variables (comma-separated)"
          value={varsRaw}
          onChange={(e) => setVarsRaw(e.target.value)}
          disabled={loading}
        />
        <button type="submit" disabled={loading || !rid}>
          {loading ? "Sending..." : "Send"}
        </button>
      </form>
    </Layout>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [rid, setRid] = useState(() => {
    try {
      return localStorage.getItem("rid") || "dev-rest";
    } catch {
      return "dev-rest";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("rid", rid || "");
    } catch {
      /* ignore */
    }
  }, [rid]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u && !isAllowedEmail(u.email)) {
        // Sign out immediately if the account domain is not allowed
        signOut(auth).catch(() => {});
        setUser(null);
        setReady(true);
        return;
      }
      setUser(u);
      setReady(true);
    });
    return () => {
      unsub();
    };
  }, []);

  // Dev-only: auto sign-in if running on localhost and env vars provided
  const [autoSignAttempted, setAutoSignAttempted] = useState(false);
  useEffect(() => {
    if (user || autoSignAttempted) return;
    if (typeof window === "undefined") return;
    if (window.location.hostname !== "localhost") return;

    const email = process.env.REACT_APP_DEV_AUTO_LOGIN_EMAIL;
    const pass = process.env.REACT_APP_DEV_AUTO_LOGIN_PASSWORD;
    if (!email || !pass) return;

    setAutoSignAttempted(true);
    signInWithEmailAndPassword(auth, email, pass).catch(() => {
      // ignore failure; user can sign in manually
    });
    // eslint-disable-next-line
  }, [user, autoSignAttempted]);

  if (!ready) return null;

  return (
    <RidContext.Provider value={{ rid, setRid }}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route
          path="/admin"
          element={user ? <AdminRoot /> : <Navigate to="/login" />}
        />

        <Route
          path="/login"
          element={user ? <Navigate to="/admin" /> : <LoginPage />}
        />
        <Route
          path="/templates"
          element={user ? <TemplatesPage /> : <Navigate to="/login" />}
        />
        <Route
          path="/create"
          element={user ? <CreatePage /> : <Navigate to="/login" />}
        />
        <Route
          path="/send"
          element={user ? <SendTestPage /> : <Navigate to="/login" />}
        />
        <Route
          path="/assets"
          element={user ? <AssetsPage /> : <Navigate to="/login" />}
        />
        <Route
          path="/"
          element={<Navigate to={user ? "/admin" : "/login"} />}
        />
      </Routes>
      </BrowserRouter>
    </RidContext.Provider>
  );
}
