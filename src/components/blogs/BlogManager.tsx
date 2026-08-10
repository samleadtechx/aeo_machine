"use client";

import { useMemo, useState } from "react";
import { Globe2, Plus, Save, Server, TestTube2, Trash2 } from "lucide-react";

type DeploymentTargetRow = {
  id: string;
  type: "SFTP" | "FTP" | "FTPS";
  host: string;
  port: number;
  username: string;
  remoteRootPath: string;
  cleanUrlMode?: "HTML" | "HTACCESS_DIRECTORY";
  phpEnabled?: boolean;
  htaccessEnabled?: boolean;
  lastTestStatus?: string | null;
};

type BlogRow = {
  id: string;
  name: string;
  slug: string;
  baseUrl: string;
  status: "ACTIVE" | "PAUSED";
  domainMode: "SUBFOLDER" | "SUBDOMAIN_ROOT";
  language?: string;
  timezone?: string;
  brandName: string;
  primaryColor: string;
  accentColor: string;
  fontFamily?: string;
  defaultAuthorName: string;
  organizationName?: string | null;
  robotsPolicy?: string;
  indexNowEnabled?: boolean;
  deploymentTargets?: DeploymentTargetRow[];
  _count?: { articles: number; funnels: number; leads: number };
};

type BlogForm = {
  name: string;
  slug: string;
  baseUrl: string;
  status: "ACTIVE" | "PAUSED";
  domainMode: "SUBFOLDER" | "SUBDOMAIN_ROOT";
  language: string;
  timezone: string;
  brandName: string;
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
  defaultAuthorName: string;
  organizationName: string;
  robotsPolicy: string;
  indexNowEnabled: boolean;
};

type DeploymentTargetForm = {
  type: "SFTP" | "FTP" | "FTPS";
  host: string;
  port: number;
  username: string;
  password: string;
  privateKey: string;
  privateKeyPassphrase: string;
  remoteRootPath: string;
  cleanUrlMode: "HTML" | "HTACCESS_DIRECTORY";
  phpEnabled: boolean;
  htaccessEnabled: boolean;
};

const emptyBlog: BlogForm = {
  name: "",
  slug: "",
  baseUrl: "",
  status: "ACTIVE",
  domainMode: "SUBFOLDER",
  language: "en",
  timezone: "America/Chicago",
  brandName: "",
  primaryColor: "#2563eb",
  accentColor: "#0f766e",
  fontFamily: "Inter, ui-sans-serif, system-ui",
  defaultAuthorName: "Editorial Team",
  organizationName: "",
  robotsPolicy: "index,follow",
  indexNowEnabled: false,
};

const emptyDeploymentTarget: DeploymentTargetForm = {
  type: "SFTP",
  host: "",
  port: 22,
  username: "",
  password: "",
  privateKey: "",
  privateKeyPassphrase: "",
  remoteRootPath: "/",
  cleanUrlMode: "HTACCESS_DIRECTORY",
  phpEnabled: true,
  htaccessEnabled: true,
};

