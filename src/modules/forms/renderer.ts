import { createHmac } from "crypto";
import type { Funnel, PublicWebhookEndpoint } from "@prisma/client";
import { publicWebhookBaseUrl } from "@/lib/env";
import { escapeAttribute, escapeHtml, jsonScript } from "@/lib/utils/html";
import { funnelConfigSchema, type FunnelConfig } from "@/lib/validation/funnels";

type RenderFunnelOptions = {
  funnel: Pick<Funnel, "id" | "slug" | "name" | "configJson" | "styleJson">;
  endpoint: Pick<PublicWebhookEndpoint, "publicId">;
  webhookSecret: string;
  mediaMap?: Record<string, string>;
  embedded?: boolean;
  publicBasePath?: string;
  directPhpEndpoints?: boolean;
};

export function parseFunnelConfig(value: unknown): FunnelConfig {
  return funnelConfigSchema.parse(value);
}

export function renderFunnelHtml(options: RenderFunnelOptions) {
  const config = resolveFunnelMedia(parseFunnelConfig(options.funnel.configJson), options.mediaMap || {});
  const formToken = createFormToken(options.funnel.slug, options.endpoint.publicId, options.webhookSecret);
  const rootId = `aeo-funnel-${options.funnel.id}`;
  const accent = styleValue(options.funnel.styleJson, "accentColor", "#0f766e");
  const primary = styleValue(options.funnel.styleJson, "primaryColor", "#2563eb");
  const css = funnelCss(rootId, primary, accent, Boolean(options.embedded));
  const publicBasePath = normalizePublicBasePath(options.publicBasePath || "");
  const script = funnelScript(rootId, options.funnel.slug, config, formToken, {
    publicBasePath,
    directPhpEndpoints: Boolean(options.directPhpEndpoints),
  });
  const body = `
    <section id="${escapeAttribute(rootId)}" class="aeo-funnel" data-funnel="${escapeAttribute(options.funnel.slug)}">
      <div class="aeo-progress aeo-progress-top"><div data-progress></div></div>
      <div class="aeo-funnel-top">
        <div>
          <div class="aeo-kicker" data-kicker>${escapeHtml(config.intro.kicker)}</div>
          <div class="aeo-step" data-step-label></div>
        </div>
      </div>
      <div class="aeo-funnel-panel">
        <section data-screen="hero">
          <div class="aeo-center">
            <div class="aeo-pill">${escapeHtml(config.intro.kicker)}</div>
            <h2>${escapeHtml(config.intro.title)}</h2>
            <p>${escapeHtml(config.intro.subtitle)}</p>
            <button class="aeo-primary" type="button" data-start>${escapeHtml(config.intro.startButton)}</button>
            <p class="aeo-note">Answer with one tap. Contact details come after your result.</p>
          </div>
        </section>
        <section data-screen="question" hidden>
          <div class="aeo-question-head">
            <h2 data-question-title></h2>
            <p data-question-subtitle></p>
          </div>
          <div class="aeo-choice-grid" data-choices></div>
          <div class="aeo-actions">
            <button type="button" data-back>Back</button>
            <button type="button" data-restart>Restart</button>
          </div>
        </section>
        <section data-screen="result" hidden>
          <div class="aeo-center">
            <div class="aeo-pill">Your Result</div>
            <h2>Here is the estimate.</h2>
            <p data-result-lead></p>
            <div class="aeo-result-box">
              <div class="aeo-result-big" data-result-big></div>
              <ul data-result-bullets></ul>
              <form data-lead-form>
                ${config.leadFields.map(renderField).join("")}
                <input type="text" name="company_website" tabindex="-1" autocomplete="off" class="aeo-hp" />
                <input type="hidden" name="aeo_started_at" data-started-at />
                <input type="hidden" name="aeo_form_token" value="${escapeAttribute(formToken)}" />
                <input type="hidden" name="aeo_event_id" data-event-id />
                <button class="aeo-primary" type="submit">${escapeHtml(config.submit.buttonLabel)}</button>
              </form>
              <p class="aeo-note" data-submit-note></p>
            </div>
            <div class="aeo-actions">
              <button type="button" data-back-result>Back</button>
              <button type="button" data-copy>Copy result</button>
            </div>
          </div>
        </section>
        <section data-screen="done" hidden>
          <div class="aeo-center">
            <div class="aeo-pill">Submitted</div>
            <h2>Thanks. Your result was received.</h2>
          </div>
        </section>
      </div>
      <div class="aeo-progress aeo-progress-bottom"><div data-progress></div></div>
    </section>`;

  if (options.embedded) {
    return `${css}${body}${script}`;
  }

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex,follow" />
  <title>${escapeHtml(options.funnel.name)}</title>
  ${css}
</head>
<body class="aeo-standalone">
  ${body}
  <footer class="aeo-legal"><a href="${escapeAttribute(joinPublicPath(publicBasePath, "terms.html"))}">Terms</a><a href="${escapeAttribute(joinPublicPath(publicBasePath, "privacy.html"))}">Privacy</a></footer>
  ${script}
</body>
</html>`;
}

export function renderSubmitPhp(options: RenderFunnelOptions) {
  const config = parseFunnelConfig(options.funnel.configJson);
  const formToken = createFormToken(options.funnel.slug, options.endpoint.publicId, options.webhookSecret);
  const requiredFields = config.leadFields.filter((field) => field.required).map((field) => field.name);
  const redirectUrl =
    config.submit.successMode === "redirect" && config.submit.redirectUrl
      ? config.submit.redirectUrl
      : "";

  return `<?php
declare(strict_types=1);
header('X-Robots-Tag: noindex, nofollow', true);

$webhookUrl = '${escapePhp(publicWebhookBaseUrl())}/api/public/blog-webhooks/${escapePhp(options.endpoint.publicId)}/leads';
$webhookSecret = '${escapePhp(options.webhookSecret)}';
$expectedToken = '${escapePhp(formToken)}';
$requiredFields = ${phpArray(requiredFields)};
$redirectUrl = '${escapePhp(redirectUrl)}';

function aeo_json_response(int $status, array $payload): void {
  http_response_code($status);
  header('Content-Type: application/json');
  echo json_encode($payload);
  exit;
}

function aeo_fallback_response(array $payload, string $reason): void {
  $dir = dirname(__DIR__) . '/_aeo-private';
  if (!is_dir($dir)) {
    @mkdir($dir, 0750, true);
  }
  $record = [
    'storedAt' => gmdate('c'),
    'reason' => $reason,
    'payload' => $payload,
  ];
  $written = is_dir($dir) && @file_put_contents($dir . '/lead-fallback.jsonl', json_encode($record) . PHP_EOL, FILE_APPEND | LOCK_EX) !== false;
  if ($written) {
    header('X-AEO-Fallback: queued');
    aeo_json_response(202, ['ok' => true, 'queuedFallback' => true]);
  }
  aeo_json_response(502, ['ok' => false, 'error' => 'upstream_failed']);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  aeo_json_response(405, ['ok' => false, 'error' => 'method_not_allowed']);
}

$raw = file_get_contents('php://input') ?: '';
$contentType = $_SERVER['CONTENT_TYPE'] ?? '';
if (stripos($contentType, 'application/json') !== false) {
  $data = json_decode($raw, true);
  if (!is_array($data)) {
    aeo_json_response(400, ['ok' => false, 'error' => 'invalid_json']);
  }
} else {
  $data = $_POST;
}

if (($data['company_website'] ?? '') !== '') {
  aeo_json_response(200, ['ok' => true]);
}

if (($data['aeo_form_token'] ?? '') !== $expectedToken) {
  aeo_json_response(403, ['ok' => false, 'error' => 'invalid_token']);
}

$startedAt = intval($data['aeo_started_at'] ?? 0);
if ($startedAt <= 0 || (time() * 1000 - $startedAt) < 2500) {
  aeo_json_response(400, ['ok' => false, 'error' => 'too_fast']);
}

foreach ($requiredFields as $field) {
  if (!isset($data[$field]) || trim((string)$data[$field]) === '') {
    aeo_json_response(400, ['ok' => false, 'error' => 'missing_' . $field]);
  }
}

$remoteSubmissionId = $data['remoteSubmissionId'] ?? bin2hex(random_bytes(16));
$payload = [
  'remoteSubmissionId' => $remoteSubmissionId,
  'funnelSlug' => '${escapePhp(options.funnel.slug)}',
  'email' => $data['email'] ?? null,
  'phone' => $data['phone'] ?? null,
  'name' => $data['name'] ?? null,
  'fields' => $data,
  'answers' => $data['answers'] ?? [],
  'result' => $data['result'] ?? [],
  'resultText' => $data['resultText'] ?? null,
  'sourceUrl' => $data['sourceUrl'] ?? ($_SERVER['HTTP_REFERER'] ?? null),
  'referrer' => $data['referrer'] ?? ($_SERVER['HTTP_REFERER'] ?? null),
  'userAgent' => $_SERVER['HTTP_USER_AGENT'] ?? null,
  'eventId' => $data['aeo_event_id'] ?? ($data['eventId'] ?? null),
  'utm' => $data['utm'] ?? [],
  'tracking' => $data['tracking'] ?? [],
];

$body = json_encode($payload);
$timestamp = (string) time();
$signature = hash_hmac('sha256', $timestamp . '.' . $body, $webhookSecret);

$ch = curl_init($webhookUrl);
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_POSTFIELDS => $body,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_CONNECTTIMEOUT => 8,
  CURLOPT_TIMEOUT => 15,
  CURLOPT_HTTPHEADER => [
    'Content-Type: application/json',
    'X-AEO-Timestamp: ' . $timestamp,
    'X-AEO-Signature: ' . $signature,
  ],
]);
$response = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error = curl_error($ch);
curl_close($ch);

