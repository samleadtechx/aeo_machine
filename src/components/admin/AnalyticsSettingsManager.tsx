"use client";

import { useMemo, useState } from "react";
import { BarChart3, KeyRound, Save, TimerReset } from "lucide-react";

type BlogOption = {
  id: string;
  name: string;
  slug: string;
};

type AnalyticsSetting = {
  blogId: string;
  blogName: string;
  blogSlug: string;
  trackingEnabled: boolean;
  deepReadScrollPercent: number;
  deepReadSeconds: number;
  pixelId: string;
  testEventCode: string;
  eventMap: {
    articleOpen: string;
    deepRead: string;
    lead: string;
  };
  capiEnabled: boolean;
  hasAccessToken: boolean;
  maskedAccessToken: string;
  updatedAt?: string | null;
};

type Draft = {
  trackingEnabled: boolean;
  deepReadScrollPercent: string;
  deepReadSeconds: string;
  pixelId: string;
  accessToken: string;
  testEventCode: string;
  articleOpenEvent: string;
  deepReadEvent: string;
  leadEvent: string;
};

export function AnalyticsSettingsManager({
  initialBlogs,
  initialSettings,
}: {
  initialBlogs: BlogOption[];
  initialSettings: AnalyticsSetting[];
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(initialBlogs.map((blog) => {
      const setting = initialSettings.find((item) => item.blogId === blog.id);
      return [blog.id, draftFromSetting(setting)];
    }))
  );
  const [busyBlogId, setBusyBlogId] = useState("");
  const [message, setMessage] = useState("");

  const settingsByBlog = useMemo(() => {
    const map = new Map<string, AnalyticsSetting>();
    for (const setting of settings) map.set(setting.blogId, setting);
    return map;
  }, [settings]);

  function updateDraft(blogId: string, patch: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [blogId]: {
        ...draftFromSetting(settingsByBlog.get(blogId)),
        ...current[blogId],
        ...patch,
      },
    }));
  }

  async function save(blog: BlogOption, patch?: Partial<Draft>) {
    const draft = { ...drafts[blog.id], ...patch };
    setBusyBlogId(blog.id);
    setMessage("");
    try {
      const payload = {
        blogId: blog.id,
        trackingEnabled: draft.trackingEnabled,
        deepReadScrollPercent: Number(draft.deepReadScrollPercent),
        deepReadSeconds: Number(draft.deepReadSeconds),
        pixelId: draft.pixelId,
        accessToken: draft.accessToken,
        testEventCode: draft.testEventCode,
        eventMap: {
          articleOpen: draft.articleOpenEvent,
          deepRead: draft.deepReadEvent,
          lead: draft.leadEvent,
        },
      };
      const response = await fetch("/api/analytics/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error || "Analytics settings could not be saved.");
        return;
      }
      setSettings((current) => [...current.filter((setting) => setting.blogId !== blog.id), data.setting]);
      setDrafts((current) => ({ ...current, [blog.id]: draftFromSetting(data.setting) }));
      setMessage(`${blog.name}: analytics settings saved. Rebuild and redeploy the blog for static article pages to use the newest script.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Analytics settings could not be saved.");
    } finally {
      setBusyBlogId("");
    }
  }

  return (
    <section className="panel panel-pad stack" style={{ marginTop: 16 }}>
      <div className="button-row" style={{ justifyContent: "space-between" }}>
        <div>
          <p className="eyebrow">Analytics and Meta</p>
          <h2 className="page-title" style={{ fontSize: 22 }}>
            Article Tracking
          </h2>
        </div>
        <BarChart3 size={18} />
      </div>
      <div className="notice compact-notice">
        Article pages send first-party events to the static blog&apos;s `track/collect.php` file. When a Meta
        Pixel ID and CAPI token are saved, browser Pixel and server CAPI use the same event ID for dedupe.
      </div>
      <div className="grid-2">
        {initialBlogs.map((blog) => {
          const setting = settingsByBlog.get(blog.id);
          const draft = drafts[blog.id] || draftFromSetting(setting);
          const busy = busyBlogId === blog.id;
          return (
            <div className="panel panel-pad stack" key={blog.id} style={{ boxShadow: "none" }}>
              <div className="button-row" style={{ justifyContent: "space-between" }}>
                <div>
                  <strong>{blog.name}</strong>
                  <div className="muted">/{blog.slug}</div>
                </div>
                <span className={`badge ${draft.trackingEnabled ? "pass" : "warn"}`}>
                  {draft.trackingEnabled ? "Tracking on" : "Tracking off"}
                </span>
              </div>

              <label className="toggle-line">
                <input
                  type="checkbox"
                  checked={draft.trackingEnabled}
                  disabled={busy}
                  onChange={(event) => updateDraft(blog.id, { trackingEnabled: event.target.checked })}
                />
                Inject article open, deep-read, and lead tracking into published article pages
              </label>

              <div className="grid-2">
                <label className="field">
                  <span>Deep read scroll %</span>
                  <input
                    className="input"
                    type="number"
                    min={10}
                    max={100}
                    value={draft.deepReadScrollPercent}
                    disabled={busy}
                    onChange={(event) => updateDraft(blog.id, { deepReadScrollPercent: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Deep read seconds</span>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={900}
                    value={draft.deepReadSeconds}
                    disabled={busy}
                    onChange={(event) => updateDraft(blog.id, { deepReadSeconds: event.target.value })}
                  />
                </label>
              </div>

              <label className="field">
                <span>Meta Pixel ID</span>
                <input
                  className="input"
                  placeholder="1234567890"
                  value={draft.pixelId}
                  disabled={busy}
                  onChange={(event) => updateDraft(blog.id, { pixelId: event.target.value })}
                />
              </label>
              <label className="field">
                <span>CAPI access token</span>
                <input
                  className="input"
                  type="password"
                  placeholder={setting?.hasAccessToken ? `Saved ${setting.maskedAccessToken}` : "Paste Meta CAPI token"}
                  value={draft.accessToken}
                  disabled={busy}
                  onChange={(event) => updateDraft(blog.id, { accessToken: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Test event code</span>
                <input
                  className="input"
                  placeholder="TEST12345"
                  value={draft.testEventCode}
                  disabled={busy}
                  onChange={(event) => updateDraft(blog.id, { testEventCode: event.target.value })}
                />
              </label>

              <div className="grid-3">
                <label className="field">
                  <span>Article open</span>
                  <input
                    className="input"
                    value={draft.articleOpenEvent}
                    disabled={busy}
                    onChange={(event) => updateDraft(blog.id, { articleOpenEvent: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Deep read</span>
                  <input
                    className="input"
                    value={draft.deepReadEvent}
                    disabled={busy}
                    onChange={(event) => updateDraft(blog.id, { deepReadEvent: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Lead submit</span>
                  <input
                    className="input"
                    value={draft.leadEvent}
                    disabled={busy}
                    onChange={(event) => updateDraft(blog.id, { leadEvent: event.target.value })}
                  />
                </label>
              </div>

              <div className="button-row" style={{ justifyContent: "space-between" }}>
                <span className={`mini-pill ${setting?.capiEnabled ? "" : "muted"}`}>
                  <KeyRound size={13} />
                  {setting?.capiEnabled ? "Meta CAPI ready" : setting?.hasAccessToken ? "Token saved, Pixel/settings incomplete" : "No CAPI token"}
                </span>
                <span className="mini-pill">
                  <TimerReset size={13} />
                  {draft.deepReadScrollPercent}% + {draft.deepReadSeconds}s
                </span>
              </div>

              <button className="btn primary" type="button" disabled={busy} onClick={() => void save(blog)}>
                <Save size={16} />
                {busy ? "Saving..." : "Save Tracking"}
              </button>
            </div>
          );
        })}
      </div>
      {message ? <div className="notice compact-notice">{message}</div> : null}
    </section>
  );
}

function draftFromSetting(setting?: AnalyticsSetting): Draft {
  return {
    trackingEnabled: setting?.trackingEnabled ?? false,
    deepReadScrollPercent: String(setting?.deepReadScrollPercent ?? 70),
    deepReadSeconds: String(setting?.deepReadSeconds ?? 45),
    pixelId: setting?.pixelId ?? "",
    accessToken: "",
    testEventCode: setting?.testEventCode ?? "",
    articleOpenEvent: setting?.eventMap.articleOpen ?? "ViewContent",
    deepReadEvent: setting?.eventMap.deepRead ?? "DeepRead",
    leadEvent: setting?.eventMap.lead ?? "Lead",
  };
}
