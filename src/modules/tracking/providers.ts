import { createHash } from "crypto";
import type { IntegrationCredential, TrackingEvent } from "@prisma/client";
import { decryptJson } from "@/lib/crypto/encryption";

export type ProviderConfig = Record<string, unknown>;

export type NormalizedTrackingEvent = {
  eventName: string;
  eventId: string;
  eventTime: Date;
  sourceUrl?: string | null;
  userAgent?: string | null;
  email?: string | null;
  phone?: string | null;
  payload: Record<string, unknown>;
};

export type ProviderSendResult = {
  ok: boolean;
  status?: number;
  response?: unknown;
  error?: string;
};

export interface ConversionProvider {
  provider: "META" | "TIKTOK" | "REDDIT" | "OPENAI_ADS";
  buildBrowserSnippet(config: ProviderConfig): string;
  buildServerPayload(event: NormalizedTrackingEvent, config: ProviderConfig): unknown;
  send(event: TrackingEvent, credential: IntegrationCredential): Promise<ProviderSendResult>;
}

export const metaProvider: ConversionProvider = {
  provider: "META",
  buildBrowserSnippet(config) {
    const pixelId = String(config.pixelId || "");
    if (!pixelId) return "";
    return `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixelId}');`;
  },
  buildServerPayload(event, config) {
    const customData = { ...event.payload };
    delete customData.email;
    delete customData.phone;
    delete customData.userAgent;
    delete customData.fbp;
    delete customData.fbc;
    return {
      data: [
        {
          event_name: event.eventName,
          event_time: Math.floor(event.eventTime.getTime() / 1000),
          event_id: event.eventId,
          action_source: "website",
          event_source_url: event.sourceUrl,
          user_data: {
            client_user_agent: event.userAgent || undefined,
            em: event.email ? [hashForMeta(event.email)] : undefined,
            ph: event.phone ? [hashForMeta(event.phone)] : undefined,
            fbp: typeof event.payload.fbp === "string" ? event.payload.fbp : undefined,
            fbc: typeof event.payload.fbc === "string" ? event.payload.fbc : undefined,
          },
          custom_data: customData,
        },
      ],
      test_event_code: config.testEventCode || undefined,
    };
  },
  async send(event, credential) {
    const config = credential.settingsJson as ProviderConfig | null;
    const secrets = decryptJson<Record<string, string>>(credential.secretsEncryptedJson, {});
    const pixelId = String(config?.pixelId || "");
    const accessToken = secrets.accessToken;
    if (!pixelId || !accessToken) {
      return { ok: false, error: "Meta pixel ID or access token missing" };
    }
    const payload = this.buildServerPayload(
      normalizeStoredEvent(event),
      config || {}
    );
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, response: body, error: response.ok ? undefined : JSON.stringify(body) };
  },
};

const stubProvider = (provider: ConversionProvider["provider"]): ConversionProvider => ({
  provider,
  buildBrowserSnippet() {
    return "";
  },
  buildServerPayload(event) {
    return {
      event_name: event.eventName,
      event_id: event.eventId,
      event_time: event.eventTime.toISOString(),
      source_url: event.sourceUrl,
      payload: event.payload,
    };
  },
  async send() {
    return { ok: false, error: `${provider} adapter is scaffolded but not fully implemented in V1.` };
  },
});

export const providers: Record<ConversionProvider["provider"], ConversionProvider> = {
  META: metaProvider,
  TIKTOK: stubProvider("TIKTOK"),
  REDDIT: stubProvider("REDDIT"),
  OPENAI_ADS: stubProvider("OPENAI_ADS"),
};

export function normalizeStoredEvent(event: TrackingEvent): NormalizedTrackingEvent {
  const payload =
    event.payloadJson && typeof event.payloadJson === "object"
      ? (event.payloadJson as Record<string, unknown>)
      : {};
  return {
    eventName: event.eventName,
    eventId: event.eventId,
    eventTime: event.eventTime,
    sourceUrl: event.sourceUrl,
    userAgent: typeof payload.userAgent === "string" ? payload.userAgent : null,
    email: typeof payload.email === "string" ? payload.email : null,
    phone: typeof payload.phone === "string" ? payload.phone : null,
    payload,
  };
}

function hashForMeta(value: string) {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}
