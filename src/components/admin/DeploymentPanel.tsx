"use client";

import { useState } from "react";
import { Hammer, RefreshCcw, Rocket, TestTube2 } from "lucide-react";

type BlogRow = { id: string; name: string; baseUrl: string };
type BuildRow = {
  id: string;
  status: string;
  reason: string;
  outputPath?: string | null;
  fileCount?: number | null;
  sizeBytes?: number | null;
  createdAt: string;
  completedAt?: string | null;
  error?: string | null;
};
type DeploymentRow = {
  id: string;
  status: string;
  uploadedFiles: number;
  skippedFiles: number;
  deletedFiles: number;
  createdAt: string;
  error?: string | null;
  target?: { host: string; type: string };
};

export function DeploymentPanel({
  initialBlogs,
  initialBuilds,
  initialDeployments,
}: {
  initialBlogs: BlogRow[];
  initialBuilds: BuildRow[];
  initialDeployments: DeploymentRow[];
}) {
  const [blogs] = useState(initialBlogs);
  const [blogId, setBlogId] = useState(initialBlogs[0]?.id || "");
  const [builds, setBuilds] = useState(initialBuilds);
  const [deployments, setDeployments] = useState(initialDeployments);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function refresh(id = blogId) {
    if (!id) return;
    const response = await fetch(`/api/blogs/${id}/deployments`);
    const data = await response.json();
    setBuilds(data.builds || []);
    setDeployments(data.deployments || []);
  }

  async function choose(id: string) {
    setBlogId(id);
    await refresh(id);
  }

  async function post(path: string, success: string, body: Record<string, unknown> = {}) {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      await refresh();
      setMessage(response.ok ? `${success}${deploymentSummary(data.deployment)}` : data.error || "Action failed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setLoading(false);
    }
  }

  function cleanRedeploy() {
    const blog = blogs.find((entry) => entry.id === blogId);
    const confirmed = window.confirm(
      `Clean redeploy will delete every file in the saved FTP/SFTP remote folder${blog ? ` for ${blog.name}` : ""}, rebuild the blog, and upload it from scratch. Continue?`
    );
    if (!confirmed) return;
    void post(`/api/blogs/${blogId}/deploy`, "Clean redeploy completed.", { rebuild: true, cleanRemoteRoot: true });
  }

  return (
    <div className="stack">
      <section className="panel panel-pad">
        <div className="button-row" style={{ justifyContent: "space-between" }}>
          <label className="field" style={{ minWidth: 260 }}>
            <span>Blog</span>
            <select className="select" value={blogId} onChange={(event) => choose(event.target.value)}>
              {blogs.map((blog) => (
                <option key={blog.id} value={blog.id}>
                  {blog.name}
                </option>
              ))}
            </select>
          </label>
          <div className="button-row">
            <button className="btn" type="button" disabled={!blogId || loading} onClick={() => post(`/api/blogs/${blogId}/test-deployment`, "Connection test passed.")}>
              <TestTube2 size={16} />
              Test
            </button>
            <button className="btn primary" type="button" disabled={!blogId || loading} onClick={() => post(`/api/blogs/${blogId}/build`, "Build completed.")}>
              <Hammer size={16} />
              Build Now
            </button>
            <button className="btn green" type="button" disabled={!blogId || loading} onClick={() => post(`/api/blogs/${blogId}/deploy`, "Deployment completed.")}>
              <Rocket size={16} />
              Deploy Latest
            </button>
            <button className="btn danger" type="button" disabled={!blogId || loading} onClick={cleanRedeploy}>
              <RefreshCcw size={16} />
              Clean Redeploy
            </button>
          </div>
        </div>
        {message ? <div className="notice" style={{ marginTop: 12 }}>{message}</div> : null}
      </section>

      <section className="grid-2">
        <div className="panel panel-pad stack">
          <strong>Builds</strong>
          <table className="table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Files</th>
                <th>Output</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {builds.map((build) => (
                <tr key={build.id}>
                  <td><span className={`badge ${build.status === "SUCCESS" ? "pass" : build.status === "FAILED" ? "fail" : "warn"}`}>{build.status}</span></td>
                  <td>{build.fileCount || 0}</td>
                  <td className="muted">{build.outputPath || build.error || "Queued"}</td>
                  <td>{new Date(build.createdAt).toLocaleString()}</td>
                </tr>
              ))}
              {builds.length === 0 ? <tr><td colSpan={4} className="muted">No builds yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <div className="panel panel-pad stack">
          <strong>Deployments</strong>
          <table className="table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Host</th>
                <th>Uploaded</th>
                <th>Deleted</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {deployments.map((deployment) => (
                <tr key={deployment.id}>
                  <td><span className={`badge ${deployment.status === "SUCCESS" ? "pass" : deployment.status === "FAILED" ? "fail" : "warn"}`}>{deployment.status}</span></td>
                  <td>{deployment.target?.host || deployment.error || "Unknown"}</td>
                  <td>{deployment.uploadedFiles}</td>
                  <td>{deployment.deletedFiles}</td>
                  <td>{new Date(deployment.createdAt).toLocaleString()}</td>
                </tr>
              ))}
              {deployments.length === 0 ? <tr><td colSpan={5} className="muted">No deployments yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function deploymentSummary(deployment?: Partial<DeploymentRow>) {
  if (!deployment) return "";
  const parts = [];
  if (typeof deployment.uploadedFiles === "number") parts.push(`${deployment.uploadedFiles} uploaded`);
  if (typeof deployment.deletedFiles === "number" && deployment.deletedFiles > 0) parts.push(`${deployment.deletedFiles} deleted`);
  return parts.length ? ` ${parts.join(", ")}.` : "";
}
