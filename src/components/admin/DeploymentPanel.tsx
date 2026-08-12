"use client";

import { useState } from "react";
import { Hammer, Loader2, RefreshCcw, Rocket, TestTube2 } from "lucide-react";
import { OperationProgress, useOperationProgress } from "@/components/admin/OperationProgress";

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
  const [loadingKey, setLoadingKey] = useState("");
  const loading = Boolean(loadingKey);
  const { progress, driftProgress, completeProgress, failProgress } = useOperationProgress();

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

  async function post(
    key: string,
    path: string,
    success: string,
    body: Record<string, unknown> = {},
    progressOptions: {
      label: string;
      detail?: string;
      start?: number;
      ceiling?: number;
      completeLabel?: string;
    }
  ) {
    setLoadingKey(key);
    setMessage("");
    driftProgress({
      label: progressOptions.label,
      detail: progressOptions.detail,
      start: progressOptions.start || 12,
      ceiling: progressOptions.ceiling || 88,
    });
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      await refresh();
      if (!response.ok) {
        const error = data.error || "Action failed.";
        setMessage(error);
        failProgress(`${progressOptions.label} failed`, error);
        return;
      }
      const summary = deploymentSummary(data.deployment);
      setMessage(`${success}${summary}`);
      completeProgress(progressOptions.completeLabel || success, summary.trim() || undefined);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Action failed.";
      setMessage(errorMessage);
      failProgress(`${progressOptions.label} failed`, errorMessage);
    } finally {
      setLoadingKey("");
    }
  }

  function cleanRedeploy() {
    const blog = blogs.find((entry) => entry.id === blogId);
    const confirmed = window.confirm(
      `Clean redeploy will delete every file in the saved FTP/SFTP remote folder${blog ? ` for ${blog.name}` : ""}, rebuild the blog, and upload it from scratch. Continue?`
    );
    if (!confirmed) return;
    void post(
      "clean-redeploy",
      `/api/blogs/${blogId}/deploy`,
      "Clean redeploy completed.",
      { rebuild: true, cleanRemoteRoot: true },
      {
        label: "Clean redeploy running",
        detail: "Rebuilding the blog, deleting files in the remote folder, then uploading fresh files.",
        start: 10,
        ceiling: 94,
        completeLabel: "Clean redeploy completed",
      }
    );
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
            <button
              className="btn"
              type="button"
              disabled={!blogId || loading}
              onClick={() => {
                void post("test", `/api/blogs/${blogId}/test-deployment`, "Connection test passed.", {}, {
                  label: "Testing connection",
                  detail: "Connecting to the saved FTP/SFTP target.",
                  start: 18,
                  ceiling: 86,
                  completeLabel: "Connection test passed",
                });
              }}
            >
              {loadingKey === "test" ? <Loader2 className="spin" size={16} /> : <TestTube2 size={16} />}
              Test
            </button>
            <button
              className="btn primary"
              type="button"
              disabled={!blogId || loading}
              onClick={() =>
                post("build", `/api/blogs/${blogId}/build`, "Build completed.", {}, {
                  label: "Building static files",
                  detail: "Rendering article pages, funnels, assets, sitemap, RSS, and rewrite files.",
                  start: 14,
                  ceiling: 90,
                  completeLabel: "Build completed",
                })
              }
            >
              {loadingKey === "build" ? <Loader2 className="spin" size={16} /> : <Hammer size={16} />}
              Build Now
            </button>
            <button
              className="btn green"
              type="button"
              disabled={!blogId || loading}
              onClick={() =>
                post("deploy", `/api/blogs/${blogId}/deploy`, "Deployment completed.", {}, {
                  label: "Deploying latest build",
                  detail: "Uploading static files and assets to the saved FTP/SFTP target.",
                  start: 12,
                  ceiling: 92,
                  completeLabel: "Deployment completed",
                })
              }
            >
              {loadingKey === "deploy" ? <Loader2 className="spin" size={16} /> : <Rocket size={16} />}
              Deploy Latest
            </button>
            <button className="btn danger" type="button" disabled={!blogId || loading} onClick={cleanRedeploy}>
              {loadingKey === "clean-redeploy" ? <Loader2 className="spin" size={16} /> : <RefreshCcw size={16} />}
              Clean Redeploy
            </button>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <OperationProgress progress={progress} />
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
