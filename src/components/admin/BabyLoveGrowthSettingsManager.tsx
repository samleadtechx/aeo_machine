"use client";

import { useMemo, useState } from "react";
import { FileUp, Power, PowerOff } from "lucide-react";

type BlogOption = {
  id: string;
  name: string;
  slug: string;
};

type BabyLoveGrowthSetting = {
  blogId: string;
  blogName: string;
  blogSlug: string;
  autoPublish: boolean;
  enabled: boolean;
  updatedAt?: string | null;
};

export function BabyLoveGrowthSettingsManager({
  initialBlogs,
  initialSettings,
}: {
  initialBlogs: BlogOption[];
  initialSettings: BabyLoveGrowthSetting[];
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [busyBlogId, setBusyBlogId] = useState("");
  const [message, setMessage] = useState("");

  const settingsByBlog = useMemo(() => {
    const map = new Map<string, BabyLoveGrowthSetting>();
    for (const setting of settings) map.set(setting.blogId, setting);
    return map;
  }, [settings]);

  async function toggle(blog: BlogOption) {
    const current = settingsByBlog.get(blog.id)?.autoPublish ?? false;
    setBusyBlogId(blog.id);
    setMessage("");
    try {
      const response = await fetch("/api/integrations/babylovegrowth/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blogId: blog.id, autoPublish: !current }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error || "BabyLoveGrowth setting could not be saved.");
        return;
      }
      setSettings((currentSettings) => {
        const rest = currentSettings.filter((setting) => setting.blogId !== blog.id);
        return [...rest, data.setting];
      });
      setMessage(
        `${blog.name}: BabyLoveGrowth imports will ${data.setting.autoPublish ? "auto-publish after passing the publishing gate" : "stay as drafts"}.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "BabyLoveGrowth setting could not be saved.");
    } finally {
      setBusyBlogId("");
    }
  }

  return (
    <section className="panel panel-pad stack" style={{ marginTop: 16 }}>
      <div className="button-row" style={{ justifyContent: "space-between" }}>
        <div>
          <p className="eyebrow">BabyLoveGrowth</p>
          <h2 className="page-title" style={{ fontSize: 22 }}>
            Import Publishing
          </h2>
        </div>
        <FileUp size={18} />
      </div>
      <div className="notice compact-notice">
        Auto-publish runs the same publishing gate as the article editor. If SEO/AEO blockers fail, the
        import stays as a draft and the BabyLoveGrowth import status records the failure.
      </div>
      <div className="grid-2">
        {initialBlogs.map((blog) => {
          const setting = settingsByBlog.get(blog.id);
          const autoPublish = setting?.autoPublish ?? false;
          const busy = busyBlogId === blog.id;
          return (
            <div className="panel panel-pad stack" key={blog.id} style={{ boxShadow: "none" }}>
              <div className="button-row" style={{ justifyContent: "space-between" }}>
                <div>
                  <strong>{blog.name}</strong>
                  <div className="muted">/{blog.slug}</div>
                </div>
                <span className={`badge ${autoPublish ? "pass" : "warn"}`}>
                  {autoPublish ? "Auto-publish on" : "Draft only"}
                </span>
              </div>
              <label className="toggle-line">
                <input
                  type="checkbox"
                  checked={autoPublish}
                  disabled={busy}
                  onChange={() => void toggle(blog)}
                />
                Publish BabyLoveGrowth imports automatically
              </label>
              <button
                className={`btn ${autoPublish ? "danger" : "primary"}`}
                type="button"
                disabled={busy}
                onClick={() => void toggle(blog)}
              >
                {autoPublish ? <PowerOff size={16} /> : <Power size={16} />}
                {busy ? "Saving..." : autoPublish ? "Turn Off" : "Turn On"}
              </button>
            </div>
          );
        })}
      </div>
      {message ? <div className="notice compact-notice">{message}</div> : null}
    </section>
  );
}
