# Streaming OCR — TypeScript SDK

The TypeScript SDK streams OCR progress via async generators. Instead of polling manually, `stream()` yields events as each page completes.

## Quick Start

```typescript
import { OpenOCR } from "@openocr/client";

const client = new OpenOCR({ apiKey: "sk-your-key" });

for await (const event of client.stream({
  engine: "openocr/tesseract",
  url: "https://example.com/document.pdf",
})) {
  if (event.type === "job_started") {
    console.log(`Processing ${event.totalPages} pages…`);
  } else if (event.type === "page_complete") {
    console.log(`  Page ${event.pageNumber}/${event.totalPages} (${event.progressPct}%)`);
  } else if (event.type === "job_complete") {
    console.log(`Done! Text: ${event.result?.extractedText?.slice(0, 100)}`);
  } else if (event.type === "error") {
    console.error(`Error: ${event.error}`);
  }
}
```

## API Reference

### `client.stream(options): AsyncGenerator<StreamEvent>`

Yields `StreamEvent` objects as the job progresses. Polls `/v1/ocr/jobs/:id/status` at the given interval.

**Options (`StreamOptions`):**

| Name | Type | Description |
|------|------|-------------|
| `engine` | `string` | Engine ID (e.g. `"openocr/tesseract"`) |
| `url` | `string` | URL of the image or PDF |
| `dataBase64` | `string` | Base64-encoded image (alternative to `url`) |
| `mimeType` | `string` | MIME type hint (e.g. `"application/pdf"`) |
| `pollIntervalMs` | `number` | Milliseconds between polls (default: `1000`) |
| `webhookUrl` | `string` | Optional webhook URL for completion notification |
| `options` | `Record<string, unknown>` | Engine-specific options |

---

### `StreamEvent`

```typescript
interface StreamEvent {
  type: StreamEventType;       // "job_started" | "page_complete" | "job_complete" | "error"
  jobId: string;               // Async job ID
  pageNumber?: number;         // Current page (page_complete only)
  totalPages?: number;         // Total pages in document
  pagesCompleted?: number;     // Pages completed so far
  progressPct?: number;        // 0–100
  result?: OcrResult;          // Full result (job_complete only)
  error?: string;              // Error message (error only)
}
```

### `StreamEventType`

```typescript
type StreamEventType =
  | "job_started"    // Emitted once when job is created
  | "page_complete"  // Emitted for each completed page
  | "job_complete"   // Emitted once on success (carries result)
  | "error";         // Emitted on failure — generator stops after this
```

## Event Flow

```
job_started → [page_complete × N] → job_complete
                                  ↘ error
```

For single-page images: `job_started → page_complete(1/1) → job_complete`.

## Error Handling

```typescript
try {
  for await (const event of client.stream({ engine: "openocr/tesseract", url })) {
    if (event.type === "error") {
      throw new Error(event.error);
    }
    // handle other events
  }
} catch (err) {
  console.error("Stream failed:", err);
}
```

The generator stops after emitting an `error` event. Network errors are also surfaced as `error` events rather than thrown exceptions.
