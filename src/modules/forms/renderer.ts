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
            <p class="aeo-kicker" data-question-meta></p>
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
$payload = $_SERVER['REQUEST_METHOD'] === 'POST' ? $_POST : $_GET;
$payload['userAgent'] = $_SERVER['HTTP_USER_AGENT'] ?? null;
$payload['referrer'] = $payload['referrer'] ?? ($_SERVER['HTTP_REFERER'] ?? null);
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
#${rootId}{--aeo-primary:${primary};--aeo-accent:${accent};--aeo-ink:#172033;--aeo-muted:#5a6475;--aeo-line:#dfe6f0;--aeo-panel:#ffffff;font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Arial,sans-serif;color:var(--aeo-ink);${embedded ? "margin:28px 0;" : "max-width:1050px;margin:20px auto;padding:0 16px;"}}
.aeo-standalone{margin:0;background:#f4f7fb}
#${rootId} *{box-sizing:border-box}
#${rootId} .aeo-progress{height:8px;background:#e6edf5;border-radius:999px;overflow:hidden}
#${rootId} .aeo-progress>div{height:100%;width:0;background:var(--aeo-accent);transition:width .25s ease}
#${rootId} .aeo-progress-top{margin-bottom:12px}
#${rootId} .aeo-progress-bottom{margin-top:12px}
#${rootId} .aeo-funnel-top{display:flex;align-items:center;justify-content:space-between;padding:8px 2px 12px}
#${rootId} .aeo-kicker{color:var(--aeo-accent);font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}
#${rootId} .aeo-step,.aeo-note{color:var(--aeo-muted);font-size:13px}
#${rootId} .aeo-funnel-panel{background:var(--aeo-panel);border:1px solid var(--aeo-line);border-radius:8px;box-shadow:0 18px 45px rgba(23,32,51,.08);padding:24px 18px}
#${rootId} .aeo-center{max-width:760px;margin:0 auto;text-align:center}
#${rootId} h2{font-size:clamp(26px,4vw,42px);line-height:1.08;margin:8px 0 12px;color:var(--aeo-ink);letter-spacing:0}
#${rootId} p{color:var(--aeo-muted);font-size:17px;line-height:1.45;margin:0 0 16px}
#${rootId} .aeo-pill{display:inline-flex;align-items:center;border:1px solid color-mix(in srgb,var(--aeo-accent) 22%,white);background:color-mix(in srgb,var(--aeo-accent) 10%,white);color:var(--aeo-accent);font-size:12px;font-weight:900;border-radius:999px;padding:7px 11px;margin-bottom:8px}
#${rootId} .aeo-primary{border:0;background:var(--aeo-primary);color:#fff;font-weight:900;border-radius:8px;padding:13px 18px;min-height:46px;cursor:pointer}
#${rootId} .aeo-primary:hover{filter:brightness(.94)}
#${rootId} .aeo-question-head{text-align:center;max-width:820px;margin:0 auto}
#${rootId} .aeo-choice-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:18px auto 0;max-width:760px}
#${rootId} .aeo-choice{border:1px solid var(--aeo-line);border-radius:8px;background:#fff;overflow:hidden;text-align:left;cursor:pointer}
#${rootId} .aeo-choice:hover{border-color:var(--aeo-accent);box-shadow:0 12px 30px rgba(23,32,51,.12)}
#${rootId} .aeo-choice-media{aspect-ratio:4/2.7;background:#eef3f9;display:flex;align-items:center;justify-content:center;color:var(--aeo-muted);font-weight:800}
#${rootId} .aeo-choice-media img{width:100%;height:100%;display:block;object-fit:cover}
#${rootId} .aeo-choice-label{padding:12px 13px;background:var(--aeo-primary);color:#fff;font-weight:900;min-height:58px;display:flex;align-items:center;justify-content:center;text-align:center}
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
@media(max-width:640px){#${rootId} .aeo-choice-grid{grid-template-columns:1fr}#${rootId} .aeo-funnel-panel{padding:18px 12px}}
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
    $('[data-question-meta]').textContent = 'Question ' + (state.step + 1) + ' of ' + config.questions.length;
    $('[data-question-title]').textContent = q.title;
    $('[data-question-subtitle]').textContent = q.subtitle;
    const choices = $('[data-choices]');
    choices.innerHTML = '';
    q.options.forEach((option) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'aeo-choice';
      const media = option.imageUrl ? '<img src="' + option.imageUrl.replace(/"/g, '&quot;') + '" alt="" loading="lazy" />' : '<span>' + option.label + '</span>';
      card.innerHTML = '<div class="aeo-choice-media">' + media + '</div><div class="aeo-choice-label">' + option.label + '</div>';
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
      utm: Object.fromEntries(new URLSearchParams(window.location.search).entries())
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