if ($response === false || $status < 200 || $status >= 300) {
  $reason = $response === false ? ($error ?: 'curl_failed') : ('http_' . $status);
  aeo_fallback_response($payload, $reason);
}

if ($redirectUrl !== '') {
  header('Location: ' . $redirectUrl, true, 303);
  exit;
}

aeo_json_response(200, ['ok' => true]);
`;
}

export function renderTrackPhp(endpoint: Pick<PublicWebhookEndpoint, "publicId">, webhookSecret: string) {
  return `<?php
declare(strict_types=1);
header('X-Robots-Tag: noindex, nofollow', true);

$webhookUrl = '${escapePhp(publicWebhookBaseUrl())}/api/public/blog-webhooks/${escapePhp(endpoint.publicId)}/events';
$webhookSecret = '${escapePhp(webhookSecret)}';
$raw = file_get_contents('php://input') ?: '';
$contentType = $_SERVER['CONTENT_TYPE'] ?? '';
if ($_SERVER['REQUEST_METHOD'] === 'POST' && stripos($contentType, 'application/json') !== false) {
  $decoded = json_decode($raw, true);
  $payload = is_array($decoded) ? $decoded : [];
} else {
  $payload = $_SERVER['REQUEST_METHOD'] === 'POST' ? $_POST : $_GET;
}
$server = [];
foreach ($_SERVER as $key => $value) {
  if (strpos($key, 'HTTP_') === 0 || in_array($key, ['REMOTE_ADDR', 'REQUEST_METHOD', 'QUERY_STRING', 'REQUEST_URI', 'SERVER_NAME', 'SERVER_PORT', 'HTTPS'], true)) {
    $server[$key] = $value;
  }
}
$payload['userAgent'] = $_SERVER['HTTP_USER_AGENT'] ?? null;
$payload['referrer'] = $payload['referrer'] ?? ($_SERVER['HTTP_REFERER'] ?? null);
$payload['query'] = $payload['query'] ?? $_GET;
$payload['server'] = $server;
$body = json_encode($payload);
$timestamp = (string) time();
$signature = hash_hmac('sha256', $timestamp . '.' . $body, $webhookSecret);

