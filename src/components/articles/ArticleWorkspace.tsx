"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { OperationProgress, useOperationProgress } from "@/components/admin/OperationProgress";
import {
  AlertCircle,
  Bold,
  Check,
  FilePlus2,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link as LinkIcon,
  List,
  Loader2,
  Quote,
  RefreshCcw,
  Save,
  Send,
  Trash2,
  Type,
  Undo2,
  Upload,
} from "lucide-react";

type BlogOption = { id: string; name: string; baseUrl: string; defaultAuthorName: string };
type ArticleRow = {
  id: string;
  blogId: string;
  title: string;
  slug: string;
  status: string;
  source: string;
  markdown: string;
  excerpt?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  canonicalUrl?: string | null;
  heroMediaId?: string | null;
  heroAlt?: string | null;
  authorName?: string | null;
  noindex: boolean;
  seoScore: number;
  seoGateStatus: string;
  createdAt?: string;
  updatedAt?: string;
  seoAuditIssues?: Array<{ id: string; severity: string; code: string; message: string }>;
  tags?: Array<{ tag: { name: string; slug: string } }>;
  blog?: { name: string; slug: string; baseUrl: string };
};

type MediaRow = {
  id: string;
  originalName: string;
  filename: string;
  publicPath: string;
  altText?: string | null;
};

type ArticleForm = {
  id?: string;
  blogId: string;
  title: string;
  slug: string;
  markdown: string;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  canonicalUrl: string;
  heroMediaId: string;
  heroAlt: string;
  authorName: string;
  tags: string;
  noindex: boolean;
  status?: string;
  source?: string;
};

type ToastState = {
  kind: "success" | "error" | "info";
  message: string;
};

type PublishResult = {
  articleUrl?: string;
  mainPageUrl?: string;
  uploadedFiles?: number;
  error?: string;
  stage?: string;
};

const editorFonts = {
  system: "Inter, ui-sans-serif, system-ui",
  serif: "Georgia, Cambria, serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
};

