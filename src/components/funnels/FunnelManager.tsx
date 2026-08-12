"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Save, SplitSquareVertical, Trash2, X } from "lucide-react";
import { defaultFunnelConfig } from "@/modules/forms/default-funnel";

type BlogOption = { id: string; name: string };
type PlacementRuleRow = {
  id: string;
  name: string;
  placement: string;
  matchMode: string;
  tagSlugsJson: unknown;
  enabled: boolean;
  priority: number;
};
type FunnelRow = {
  id: string;
  blogId: string;
  name: string;
  slug: string;
  status: string;
  configJson: unknown;
  styleJson?: Record<string, unknown>;
  blog?: { name: string; slug: string };
  placementRules?: PlacementRuleRow[];
  _count?: { leads: number };
};

type RuleForm = {
  name: string;
  enabled: boolean;
  matchMode: string;
  tagSlugs: string;
  placement: string;
  priority: number;
};

const emptyRuleForm: RuleForm = {
  name: "Article quiz placement",
  enabled: true,
  matchMode: "ANY_TAG",
  tagSlugs: "",
  placement: "AFTER_INTRO",
  priority: 10,
};

export function FunnelManager({
  initialBlogs,
  initialFunnels,
}: {
  initialBlogs: BlogOption[];
  initialFunnels: FunnelRow[];
}) {
  const [blogs] = useState(initialBlogs);
  const [funnels, setFunnels] = useState(initialFunnels);
  const [selectedId, setSelectedId] = useState(initialFunnels[0]?.id || "");
  const selected = useMemo(() => funnels.find((funnel) => funnel.id === selectedId), [funnels, selectedId]);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(() => funnelToForm(selected, blogs[0]?.id || ""));
  const [rule, setRule] = useState<RuleForm>(emptyRuleForm);
  const [editingRuleId, setEditingRuleId] = useState("");

  async function refresh(selectId = selectedId) {
    const all: FunnelRow[] = [];
    for (const blog of blogs) {
      const response = await fetch(`/api/blogs/${blog.id}/funnels`);
      const data = await response.json();
      all.push(...(data.funnels || []));
    }
    const nextId = selectId || all[0]?.id || "";
    const nextFunnel = all.find((funnel) => funnel.id === nextId);
    setFunnels(all);
    setSelectedId(nextId);
    if (nextFunnel) setForm(funnelToForm(nextFunnel, nextFunnel.blogId));
  }

  function choose(funnel: FunnelRow) {
    setSelectedId(funnel.id);
    setForm(funnelToForm(funnel, funnel.blogId));
    resetRuleForm();
    setMessage("");
  }

  function createNew() {
    setSelectedId("");
    setForm(funnelToForm(undefined, blogs[0]?.id || ""));
    resetRuleForm();
    setMessage("");
  }

  async function save() {
    setMessage("");
    let configJson: unknown;
    let styleJson: unknown;
    try {
      configJson = JSON.parse(form.configJson);
      styleJson = JSON.parse(form.styleJson);
    } catch {
      setMessage("Config and style must be valid JSON.");
      return;
    }
    const response = await fetch(form.id ? `/api/funnels/${form.id}` : `/api/blogs/${form.blogId}/funnels`, {
      method: form.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        slug: form.slug,
        status: form.status,
        configJson,
        styleJson,
        trackingJson: {},
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "Save failed.");
      return;
    }
    const savedId = data.funnel?.id || form.id;
    await refresh(savedId);
    setMessage("Funnel saved.");
  }

  async function saveRule() {
    if (!form.id) return;
    setMessage("");
    const priority = Number(rule.priority);
    const response = await fetch(editingRuleId ? `/api/funnels/${form.id}/placement-rules/${editingRuleId}` : `/api/funnels/${form.id}/placement-rules`, {
      method: editingRuleId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...rule,
        priority: Number.isFinite(priority) ? priority : 100,
        tagSlugs: rule.tagSlugs.split(",").map((tag) => tag.trim()).filter(Boolean),
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "Rule failed.");
      return;
    }
    await refresh(form.id);
    const wasEditing = Boolean(editingRuleId);
    resetRuleForm();
    setMessage(wasEditing ? "Placement rule updated." : "Placement rule added.");
  }

  function editRule(item: PlacementRuleRow) {
    setEditingRuleId(item.id);
    setRule({
      name: item.name,
      enabled: item.enabled,
      matchMode: item.matchMode,
      tagSlugs: Array.isArray(item.tagSlugsJson) ? item.tagSlugsJson.join(", ") : "",
      placement: item.placement,
      priority: item.priority,
    });
    setMessage("");
  }

  function resetRuleForm() {
    setEditingRuleId("");
    setRule(emptyRuleForm);
  }

  async function removeRule(item: PlacementRuleRow) {
    if (!form.id) return;
    const tags = Array.isArray(item.tagSlugsJson) && item.tagSlugsJson.length ? item.tagSlugsJson.join(", ") : "all articles";
    const confirmed = window.confirm(`Remove placement rule "${item.name}" for ${tags}?`);
    if (!confirmed) return;
    const response = await fetch(`/api/funnels/${form.id}/placement-rules/${item.id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(data.error || "Rule remove failed.");
      return;
    }
    await refresh(form.id);
    resetRuleForm();
    setMessage("Placement rule removed.");
  }

  async function removeFunnel(funnel: FunnelRow) {
    const confirmed = window.confirm(`Remove funnel "${funnel.name}"? Existing leads stay saved, but placement rules for this funnel will be removed.`);
    if (!confirmed) return;
    const response = await fetch(`/api/funnels/${funnel.id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(data.error || "Funnel remove failed.");
      return;
    }
    await refresh("");
    setSelectedId("");
    setForm(funnelToForm(undefined, blogs[0]?.id || ""));
    setMessage("Funnel removed.");
  }

  return (
    <div className="funnel-workspace">
      <aside className="panel panel-pad funnel-rail">
        <div className="funnel-rail-head">
          <div>
            <p className="eyebrow">Library</p>
            <strong>Funnels</strong>
            <div className="muted">{selected ? `Editing ${selected.name}` : "New funnel"}</div>
          </div>
          <button className="btn primary" type="button" onClick={createNew}>
            <Plus size={16} />
            New
          </button>
        </div>
        <label className="field">
          <span>Blog</span>
          <select className="select" value={form.blogId} onChange={(event) => setForm({ ...form, blogId: event.target.value })}>
            {blogs.map((blog) => (
              <option key={blog.id} value={blog.id}>
                {blog.name}
              </option>
            ))}
          </select>
        </label>
        <div className="funnel-list">
          {funnels.map((funnel) => {
            const isSelected = funnel.id === selectedId;
            const ruleCount = funnel.placementRules?.length || 0;
            return (
              <button
                key={funnel.id}
                className={`funnel-list-item ${isSelected ? "active" : ""}`}
                type="button"
                onClick={() => choose(funnel)}
              >
                <div className="funnel-list-title">
                  <strong>{funnel.name}</strong>
                  <span className={`badge ${funnel.status === "ACTIVE" ? "pass" : funnel.status === "ARCHIVED" ? "fail" : "warn"}`}>{funnel.status}</span>
                </div>
                <div className="funnel-list-url">/{funnel.slug}</div>
                <div className="funnel-list-meta">
                  <span>{funnel.blog?.name || "Selected blog"}</span>
                  <span>{funnel._count?.leads || 0} leads</span>
                  <span>{ruleCount} rules</span>
                </div>
                <div className="list-item-actions">
                  <span className="muted">/{funnel.slug}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    className="mini-danger-action"
                    onClick={(event) => {
                      event.stopPropagation();
                      void removeFunnel(funnel);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      event.stopPropagation();
                      void removeFunnel(funnel);
                    }}
                  >
                    <Trash2 size={13} />
                    Remove
                  </span>
                </div>
              </button>
            );
          })}
          {funnels.length === 0 ? (
            <div className="funnel-empty-state">
              <SplitSquareVertical size={22} />
              <strong>No funnels yet</strong>
              <span className="muted">Create a quiz funnel, then configure placement rules after saving.</span>
            </div>
          ) : null}
        </div>
      </aside>

      <section className="funnel-main stack">
        <div className="panel panel-pad stack">
          <div className="button-row" style={{ justifyContent: "space-between" }}>
            <strong>Quiz configuration</strong>
            <button className="btn primary" type="button" onClick={save}>
              <Save size={16} />
              Save Funnel
            </button>
          </div>
          <div className="grid-3">
            <label className="field">
              <span>Name</span>
              <input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </label>
            <label className="field">
              <span>Slug</span>
              <input className="input" value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} />
            </label>
            <label className="field">
              <span>Status</span>
              <select className="select" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                <option value="DRAFT">Draft</option>
                <option value="ACTIVE">Active</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </label>
          </div>
          <label className="field">
            <span>Config JSON</span>
            <textarea className="textarea" style={{ minHeight: 360 }} value={form.configJson} onChange={(event) => setForm({ ...form, configJson: event.target.value })} />
          </label>
          <label className="field">
            <span>Style JSON</span>
            <textarea className="textarea" value={form.styleJson} onChange={(event) => setForm({ ...form, styleJson: event.target.value })} />
          </label>
          {message ? <div className="notice">{message}</div> : null}
        </div>

        <div className="panel panel-pad stack">
          <div className="button-row" style={{ justifyContent: "space-between" }}>
            <strong>Placement rules</strong>
            <SplitSquareVertical size={18} />
          </div>
          {selected?.placementRules?.length ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Tags</th>
                  <th>Mode</th>
                  <th>Placement</th>
                  <th>Priority</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {selected.placementRules.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{Array.isArray(item.tagSlugsJson) && item.tagSlugsJson.length ? item.tagSlugsJson.join(", ") : "Any article"}</td>
                    <td>{item.matchMode === "ALL_TAGS" ? "All tags" : "Any tag"}</td>
                    <td>{item.placement}</td>
                    <td>{item.priority}</td>
                    <td>
                      <div className="button-row">
                        <button className="btn icon-btn" type="button" title="Edit rule" onClick={() => editRule(item)}>
                          <Pencil size={15} />
                        </button>
                        <button className="btn icon-btn danger" type="button" title="Remove rule" onClick={() => void removeRule(item)}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">No placement rules yet.</p>
          )}
          <div className="notice compact-notice">
            Published articles show one embedded funnel. Leave tag slugs blank to match every article, or use exact article tags like virtual-receptionist, cost. Active rules from all funnels are compared together; lower priority numbers win. Rebuild or redeploy the blog after changing rules.
          </div>
          {editingRuleId ? (
            <div className="button-row">
              <span className="badge warn">Editing rule</span>
              <button className="btn" type="button" onClick={resetRuleForm}>
                <X size={16} />
                Cancel
              </button>
            </div>
          ) : null}
          <div className="grid-4">
            <label className="field">
              <span>Rule name</span>
              <input className="input" value={rule.name} onChange={(event) => setRule({ ...rule, name: event.target.value })} />
            </label>
            <label className="field">
              <span>Tag slugs</span>
              <input
                className="input"
                placeholder="Blank = all articles"
                value={rule.tagSlugs}
                onChange={(event) => setRule({ ...rule, tagSlugs: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Match mode</span>
              <select className="select" value={rule.matchMode} onChange={(event) => setRule({ ...rule, matchMode: event.target.value })}>
                <option value="ANY_TAG">Any tag</option>
                <option value="ALL_TAGS">All tags</option>
              </select>
            </label>
            <label className="field">
              <span>Placement</span>
              <select className="select" value={rule.placement} onChange={(event) => setRule({ ...rule, placement: event.target.value })}>
                <option value="AFTER_INTRO">After intro</option>
                <option value="MIDDLE">Middle</option>
                <option value="BEFORE_CONCLUSION">Before conclusion</option>
                <option value="END">End</option>
              </select>
            </label>
            <label className="field">
              <span>Priority</span>
              <input
                className="input"
                min={0}
                step={1}
                type="number"
                value={rule.priority}
                onChange={(event) => setRule({ ...rule, priority: Number(event.target.value) })}
              />
            </label>
          </div>
          <button className="btn" type="button" disabled={!form.id} onClick={saveRule}>
            {editingRuleId ? <Save size={16} /> : <Plus size={16} />}
            {editingRuleId ? "Update Rule" : "Add Rule"}
          </button>
        </div>
      </section>
    </div>
  );
}

function funnelToForm(funnel: FunnelRow | undefined, blogId: string) {
  return {
    id: funnel?.id,
    blogId: funnel?.blogId || blogId,
    name: funnel?.name || "Lead Value Quiz",
    slug: funnel?.slug || "lead-value-quiz",
    status: funnel?.status || "DRAFT",
    configJson: JSON.stringify(funnel?.configJson || defaultFunnelConfig, null, 2),
    styleJson: JSON.stringify(funnel?.styleJson || { primaryColor: "#2563eb", accentColor: "#0f766e" }, null, 2),
  };
}
