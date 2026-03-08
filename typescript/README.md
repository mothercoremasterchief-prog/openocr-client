# openocr (TypeScript/JavaScript)

TypeScript/JavaScript SDK for the [OpenOCR API](https://open-ocr.com).

## Installation

```bash
npm install openocr
# or
yarn add openocr
```

## Quick Start

```typescript
import { OpenOCR } from "openocr";

const client = new OpenOCR({ apiKey: "sk-ocr-your-api-key" });

// From a URL
const result = await client.ocr({
  engine: "openocr/tesseract",
  url: "https://example.com/document.pdf",
});
console.log(result.extractedText);
```

## Large PDFs (async)

PDFs with >20 pages are processed asynchronously. The client waits by default:

```typescript
// wait: true (default) — resolves when done
const result = await client.ocr({
  engine: "openocr/tesseract",
  url: "https://example.com/annual-report.pdf",
});
console.log(result.extractedText);

// wait: false — returns job_id immediately
const result = await client.ocr({
  engine: "openocr/tesseract",
  url: "https://example.com/annual-report.pdf",
  wait: false,
});
console.log(result.jobId); // poll manually
```

## Streaming Progress

Stream page-by-page progress for multi-page documents:

```typescript
for await (const event of client.stream({ engine: "openocr/tesseract", url })) {
  if (event.type === "job_started")   console.log(`${event.totalPages} pages…`);
  if (event.type === "page_complete") console.log(`Page ${event.pageNumber}/${event.totalPages}`);
  if (event.type === "job_complete")  console.log(event.result?.extractedText);
  if (event.type === "error")         console.error(event.error);
}
```

See [STREAMING.md](STREAMING.md) for full API reference.

## Webhooks

Receive a signed POST when a job completes:

```typescript
import { verifySignature, parseWebhookEvent } from "@openocr/client/webhooks";

// In your POST handler:
const valid = verifySignature(rawBody, req.headers["x-openocr-signature"], secret);
if (!valid) return res.status(400).send("Invalid signature");

const event = parseWebhookEvent(rawBody);
console.log(event.eventType, event.jobId);
```

See [WEBHOOKS.md](WEBHOOKS.md) for Next.js/Express examples and full API reference.
