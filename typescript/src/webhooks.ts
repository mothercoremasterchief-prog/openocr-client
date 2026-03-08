import { createHmac, timingSafeEqual } from "crypto";

/** A parsed webhook event payload. */
export interface WebhookEvent {
  eventType: string;
  jobId: string;
  requestId: string;
  status: string;
  engine: string;
  totalPages: number;
  extractedText?: string;
  error?: string;
  timestamp: number;
  usage?: Record<string, unknown>;
}

/**
 * Parse a webhook event from a JSON body.
 */
export function parseWebhookEvent(body: string | Record<string, unknown>): WebhookEvent {
  const data = typeof body === "string" ? JSON.parse(body) : body;
  return {
    eventType: data.event_type ?? data.event ?? "",
    jobId: data.job_id ?? "",
    requestId: data.request_id ?? "",
    status: data.status ?? "",
    engine: data.engine ?? "",
    totalPages: data.total_pages ?? 0,
    extractedText: data.extracted_text,
    error: data.error,
    timestamp: data.timestamp ?? 0,
    usage: data.usage,
  };
}

/**
 * Verify an OpenOCR webhook signature.
 *
 * The signature format is: `t=<timestamp>,v1=<hex-hmac-sha256>`
 *
 * Verification:
 * 1. Parse the timestamp and HMAC from the signature header.
 * 2. Check the timestamp is within tolerance (default: 5 minutes).
 * 3. Compute `HMAC-SHA256(secret, "<timestamp>.<payload>")`
 * 4. Compare against the provided HMAC using constant-time comparison.
 *
 * @param payload - The raw request body as a string.
 * @param signature - The `X-OpenOCR-Signature` header value.
 * @param secret - Your webhook signing secret.
 * @param toleranceSeconds - Max age of the signature in seconds (default: 300).
 * @returns `true` if the signature is valid.
 * @throws Error if the signature format is invalid.
 */
export function verifySignature(
  payload: string,
  signature: string,
  secret: string,
  toleranceSeconds: number = 300
): boolean {
  // Parse signature: t=<timestamp>,v1=<hmac>
  const parts: Record<string, string> = {};
  for (const part of signature.split(",")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx !== -1) {
      parts[part.slice(0, eqIdx).trim()] = part.slice(eqIdx + 1).trim();
    }
  }

  const timestampStr = parts.t;
  const providedHmac = parts.v1;

  if (!timestampStr || !providedHmac) {
    throw new Error(
      `Invalid signature format. Expected 't=<timestamp>,v1=<hmac>', got: '${signature}'`
    );
  }

  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) {
    throw new Error(`Invalid timestamp in signature: '${timestampStr}'`);
  }

  // Check timestamp tolerance
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSeconds) {
    return false;
  }

  // Compute expected HMAC
  const signedPayload = `${timestamp}.${payload}`;
  const expectedHmac = createHmac("sha256", secret).update(signedPayload).digest("hex");

  // Constant-time comparison
  const a = Buffer.from(expectedHmac, "utf-8");
  const b = Buffer.from(providedHmac, "utf-8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Construct an OpenOCR webhook signature (for testing).
 *
 * @param payload - The request body.
 * @param secret - The webhook signing secret.
 * @param timestamp - Optional unix timestamp (defaults to now).
 * @returns Signature string in format `t=<timestamp>,v1=<hmac>`.
 */
export function constructSignature(
  payload: string,
  secret: string,
  timestamp?: number
): string {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const signedPayload = `${ts}.${payload}`;
  const sig = createHmac("sha256", secret).update(signedPayload).digest("hex");
  return `t=${ts},v1=${sig}`;
}