$ch = curl_init($webhookUrl);
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_POSTFIELDS => $body,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_CONNECTTIMEOUT => 5,
  CURLOPT_TIMEOUT => 10,
  CURLOPT_HTTPHEADER => [
    'Content-Type: application/json',
    'X-AEO-Timestamp: ' . $timestamp,
    'X-AEO-Signature: ' . $signature,
  ],
]);
curl_exec($ch);
curl_close($ch);

http_response_code(204);
`;
}

export function createFormToken(funnelSlug: string, publicId: string, secret: string) {
  return createHmac("sha256", secret).update(`${publicId}.${funnelSlug}`).digest("hex");
}

function renderField(field: FunnelConfig["leadFields"][number]) {
  const label = field.name.charAt(0).toUpperCase() + field.name.slice(1);
  return `<label><span>${escapeHtml(label)}</span><input name="${escapeAttribute(field.name)}" type="${escapeAttribute(field.type)}" ${field.required ? "required" : ""} autocomplete="${field.type === "email" ? "email" : "on"}" /></label>`;
}

function funnelCss(rootId: string, primary: string, accent: string, embedded: boolean) {
  return `<style>
#${rootId}{--aeo-primary:${primary};--aeo-accent:${accent};--aeo-ink:#172033;--aeo-muted:#5a6475;--aeo-line:#dfe6f0;--aeo-panel:#ffffff;font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Arial,sans-serif;color:var(--aeo-ink);${embedded ? "margin:34px 0;padding:18px;border:1px solid var(--aeo-line);border-left:4px solid var(--aeo-accent);border-radius:8px;background:linear-gradient(180deg,#fff 0%,#f8fbff 100%);box-shadow:0 18px 40px rgba(23,32,51,.06);" : "max-width:1050px;margin:20px auto;padding:0 16px;"}}
.aeo-standalone{margin:0;background:#f4f7fb}
#${rootId} *{box-sizing:border-box}
#${rootId} .aeo-progress{height:6px;background:#e6edf5;border-radius:999px;overflow:hidden}
#${rootId} .aeo-progress>div{height:100%;width:0;background:var(--aeo-accent);transition:width .25s ease}
#${rootId} .aeo-progress-top{margin-bottom:14px}
#${rootId} .aeo-progress-bottom{display:none}
#${rootId} .aeo-funnel-top{display:flex;align-items:center;justify-content:space-between;padding:0 0 14px}
#${rootId} .aeo-kicker{color:var(--aeo-accent);font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}
#${rootId} .aeo-step,#${rootId} .aeo-note{color:var(--aeo-muted);font-size:13px}
#${rootId} .aeo-funnel-panel{${embedded ? "background:transparent;border:0;border-radius:8px;box-shadow:none;padding:6px 0 2px" : "background:var(--aeo-panel);border:1px solid var(--aeo-line);border-radius:8px;box-shadow:0 18px 45px rgba(23,32,51,.08);padding:24px 18px"}}
#${rootId} .aeo-center{max-width:760px;${embedded ? "margin:0;text-align:left" : "margin:0 auto;text-align:center"}}
#${rootId} h2{font-size:${embedded ? "clamp(24px,3.2vw,34px)" : "clamp(26px,4vw,42px)"};line-height:1.12;margin:8px 0 10px;color:var(--aeo-ink);letter-spacing:0}
#${rootId} p{color:var(--aeo-muted);font-size:16px;line-height:1.5;margin:0 0 16px}
#${rootId} .aeo-pill{display:inline-flex;align-items:center;border:1px solid color-mix(in srgb,var(--aeo-accent) 22%,white);background:color-mix(in srgb,var(--aeo-accent) 10%,white);color:var(--aeo-accent);font-size:12px;font-weight:900;border-radius:999px;padding:6px 10px;margin-bottom:8px}
#${rootId} .aeo-primary{border:0;background:var(--aeo-primary);color:#fff;font-weight:900;border-radius:8px;padding:13px 18px;min-height:46px;cursor:pointer}
#${rootId} .aeo-primary:hover{filter:brightness(.94)}
#${rootId} .aeo-question-head{text-align:${embedded ? "left" : "center"};max-width:820px;${embedded ? "margin:0" : "margin:0 auto"}}
#${rootId} .aeo-question-head h2{max-width:900px}
#${rootId} .aeo-choice-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;${embedded ? "margin:18px 0 0" : "margin:18px auto 0"};max-width:900px}
#${rootId} .aeo-choice{align-items:center;border:1px solid var(--aeo-line);border-radius:8px;background:#fff;color:var(--aeo-ink);cursor:pointer;display:grid;gap:12px;grid-template-columns:auto minmax(0,1fr);min-height:94px;padding:14px;text-align:left;transition:border-color .18s ease,box-shadow .18s ease,transform .18s ease,background .18s ease}
#${rootId} .aeo-choice:hover{background:#fbfdff;border-color:var(--aeo-accent);box-shadow:0 12px 28px rgba(23,32,51,.1);transform:translateY(-1px)}
#${rootId} .aeo-choice:focus-visible{outline:3px solid color-mix(in srgb,var(--aeo-accent) 20%,transparent);outline-offset:2px}
#${rootId} .aeo-choice.has-media{align-content:start;grid-template-columns:1fr;gap:0;min-height:260px;overflow:hidden;padding:0}
#${rootId} .aeo-choice-media{background:#eef3f9;display:block;min-height:168px;overflow:hidden;width:100%}
#${rootId} .aeo-choice-media img{width:100%;height:100%;min-height:168px;display:block;object-fit:cover}
#${rootId} .aeo-choice.has-media .aeo-choice-copy{background:var(--aeo-primary);color:#fff;gap:5px;min-height:78px;padding:14px;text-align:center}
#${rootId} .aeo-choice.has-media .aeo-choice-label{color:#fff;font-size:17px}
#${rootId} .aeo-choice.has-media .aeo-choice-hint{color:rgba(255,255,255,.82)}
#${rootId} .aeo-choice-icon{align-items:center;background:color-mix(in srgb,var(--aeo-accent) 10%,white);border:1px solid color-mix(in srgb,var(--aeo-accent) 22%,white);border-radius:8px;color:var(--aeo-accent);display:flex;height:48px;justify-content:center;width:48px}
#${rootId} .aeo-choice-icon svg{display:block;height:24px;width:24px}
#${rootId} .aeo-choice-copy{display:grid;gap:3px;min-width:0}
#${rootId} .aeo-choice-label{color:var(--aeo-ink);font-weight:900;line-height:1.2}
#${rootId} .aeo-choice-hint{color:var(--aeo-muted);font-size:13px;font-weight:750;line-height:1.35}
#${rootId} .aeo-actions{display:flex;justify-content:space-between;gap:12px;border-top:1px solid var(--aeo-line);padding-top:14px;margin-top:18px}
#${rootId} .aeo-actions button{border:0;background:transparent;color:var(--aeo-muted);font-weight:800;cursor:pointer;padding:9px 6px}
#${rootId} .aeo-result-box{border:1px solid var(--aeo-line);border-radius:8px;text-align:left;padding:16px;background:#fff}
#${rootId} .aeo-result-big{font-size:24px;font-weight:950;margin-bottom:10px}
#${rootId} ul{margin:0 0 14px;padding-left:20px;color:var(--aeo-ink)}
#${rootId} li{margin:7px 0;line-height:1.4}
#${rootId} form{display:grid;gap:10px;margin-top:14px}
#${rootId} label{display:grid;gap:6px;color:var(--aeo-muted);font-size:13px;font-weight:800}
#${rootId} input{width:100%;border:1px solid var(--aeo-line);border-radius:8px;min-height:46px;padding:10px 12px;font-size:16px}
#${rootId} input:focus{outline:3px solid color-mix(in srgb,var(--aeo-accent) 20%,transparent);border-color:var(--aeo-accent)}
#${rootId} .aeo-hp{position:absolute;left:-10000px}
.aeo-legal{display:flex;justify-content:center;gap:16px;padding:8px 0 24px;font:13px system-ui}.aeo-legal a{color:#5a6475}
@media(max-width:640px){#${rootId}{padding:14px}#${rootId} .aeo-choice-grid{grid-template-columns:1fr}#${rootId} .aeo-funnel-panel{padding:4px 0}#${rootId} .aeo-choice.has-media{min-height:220px}#${rootId} .aeo-choice-media,#${rootId} .aeo-choice-media img{min-height:142px}}
</style>`;
}

function funnelScript(
  rootId: string,
  slug: string,
  config: FunnelConfig,
  formToken: string,
  options: { publicBasePath: string; directPhpEndpoints: boolean }
) {
  const trackUrl = joinPublicPath(options.publicBasePath, options.directPhpEndpoints ? "track/collect.php" : "track/collect.html");
  const submitUrl = joinPublicPath(options.publicBasePath, `forms/${slug}-submit.${options.directPhpEndpoints ? "php" : "html"}`);
  return `<script>
(() => {
  const root = document.getElementById(${JSON.stringify(rootId)});
  if (!root) return;
  const config = ${jsonScript(config)};
  const slug = ${JSON.stringify(slug)};
  const formToken = ${JSON.stringify(formToken)};
  const trackUrl = ${JSON.stringify(trackUrl)};
  const submitUrl = ${JSON.stringify(submitUrl)};
  const screens = {
    hero: root.querySelector('[data-screen="hero"]'),
    question: root.querySelector('[data-screen="question"]'),
    result: root.querySelector('[data-screen="result"]'),
    done: root.querySelector('[data-screen="done"]')
  };
  const state = { step: -1, answers: {}, result: null, eventId: crypto.randomUUID ? crypto.randomUUID() : 'evt_' + Date.now() + '_' + Math.random().toString(36).slice(2) };
  const $ = (selector) => root.querySelector(selector);
  const money = (value) => Number(value).toLocaleString('en-US', { style:'currency', currency: config.result.currency || 'USD', maximumFractionDigits:0 });
  const iconSvg = (name) => {
    const icons = {
      check: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 6 9 17l-5-5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      search: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m21 21-4.35-4.35" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2.2"/></svg>',
      phone: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7.5 4.5 10 7 8.2 9.2c1 2 2.6 3.6 4.6 4.6L15 12l2.5 2.5-1.4 3c-.3.7-1.1 1.1-1.8.9-4.5-1.1-7.9-4.5-9-9-.1-.7.2-1.5.9-1.8l1.3-3.1Z" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      shield: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3 19 6v5c0 4.4-2.8 8.2-7 9.8-4.2-1.6-7-5.4-7-9.8V6l7-3Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="m9 12 2 2 4-5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      money: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v18M16.5 7.5c-.9-1-2.3-1.5-4.1-1.5-2.1 0-3.7 1-3.7 2.7 0 4.3 8.6 1.8 8.6 6.2 0 1.9-1.8 3.1-4.5 3.1-2 0-3.7-.7-4.8-2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
      calendar: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 3v4M17 3v4M4.5 9h15M6.5 5h11A2.5 2.5 0 0 1 20 7.5v10A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5v-10A2.5 2.5 0 0 1 6.5 5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
    };
    return icons[name] || icons.check;
  };
  const choiceIcon = (option) => {
    const text = String((option.value || '') + ' ' + (option.label || '')).toLowerCase();
    if (text.includes('research')) return iconSvg('search');
    if (text.includes('miss') || text.includes('call')) return iconSvg('phone');
    if (text.includes('always') || text.includes('voicemail') || text.includes('fine')) return iconSvg('shield');
    if (text.includes('300') || text.includes('value') || text.includes('$')) return iconSvg('money');
    if (text.includes('book')) return iconSvg('calendar');
    return iconSvg('check');
  };
  const choiceHint = (option) => {
    const value = String(option.value || '');
    const hints = {
      owner: 'You can approve changes.',
      not_owner: 'You are gathering options.',
      miss_regular: 'Busy moments may leak jobs.',
      miss_never: 'Good baseline to compare.',
      value_high: 'Each missed call matters.',
      value_low: 'Keep the estimate conservative.',
      want_yes: 'Show the upside.',
      want_no: 'No pressure, just compare.'
    };
    return hints[value] || 'Tap to choose this answer.';
  };
  const show = (screen) => Object.entries(screens).forEach(([name, el]) => { if (el) el.hidden = name !== screen; });
  const progress = () => {
    const total = config.questions.length + 1;
    const current = Math.max(0, Math.min(total, state.step + 1));
    root.querySelectorAll('[data-progress]').forEach((el) => el.style.width = ((current / total) * 100).toFixed(1) + '%');
    const label = $('[data-step-label]');
    const kicker = $('[data-kicker]');
    if (state.step < 0) { label.textContent = ''; kicker.textContent = config.intro.kicker; }
    else if (state.step < config.questions.length) { label.textContent = 'Question ' + (state.step + 1) + ' of ' + config.questions.length; kicker.textContent = config.questions[state.step].kicker; }
    else { label.textContent = 'Last step'; kicker.textContent = 'Result'; }
  };
  const renderQuestion = () => {
    const q = config.questions[state.step];
    $('[data-question-title]').textContent = q.title;
    $('[data-question-subtitle]').textContent = q.subtitle;
    const choices = $('[data-choices]');
    choices.innerHTML = '';
    q.options.forEach((option) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'aeo-choice' + (option.imageUrl ? ' has-media' : '');
      const visual = document.createElement('span');
      if (option.imageUrl) {
        visual.className = 'aeo-choice-media';
        const img = document.createElement('img');
        img.src = option.imageUrl;
        img.alt = '';
        img.loading = 'lazy';
        visual.appendChild(img);
      } else {
        visual.className = 'aeo-choice-icon';
        visual.innerHTML = choiceIcon(option);
      }
      const copy = document.createElement('span');
      copy.className = 'aeo-choice-copy';
      const label = document.createElement('span');
      label.className = 'aeo-choice-label';
      label.textContent = option.label;
      const hint = document.createElement('span');
      hint.className = 'aeo-choice-hint';
      hint.textContent = choiceHint(option);
      copy.append(label, hint);
      card.append(visual, copy);
      card.addEventListener('click', () => { state.answers[q.id] = option.value; next(); });
      choices.appendChild(card);
    });
  };
  const calculate = () => {
    const constants = Object.assign({ missedCallsRegular:6, missedCallsFloor:1, highValuePerMissedCall:450, lowValuePerMissedCall:300, lossFactor:.6, subscriptionComparisonMonthly:49 }, config.result.constants || {});
    const owner = state.answers.owner === 'owner';
    const misses = state.answers.missed === 'miss_regular';
    const high = state.answers.value === 'value_high';
    const wants = state.answers.want === 'want_yes';
    const missedCallsPerWeek = misses ? constants.missedCallsRegular : constants.missedCallsFloor;
    const valuePerMissedCall = high ? constants.highValuePerMissedCall : constants.lowValuePerMissedCall;
    const weeklyLost = Math.round(missedCallsPerWeek * valuePerMissedCall * constants.lossFactor);
    const monthlyLost = weeklyLost * 4;
    const bullets = [
      'Missed calls/week: ' + missedCallsPerWeek + '.',
      'Value per missed call: ' + money(valuePerMissedCall) + '.',
      'Loss factor applied: ' + Math.round(constants.lossFactor * 100) + '%.',
      'Estimated loss: ' + money(weeklyLost) + '/week (' + money(monthlyLost) + '/month).'
    ];
    if (misses && wants && constants.subscriptionComparisonMonthly > 0) bullets.push('The monthly leak is roughly ' + (monthlyLost / constants.subscriptionComparisonMonthly).toFixed(1) + 'x the comparison cost.');
    state.result = { weeklyLost, monthlyLost, missedCallsPerWeek, valuePerMissedCall, qualified: owner && (misses || wants), bullets };
    state.resultText = 'Weekly estimated leak: ' + money(weeklyLost) + '\\nMonthly estimated leak: ' + money(monthlyLost);
    $('[data-result-lead]').textContent = !owner ? 'This is most useful for owners and decision-makers.' : (misses ? 'Missed calls usually mean lost jobs.' : 'Even strong teams can leak value after hours or during rushes.');
    $('[data-result-big]').textContent = money(weeklyLost) + ' / week likely leaking';
    $('[data-result-bullets]').innerHTML = bullets.map((line) => '<li>' + line + '</li>').join('');
    $('[data-event-id]').value = state.eventId;
  };
  const track = (eventName, extra) => {
    if (eventName === 'Lead' && window.AEOAnalytics && typeof window.AEOAnalytics.trackLead === 'function') {
      window.AEOAnalytics.trackLead(state.eventId, Object.assign({ funnelSlug: slug }, extra || {}));
      return;
    }
    const params = new URLSearchParams(Object.assign({
      event_name: eventName,
      event_id: state.eventId,
      source_url: window.location.href,
      referrer: document.referrer || '',
      funnel_slug: slug
    }, extra || {}));
    const url = trackUrl + '?' + params.toString();
    if (navigator.sendBeacon) navigator.sendBeacon(url);
    else (new Image()).src = url + '&_cb=' + Date.now();
  };
  const next = () => {
    state.step++;
    progress();
    if (state.step < config.questions.length) { show('question'); renderQuestion(); }
    else { show('result'); calculate(); track('ViewContent', { content_type:'quiz', content_name:slug }); }
  };
  const back = () => {
    if (state.step <= 0) return;
    state.step--;
    progress();
    show('question');
    renderQuestion();
  };
  const restart = () => {
    state.step = -1;
    state.answers = {};
    state.result = null;
    progress();
    show('hero');
  };
  $('[data-start]').addEventListener('click', next);
  $('[data-back]').addEventListener('click', back);
  $('[data-restart]').addEventListener('click', restart);
  $('[data-back-result]').addEventListener('click', () => { state.step = config.questions.length - 1; progress(); show('question'); renderQuestion(); });
  $('[data-copy]').addEventListener('click', async () => navigator.clipboard && navigator.clipboard.writeText(state.resultText || ''));
  const started = $('[data-started-at]');
  if (started) started.value = String(Date.now());
  $('[data-lead-form]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const fields = Object.fromEntries(formData.entries());
    const payload = Object.assign({}, fields, {
      aeo_form_token: formToken,
      aeo_started_at: fields.aeo_started_at || Date.now(),
      remoteSubmissionId: crypto.randomUUID ? crypto.randomUUID() : 'sub_' + Date.now(),
      answers: state.answers,
      result: state.result,
      resultText: state.resultText,
      sourceUrl: window.location.href,
      referrer: document.referrer || '',
      utm: Object.fromEntries(new URLSearchParams(window.location.search).entries()),
      tracking: window.AEOAnalytics && typeof window.AEOAnalytics.context === 'function'
        ? window.AEOAnalytics.context()
        : {}
    });
    track('Lead', { content_type:'lead', content_name:slug });
    const response = await fetch(submitUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'same-origin'
    });
    if (!response.ok) {
      $('[data-submit-note]').textContent = 'Submission failed. Please try again.';
      return;
    }
    show('done');
  });
  progress();
})();
</script>`;
}

function normalizePublicBasePath(value: string) {
  if (!value || value === "/") return "";
  return `/${value.replace(/^\/+|\/+$/g, "")}`;
}

function joinPublicPath(basePath: string, itemPath: string) {
  const cleanBase = normalizePublicBasePath(basePath);
  const cleanPath = itemPath.replace(/^\/+/, "");
  return `${cleanBase}/${cleanPath}`;
}

function styleValue(value: unknown, key: string, fallback: string) {
  if (value && typeof value === "object" && key in value) {
    const maybe = (value as Record<string, unknown>)[key];
    if (typeof maybe === "string" && /^#[0-9a-fA-F]{6}$/.test(maybe)) return maybe;
  }
  return fallback;
}

function escapePhp(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function phpArray(values: string[]) {
  return `[${values.map((value) => `'${escapePhp(value)}'`).join(", ")}]`;
}

function resolveFunnelMedia(config: FunnelConfig, mediaMap: Record<string, string>): FunnelConfig {
  return {
    ...config,
    questions: config.questions.map((question) => ({
      ...question,
      options: question.options.map((option) => ({
        ...option,
        imageUrl:
          (option.imageMediaId ? mediaMap[option.imageMediaId] : undefined) ||
          (option.imageUrl ? mediaMap[option.imageUrl] : undefined) ||
          option.imageUrl,
      })),
    })),
  };
}
