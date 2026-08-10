"use client";

import { useState } from "react";
import { Power, PowerOff, Send, Trash2, Webhook } from "lucide-react";
import { CopyValue } from "@/components/admin/CopyValue";

type BlogOption = { id: string; name: string };
type OutboundWebhookRow = {
  id: string;
  blogId?: string | null;
  blog?: { id: string; name: string; slug: string } | null;
  name: string;
  enabled: boolean;
  url: string;
  method: "POST" | "PUT" | "PATCH";
  headersText: string;
  signingSecret: string;
  recentDeliveries?: Array<{
    id: string;
    status: string;
    attempts: number;
    responseStatus?: number | null;
    lastError?: string | null;
    createdAt: string;
  }>;
};

type WebhookMethod = "POST" | "PUT" | "PATCH";
type WebhookForm = {
  blogId: string;
  name: string;
  url: string;
  method: WebhookMethod;
  enabled: boolean;
  headersText: string;
  signingSecret: string;
};

const emptyForm: WebhookForm = {
  blogId: "",
  name: "",
  url: "",
  method: "POST",
  enabled: true,
  headersText: "",
  signingSecret: "",
};

export function OutboundWebhookManager({
  initialBlogs,
  initialWebhooks,
}: {
  initialBlogs: BlogOption[];
  initialWebhooks: OutboundWebhookRow[];
}) {
  const [blogs] = useState(initialBlogs);
  const [webhooks, setWebhooks] = useState(initialWebhooks);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState("");

  async function refresh() {
    const response = await fetch("/api/outbound-webhooks");
    const data = await response.json();
    setWebhooks(data.webhooks || []);
  }

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    try {
      const payload = {
        blogId: form.blogId || null,
        name: form.name,
        enabled: form.enabled,
        url: form.url,
        method: form.method,
        headers: parseHeaderText(form.headersText),
        signingSecret: form.signingSecret || undefined,
      };
      const response = await fetch("/api/outbound-webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error || "Webhook could not be created.");
        return;
      }
      setForm(emptyForm);
      await refresh();
      setMessage(`Created ${data.webhook.name}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Webhook could not be created.");
    }
  }

  async function toggle(webhook: OutboundWebhookRow) {
    const response = await fetch(`/api/outbound-webhooks/${webhook.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !webhook.enabled }),
    });
    if (response.ok) {
      setWebhooks((current) =>
        current.map((item) => (item.id === webhook.id ? { ...item, enabled: !item.enabled } : item))
      );
    }
  }

  async function test(webhook: OutboundWebhookRow) {
    setMessage("");
    const response = await fetch(`/api/outbound-webhooks/${webhook.id}/test`, { method: "POST" });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "Test send failed.");
      return;
    }
    setMessage(`Test sent to ${webhook.name}: HTTP ${data.result.status}.`);
  }

  async function remove(webhook: OutboundWebhookRow) {
    if (!window.confirm(`Delete ${webhook.name}?`)) return;
    const response = await fetch(`/api/outbound-webhooks/${webhook.id}`, { method: "DELETE" });
    if (response.ok) {
      setWebhooks((current) => current.filter((item) => item.id !== webhook.id));
      setMessage(`Deleted ${webhook.name}.`);
    }
  }

  return (
    <section className="panel panel-pad stack" style={{ marginTop: 16 }}>
      <div>
        <p className="eyebrow">Lead forwarding</p>
        <h2 className="page-title" style={{ fontSize: 22 }}>Outbound Lead Webhooks</h2>
      </div>
      <div className="notice">
        Each blog can forward captured leads to its own webhook destination. Global destinations receive
        leads from every blog.
      </div>

      <form className="stack" onSubmit={create}>
        <div className="grid-4">
          <label className="field">
            <span>Blog</span>
            <select className="select" value={form.blogId} onChange={(event) => setForm({ ...form, blogId: event.target.value })}>
              <option value="">Global</option>
              {blogs.map((blog) => (
                <option key={blog.id} value={blog.id}>
                  {blog.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Name</span>
            <input className="input" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </label>
          <label className="field">
            <span>Method</span>
            <select
              className="select"
              value={form.method}
              onChange={(event) => setForm({ ...form, method: event.target.value as WebhookMethod })}
            >
              <option>POST</option>
              <option>PUT</option>
              <option>PATCH</option>
            </select>
          </label>
          <label className="field">
            <span>Enabled</span>
            <select
              className="select"
              value={form.enabled ? "yes" : "no"}
              onChange={(event) => setForm({ ...form, enabled: event.target.value === "yes" })}
            >
              <option value="yes">Enabled</option>
              <option value="no">Disabled</option>
            </select>
          </label>
        </div>
        <label className="field">
          <span>Destination URL</span>
          <input
            className="input"
            required
            type="url"
            placeholder="https://hooks.example.com/lead"
            value={form.url}
            onChange={(event) => setForm({ ...form, url: event.target.value })}
          />
        </label>
        <div className="grid-2">
          <label className="field">
            <span>Custom headers</span>
            <textarea
              className="textarea"
              placeholder="Authorization: Bearer token"
              value={form.headersText}
              onChange={(event) => setForm({ ...form, headersText: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Signing secret</span>
            <textarea
              className="textarea"
              placeholder="Leave blank to generate one"
              value={form.signingSecret}
              onChange={(event) => setForm({ ...form, signingSecret: event.target.value })}
            />
          </label>
        </div>
        <button className="btn primary" type="submit">
          <Webhook size={16} />
          Create Webhook
        </button>
      </form>

      {message ? <div className="notice">{message}</div> : null}

      <div className="grid-2">
        {webhooks.map((webhook) => (
          <div className="panel panel-pad stack" key={webhook.id} style={{ boxShadow: "none" }}>
            <div className="button-row" style={{ justifyContent: "space-between" }}>
              <div>
                <strong>{webhook.name}</strong>
                <div className="muted">{webhook.blog?.name || "Global"}</div>
              </div>
              <span className={`badge ${webhook.enabled ? "pass" : "warn"}`}>
                {webhook.enabled ? "Enabled" : "Disabled"}
              </span>
            </div>
            <CopyValue label="Destination URL" value={webhook.url} />
            <CopyValue label="Signing secret" value={webhook.signingSecret} />
            <CopyValue
              label="Receiver signature"
              multiline
              value={[
                "X-AEO-Timestamp: <unix timestamp seconds>",
                "X-AEO-Signature: hmac_sha256(secret, timestamp + '.' + rawBody)",
              ].join("\n")}
            />
            <CopyValue label="Custom headers" multiline value={webhook.headersText || "None"} />
            <CopyValue label="Sample payload" multiline value={samplePayload(webhook)} />
            <div className="button-row">
              <button className="btn" type="button" onClick={() => test(webhook)}>
                <Send size={16} />
                Test
              </button>
              <button className="btn" type="button" onClick={() => toggle(webhook)}>
                {webhook.enabled ? <PowerOff size={16} /> : <Power size={16} />}
                {webhook.enabled ? "Disable" : "Enable"}
              </button>
              <button className="btn danger" type="button" onClick={() => remove(webhook)}>
                <Trash2 size={16} />
                Delete
              </button>
            </div>
            {webhook.recentDeliveries?.length ? (
              <div className="muted">
                Last delivery: {webhook.recentDeliveries[0].status}
                {webhook.recentDeliveries[0].responseStatus ? ` / HTTP ${webhook.recentDeliveries[0].responseStatus}` : ""}
              </div>
            ) : null}
          </div>
        ))}
        {webhooks.length === 0 ? <div className="notice">No outbound lead webhooks yet.</div> : null}
      </div>
    </section>
  );
}

function parseHeaderText(value: string) {
  const headers: Record<string, string> = {};
  for (const rawLine of value.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const index = line.indexOf(":");
    if (index <= 0) throw new Error(`Invalid header line: ${line}`);
    headers[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return headers;
}

function samplePayload(webhook: OutboundWebhookRow) {
  return JSON.stringify(
    {
      event: "lead.created",
      lead: {
        id: "lead_id",
        blogId: webhook.blogId,
        blogName: webhook.blog?.name || "Global",
        email: "lead@example.com",
        phone: "+15555550123",
        name: "Example Lead",
        fields: {},
        answers: {},
        result: {},
        resultText: "Lead result text",
        sourceUrl: "https://example.com/article/",
        eventId: "browser_event_id",
        createdAt: new Date(0).toISOString(),
      },
    },
    null,
    2
  );
}