export function BlogManager({ initialBlogs }: { initialBlogs: BlogRow[] }) {
  const [blogs, setBlogs] = useState(initialBlogs);
  const [selectedId, setSelectedId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<BlogForm>(emptyBlog);
  const [editForm, setEditForm] = useState<BlogForm>(emptyBlog);
  const [deploymentTarget, setDeploymentTarget] = useState<DeploymentTargetForm>(emptyDeploymentTarget);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const selected = useMemo(() => blogs.find((blog) => blog.id === selectedId), [blogs, selectedId]);
  const savedTarget = selected?.deploymentTargets?.[0];

  async function refresh(nextSelectedId = selectedId) {
    const response = await fetch("/api/blogs");
    const data = await response.json();
    const nextBlogs = data.blogs || [];
    setBlogs(nextBlogs);
    const nextSelected = nextSelectedId
      ? nextBlogs.find((blog: BlogRow) => blog.id === nextSelectedId)
      : undefined;
    setSelectedId(nextSelected?.id || "");
    setEditForm(nextSelected ? blogToForm(nextSelected) : emptyBlog);
    setDeploymentTarget(targetToForm(nextSelected?.deploymentTargets?.[0]));
  }

  async function runBusy(key: string, task: () => Promise<void>) {
    if (busy) return;
    setBusy(key);
    setMessage("");
    try {
      await task();
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    await runBusy("create", async () => {
      const response = await fetch("/api/blogs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error || "Create failed.");
        return;
      }
      setCreateForm(emptyBlog);
      setCreateOpen(false);
      await refresh("");
      setMessage("Blog created. Select it from the list to edit settings.");
    });
  }

  async function saveBlog() {
    if (!selectedId) return;
    await runBusy("save-blog", async () => {
      const response = await fetch(`/api/blogs/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blog: editForm }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error || "Blog save failed.");
        return;
      }
      await refresh(selectedId);
      setMessage("Blog settings saved.");
    });
  }

  async function deleteSelectedBlog() {
    if (!selected) return;
    const confirmed = window.confirm(
      `Delete "${selected.name}" and all related articles, funnels, leads, builds, deployments, webhook endpoints, and FTP settings?`
    );
    if (!confirmed) return;
    await runBusy("delete-blog", async () => {
      const response = await fetch(`/api/blogs/${selected.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error || "Blog delete failed.");
        return;
      }
      await refresh("");
      setMessage("Blog deleted.");
    });
  }

  async function saveDeployment() {
    if (!selectedId) return;
    await runBusy("save-target", async () => {
      const response = await fetch(`/api/blogs/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deploymentTarget }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error || "Deployment target save failed.");
        return;
      }
      await refresh(selectedId);
      setMessage("FTP/SFTP target saved.");
    });
  }

  async function testDeployment() {
    if (!selectedId) return;
    await runBusy("test-target", async () => {
      const response = await fetch(`/api/blogs/${selectedId}/test-deployment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deploymentTarget }),
      });
      const data = await response.json();
      await refresh(selectedId);
      const reusedSavedSecret = Object.values(data.reusedSavedCredentials || {}).some(Boolean);
      const successMessage = reusedSavedSecret
        ? "Connection test passed. Blank secret fields used the saved credentials."
        : savedTarget
          ? "Connection test passed."
          : "Connection test passed. Save the target to use it for deployments.";
      setMessage(response.ok ? successMessage : data.error || "Connection test failed.");
    });
  }

  async function removeDeploymentTarget() {
    if (!selected) return;
    const confirmed = window.confirm(`Remove saved FTP/SFTP settings for "${selected.name}"?`);
    if (!confirmed) return;
    await runBusy("delete-target", async () => {
      const response = await fetch(`/api/blogs/${selected.id}/deployment-target`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error || "Could not remove FTP/SFTP settings.");
        return;
      }
      await refresh(selected.id);
      setDeploymentTarget(emptyDeploymentTarget);
      setMessage("FTP/SFTP settings removed.");
    });
  }

  function updateCreate(next: Partial<BlogForm>) {
    setCreateForm((current) => ({ ...current, ...next }));
  }

  function updateEdit(next: Partial<BlogForm>) {
    setEditForm((current) => ({ ...current, ...next }));
  }

  function updateTarget(next: Partial<DeploymentTargetForm>) {
    setDeploymentTarget((current) => ({ ...current, ...next }));
  }

  function chooseBlog(blog: BlogRow) {
    setSelectedId(blog.id);
    setCreateOpen(false);
    setEditForm(blogToForm(blog));
    setDeploymentTarget(targetToForm(blog.deploymentTargets?.[0]));
    setMessage("");
  }

  function newBlog() {
    setSelectedId("");
    setCreateOpen(true);
    setCreateForm(emptyBlog);
    setEditForm(emptyBlog);
    setDeploymentTarget(emptyDeploymentTarget);
    setMessage("");
  }

  return (
    <div className="blogs-workspace">
      <section className="panel panel-pad stack blogs-rail">
        <div className="blogs-rail-head">
          <div>
            <p className="eyebrow">Workspace</p>
            <strong>Controlled blogs</strong>
            <div className="muted">{selected ? `Editing ${selected.name}` : createOpen ? "Creating new blog" : "Select a blog"}</div>
          </div>
          <div className="button-row">
            <span className="badge">{blogs.length}</span>
            <button className="btn primary" type="button" disabled={Boolean(busy)} onClick={newBlog}>
              <Plus size={16} />
              New
            </button>
          </div>
        </div>
        <div className="blog-list">
          {blogs.map((blog) => {
            const target = blog.deploymentTargets?.[0];
            const isSelected = blog.id === selectedId;

            return (
              <button
                key={blog.id}
                className={`blog-list-item ${isSelected ? "active" : ""}`}
                type="button"
                onClick={() => chooseBlog(blog)}
              >
                <div className="blog-list-title">
                  <strong>{blog.name}</strong>
                  <span className={`badge ${blog.status === "ACTIVE" ? "pass" : "warn"}`}>{blog.status}</span>
                </div>
                <div className="blog-list-url">{blog.baseUrl}</div>
                <div className="blog-list-meta">
                  <span className="mini-pill">{blog._count?.articles || 0} articles</span>
                  <span className="mini-pill">{blog._count?.funnels || 0} funnels</span>
                  <span className="mini-pill">{blog._count?.leads || 0} leads</span>
                </div>
                <div className="blog-list-footer">
                  <span>{target ? `${target.type} ${target.host}` : "No FTP target"}</span>
                  <span>{blog.domainMode === "SUBFOLDER" ? "Subfolder" : "Root"}</span>
                </div>
              </button>
            );
          })}
          {blogs.length === 0 ? (
            <div className="blog-empty-state">
              <Globe2 size={22} />
              <strong>No blogs yet</strong>
              <span className="muted">Create the first blog, then its FTP settings will appear here.</span>
            </div>
          ) : null}
        </div>
        {selected ? (
          <div className="notice compact-notice">
            Selected: {selected.name}. Latest target: {savedTarget?.host || "none configured"}.
          </div>
        ) : null}
        {message ? <div className="notice compact-notice">{message}</div> : null}
      </section>

      {createOpen || selected ? (
        <section className="blogs-main stack">
          {createOpen ? (
            <div className="panel panel-pad stack">
              <strong>Create blog</strong>
              <BlogFields form={createForm} update={updateCreate} />
              <button className="btn primary" type="button" disabled={Boolean(busy)} onClick={create}>
                <Plus size={16} />
                {busy === "create" ? "Creating..." : "Create Blog"}
              </button>
            </div>
          ) : null}

          {selected ? (
            <>
            <div className="panel panel-pad stack">
              <div className="button-row" style={{ justifyContent: "space-between" }}>
                <strong>Edit selected blog</strong>
                <span className="badge">{selected.slug}</span>
              </div>
              <BlogFields form={editForm} update={updateEdit} includeAdvanced />
              <div className="button-row">
                <button className="btn primary" type="button" disabled={Boolean(busy)} onClick={saveBlog}>
                  <Save size={16} />
                  {busy === "save-blog" ? "Saving..." : "Save Blog"}
                </button>
                <button className="btn danger" type="button" disabled={Boolean(busy)} onClick={deleteSelectedBlog}>
                  <Trash2 size={16} />
                  {busy === "delete-blog" ? "Deleting..." : "Delete Blog"}
                </button>
              </div>
            </div>

            <div className="panel panel-pad stack">
              <div className="button-row" style={{ justifyContent: "space-between" }}>
                <strong>FTP/SFTP settings</strong>
                <Server size={18} />
              </div>
              {savedTarget ? (
                <div className="notice">
                  Saved target: {savedTarget.type} {savedTarget.username}@{savedTarget.host}:{savedTarget.port}
                  {savedTarget.lastTestStatus ? ` / Last test: ${savedTarget.lastTestStatus}` : ""}
                </div>
              ) : (
                <div className="notice">No FTP/SFTP target saved for this blog.</div>
              )}
              <DeploymentFields form={deploymentTarget} update={updateTarget} />
              <div className="button-row">
                <button className="btn primary" type="button" disabled={Boolean(busy)} onClick={saveDeployment}>
                  <Save size={16} />
                  {busy === "save-target" ? "Saving..." : "Save FTP Settings"}
                </button>
                <button className="btn" type="button" disabled={Boolean(busy)} onClick={testDeployment}>
                  <TestTube2 size={16} />
                  {busy === "test-target" ? "Testing..." : "Test"}
                </button>
                <button className="btn danger" type="button" disabled={!savedTarget || Boolean(busy)} onClick={removeDeploymentTarget}>
                  <Trash2 size={16} />
                  {busy === "delete-target" ? "Removing..." : "Remove FTP Settings"}
                </button>
              </div>
            </div>
          </>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function BlogFields({
  form,
  update,
  disabled = false,
  includeAdvanced = false,
}: {
  form: BlogForm;
  update: (next: Partial<BlogForm>) => void;
  disabled?: boolean;
  includeAdvanced?: boolean;
}) {
  return (
    <div className="grid-2">
      <label className="field">
        <span>Name</span>
        <input
          className="input"
          disabled={disabled}
          value={form.name}
          onChange={(event) => update({ name: event.target.value, brandName: event.target.value })}
        />
      </label>
      <label className="field">
        <span>Slug</span>
        <input className="input" disabled={disabled} value={form.slug} onChange={(event) => update({ slug: event.target.value })} />
      </label>
      <label className="field">
        <span>Base URL</span>
        <input className="input" disabled={disabled} value={form.baseUrl} placeholder="https://example.com/blog" onChange={(event) => update({ baseUrl: event.target.value })} />
      </label>
      <label className="field">
        <span>Status</span>
        <select className="select" disabled={disabled} value={form.status} onChange={(event) => update({ status: event.target.value as BlogForm["status"] })}>
          <option value="ACTIVE">Active</option>
          <option value="PAUSED">Paused</option>
        </select>
      </label>
      <label className="field">
        <span>Mode</span>
        <select className="select" disabled={disabled} value={form.domainMode} onChange={(event) => update({ domainMode: event.target.value as BlogForm["domainMode"] })}>
          <option value="SUBFOLDER">Subfolder</option>
          <option value="SUBDOMAIN_ROOT">Subdomain root</option>
        </select>
      </label>
      <label className="field">
        <span>Brand name</span>
        <input className="input" disabled={disabled} value={form.brandName} onChange={(event) => update({ brandName: event.target.value })} />
      </label>
      <label className="field">
        <span>Primary color</span>
        <input className="input" disabled={disabled} type="color" value={form.primaryColor} onChange={(event) => update({ primaryColor: event.target.value })} />
      </label>
      <label className="field">
        <span>Accent color</span>
        <input className="input" disabled={disabled} type="color" value={form.accentColor} onChange={(event) => update({ accentColor: event.target.value })} />
      </label>
      {includeAdvanced ? (
        <>
          <label className="field">
            <span>Author</span>
            <input className="input" disabled={disabled} value={form.defaultAuthorName} onChange={(event) => update({ defaultAuthorName: event.target.value })} />
          </label>
          <label className="field">
            <span>Organization</span>
            <input className="input" disabled={disabled} value={form.organizationName} onChange={(event) => update({ organizationName: event.target.value })} />
          </label>
          <label className="field">
            <span>Language</span>
            <input className="input" disabled={disabled} value={form.language} onChange={(event) => update({ language: event.target.value })} />
          </label>
          <label className="field">
            <span>Timezone</span>
            <input className="input" disabled={disabled} value={form.timezone} onChange={(event) => update({ timezone: event.target.value })} />
          </label>
          <label className="field">
            <span>Robots policy</span>
            <input className="input" disabled={disabled} value={form.robotsPolicy} onChange={(event) => update({ robotsPolicy: event.target.value })} />
          </label>
          <label className="field">
            <span>Font family</span>
            <input className="input" disabled={disabled} value={form.fontFamily} onChange={(event) => update({ fontFamily: event.target.value })} />
          </label>
        </>
      ) : null}
    </div>
  );
}

function DeploymentFields({
  form,
  update,
  disabled = false,
}: {
  form: DeploymentTargetForm;
  update: (next: Partial<DeploymentTargetForm>) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid-2">
      <label className="field">
        <span>Protocol</span>
        <select
          className="select"
          disabled={disabled}
          value={form.type}
          onChange={(event) => {
            const type = event.target.value as DeploymentTargetForm["type"];
            update({ type, port: type === "SFTP" ? 22 : 21 });
          }}
        >
          <option value="SFTP">SFTP</option>
          <option value="FTP">FTP</option>
          <option value="FTPS">FTPS</option>
        </select>
      </label>
      <label className="field">
        <span>Port</span>
        <input className="input" disabled={disabled} type="number" value={form.port} onChange={(event) => update({ port: Number(event.target.value) })} />
      </label>
      <label className="field">
        <span>Host</span>
        <input className="input" disabled={disabled} value={form.host} onChange={(event) => update({ host: event.target.value })} />
      </label>
      <label className="field">
        <span>Username</span>
        <input className="input" disabled={disabled} value={form.username} onChange={(event) => update({ username: event.target.value })} />
      </label>
      <label className="field">
        <span>Password</span>
        <input className="input" disabled={disabled} type="password" placeholder="Leave blank to use saved password" value={form.password} onChange={(event) => update({ password: event.target.value })} />
      </label>
      <label className="field">
        <span>Remote root</span>
        <input className="input" disabled={disabled} value={form.remoteRootPath} onChange={(event) => update({ remoteRootPath: event.target.value })} />
      </label>
      <label className="field">
        <span>Clean URLs</span>
        <select className="select" disabled={disabled} value={form.cleanUrlMode} onChange={(event) => update({ cleanUrlMode: event.target.value as DeploymentTargetForm["cleanUrlMode"] })}>
          <option value="HTACCESS_DIRECTORY">.htaccess directory URLs</option>
          <option value="HTML">HTML file URLs</option>
        </select>
      </label>
      <label className="field">
        <span>Private key</span>
        <textarea className="textarea" disabled={disabled} placeholder="Leave blank to use saved private key" value={form.privateKey} onChange={(event) => update({ privateKey: event.target.value })} />
      </label>
      <label className="field">
        <span>Private key passphrase</span>
        <input className="input" disabled={disabled} type="password" placeholder="Leave blank to use saved passphrase" value={form.privateKeyPassphrase} onChange={(event) => update({ privateKeyPassphrase: event.target.value })} />
      </label>
      <label className="field">
        <span>PHP enabled</span>
        <select className="select" disabled={disabled} value={form.phpEnabled ? "yes" : "no"} onChange={(event) => update({ phpEnabled: event.target.value === "yes" })}>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </label>
      <label className="field">
        <span>.htaccess enabled</span>
        <select className="select" disabled={disabled} value={form.htaccessEnabled ? "yes" : "no"} onChange={(event) => update({ htaccessEnabled: event.target.value === "yes" })}>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </label>
    </div>
  );
}

function blogToForm(blog: BlogRow): BlogForm {
  return {
    name: blog.name,
    slug: blog.slug,
    baseUrl: blog.baseUrl,
    status: blog.status,
    domainMode: blog.domainMode,
    language: blog.language || "en",
    timezone: blog.timezone || "America/Chicago",
    brandName: blog.brandName,
    primaryColor: blog.primaryColor,
    accentColor: blog.accentColor,
    fontFamily: blog.fontFamily || "Inter, ui-sans-serif, system-ui",
    defaultAuthorName: blog.defaultAuthorName,
    organizationName: blog.organizationName || "",
    robotsPolicy: blog.robotsPolicy || "index,follow",
    indexNowEnabled: Boolean(blog.indexNowEnabled),
  };
}

function targetToForm(target?: DeploymentTargetRow): DeploymentTargetForm {
  if (!target) return emptyDeploymentTarget;
  return {
    type: target.type,
    host: target.host,
    port: target.port,
    username: target.username,
    password: "",
    privateKey: "",
    privateKeyPassphrase: "",
    remoteRootPath: target.remoteRootPath,
    cleanUrlMode: target.cleanUrlMode || "HTACCESS_DIRECTORY",
    phpEnabled: target.phpEnabled ?? true,
    htaccessEnabled: target.htaccessEnabled ?? true,
  };
}
