"use client";

import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { CopyValue } from "@/components/admin/CopyValue";

type BlogOption = { id: string; name: string };
type MediaRow = {
  id: string;
  blogId?: string | null;
  filename: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  publicPath: string;
  altText?: string | null;
  createdAt: string;
  blog?: { id: string; name: string; slug: string } | null;
};

export function MediaManager({
  initialBlogs,
  initialMedia,
}: {
  initialBlogs: BlogOption[];
  initialMedia: MediaRow[];
}) {
  const [blogs] = useState(initialBlogs);
  const [blogId, setBlogId] = useState(initialBlogs[0]?.id || "");
  const [media, setMedia] = useState(initialMedia);
  const [message, setMessage] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  async function refresh(id = blogId) {
    if (!id) return;
    const response = await fetch(`/api/blogs/${id}/media`);
    const data = await response.json();
    setMedia(data.media || []);
  }

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!blogId) return;
    setMessage("");
    const formData = new FormData(event.currentTarget);
    const response = await fetch(`/api/blogs/${blogId}/media`, {
      method: "POST",
      body: formData,
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "Upload failed.");
      return;
    }
    formRef.current?.reset();
    await refresh(blogId);
    setMessage(`Uploaded ${data.media.originalName}.`);
  }

  return (
    <section className="panel panel-pad stack" style={{ marginTop: 16 }}>
      <div>
        <p className="eyebrow">Local public assets</p>
        <h2 className="page-title" style={{ fontSize: 22 }}>Media Library</h2>
      </div>
      <div className="notice">
        Uploaded images are stored in the main system, then copied into each static build under
        `/assets/media/`. Use `media:&lt;id&gt;` in Markdown or `imageMediaId` in funnel JSON to keep
        the public blog independent from the admin app.
      </div>
      <form ref={formRef} className="grid-3" onSubmit={upload}>
        <label className="field">
          <span>Blog</span>
          <select
            className="select"
            value={blogId}
            onChange={async (event) => {
              setBlogId(event.target.value);
              await refresh(event.target.value);
            }}
          >
            {blogs.map((blog) => (
              <option key={blog.id} value={blog.id}>
                {blog.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Image</span>
          <input className="input" name="file" type="file" accept="image/*" required />
        </label>
        <label className="field">
          <span>Alt text</span>
          <input className="input" name="altText" />
        </label>
        <button className="btn primary" type="submit" disabled={!blogId}>
          <ImagePlus size={16} />
          Upload Image
        </button>
      </form>
      {message ? <div className="notice">{message}</div> : null}
      <div className="grid-2">
        {media.map((asset) => (
          <div className="panel panel-pad stack" key={asset.id} style={{ boxShadow: "none" }}>
            <div>
              <strong>{asset.originalName}</strong>
              <div className="muted">
                {asset.mimeType} / {Math.round(asset.sizeBytes / 1024)} KB
              </div>
            </div>
            <CopyValue label="Media ID" value={asset.id} />
            <CopyValue label="Markdown token" value={`media:${asset.id}`} />
            <CopyValue label="Build public path" value={asset.publicPath} />
            <CopyValue
              label="Funnel option JSON"
              multiline
              value={JSON.stringify(
                {
                  label: "Answer label",
                  value: "answer_value",
                  imageMediaId: asset.id,
                },
                null,
                2
              )}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