export function ArticleWorkspace({
  initialBlogs,
  initialArticles,
}: {
  initialBlogs: BlogOption[];
  initialArticles: ArticleRow[];
}) {
  const [blogs] = useState(initialBlogs);
  const [articles, setArticles] = useState(initialArticles);
  const [selectedId, setSelectedId] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState<ToastState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [media, setMedia] = useState<MediaRow[]>([]);
  const [editorFont, setEditorFont] = useState<keyof typeof editorFonts>("system");
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const { progress, showProgress, driftProgress, completeProgress, failProgress } = useOperationProgress();
  const selected = useMemo(() => articles.find((article) => article.id === selectedId), [articles, selectedId]);
  const [form, setForm] = useState<ArticleForm>(() => articleToForm(undefined, blogs[0]?.id || ""));
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const richEditorRef = useRef<HTMLDivElement>(null);
  const richEditorFocusedRef = useRef(false);
  const richSelectionRef = useRef<Range | null>(null);

  useEffect(() => {
    if (form.blogId) void loadMedia(form.blogId);
  }, [form.blogId]);

  useEffect(() => {
    resizeTitleField();
  }, [form.title]);

  useEffect(() => {
    const editor = richEditorRef.current;
    if (!editorOpen || !editor || richEditorFocusedRef.current) return;
    editor.innerHTML = markdownToVisualHtml(form.markdown, media);
    richSelectionRef.current = null;
  }, [editorOpen, form.id, form.markdown, media]);

  async function loadMedia(blogId: string) {
    const response = await fetch(`/api/blogs/${blogId}/media`);
    if (!response.ok) return;
    const data = await response.json();
    setMedia(data.media || []);
  }

  async function refresh(selectId = selectedId) {
    const all: ArticleRow[] = [];
    for (const blog of blogs) {
      const response = await fetch(`/api/blogs/${blog.id}/articles`);
      const data = await response.json();
      all.push(...(data.articles || []));
    }
    const nextArticle = selectId ? all.find((article) => article.id === selectId) : undefined;
    setArticles(all);
    setSelectedId(nextArticle?.id || "");
    if (nextArticle) {
      setForm(articleToForm(nextArticle, nextArticle.blogId));
      setEditorOpen(true);
    } else if (!selectId) {
      setForm(articleToForm(undefined, blogs[0]?.id || ""));
      setEditorOpen(false);
    }
    return all;
  }

  function notify(kind: ToastState["kind"], nextMessage: string) {
    setToast({ kind, message: nextMessage });
    setMessage(nextMessage);
    if (kind !== "error") {
      window.setTimeout(() => setToast(null), 2600);
    }
  }

  async function runBusy(key: string, task: () => Promise<void>) {
    if (busy) return;
    setBusy(key);
    try {
      await task();
    } finally {
      setBusy(null);
    }
  }

  function choose(article: ArticleRow) {
    setSelectedId(article.id);
    setEditorOpen(true);
    setForm(articleToForm(article, article.blogId));
    setMessage("");
    setToast(null);
    setPublishResult(null);
  }

  function newArticle() {
    setSelectedId("");
    setEditorOpen(true);
    setForm(articleToForm(undefined, blogs[0]?.id || ""));
    setMessage("");
    setToast(null);
    setPublishResult(null);
  }

  function resizeTitleField() {
    const title = titleRef.current;
    if (!title) return;
    title.style.height = "auto";
    title.style.height = `${title.scrollHeight}px`;
  }

  async function save() {
    await runBusy("save", async () => {
      const saved = await persistDraft();
      if (!saved.ok) {
        notify("error", saved.error || "Save failed.");
        return;
      }
      notify("success", "Article saved and SEO gate rechecked.");
    });
  }

  async function persistDraft(): Promise<{ ok: true; articleId: string } | { ok: false; error: string }> {
    setMessage("");
    setPublishResult(null);
    const latestMarkdown = syncVisualEditor();
    const draft = { ...form, markdown: latestMarkdown };
    const payload = articlePayload(draft);
    const response = await fetch(draft.id ? `/api/articles/${draft.id}` : `/api/blogs/${draft.blogId}/articles`, {
      method: draft.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await safeJson(response);
    if (!response.ok) {
      return { ok: false, error: data.error || "Save failed." };
    }
    const savedId = data.article?.id || draft.id;
    if (!savedId) return { ok: false, error: "Save finished, but no article id was returned." };
    await refresh(savedId);
    return { ok: true, articleId: savedId };
  }

  async function action(key: string, path: string, success: string) {
    if (!form.id) return;
    await runBusy(key, async () => {
      setMessage("");
      setPublishResult(null);
      const response = await fetch(path, { method: "POST" });
      const data = await safeJson(response);
      await refresh(form.id);
      if (!response.ok) {
        notify("error", data.error || "Action failed.");
        return;
      }
      notify("success", success);
    });
  }

  async function removeArticle(article: ArticleRow) {
    const published = article.status === "PUBLISHED";
    const confirmed = window.confirm(
      `Remove "${article.title || "Untitled article"}"?${published ? " It is published now, so redeploy the blog after removing it to clear the public file from FTP." : ""}`
    );
    if (!confirmed) return;
    await runBusy(`delete-${article.id}`, async () => {
      const response = await fetch(`/api/articles/${article.id}`, { method: "DELETE" });
      const data = await safeJson(response);
      if (!response.ok) {
        notify("error", data.error || "Article remove failed.");
        return;
      }
      const nextArticles = await refresh("");
      setArticles(nextArticles.filter((item) => item.id !== article.id));
      setSelectedId("");
      setEditorOpen(false);
      setForm(articleToForm(undefined, blogs[0]?.id || ""));
      notify("success", published ? "Article removed. Redeploy the blog to remove it from FTP." : "Article removed.");
    });
  }

  async function publishAndDeploy() {
    if (!form.id) return;
    await runBusy("publish", async () => {
      setMessage("");
      setPublishResult(null);
      showProgress("Saving article", "Saving latest edits before publishing.", 12);
      notify("info", "Saving latest edits before publishing...");
      const saved = await persistDraft();
      if (!saved.ok) {
        failProgress("Publish stopped", `Could not save before publishing: ${saved.error}`);
        notify("error", `Could not save before publishing: ${saved.error}`);
        return;
      }
      driftProgress({
        label: "Publishing and uploading",
        detail: "Rebuilding the article, main page, feeds, sitemap, assets, and uploading files to FTP/SFTP.",
        start: 34,
        ceiling: 92,
      });
      const response = await fetch(`/api/articles/${saved.articleId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deploy: true }),
      });
      const data = await safeJson(response);
      await refresh(saved.articleId);
      if (!response.ok) {
        setPublishResult({
          articleUrl: data.articleUrl,
          mainPageUrl: data.mainPageUrl,
          error: data.error || "Publish/upload failed.",
          stage: data.stage,
        });
        failProgress(
          data.stage === "deploy" ? "Upload failed" : "Publish failed",
          data.error || "Publish/upload failed."
        );
        notify("error", data.error || "Publish/upload failed.");
        return;
      }
      const uploadedFiles = Number(data.deployment?.uploadedFiles || 0);
      setPublishResult({ articleUrl: data.articleUrl, mainPageUrl: data.mainPageUrl, uploadedFiles });
      completeProgress("Published and uploaded", `Uploaded ${uploadedFiles} files and verified the article plus main page.`);
      notify("success", `Article published, main page rebuilt, and uploaded ${uploadedFiles} files.`);
    });
  }

  async function uploadImage(file: File | null) {
    if (!file || !form.blogId) return;
    await runBusy("image", async () => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("altText", file.name.replace(/\.[^.]+$/, ""));
      const response = await fetch(`/api/blogs/${form.blogId}/media`, {
        method: "POST",
        body: formData,
      });
      const data = await safeJson(response);
      if (!response.ok) {
        notify("error", data.error || "Image upload failed.");
        return;
      }
      const asset = data.media as MediaRow;
      setMedia((current) => [asset, ...current.filter((item) => item.id !== asset.id)]);
      insertImage(asset);
      notify("success", `Uploaded ${asset.originalName} and inserted it into the article.`);
    });
  }

  function insertAtSelection(before: string, after = "", placeholder = "text") {
    if (richEditorRef.current) {
      const selectedText = getRichSelectionText() || placeholder;
      insertRichText(`${before}${selectedText}${after}`);
      return;
    }

    const textarea = textareaRef.current;
    const value = form.markdown;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;
    const selectedText = value.slice(start, end) || placeholder;
    const insertion = `${before}${selectedText}${after}`;
    const next = `${value.slice(0, start)}${insertion}${value.slice(end)}`;
    const cursor = start + insertion.length;
    setForm((current) => ({ ...current, markdown: next }));
    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(cursor, cursor);
    });
  }

  function insertBlock(block: string) {
    if (richEditorRef.current) {
      const currentMarkdown = syncVisualEditor();
      const range = getRichRange();
      const offsetText = range?.startContainer.textContent || currentMarkdown;
      const start = range?.startOffset ?? offsetText.length;
      const needsLeadingBreak = start > 0 && !offsetText.slice(0, start).endsWith("\n\n");
      insertRichText(`${needsLeadingBreak ? "\n\n" : ""}${block}`);
      return;
    }

    const textarea = textareaRef.current;
    const value = form.markdown;
    const start = textarea?.selectionStart ?? value.length;
    const needsLeadingBreak = start > 0 && !value.slice(0, start).endsWith("\n\n");
    const insertion = `${needsLeadingBreak ? "\n\n" : ""}${block}`;
    const next = `${value.slice(0, start)}${insertion}${value.slice(start)}`;
    setForm((current) => ({ ...current, markdown: next }));
    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + insertion.length, start + insertion.length);
    });
  }

  function insertImage(asset: MediaRow) {
    const alt = asset.altText || asset.originalName.replace(/\.[^.]+$/, "");
    const visualNode = createVisualMediaElement(`media:${asset.id}`, alt, media);
    if (insertRichNode(visualNode)) return;
    insertBlock(`![${alt}](media:${asset.id})\n\n`);
  }

  function applyTextStyle(style: string) {
    if (style === "h2") insertBlock("## Section heading\n\n");
    if (style === "h3") insertBlock("### Subheading\n\n");
    if (style === "quote") insertBlock("> Quote or callout text.\n\n");
    if (style === "list") insertBlock("- First point\n- Second point\n\n");
  }

  function syncVisualEditor() {
    const editor = richEditorRef.current;
    if (!editor) return form.markdown;
    const markdown = visualEditorToMarkdown(editor);
    setForm((current) => (current.markdown === markdown ? current : { ...current, markdown }));
    return markdown;
  }

  function rememberRichSelection() {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (richEditorContains(range.commonAncestorContainer)) {
      richSelectionRef.current = range.cloneRange();
    }
  }

  function getRichSelectionText() {
    const selection = window.getSelection();
    if (selection?.rangeCount) {
      const range = selection.getRangeAt(0);
      if (richEditorContains(range.commonAncestorContainer)) return selection.toString();
    }
    return richSelectionRef.current?.toString() || "";
  }

  function getRichRange() {
    const editor = richEditorRef.current;
    if (!editor) return null;

    const selection = window.getSelection();
    if (selection?.rangeCount) {
      const range = selection.getRangeAt(0);
      if (richEditorContains(range.commonAncestorContainer)) return range.cloneRange();
    }

    if (richSelectionRef.current && richEditorContains(richSelectionRef.current.commonAncestorContainer)) {
      return richSelectionRef.current.cloneRange();
    }

    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    return range;
  }

  function richEditorContains(node: Node | null) {
    const editor = richEditorRef.current;
    return Boolean(editor && node && (node === editor || editor.contains(node)));
  }

  function restoreRichRange(range: Range) {
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    richSelectionRef.current = range.cloneRange();
  }

  function insertRichText(text: string) {
    const editor = richEditorRef.current;
    const range = getRichRange();
    if (!editor || !range) return false;

    richEditorFocusedRef.current = true;
    editor.focus();
    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);
    restoreRichRange(range);
    syncVisualEditor();
    return true;
  }

  function insertRichNode(node: HTMLElement) {
    const editor = richEditorRef.current;
    const range = getRichRange();
    if (!editor || !range) return false;

    richEditorFocusedRef.current = true;
    editor.focus();
    range.deleteContents();
    range.insertNode(node);
    const spacer = document.createTextNode(" ");
    node.after(spacer);
    range.setStartAfter(spacer);
    range.collapse(true);
    restoreRichRange(range);
    syncVisualEditor();
    return true;
  }

  function handleRichEditorClick(event: React.MouseEvent<HTMLDivElement>) {
    const removeButton = (event.target as HTMLElement).closest("[data-remove-media]");
    if (removeButton) {
      removeButton.closest(".inline-media-element")?.remove();
      syncVisualEditor();
      return;
    }
    rememberRichSelection();
  }

  const issues = selected?.seoAuditIssues || [];
  const blockerIssues = issues.filter((issue) => issue.severity === "BLOCKER");
  const warningIssues = issues.filter((issue) => issue.severity === "WARNING");
  const previewMarkdown = renderPreviewMarkdown(form.markdown);
  const selectedHero = media.find((asset) => asset.id === form.heroMediaId);
  const wordCount = form.markdown.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className={`article-workspace article-editor-workspace ${!editorOpen ? "list-only-workspace" : ""}`}>
      {toast ? (
        <div className={`toast ${toast.kind}`} role="status">
          {toast.kind === "error" ? <AlertCircle size={18} /> : <Check size={18} />}
          <span>{toast.message}</span>
          <button type="button" onClick={() => setToast(null)}>Dismiss</button>
        </div>
      ) : null}

      <aside className="panel panel-pad article-queue-rail article-editor-rail">
        <div className="article-queue-head">
          <div>
            <p className="eyebrow">Queue</p>
            <strong>Articles</strong>
            <div className="muted">{selected ? `Editing ${selected.title}` : editorOpen ? "New draft" : "Select an article"}</div>
          </div>
          <button className="btn primary" type="button" disabled={Boolean(busy)} onClick={newArticle}>
            <FilePlus2 size={16} />
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
        <div className="article-list">
          {articles.map((article) => {
            const isSelected = article.id === selectedId;
            return (
              <button
                key={article.id}
                className={`article-list-item ${isSelected ? "active" : ""}`}
                type="button"
                disabled={Boolean(busy)}
                onClick={() => choose(article)}
              >
                <div className="article-list-title">
                  <strong>{article.title || "Untitled article"}</strong>
                  <span className={`badge ${article.seoGateStatus === "PASS" ? "pass" : article.seoGateStatus === "WARNING" ? "warn" : "fail"}`}>
                    {article.status}
                  </span>
                </div>
                <div className="article-list-meta">
                  <span>{article.blog?.name || "No blog"}</span>
                  <span>Score {article.seoScore ?? 0}</span>
                  <span>{article.source}</span>
                </div>
                <div className="article-list-url">{article.slug ? `/${article.slug}` : "No slug yet"}</div>
                <div className="list-item-actions">
                  <span className="muted">{new Date(article.updatedAt || article.createdAt || Date.now()).toLocaleDateString()}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    className="mini-danger-action"
                    onClick={(event) => {
                      event.stopPropagation();
                      void removeArticle(article);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      event.stopPropagation();
                      void removeArticle(article);
                    }}
                  >
                    <Trash2 size={13} />
                    Remove
                  </span>
                </div>
              </button>
            );
          })}
          {articles.length === 0 ? (
            <div className="article-empty-state">
              <FilePlus2 size={22} />
              <strong>No articles yet</strong>
              <span className="muted">Create the first draft, then it will stay in this queue.</span>
            </div>
          ) : null}
        </div>
      </aside>

      {editorOpen ? (
        <>
      <main className="article-editor-canvas">
        <div className="panel panel-pad article-editor-commandbar">
          <div className="article-editor-status">
            <span className={`badge ${selected?.seoGateStatus === "PASS" ? "pass" : selected?.seoGateStatus === "WARNING" ? "warn" : "fail"}`}>
              SEO {selected?.seoGateStatus || "NEW"}
            </span>
            <span className="badge">Score {selected?.seoScore ?? 0}</span>
            {form.source ? <span className="badge">{form.source}</span> : null}
            <span className="muted">{wordCount} words</span>
          </div>
          <div className="button-row">
            <button className="btn primary" type="button" disabled={Boolean(busy)} onClick={save}>
              {busy === "save" ? <Loader2 className="spin" size={16} /> : <Save size={16} />}
              {busy === "save" ? "Saving..." : "Save Draft"}
            </button>
            {form.id ? (
              <>
                <button className="btn" type="button" disabled={Boolean(busy)} onClick={() => action("audit", `/api/articles/${form.id}/seo-audit`, "SEO audit refreshed.")}>
                  {busy === "audit" ? <Loader2 className="spin" size={16} /> : <RefreshCcw size={16} />}
                  {busy === "audit" ? "Auditing..." : "Audit"}
                </button>
                <button className="btn green" type="button" disabled={Boolean(busy)} onClick={publishAndDeploy}>
                  {busy === "publish" ? <Loader2 className="spin" size={16} /> : <Send size={16} />}
                  {busy === "publish" ? "Publishing..." : "Publish + Upload"}
                </button>
                <button className="btn" type="button" disabled={Boolean(busy)} onClick={() => action("unpublish", `/api/articles/${form.id}/unpublish`, "Article returned to draft.")}>
                  {busy === "unpublish" ? <Loader2 className="spin" size={16} /> : <Undo2 size={16} />}
                  {busy === "unpublish" ? "Updating..." : "Unpublish"}
                </button>
              </>
            ) : null}
          </div>
        </div>
        <OperationProgress progress={progress} />

        <section className="panel article-compose-panel">
          <textarea
            ref={titleRef}
            className="article-title-input"
            rows={1}
            value={form.title}
            onChange={(event) => {
              setForm({ ...form, title: event.target.value });
              window.requestAnimationFrame(resizeTitleField);
            }}
            placeholder="Add title"
          />
          <div className="article-under-title">
            <span>{selected ? `Editing ${selected.title || "untitled article"}` : "New draft"}</span>
            <span>{form.slug ? `/${form.slug}` : "/article-slug"}</span>
          </div>

          <div className="editor-toolbar wordpress-toolbar">
            <label className="field compact-field">
              <span>Text style</span>
              <select className="select" defaultValue="" onChange={(event) => { applyTextStyle(event.target.value); event.target.value = ""; }}>
                <option value="">Insert style</option>
                <option value="h2">Large heading</option>
                <option value="h3">Small heading</option>
                <option value="quote">Quote/callout</option>
                <option value="list">Bullet list</option>
              </select>
            </label>
            <label className="field compact-field">
              <span>Editor font</span>
              <select className="select" value={editorFont} onChange={(event) => setEditorFont(event.target.value as keyof typeof editorFonts)}>
                <option value="system">Sans</option>
                <option value="serif">Serif</option>
                <option value="mono">Mono</option>
              </select>
            </label>
            <button className="btn" type="button" onClick={() => insertBlock("## Section heading\n\n")} title="Heading">
              <Heading2 size={16} />
            </button>
            <button className="btn" type="button" onClick={() => insertBlock("### Subheading\n\n")} title="Subheading">
              <Heading3 size={16} />
            </button>
            <button className="btn" type="button" onClick={() => insertAtSelection("**", "**", "bold text")} title="Bold">
              <Bold size={16} />
            </button>
            <button className="btn" type="button" onClick={() => insertAtSelection("*", "*", "italic text")} title="Italic">
              <Italic size={16} />
            </button>
            <button className="btn" type="button" onClick={() => insertAtSelection("[", "](https://example.com)", "link text")} title="Link">
              <LinkIcon size={16} />
            </button>
            <button className="btn" type="button" onClick={() => insertBlock("> Quote or callout text.\n\n")} title="Quote">
              <Quote size={16} />
            </button>
            <button className="btn" type="button" onClick={() => insertBlock("- First point\n- Second point\n\n")} title="List">
              <List size={16} />
            </button>
            <label className="btn" title="Upload and insert image">
              {busy === "image" ? <Loader2 className="spin" size={16} /> : <Upload size={16} />}
              Upload Image
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={async (event) => {
                  await uploadImage(event.target.files?.[0] || null);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <label className="field compact-field">
              <span>Insert image</span>
              <select
                className="select"
                defaultValue=""
                onChange={(event) => {
                  const asset = media.find((item) => item.id === event.target.value);
                  if (asset) insertImage(asset);
                  event.target.value = "";
                }}
              >
                <option value="">Choose media</option>
                {media.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.originalName}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn" type="button" onClick={() => insertBlock("![Alt text](media:MEDIA_ID)\n\n")} title="Image token">
              <ImagePlus size={16} />
            </button>
            <span className="badge"><Type size={13} /> Markdown</span>
          </div>

          {media.length ? (
            <div className="editor-media-strip">
              {media.slice(0, 8).map((asset) => (
                <button key={asset.id} type="button" onClick={() => insertImage(asset)} title={`Insert ${asset.originalName}`}>
                  <span className="media-thumb" style={{ backgroundImage: `url(/api/media/${asset.id})` }} />
                  <span>{asset.originalName}</span>
                </button>
              ))}
            </div>
          ) : null}

          <div className="field article-markdown-field">
            <span>Body</span>
            <div
              ref={richEditorRef}
              className="word-body-editor"
              contentEditable
              data-placeholder="Start writing..."
              onBlur={() => {
                rememberRichSelection();
                richEditorFocusedRef.current = false;
                syncVisualEditor();
              }}
              onClick={handleRichEditorClick}
              onFocus={() => {
                richEditorFocusedRef.current = true;
                rememberRichSelection();
              }}
              onInput={() => {
                rememberRichSelection();
                syncVisualEditor();
              }}
              onKeyUp={rememberRichSelection}
              onMouseUp={rememberRichSelection}
              style={{ fontFamily: editorFonts[editorFont] }}
              suppressContentEditableWarning
            />
          </div>

          <details className="markdown-source-details" onToggle={(event) => {
            if (event.currentTarget.open) syncVisualEditor();
          }}>
            <summary>Markdown source</summary>
            <textarea
              ref={textareaRef}
              className="textarea article-markdown-textarea"
              style={{ fontFamily: editorFonts[editorFont] }}
              value={form.markdown}
              placeholder="Start writing..."
              onFocus={syncVisualEditor}
              onChange={(event) => setForm({ ...form, markdown: event.target.value })}
            />
          </details>
        </section>

        <details className="panel article-preview-details">
          <summary>Preview</summary>
          <div className="preview article-live-preview" style={{ fontFamily: editorFonts[editorFont] }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{previewMarkdown || "Start writing to preview rendered Markdown."}</ReactMarkdown>
          </div>
        </details>
      </main>

      <aside className="article-inspector stack">
        <section className="panel panel-pad stack">
          <div className="article-inspector-head">
            <div>
              <p className="eyebrow">Publish</p>
              <strong>Status</strong>
            </div>
            <span className={`badge ${form.status === "PUBLISHED" ? "pass" : "warn"}`}>{form.status || "DRAFT"}</span>
          </div>
          {message ? <div className="notice">{message}</div> : null}
          {publishResult ? (
            <div className={`notice ${publishResult.error ? "error-notice" : ""}`}>
              <strong>{publishResult.error ? "Upload status" : "Published article"}</strong>
              {publishResult.articleUrl ? (
                <div>
                  Public URL:{" "}
                  <a href={publishResult.articleUrl} target="_blank" rel="noreferrer">
                    {publishResult.articleUrl}
                  </a>
                </div>
              ) : null}
              {publishResult.mainPageUrl ? (
                <div>
                  Main page:{" "}
                  <a href={publishResult.mainPageUrl} target="_blank" rel="noreferrer">
                    {publishResult.mainPageUrl}
                  </a>
                </div>
              ) : null}
              {publishResult.uploadedFiles !== undefined ? (
                <div>Uploaded {publishResult.uploadedFiles} files to the saved FTP/SFTP target.</div>
              ) : null}
              {publishResult.error ? <div>{publishResult.error}</div> : null}
              {publishResult.stage ? <div>Failed stage: {publishResult.stage}</div> : null}
            </div>
          ) : null}
          {blockerIssues.length ? (
            <div className="notice error-notice">
              <strong>Cannot publish yet</strong>
              <ul className="issue-list">
                {blockerIssues.map((issue) => (
                  <li key={issue.id}>{issue.message}</li>
                ))}
              </ul>
            </div>
          ) : warningIssues.length ? (
            <div className="notice">
              <strong>Publish allowed</strong>
              <ul className="issue-list">
                {warningIssues.slice(0, 6).map((issue) => (
                  <li key={issue.id}>{issue.message}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="notice">
              <Check size={15} /> No persisted SEO issues for this article.
            </div>
          )}
        </section>

        <section className="panel panel-pad stack">
          <div>
            <p className="eyebrow">Document</p>
            <strong>Settings</strong>
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
          <label className="field">
            <span>Slug</span>
            <input className="input" value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} />
          </label>
          <label className="field">
            <span>Author</span>
            <input className="input" value={form.authorName} onChange={(event) => setForm({ ...form, authorName: event.target.value })} />
          </label>
          <label className="field">
            <span>Canonical URL</span>
            <input className="input" value={form.canonicalUrl} onChange={(event) => setForm({ ...form, canonicalUrl: event.target.value })} />
          </label>
          <label className="field">
            <span>Excerpt</span>
            <textarea className="textarea compact-textarea" value={form.excerpt} onChange={(event) => setForm({ ...form, excerpt: event.target.value })} />
          </label>
          <label className="toggle-line">
            <input type="checkbox" checked={form.noindex} onChange={(event) => setForm({ ...form, noindex: event.target.checked })} />
            <span>Noindex</span>
          </label>
        </section>

        <section className="panel panel-pad stack">
          <div>
            <p className="eyebrow">SEO/AEO</p>
            <strong>Search Details</strong>
          </div>
          <label className="field">
            <span>Meta title</span>
            <input className="input" value={form.metaTitle} onChange={(event) => setForm({ ...form, metaTitle: event.target.value })} />
          </label>
          <label className="field">
            <span>Meta description</span>
            <textarea className="textarea compact-textarea" value={form.metaDescription} onChange={(event) => setForm({ ...form, metaDescription: event.target.value })} />
          </label>
          <label className="field">
            <span>Tags</span>
            <input className="input" value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="SEO, AEO" />
          </label>
        </section>

        <section className="panel panel-pad stack">
          <div>
            <p className="eyebrow">Media</p>
            <strong>Featured Image</strong>
          </div>
          <div className="featured-image-preview">
            {selectedHero ? (
              <span className="featured-image-thumb" style={{ backgroundImage: `url(/api/media/${selectedHero.id})` }} />
            ) : (
              <span>No hero image</span>
            )}
          </div>
          <label className="field">
            <span>Hero image</span>
            <select className="select" value={form.heroMediaId} onChange={(event) => setForm({ ...form, heroMediaId: event.target.value })}>
              <option value="">No hero image</option>
              {media.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.originalName}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Hero alt text</span>
            <input className="input" value={form.heroAlt} onChange={(event) => setForm({ ...form, heroAlt: event.target.value })} />
          </label>
          {media.length ? (
            <div className="featured-media-grid">
              {media.slice(0, 6).map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => setForm({ ...form, heroMediaId: asset.id, heroAlt: form.heroAlt || asset.altText || asset.originalName })}
                  title={`Set ${asset.originalName} as hero`}
                >
                  <span className="media-thumb" style={{ backgroundImage: `url(/api/media/${asset.id})` }} />
                </button>
              ))}
            </div>
          ) : null}
        </section>
      </aside>
        </>
      ) : null}
    </div>
  );
}

function articlePayload(form: ArticleForm) {
  return {
    title: form.title,
    slug: form.slug,
    markdown: form.markdown,
    excerpt: form.excerpt || null,
    metaTitle: form.metaTitle || null,
    metaDescription: form.metaDescription || null,
    canonicalUrl: form.canonicalUrl || null,
    heroMediaId: form.heroMediaId || null,
    heroAlt: form.heroAlt || null,
    authorName: form.authorName || null,
    tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
    noindex: form.noindex,
    source: form.source || "MANUAL",
  };
}

function renderPreviewMarkdown(markdown: string) {
  return markdown.replace(/!\[([^\]]*)]\(media:([^)]+)\)/g, "![$1](/api/media/$2)");
}

function markdownToVisualHtml(markdown: string, media: MediaRow[]) {
  const imagePattern = /!\[([^\]]*)]\(([^)]+)\)/g;
  let html = "";
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = imagePattern.exec(markdown)) !== null) {
    if (match.index > cursor) {
      html += markdownTextToHtml(markdown.slice(cursor, match.index));
    }
    html += visualMediaHtml(match[2] || "", match[1] || "", media);
    cursor = match.index + match[0].length;
  }

  if (cursor < markdown.length) {
    html += markdownTextToHtml(markdown.slice(cursor));
  }

  return html;
}

function markdownTextToHtml(text: string) {
  return escapeHtml(text).replace(/\n/g, "<br>");
}

function visualMediaHtml(src: string, alt: string, media: MediaRow[]) {
  const label = alt || editorImageLabel(src, media);
  return [
    `<span class="inline-media-element" contenteditable="false" data-src="${escapeAttribute(src)}" data-alt="${escapeAttribute(alt)}">`,
    `<span class="inline-media-preview" style="background-image: url(&quot;${escapeAttribute(editorImageSrc(src, media))}&quot;)"></span>`,
    `<span class="inline-media-caption">${escapeHtml(label)}</span>`,
    `<button class="inline-media-remove" type="button" data-remove-media="true" aria-label="Remove image">x</button>`,
    "</span>",
  ].join("");
}

function createVisualMediaElement(src: string, alt: string, media: MediaRow[]) {
  const wrapper = document.createElement("span");
  wrapper.className = "inline-media-element";
  wrapper.contentEditable = "false";
  wrapper.dataset.src = src;
  wrapper.dataset.alt = alt;

  const preview = document.createElement("span");
  preview.className = "inline-media-preview";
  preview.style.backgroundImage = `url("${editorImageSrc(src, media)}")`;

  const caption = document.createElement("span");
  caption.className = "inline-media-caption";
  caption.textContent = alt || editorImageLabel(src, media);

  const remove = document.createElement("button");
  remove.className = "inline-media-remove";
  remove.type = "button";
  remove.dataset.removeMedia = "true";
  remove.setAttribute("aria-label", "Remove image");
  remove.textContent = "x";

  wrapper.append(preview, caption, remove);
  return wrapper;
}

function visualEditorToMarkdown(root: HTMLElement) {
  return Array.from(root.childNodes)
    .map((node) => visualNodeToMarkdown(node))
    .join("")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimStart();
}

function visualNodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const element = node as HTMLElement;
  if (element.classList.contains("inline-media-element")) {
    const src = element.dataset.src || "";
    const alt = element.dataset.alt || element.querySelector(".inline-media-caption")?.textContent || "";
    return `![${alt.replaceAll("]", "")}](${src})`;
  }

  const tagName = element.tagName.toLowerCase();
  if (tagName === "br") return "\n";

  const children = Array.from(element.childNodes).map((child) => visualNodeToMarkdown(child)).join("");
  if (tagName === "strong" || tagName === "b") return `**${children}**`;
  if (tagName === "em" || tagName === "i") return `*${children}*`;
  if (tagName === "a") return `[${children}](${element.getAttribute("href") || ""})`;
  if (tagName === "div" || tagName === "p") return `${children}\n`;
  if (tagName === "li") return `- ${children}\n`;
  if (tagName === "ul" || tagName === "ol") return `${children}\n`;
  return children;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function editorImageSrc(src: string, media: MediaRow[]) {
  const mediaId = src.match(/^media:(.+)$/)?.[1];
  if (mediaId) return `/api/media/${mediaId}`;
  if (src.startsWith("/api/media/") || /^https?:\/\//i.test(src)) return src;

  const filename = src.split(/[?#]/)[0]?.split("/").pop();
  const asset = media.find((item) => item.publicPath === src || item.filename === filename || src.endsWith(`/${item.filename}`));
  return asset ? `/api/media/${asset.id}` : src;
}

function editorImageLabel(src: string, media: MediaRow[]) {
  const mediaId = src.match(/^media:(.+)$/)?.[1];
  const filename = src.split(/[?#]/)[0]?.split("/").pop();
  const asset = media.find((item) => item.id === mediaId || item.publicPath === src || item.filename === filename || src.endsWith(`/${item.filename}`));
  return asset?.originalName || src;
}

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function articleToForm(article: ArticleRow | undefined, blogId: string): ArticleForm {
  return {
    id: article?.id,
    blogId: article?.blogId || blogId,
    title: article?.title || "",
    slug: article?.slug || "",
    markdown: article?.markdown || "",
    excerpt: article?.excerpt || "",
    metaTitle: article?.metaTitle || "",
    metaDescription: article?.metaDescription || "",
    canonicalUrl: article?.canonicalUrl || "",
    heroMediaId: article?.heroMediaId || "",
    heroAlt: article?.heroAlt || "",
    authorName: article?.authorName || "",
    tags: article?.tags?.map((entry) => entry.tag.name).join(", ") || "",
    noindex: article?.noindex || false,
    status: article?.status,
    source: article?.source || "MANUAL",
  };
}
