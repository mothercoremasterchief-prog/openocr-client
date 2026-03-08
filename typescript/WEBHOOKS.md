# Webhook Integration — TypeScript SDK

OpenOCR can POST a signed payload to your server when an OCR job completes.

## Quick Start

### 1. Register a webhook URL when submitting a job

```typescript
import { OpenOCR } from "@openocr/client";

const client = new OpenOCR({ apiKey: "sk-your-key" });

const result = await client.ocr({
  engine: "openocr/tesseract",
  url: "https://example.com/document.pdf",
  webhookUrl: "https://your-server.com/webhooks/openocr",
});

console.log(`Job submitted: ${result.jobId}`);
```

### 2. Receive and verify events

```typescript
// Next.js App Router example
import { NextRequest, NextResponse } from "next/server";
import { verifySignature, parseWebhookEvent } from "@openocr/client/webhooks";

const WEBHOOK_SECRET = process.env.OPENOCR_WEBHOOK_SECRET!;

export async function POST(req: NextRequest) {
  const payload = await req.text();
  const signature = req.headers.get("x-openocr-signature") ?? "";

  let valid: boolean;
  try {
    valid = verifySignature(payload, signature, WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: "Invalid signature format" }, { status: 400 });
  }

  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const event = parseWebhookEvent(payload);

  if (event.eventType === "job.complete") {
    console.log(`Job ${event.jobId} done:`, event.extractedText?.slice(0, 100));
    // queue background work here
  } else if (event.eventType === "job.failed") {
    console.error(`Job ${event.jobId} failed:`, event.error);
  }

  return NextResponse.json({ received: true });
}
```

## API Reference

### `verifySignature(payload, signature, secret, toleranceSeconds?)`

Verifies the `X-OpenOCR-Signature` header.

```typescript
function verifySignature(
  payload: string,          // Raw request body (not parsed JSON)
  signature: string,        // X-OpenOCR-Signature header value
  secret: string,           // Your webhook signing secret
  toleranceSeconds?: number // Max age in seconds (default: 300)
): boolean
```

Returns `true` if valid. Returns `false` if the timestamp is outside tolerance (replay attack). **Throws** if the signature format is malformed.

### `parseWebhookEvent(body)`

```typescript
function parseWebhookEvent(body: string | Record<string, unknown>): WebhookEvent
```

### `WebhookEvent`

```typescript
interface WebhookEvent {
  eventType: string;          // "job.complete" | "job.failed"
  jobId: string;              // Async job ID
  requestId: string;          // Request ID
  status: string;             // "succeeded" | "failed"
  engine: string;             // Engine used
  totalPages: number;         // Pages processed
  extractedText?: string;     // Full text (job.complete only)
  error?: string;             // Error message (job.failed only)
  timestamp: number;          // Unix timestamp
  usage?: Record<string, unknown>; // Cost/usage details
}
```

### `constructSignature(payload, secret, timestamp?)`

Generates a valid signature for testing:

```typescript
function constructSignature(
  payload: string,
  secret: string,
  timestamp?: number   // Unix timestamp (defaults to now)
): string              // Returns "t=<ts>,v1=<hmac>"
```

## Signature Format

```
X-OpenOCR-Signature: t=<unix_timestamp>,v1=<hex_hmac_sha256>
```

Signed message: `<timestamp>.<raw_body>`

## Testing Locally

```typescript
import { constructSignature, verifySignature } from "@openocr/client/webhooks";

const secret = "whsec_test-secret";
const payload = JSON.stringify({ event_type: "job.complete", job_id: "job_123", status: "succeeded" });
const sig = constructSignature(payload, secret);

// Simulate what OpenOCR sends:
const response = await fetch("http://localhost:3000/webhooks/openocr", {
  method: "POST",
  body: payload,
  headers: {
    "Content-Type": "application/json",
    "X-OpenOCR-Signature": sig,
  },
});
```

## Security Checklist

- ✅ Always verify the signature before processing
- ✅ Use the **raw body string** for verification (not `JSON.parse` then re-stringify)
- ✅ Store your signing secret in an env var — never hardcode it
- ✅ Return `200` immediately — do heavy work in a background job
- ✅ Make your handler idempotent (OpenOCR may retry on timeout)
