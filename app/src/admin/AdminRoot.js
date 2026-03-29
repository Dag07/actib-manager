import React, { useState } from "react";
import { auth } from "../firebase";
import { signOut } from "firebase/auth";
import Explorer from "./TreeView";
import BulkDelete from "./OperationsPanel";
import Search from "./SearchPanel";
import Analyze from "./CleanupPanel";
import Templates from "./TemplateManagerAdmin";

const TABS = [
  { id: "explorer",  label: "🗂  Explorer" },
  { id: "delete",    label: "🗑  Bulk Delete" },
  { id: "search",    label: "🔍  Search" },
  { id: "analyze",   label: "📊  Analyze" },
  { id: "templates", label: "📋  Templates" },
];

export default function AdminRoot() {
  const [tab, setTab] = useState("explorer");
  const user = auth.currentUser;

  async function handleSignOut() {
    await signOut(auth);
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#f1f5f9",
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    }}>

      {/* ── Top bar ── */}
      <div style={{
        background: "#0f172a",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 20px",
        height: 52,
        position: "sticky",
        top: 0,
        zIndex: 100,
        boxShadow: "0 1px 4px rgba(0,0,0,.5)",
      }}>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontWeight: 700,
            fontSize: 15,
            letterSpacing: -0.3,
            color: "#e2e8f0",
            marginRight: 12,
            whiteSpace: "nowrap",
          }}>
            ⚡ DB Studio
          </span>

          {/* Nav tabs */}
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                background: tab === t.id ? "rgba(99,102,241,.25)" : "transparent",
                color: tab === t.id ? "#a5b4fc" : "#94a3b8",
                border: "none",
                borderRadius: 6,
                padding: "6px 14px",
                fontSize: 13,
                fontWeight: tab === t.id ? 600 : 400,
                cursor: "pointer",
                whiteSpace: "nowrap",
                outline: tab === t.id ? "1px solid rgba(99,102,241,.4)" : "none",
              }}
            >{t.label}</button>
          ))}
        </div>

        {/* User info */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: "#64748b" }}>{user?.email}</span>
          <button
            onClick={handleSignOut}
            style={{
              background: "transparent",
              border: "1px solid #334155",
              color: "#94a3b8",
              borderRadius: 5,
              padding: "3px 10px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >Sign out</button>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ padding: "24px", maxWidth: 1280, margin: "0 auto" }}>
        {tab === "explorer"  && <Explorer />}
        {tab === "delete"    && <BulkDelete />}
        {tab === "search"    && <Search />}
        {tab === "analyze"   && <Analyze />}
        {tab === "templates" && <Templates />}
      </div>
    </div>
  );
}
