"use client";

import { useState } from "react";
import { KeyRound, Plus } from "lucide-react";

type McpTokenRow = {
  id: string;
  name: string;
  enabled: boolean;
  permissionsJson: unknown;
  lastUsedAt?: string | null;
  createdAt: string;
};

export function McpTokenManager({ initialTokens }: { initialTokens: McpTokenRow[] }) {
  const [tokens, setTokens] = useState(initialTokens);
  const [newToken, setNewToken] = useState("");
  const [name, setName] = useState("Draft writer token");

  async function refresh() {
    const response = await fetch("/api/mcp/tokens");
    const data = await response.json();
    setTokens(data.tokens || []);
  }

  async function create() {
    const response = await fetch("/api/mcp/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await response.json();
    if (response.ok) {
      setNewToken(data.token);
      await refresh();
    }
  }

  async function toggle(token: McpTokenRow) {
    await fetch(`/api/mcp/tokens/${token.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !token.enabled }),
    });
    await refresh();
  }

  return (
    <div className="grid-2">
      <section className="panel panel-pad stack">
        <div className="button-row" style={{ justifyContent: "space-between" }}>
          <strong>Tokens</strong>
          <KeyRound size={18} />
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Last used</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {tokens.map((token) => (
              <tr key={token.id}>
                <td>{token.name}</td>
                <td><span className={`badge ${token.enabled ? "pass" : "warn"}`}>{token.enabled ? "Enabled" : "Disabled"}</span></td>
                <td>{token.lastUsedAt ? new Date(token.lastUsedAt).toLocaleString() : "Never"}</td>
                <td>
                  <button className="btn" type="button" onClick={() => toggle(token)}>
                    {token.enabled ? "Disable" : "Enable"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="panel panel-pad stack">
        <strong>Create content + funnel token</strong>
        <label className="field">
          <span>Name</span>
          <input className="input" value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <button className="btn primary" type="button" onClick={create}>
          <Plus size={16} />
          Create Token
        </button>
        {newToken ? (
          <div className="notice">
            <strong>Token shown once</strong>
            <pre style={{ whiteSpace: "pre-wrap" }}>{newToken}</pre>
          </div>
        ) : null}
        <div className="notice">
          MCP can read blogs/articles/funnels, create or update article drafts, create/update/archive funnels, and add placement rules.
          Publish and deploy permissions are intentionally absent.
        </div>
      </section>
    </div>
  );
}
