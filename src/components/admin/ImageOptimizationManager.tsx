"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Crop, Image as ImageIcon, Save, Upload, X } from "lucide-react";

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
  const [media, setMedia] = useState(initialMedia);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [cropState, setCropState] = useState<LogoCropState | null>(null);

  const mediaByBlog = useMemo(() => {
    const map = new Map<string, MediaRow[]>();
    for (const blog of blogs) {
      map.set(
        blog.id,
        media.filter((asset) => !asset.blogId || asset.blogId === blog.id)
      );
    }
    return map;
  }, [blogs, media]);

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

  async function saveLogoFromCrop(croppedFile: File, blog: BlogImageSettings) {
    setBusyId(blog.id);
    setMessage("");
    const formData = new FormData();
    formData.set("file", croppedFile);
    formData.set("role", "logo");
    formData.set("altText", `${blog.name} logo`);
    const uploadResponse = await fetch(`/api/blogs/${blog.id}/media`, {
      method: "POST",
      body: formData,
    });
    const uploadData = await uploadResponse.json();
    if (!uploadResponse.ok) {
      setBusyId("");
      setMessage(uploadData.error || "Logo upload failed.");
      return;
    }

    setMedia((current) => [uploadData.media, ...current.filter((asset) => asset.id !== uploadData.media.id)]);
    const updatedBlog = { ...blog, logoMediaId: uploadData.media.id };
    updateBlog(blog.id, { logoMediaId: uploadData.media.id });
    await save(updatedBlog);
    setCropState(null);
    setMessage(`Uploaded and selected cropped logo for ${blog.name}.`);
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
              <button className="btn" type="button" onClick={() => setCropState({ blog })}>
                <Crop size={16} />
                Upload Cropped Logo
              </button>
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
      {cropState ? (
        <LogoCropModal
          blog={cropState.blog}
          busy={busyId === cropState.blog.id}
          onClose={() => setCropState(null)}
          onSave={(file) => saveLogoFromCrop(file, cropState.blog)}
        />
      ) : null}
    </section>
  );
}

type LogoCropState = {
  blog: Required<BlogImageSettings>;
};

