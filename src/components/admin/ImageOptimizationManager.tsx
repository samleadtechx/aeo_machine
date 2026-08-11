"use client";

import { useMemo, useState } from "react";
import { Image as ImageIcon, Save } from "lucide-react";

type ImageOutputFormat = "ORIGINAL" | "WEBP" | "JPEG" | "PNG";

type BlogImageSettings = {
  id: string;
  name: string;
  logoMediaId?: string | null;
  imageOptimizationEnabled?: boolean;
  imageOutputFormat?: ImageOutputFormat;
  imageQuality?: number;
  imageMaxWidth?: number;
  logoMaxWidth?: number;
};

type MediaRow = {
  id: string;
  blogId?: string | null;
  filename: string;
  originalName: string;
  mimeType: string;
  width?: number | null;
  height?: number | null;
};

export function ImageOptimizationManager({
  initialBlogs,
  initialMedia,
}: {
  initialBlogs: BlogImageSettings[];
  initialMedia: MediaRow[];
}) {
  const [blogs, setBlogs] = useState(initialBlogs.map(normalizeBlogSettings));
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");

  const mediaByBlog = useMemo(() => {
    const map = new Map<string, MediaRow[]>();
    for (const blog of blogs) {
      map.set(
        blog.id,
        initialMedia.filter((asset) => !asset.blogId || asset.blogId === blog.id)
      );
    }
    return map;
  }, [blogs, initialMedia]);

  function updateBlog(id: string, patch: Partial<BlogImageSettings>) {
    setBlogs((current) => current.map((blog) => (blog.id === id ? { ...blog, ...patch } : blog)));
  }

  async function save(blog: BlogImageSettings) {
    setBusyId(blog.id);
    setMessage("");
    const response = await fetch(`/api/blogs/${blog.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        blog: {
          logoMediaId: blog.logoMediaId || null,
          imageOptimizationEnabled: Boolean(blog.imageOptimizationEnabled),
          imageOutputFormat: blog.imageOutputFormat || "WEBP",
          imageQuality: blog.imageQuality || 82,
          imageMaxWidth: blog.imageMaxWidth || 1600,
          logoMaxWidth: blog.logoMaxWidth || 480,
        },
      }),
    });
    const data = await response.json();
    setBusyId("");
    if (!response.ok) {
      setMessage(data.error || "Image settings save failed.");
      return;
    }
    setMessage(`Saved image settings for ${blog.name}.`);
  }

  return (
    <section className="panel panel-pad stack" style={{ marginTop: 16 }}>
      <div className="button-row" style={{ justifyContent: "space-between" }}>
        <div>
          <p className="eyebrow">Images</p>
          <h2 className="page-title" style={{ fontSize: 22 }}>
            Blog Logos & Optimization
          </h2>
        </div>
        <ImageIcon size={18} />
      </div>

      <div className="grid-2">
        {blogs.map((blog) => {
          const choices = mediaByBlog.get(blog.id) || [];
          return (
            <div className="panel panel-pad stack" key={blog.id} style={{ boxShadow: "none" }}>
              <div className="button-row" style={{ justifyContent: "space-between" }}>
                <strong>{blog.name}</strong>
                <span className={`badge ${blog.imageOptimizationEnabled ? "pass" : "warn"}`}>
                  {blog.imageOptimizationEnabled ? "Optimized" : "Original"}
                </span>
              </div>
              <label className="field">
                <span>Header logo</span>
                <select
                  className="select"
                  value={blog.logoMediaId || ""}
                  onChange={(event) => updateBlog(blog.id, { logoMediaId: event.target.value || null })}
                >
                  <option value="">Use blog name text</option>
                  {choices.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.originalName}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid-2">
                <label className="field">
                  <span>Optimization</span>
                  <select
                    className="select"
                    value={blog.imageOptimizationEnabled ? "yes" : "no"}
                    onChange={(event) => updateBlog(blog.id, { imageOptimizationEnabled: event.target.value === "yes" })}
                  >
                    <option value="yes">On</option>
                    <option value="no">Off</option>
                  </select>
                </label>
                <label className="field">
                  <span>Output format</span>
                  <select
                    className="select"
                    value={blog.imageOutputFormat}
                    onChange={(event) => updateBlog(blog.id, { imageOutputFormat: event.target.value as ImageOutputFormat })}
                  >
                    <option value="WEBP">WebP</option>
                    <option value="ORIGINAL">Original format</option>
                    <option value="JPEG">JPEG</option>
                    <option value="PNG">PNG</option>
                  </select>
                </label>
                <label className="field">
                  <span>Quality</span>
                  <input
                    className="input"
                    type="number"
                    min={40}
                    max={100}
                    value={blog.imageQuality}
                    onChange={(event) => updateBlog(blog.id, { imageQuality: Number(event.target.value) })}
                  />
                </label>
                <label className="field">
                  <span>Article max width</span>
                  <input
                    className="input"
                    type="number"
                    min={480}
                    max={3200}
                    step={40}
                    value={blog.imageMaxWidth}
                    onChange={(event) => updateBlog(blog.id, { imageMaxWidth: Number(event.target.value) })}
                  />
                </label>
                <label className="field">
                  <span>Logo max width</span>
                  <input
                    className="input"
                    type="number"
                    min={120}
                    max={1200}
                    step={20}
                    value={blog.logoMaxWidth}
                    onChange={(event) => updateBlog(blog.id, { logoMaxWidth: Number(event.target.value) })}
                  />
                </label>
              </div>
              <button className="btn primary" type="button" disabled={busyId === blog.id} onClick={() => save(blog)}>
                <Save size={16} />
                {busyId === blog.id ? "Saving..." : "Save Image Settings"}
              </button>
            </div>
          );
        })}
      </div>
      {message ? <div className="notice">{message}</div> : null}
    </section>
  );
}

function normalizeBlogSettings(blog: BlogImageSettings): Required<BlogImageSettings> {
  return {
    id: blog.id,
    name: blog.name,
    logoMediaId: blog.logoMediaId || null,
    imageOptimizationEnabled: blog.imageOptimizationEnabled ?? true,
    imageOutputFormat: blog.imageOutputFormat || "WEBP",
    imageQuality: blog.imageQuality || 82,
    imageMaxWidth: blog.imageMaxWidth || 1600,
    logoMaxWidth: blog.logoMaxWidth || 480,
  };
}
