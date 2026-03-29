import { auth } from "../firebase";
import { firebaseConfig } from "../firebaseConfig";

export function functionsBase() {
  if (process.env.REACT_APP_FUNCTIONS_BASE_URL) return process.env.REACT_APP_FUNCTIONS_BASE_URL;
  return `https://us-central1-${firebaseConfig.projectId}.cloudfunctions.net`;
}

export async function adminFetch(path, { method = "GET", body } = {}) {
  if (!auth.currentUser) {
    throw new Error("Not authenticated");
  }
  const token = await auth.currentUser.getIdToken();
  const res = await fetch(`${functionsBase()}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-actib-admin": "1",
    },
    ...(body != null ? { body: JSON.stringify(body) } : {}),
  });

  // Read text first so we can present raw error bodies (helps debug when a
  // non-JSON response is returned, e.g. an HTML error page). Try parsing JSON
  // afterwards.
  const text = await res.text().catch(() => null);
  let json = {};
  if (text) {
    try { json = JSON.parse(text); } catch { json = {}; }
  }

  if (!res.ok || json?.success === false) {
    const message = json?.error || text || `HTTP ${res.status}`;
    throw new Error(message);
  }
  return json;
}
