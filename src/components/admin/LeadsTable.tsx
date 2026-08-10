"use client";

import { useMemo, useState } from "react";
import { Download, Mail, Phone, Send, ThumbsDown, ThumbsUp, User } from "lucide-react";

type LeadRow = {
  id: string;
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  resultText?: string | null;
  answersJson?: unknown;
  resultJson?: unknown;
  sourceUrl?: string | null;
  eventId?: string | null;
  qualifiedStatus: string;
  createdAt: string;
  blog: { name: string };
  funnel?: { name: string } | null;
  article?: { title: string } | null;
};

export function LeadsTable({ initialLeads }: { initialLeads: LeadRow[] }) {
  const [leads, setLeads] = useState(initialLeads);
  const [selectedId, setSelectedId] = useState(initialLeads[0]?.id || "");
  const [message, setMessage] = useState("");
  const selected = useMemo(
    () => leads.find((lead) => lead.id === selectedId) || leads[0],
    [leads, selectedId]
  );
  const totals = useMemo(() => ({
    qualified: leads.filter((lead) => lead.qualifiedStatus === "QUALIFIED").length,
    unknown: leads.filter((lead) => lead.qualifiedStatus === "UNKNOWN").length,
    unqualified: leads.filter((lead) => lead.qualifiedStatus === "UNQUALIFIED").length,
  }), [leads]);

  async function mark(id: string, qualifiedStatus: string) {
    const response = await fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qualifiedStatus }),
    });
    if (response.ok) {
      setLeads((current) =>
        current.map((lead) => (lead.id === id ? { ...lead, qualifiedStatus } : lead))
      );
    }
  }

  async function resendWebhooks(id: string) {
    setMessage("");
    const response = await fetch(`/api/leads/${id}/resend-webhooks`, { method: "POST" });
    const data = await response.json();
    setMessage(response.ok ? `Queued ${data.queued} outbound webhook deliveries.` : data.error || "Webhook resend failed.");
  }

  function exportCsv() {
    const rows = [
      ["createdAt", "blog", "funnel", "email", "phone", "name", "qualifiedStatus", "sourceUrl", "eventId"],
      ...leads.map((lead) => [
        lead.createdAt,
        lead.blog.name,
        lead.funnel?.name || "",
        lead.email || "",
        lead.phone || "",
        lead.name || "",
        lead.qualifiedStatus,
        lead.sourceUrl || "",
        lead.eventId || "",
      ]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "aeo-machine-leads.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="leads-workspace">
      <aside className="panel panel-pad leads-rail">
        <div className="leads-rail-head">
          <div>
            <p className="eyebrow">Inbox</p>
            <strong>{leads.length} leads</strong>
            <div className="muted">{selected ? `Viewing ${leadLabel(selected)}` : "No lead selected"}</div>
          </div>
          <button className="btn" type="button" onClick={exportCsv}>
            <Download size={16} />
            Export
          </button>
        </div>

        <div className="lead-stats">
          <div className="lead-stat">
            <strong>{totals.qualified}</strong>
            <span>Qualified</span>
          </div>
          <div className="lead-stat">
            <strong>{totals.unknown}</strong>
            <span>Unknown</span>
          </div>
          <div className="lead-stat">
            <strong>{totals.unqualified}</strong>
            <span>Rejected</span>
          </div>
        </div>

        {message ? <div className="notice compact-notice">{message}</div> : null}

        <div className="lead-list">
          {leads.map((lead) => {
            const isSelected = lead.id === selected?.id;
            return (
              <button
                key={lead.id}
                className={`lead-list-item ${isSelected ? "active" : ""}`}
                type="button"
                onClick={() => setSelectedId(lead.id)}
              >
                <div className="lead-list-title">
                  <strong>{leadLabel(lead)}</strong>
                  <span className={`badge ${lead.qualifiedStatus === "QUALIFIED" ? "pass" : lead.qualifiedStatus === "UNQUALIFIED" ? "fail" : "warn"}`}>
                    {lead.qualifiedStatus}
                  </span>
                </div>
                <div className="lead-list-meta">
                  <span>{lead.blog.name}</span>
                  <span>{lead.funnel?.name || "No funnel"}</span>
                </div>
                <div className="lead-list-footer">{new Date(lead.createdAt).toLocaleString()}</div>
              </button>
            );
          })}
          {leads.length === 0 ? (
            <div className="lead-empty-state">
              <User size={22} />
              <strong>No leads yet</strong>
              <span className="muted">Generated PHP submit handlers will post here after a static site build is deployed.</span>
            </div>
          ) : null}
        </div>
      </aside>

      <section className="leads-main">
        {selected ? (
          <div className="panel panel-pad stack">
            <div className="lead-detail-head">
              <div>
                <p className="eyebrow">Lead detail</p>
                <h2>{leadLabel(selected)}</h2>
                <div className="muted">{new Date(selected.createdAt).toLocaleString()}</div>
              </div>
              <span className={`badge ${selected.qualifiedStatus === "QUALIFIED" ? "pass" : selected.qualifiedStatus === "UNQUALIFIED" ? "fail" : "warn"}`}>
                {selected.qualifiedStatus}
              </span>
            </div>

            <div className="lead-actions">
              <button className="btn" type="button" onClick={() => mark(selected.id, "QUALIFIED")}>
                <ThumbsUp size={16} />
                Qualified
              </button>
              <button className="btn" type="button" onClick={() => mark(selected.id, "UNQUALIFIED")}>
                <ThumbsDown size={16} />
                Unqualified
              </button>
              <button className="btn" type="button" onClick={() => resendWebhooks(selected.id)}>
                <Send size={16} />
                Resend webhooks
              </button>
            </div>

            <div className="lead-detail-grid">
              <div className="lead-detail-block">
                <span className="label">Contact</span>
                <div className="lead-contact-line"><Mail size={15} /> {selected.email || "No email"}</div>
                <div className="lead-contact-line"><Phone size={15} /> {selected.phone || "No phone"}</div>
                <div className="lead-contact-line"><User size={15} /> {selected.name || "No name"}</div>
              </div>
              <div className="lead-detail-block">
                <span className="label">Source</span>
                <strong>{selected.blog.name}</strong>
                <div className="muted">{selected.funnel?.name || "No funnel"} / {selected.article?.title || "No article"}</div>
                {selected.sourceUrl ? <a href={selected.sourceUrl} target="_blank" rel="noreferrer">{selected.sourceUrl}</a> : <span className="muted">No source URL</span>}
              </div>
            </div>

            <div className="lead-result-box">
              <span className="label">Answers / result</span>
              <pre>{leadResult(selected)}</pre>
            </div>
          </div>
        ) : (
          <div className="panel panel-pad lead-empty-state">
            <User size={22} />
            <strong>No lead selected</strong>
            <span className="muted">New leads will appear here after deployed funnels start receiving submissions.</span>
          </div>
        )}
      </section>
    </div>
  );
}

function leadLabel(lead: LeadRow) {
  return lead.email || lead.phone || lead.name || "Anonymous";
}

function leadResult(lead: LeadRow) {
  return lead.resultText || JSON.stringify(lead.resultJson || lead.answersJson || {}, null, 2);
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}
