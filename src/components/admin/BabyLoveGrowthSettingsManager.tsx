"use client";

import { useMemo, useState } from "react";
import { FileUp, Power, PowerOff, Save, Tags } from "lucide-react";

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
  defaultTags: string[];
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
  const [tagDrafts, setTagDrafts] = useState(() =>
    Object.fromEntries(initialSettings.map((setting) => [setting.blogId, setting.defaultTags.join(", ")]))
  );
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

  async function saveTags(blog: BlogOption) {
    setBusyBlogId(blog.id);
    setMessage("");
    try {
      const defaultTags = parseTagText(tagDrafts[blog.id] || "");
      const response = await fetch("/api/integrations/babylovegrowth/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blogId: blog.id, defaultTags }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error || "BabyLoveGrowth default tags could not be saved.");
        return;
      }
      setSettings((currentSettings) => {
        const rest = currentSettings.filter((setting) => setting.blogId !== blog.id);
        return [...rest, data.setting];
      });
      setTagDrafts((current) => ({
        ...current,
        [blog.id]: data.setting.defaultTags.join(", "),
      }));
      setMessage(
        data.setting.defaultTags.length
          ? `${blog.name}: default BabyLoveGrowth tags saved.`
          : `${blog.name}: default BabyLoveGrowth tags cleared.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "BabyLoveGrowth default tags could not be saved.");
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
        import stays as a draft and the BabyLoveGrowth import status records the failure. Default tags are
        only used when BabyLoveGrowth does not send tags with the article.
      </div>
      <div className="grid-2">
        {initialBlogs.map((blog) => {
          const setting = settingsByBlog.get(blog.id);
          const autoPublish = setting?.autoPublish ?? false;
          const defaultTags = setting?.defaultTags ?? [];
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
              <label className="field">
                <span>Default import tags</span>
                <input
                  className="input"
                  placeholder="seo, aeo"
                  value={tagDrafts[blog.id] ?? defaultTags.join(", ")}
                  disabled={busy}
                  onChange={(event) =>
                    setTagDrafts((current) => ({ ...current, [blog.id]: event.target.value }))
                  }
                />
              </label>
              <div className="button-row" style={{ justifyContent: "space-between" }}>
                <span className="mini-pill">
                  <Tags size={13} />
                  {defaultTags.length ? `${defaultTags.length} default tags` : "No default tags"}
                </span>
                <button className="btn" type="button" disabled={busy} onClick={() => void saveTags(blog)}>
                  <Save size={16} />
                  {busy ? "Saving..." : "Save Tags"}
                </button>
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

function parseTagText(value: string) {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const rawTag of value.split(",")) {
    const tag = rawTag.trim();
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    tags.push(tag);
  }
  return tags;
}