function LogoCropModal({
  blog,
  busy,
  onClose,
  onSave,
}: {
  blog: Required<BlogImageSettings>;
  busy: boolean;
  onClose: () => void;
  onSave: (file: File) => Promise<void>;
}) {
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceName, setSourceName] = useState("logo.png");
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [crop, setCrop] = useState({ x: 12, y: 12, width: 76, height: 76 });
  const [aspect, setAspect] = useState<"free" | "wide" | "square">("wide");
  const [error, setError] = useState("");
  const imageRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; crop: typeof crop } | null>(null);

  useEffect(() => {
    return () => {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    };
  }, [sourceUrl]);

  function chooseFile(file?: File | null) {
    setError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    setSourceName(file.name);
    setSourceUrl(URL.createObjectURL(file));
    setImageSize({ width: 0, height: 0 });
    setCrop({ x: 12, y: 18, width: 76, height: aspect === "square" ? 76 : 54 });
  }

  function updateCrop(patch: Partial<typeof crop>) {
    setCrop((current) => normalizeCrop({ ...current, ...patch }, aspect));
  }

  function startCropDrag(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      crop,
    };
  }

  function moveCropDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const frame = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!frame?.width || !frame.height) return;
    const dx = ((event.clientX - dragRef.current.startX) / frame.width) * 100;
    const dy = ((event.clientY - dragRef.current.startY) / frame.height) * 100;
    setCrop(normalizeCrop({ ...dragRef.current.crop, x: dragRef.current.crop.x + dx, y: dragRef.current.crop.y + dy }, aspect));
  }

  function endCropDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
  }

  async function saveCroppedLogo() {
    setError("");
    const image = imageRef.current;
    if (!image || !sourceUrl || !imageSize.width || !imageSize.height) {
      setError("Choose a logo image first.");
      return;
    }

    const normalized = normalizeCrop(crop, aspect);
    const sx = Math.round((normalized.x / 100) * image.naturalWidth);
    const sy = Math.round((normalized.y / 100) * image.naturalHeight);
    const sw = Math.round((normalized.width / 100) * image.naturalWidth);
    const sh = Math.round((normalized.height / 100) * image.naturalHeight);
    const outputWidth = Math.min(Math.max(sw, 120), blog.logoMaxWidth || 480);
    const outputHeight = Math.max(1, Math.round((outputWidth * sh) / Math.max(1, sw)));
    const canvas = document.createElement("canvas");
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setError("Could not prepare the logo crop.");
      return;
    }
    context.imageSmoothingQuality = "high";
    context.drawImage(image, sx, sy, sw, sh, 0, 0, outputWidth, outputHeight);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", 0.92));
    if (!blob) {
      setError("Could not create the cropped logo file.");
      return;
    }
    const cleanName = sourceName.replace(/\.[a-z0-9]+$/i, "") || "logo";
    await onSave(new File([blob], `${cleanName}-cropped.png`, { type: "image/png" }));
  }

  const cropStyle = {
    left: `${crop.x}%`,
    top: `${crop.y}%`,
    width: `${crop.width}%`,
    height: `${crop.height}%`,
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-panel crop-modal" role="dialog" aria-modal="true" aria-labelledby="logo-crop-title">
        <div className="modal-head">
          <div>
            <p className="eyebrow">Header logo</p>
            <h2 id="logo-crop-title">Crop logo for {blog.name}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close crop modal">
            <X size={18} />
          </button>
        </div>

        <div className="crop-layout">
          <div className="crop-stage">
            {sourceUrl ? (
              <div className="crop-image-frame">
                {/* eslint-disable-next-line @next/next/no-img-element -- Crop previews use temporary object URLs before upload. */}
                <img
                  ref={imageRef}
                  src={sourceUrl}
                  alt=""
                  onLoad={(event) =>
                    setImageSize({
                      width: event.currentTarget.naturalWidth,
                      height: event.currentTarget.naturalHeight,
                    })
                  }
                />
                <div
                  className="crop-selection"
                  style={cropStyle}
                  onPointerDown={startCropDrag}
                  onPointerMove={moveCropDrag}
                  onPointerUp={endCropDrag}
                  onPointerCancel={endCropDrag}
                  role="presentation"
                  title="Drag to position the crop"
                />
              </div>
            ) : (
              <button className="crop-empty" type="button" onClick={() => fileInputRef.current?.click()}>
                <Upload size={22} />
                <span>Choose a logo image</span>
              </button>
            )}
          </div>

          <div className="crop-controls stack">
            <input
              ref={fileInputRef}
              className="sr-only-file"
              type="file"
              accept="image/*"
              onChange={(event) => chooseFile(event.target.files?.[0])}
            />
            <button className="btn" type="button" onClick={() => fileInputRef.current?.click()}>
              <Upload size={16} />
              Choose Image
            </button>
            <label className="field">
              <span>Crop shape</span>
              <select
                className="select"
                value={aspect}
                onChange={(event) => {
                  const next = event.target.value as typeof aspect;
                  setAspect(next);
                  setCrop((current) => normalizeCrop(current, next));
                }}
              >
                <option value="wide">Wide logo</option>
                <option value="square">Square mark</option>
                <option value="free">Free crop</option>
              </select>
            </label>
            <div className="grid-2">
              <CropNumber label="Left" value={crop.x} onChange={(value) => updateCrop({ x: value })} />
              <CropNumber label="Top" value={crop.y} onChange={(value) => updateCrop({ y: value })} />
              <CropNumber label="Width" value={crop.width} onChange={(value) => updateCrop({ width: value })} />
              <CropNumber label="Height" value={crop.height} onChange={(value) => updateCrop({ height: value })} />
            </div>
            {imageSize.width ? (
              <div className="notice compact-notice">
                Source {imageSize.width}x{imageSize.height}. Output respects this blog&apos;s logo max width:
                {" "}
                {blog.logoMaxWidth}px.
              </div>
            ) : null}
            {error ? <div className="notice error-notice compact-notice">{error}</div> : null}
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" type="button" disabled={busy || !sourceUrl} onClick={saveCroppedLogo}>
            <Save size={16} />
            {busy ? "Uploading..." : "Use Cropped Logo"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CropNumber({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        className="input"
        type="number"
        min={0}
        max={100}
        step={1}
        value={Math.round(value)}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function normalizeCrop(
  crop: { x: number; y: number; width: number; height: number },
  aspect: "free" | "wide" | "square"
) {
  const width = clamp(crop.width, 10, 100);
  let height = clamp(crop.height, 10, 100);
  if (aspect === "wide") {
    height = clamp(width / 3, 10, 100);
  } else if (aspect === "square") {
    height = width;
  }
  const x = clamp(crop.x, 0, 100 - width);
  const y = clamp(crop.y, 0, 100 - height);
  return { x, y, width, height };
}

function clamp(value: number, min: number, max: number) {
  const normalized = Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, normalized));
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
