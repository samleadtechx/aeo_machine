"use client";

import { useState } from "react";
import { Check, Copy, Info, KeyRound, Plus, X } from "lucide-react";

type McpTokenRow = {
  id: string;
  name: string;
  enabled: boolean;
  blogScopeJson?: unknown;
  permissionsJson: unknown;
  lastUsedAt?: string | null;
  createdAt: string;
};

type BlogOption = {
  id: string;
  name: string;
};

export function McpTokenManager({
  initialTokens,
  initialBlogs,
  endpointUrl,
}: {
  initialTokens: McpTokenRow[];
  initialBlogs: BlogOption[];
  endpointUrl: string;
}) {
  const [tokens, setTokens] = useState(initialTokens);
  const [newToken, setNewToken] = useState("");
  const [name, setName] = useState("Draft writer token");
  const [blogId, setBlogId] = useState(initialBlogs[0]?.id || "");
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  async function refresh() {
    const response = await fetch("/api/mcp/tokens");
    const data = await response.json();
    setTokens(data.tokens || []);
  }

  async function create() {
    const response = await fetch("/api/mcp/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        blogScopeJson: blogId ? { blogIds: [blogId] } : null,
      }),
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
              <th>Scope</th>
              <th>Status</th>
              <th>Last used</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {tokens.map((token) => (
              <tr key={token.id}>
                <td>{token.name}</td>
                <td>{scopeLabel(token.blogScopeJson, initialBlogs)}</td>
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
        <label className="field">
          <span>Blog scope</span>
          <select className="select" value={blogId} onChange={(event) => setBlogId(event.target.value)}>
            {initialBlogs.map((blog) => (
              <option key={blog.id} value={blog.id}>
                {blog.name}
              </option>
            ))}
            <option value="">All blogs</option>
          </select>
        </label>
        <button className="btn primary" type="button" onClick={create}>
          <Plus size={16} />
          Create Token
        </button>
        {newToken ? (
          <div className="notice stack">
            <strong>Token shown once</strong>
            <pre style={{ whiteSpace: "pre-wrap" }}>{newToken}</pre>
            <button className="btn" type="button" onClick={() => setInstructionsOpen(true)}>
              <Info size={16} />
              Agent Copy Instructions
            </button>
          </div>
        ) : null}
        <div className="notice">
          MCP can read blogs/articles/funnels/media, upload real images for funnel choices, create or update
          article drafts, create/update/archive funnels, and add placement rules.
          Publish and deploy permissions are intentionally absent.
        </div>
        <button className="btn" type="button" onClick={() => setInstructionsOpen(true)}>
          <Info size={16} />
          Show Agent Instructions
        </button>
      </section>
      {instructionsOpen ? (
        <McpInstructionsModal
          endpointUrl={endpointUrl}
          token={newToken}
          blogs={initialBlogs}
          selectedBlogId={blogId}
          onClose={() => setInstructionsOpen(false)}
        />
      ) : null}
    </div>
  );
}

function McpInstructionsModal({
  endpointUrl,
  token,
  blogs,
  selectedBlogId,
  onClose,
}: {
  endpointUrl: string;
  token: string;
  blogs: BlogOption[];
  selectedBlogId: string;
  onClose: () => void;
}) {
  const [manualToken, setManualToken] = useState(token);
  const [copied, setCopied] = useState(false);
  const selectedBlog = blogs.find((blog) => blog.id === selectedBlogId);
  const instructions = mcpAgentInstructions({
    endpointUrl,
    token: manualToken.trim() || "PASTE_MCP_TOKEN_HERE",
    selectedBlog,
  });

  async function copyInstructions() {
    await navigator.clipboard.writeText(instructions);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="mcp-instructions-title">
        <div className="modal-head">
          <div>
            <p className="eyebrow">MCP agent setup</p>
            <h2 id="mcp-instructions-title">Copy-paste instructions</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close instructions">
            <X size={18} />
          </button>
        </div>
        <div className="stack" style={{ padding: 18 }}>
          <label className="field">
            <span>Token for examples</span>
            <input
              className="input"
              value={manualToken}
              placeholder="Paste existing token here, or create a new one first"
              onChange={(event) => setManualToken(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Instructions to paste into another agent</span>
            <textarea className="textarea" readOnly value={instructions} style={{ minHeight: 420 }} />
          </label>
          <div className="button-row" style={{ justifyContent: "flex-end" }}>
            <button className="btn" type="button" onClick={onClose}>
              Close
            </button>
            <button className="btn primary" type="button" onClick={copyInstructions}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? "Copied" : "Copy Instructions"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function mcpAgentInstructions({
  endpointUrl,
  token,
  selectedBlog,
}: {
  endpointUrl: string;
  token: string;
  selectedBlog?: BlogOption;
}) {
  const blogHint = selectedBlog
    ? `Default blog: ${selectedBlog.name}\nDefault blogId: ${selectedBlog.id}`
    : "Use list_blogs first, then choose a blogId.";

  return `You have access to my AEO Machine MCP HTTP endpoint.

Endpoint:
${endpointUrl}

Authentication:
Use this HTTP header on every request:
Authorization: Bearer ${token}
Content-Type: application/json

${blogHint}

Important:
- This is an HTTP JSON tool endpoint at /api/mcp.
- Send POST requests with {"tool":"tool_name","arguments":{...}}.
- Do not publish or deploy articles from MCP. The endpoint is for draft/content/funnel control.

Quick health test:
curl -X POST "${endpointUrl}" \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"tool":"list_blogs","arguments":{}}'

Available tools:
- list_blogs
- get_blog
- list_articles
- get_article
- create_article_draft
- update_article_draft
- list_funnels
- get_funnel
- list_media_assets
- upload_media_asset
- create_funnel
- update_funnel
- set_funnel_status
- archive_funnel
- add_funnel_placement_rule
- get_seo_requirements

Upload a real funnel option image:
Use this when you generate or source a real image for an answer choice. The response returns imageMediaId.

curl -X POST "${endpointUrl}" \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "tool": "upload_media_asset",
    "arguments": {
      "blogId": "${selectedBlog?.id || "BLOG_ID_FROM_list_blogs"}",
      "filename": "actively-searching.png",
      "mimeType": "image/png",
      "altText": "Person actively searching on a laptop",
      "optionLabel": "I am actively searching",
      "optionValue": "actively_searching",
      "dataBase64": "BASE64_IMAGE_BYTES_HERE"
    }
  }'

You can also upload by URL:
curl -X POST "${endpointUrl}" \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "tool": "upload_media_asset",
    "arguments": {
      "blogId": "${selectedBlog?.id || "BLOG_ID_FROM_list_blogs"}",
      "sourceUrl": "https://example.com/generated-image.png",
      "filename": "open-to-offers.png",
      "altText": "Professional reviewing new offers",
      "optionLabel": "I am open to new offers",
      "optionValue": "open_to_offers"
    }
  }'

Use returned images in funnel config:
Set each option.imageMediaId to the uploaded media ID.
Call list_media_assets first when you want to reuse an existing uploaded image instead of creating a new one.

Create article draft example:
curl -X POST "${endpointUrl}" \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "tool": "create_article_draft",
    "arguments": {
      "blogId": "${selectedBlog?.id || "BLOG_ID_FROM_list_blogs"}",
      "title": "Example Article Draft",
      "slug": "example-article-draft",
      "markdown": "# Example Article Draft\\n\\nWrite the article body here.",
      "tags": ["MCP"],
      "metaTitle": "Example Article Draft",
      "metaDescription": "A short SEO description between 90 and 165 characters for this article draft."
    }
  }'

Create funnel example:
curl -X POST "${endpointUrl}" \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "tool": "create_funnel",
    "arguments": {
      "blogId": "${selectedBlog?.id || "BLOG_ID_FROM_list_blogs"}",
      "name": "Lead Value Quiz",
      "slug": "lead-value-quiz",
      "status": "DRAFT",
      "configJson": {
        "intro": {
          "kicker": "Lead Value Calculator",
          "title": "Check how many booked jobs you may be leaving behind.",
          "subtitle": "Answer 4 quick questions and get a simple estimate.",
          "startButton": "Start"
        },
        "questions": [
          {
            "id": "situation",
            "kicker": "Current situation",
            "title": "What best describes your current situation?",
            "subtitle": "Choose the closest match.",
            "options": [
              {
                "label": "I am actively searching",
                "value": "actively_searching",
                "imageMediaId": "MEDIA_ID_FROM_upload_media_asset"
              },
              {
                "label": "I am open to new offers",
                "value": "open_to_offers",
                "imageMediaId": "MEDIA_ID_FROM_upload_media_asset"
              }
            ]
          }
        ],
        "result": {
          "type": "formula",
          "formulaKey": "missed_call_loss_v1",
          "currency": "USD",
          "constants": {
            "missedCallsRegular": 6,
            "missedCallsFloor": 1,
            "highValuePerMissedCall": 450,
            "lowValuePerMissedCall": 300,
            "lossFactor": 0.6,
            "subscriptionComparisonMonthly": 49
          }
        },
        "leadFields": [
          {
            "name": "email",
            "type": "email",
            "required": true
          }
        ],
        "submit": {
          "buttonLabel": "Get my result",
          "successMode": "message",
          "redirectUrl": null
        }
      },
      "styleJson": {
        "primaryColor": "#2563eb",
        "accentColor": "#0f766e"
      }
    }
  }'
`;
}

function scopeLabel(scope: unknown, blogs: BlogOption[]) {
  const blogIds = scopedBlogIds(scope);
  if (!blogIds) return "All blogs";
  return blogIds
    .map((id) => blogs.find((blog) => blog.id === id)?.name || id)
    .join(", ");
}

function scopedBlogIds(scope: unknown) {
  if (!scope || typeof scope !== "object") return null;
  const blogIds = (scope as { blogIds?: unknown }).blogIds;
  if (!Array.isArray(blogIds) || blogIds.length === 0) return null;
  return blogIds.map(String);
}
