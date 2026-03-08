# openocr-client

Official Python and TypeScript SDKs for the [OpenOCR API](https://open-ocr.com).

## Packages

| Language | Package | Install |
|---|---|---|
| Python | `openocr` | `pip install openocr` |
| TypeScript / JS | `openocr` | `npm install openocr` |

## Quick Start

### Python

```python
from openocr import OpenOCR

client = OpenOCR(api_key="sk-ocr-your-api-key")

result = client.ocr(
    engine="openocr/tesseract",
    file="document.pdf",
)
print(result.extracted_text)
```

### TypeScript

```typescript
import { OpenOCR } from "openocr";

const client = new OpenOCR({ apiKey: "sk-ocr-your-api-key" });

const result = await client.ocr({
  engine: "openocr/tesseract",
  file: "document.pdf",
});
console.log(result.extractedText);
```

## Streaming

Track OCR progress in real-time for large documents. The SDK polls the async job status and yields structured events as pages complete.

### Python

```python
from openocr import OpenOCR, StreamEventType

client = OpenOCR(api_key="sk-ocr-your-api-key")

for event in client.stream("openocr/tesseract", file="large-document.pdf"):
    if event.type == StreamEventType.JOB_STARTED:
        print(f"Processing {event.total_pages} pages...")
    elif event.type == StreamEventType.PAGE_COMPLETE:
        print(f"Page {event.page_number}/{event.total_pages} done")
    elif event.type == StreamEventType.JOB_COMPLETE:
        print(f"Done! Extracted text:\n{event.result.text}")
    elif event.type == StreamEventType.ERROR:
        print(f"Error: {event.error}")
```

### TypeScript

```typescript
import { OpenOCR } from "openocr";

const client = new OpenOCR({ apiKey: "sk-ocr-your-api-key" });

for await (const event of client.stream({ engine: "openocr/tesseract", url: "https://example.com/doc.pdf" })) {
  switch (event.type) {
    case "job_started":
      console.log(`Processing ${event.totalPages} pages...`);
      break;
    case "page_complete":
      console.log(`Page ${event.pageNumber}/${event.totalPages} done`);
      break;
    case "job_complete":
      console.log(`Done! ${event.result?.extractedText}`);
      break;
    case "error":
      console.error(`Error: ${event.error}`);
      break;
  }
}
```

### Stream Events

| Event | Fields | Description |
|---|---|---|
| `job_started` | `jobId`, `totalPages` | Job submitted, processing begins |
| `page_complete` | `pageNumber`, `totalPages`, `pagesCompleted`, `progressPct` | A page finished processing |
| `job_complete` | `result` (full `OcrResult`) | All pages done, full text available |
| `error` | `error` (string) | Something went wrong |

### Stream Options

Both SDKs accept these options alongside standard OCR parameters:

| Option | Default | Description |
|---|---|---|
| `poll_interval` / `pollIntervalMs` | 1.0s / 1000ms | How often to check job status |
| `webhook_url` / `webhookUrl` | — | Also notify this URL on completion |
| `fallback_engine` / `fallbackEngine` | — | Engine for scanned pages in PDFs |
| `scanned_handling` / `scannedHandling` | — | How to handle scanned pages |

## Webhooks

Receive OCR results via HTTP callbacks instead of polling. The SDK provides signature verification to secure your webhook endpoint.

### Verifying Webhook Signatures

Every webhook request includes an `X-OpenOCR-Signature` header. **Always verify this signature** before processing the payload.

#### Python

```python
from openocr import verify_signature, WebhookEvent

# In your webhook handler (e.g., Flask, FastAPI, Django)
def handle_webhook(request):
    signature = request.headers["X-OpenOCR-Signature"]
    body = request.body

    if not verify_signature(body, signature, secret="whsec_your_signing_secret"):
        return {"error": "Invalid signature"}, 401

    event = WebhookEvent.from_json(body)

    if event.event_type == "job.complete":
        print(f"Job {event.job_id} completed: {event.extracted_text[:100]}...")
    elif event.event_type == "job.failed":
        print(f"Job {event.job_id} failed: {event.error}")
```

#### TypeScript

```typescript
import { verifySignature, parseWebhookEvent } from "openocr";

// In your webhook handler (e.g., Express, Hono, Next.js)
app.post("/webhook/ocr", (req, res) => {
  const signature = req.headers["x-openocr-signature"] as string;
  const body = JSON.stringify(req.body);

  if (!verifySignature(body, signature, "whsec_your_signing_secret")) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  const event = parseWebhookEvent(req.body);

  if (event.eventType === "job.complete") {
    console.log(`Job ${event.jobId} completed: ${event.extractedText?.slice(0, 100)}...`);
  } else if (event.eventType === "job.failed") {
    console.error(`Job ${event.jobId} failed: ${event.error}`);
  }

  res.status(200).json({ received: true });
});
```

### Signature Format

Signatures use the format `t=<unix-timestamp>,v1=<hex-hmac-sha256>`:

- **Signed payload**: `<timestamp>.<body>` — the timestamp prevents replay attacks
- **Algorithm**: HMAC-SHA256 with your signing secret
- **Tolerance**: Signatures older than 5 minutes are rejected by default (configurable via `tolerance_seconds` / `toleranceSeconds`)
- **Comparison**: Constant-time to prevent timing attacks

### Testing Webhooks Locally

Use the `construct_signature` / `constructSignature` helper to generate valid signatures for testing:

```python
from openocr import construct_signature
import json

payload = json.dumps({"event_type": "job.complete", "job_id": "job-123", "status": "succeeded"})
sig = construct_signature(payload, "whsec_your_signing_secret")
# Use sig as the X-OpenOCR-Signature header in test requests
```

```typescript
import { constructSignature } from "openocr";

const payload = JSON.stringify({ event_type: "job.complete", job_id: "job-123", status: "succeeded" });
const sig = constructSignature(payload, "whsec_your_signing_secret");
```

### Webhook Event Schema

```json
{
  "event_type": "job.complete",
  "job_id": "job-abc123",
  "request_id": "req-def456",
  "status": "succeeded",
  "engine": "openocr/tesseract",
  "total_pages": 5,
  "extracted_text": "Full extracted text...",
  "timestamp": 1700000000,
  "usage": {
    "cost": 0.005,
    "pages": 5
  }
}
```

| Event Type | Description |
|---|---|
| `job.complete` | OCR job finished successfully |
| `job.failed` | OCR job failed (check `error` field) |

## PDF Smart Routing

Handle mixed PDFs with digital and scanned pages:

```python
result = client.ocr(
    engine="openocr/tesseract",
    file="mixed-document.pdf",
    fallback_engine="google/gemini-2.5-flash",
    scanned_handling="fallback",
)
# Digital pages → Tesseract (fast, cheap)
# Scanned pages → Gemini Flash (vision LLM)
```

## API Reference

### Client Options

| Option | Python | TypeScript | Default |
|---|---|---|---|
| API Key | `api_key` | `apiKey` | Required |
| Base URL | `base_url` | `baseUrl` | `https://api.open-ocr.com` |
| Timeout | `timeout` (seconds) | `timeoutMs` (ms) | 60s / 60000ms |
| Max Retries | `max_retries` | `maxRetries` | 3 |

### OCR Options

| Option | Python | TypeScript | Description |
|---|---|---|---|
| Engine | `engine` | `engine` | Engine ID (e.g. `"openocr/tesseract"`) |
| File | `file` | — | Local file path |
| URL | `url` | `url` | Remote URL |
| Base64 | `data_base64` | `dataBase64` | Pre-encoded base64 |
| Fallback Engine | `fallback_engine` | `fallbackEngine` | For scanned PDF pages |
| Scanned Handling | `scanned_handling` | `scannedHandling` | `"fallback"`, `"skip"`, or `"error"` |
| Wait | `wait` | `wait` | Block until async jobs complete (default: `True`) |

### Result Fields

| Field | Python | TypeScript | Description |
|---|---|---|---|
| Request ID | `result.request_id` | `result.requestId` | Unique request identifier |
| Status | `result.status` | `result.status` | `"succeeded"` or `"failed"` |
| Text | `result.text` | `result.extractedText` | Full extracted text |
| Pages | `result.pages` | `splitPages(result.extractedText)` | Per-page text (split on `\f`) |
| Cost | `result.cost_debited` | `result.costDebited` | Credits charged |
| Confidence | `result.confidence` | `result.confidence` | 0.0–1.0 (if available) |
| Latency | `result.provider_latency_ms` | `result.providerLatencyMs` | Engine processing time (ms) |

### Error Handling

Both SDKs throw typed exceptions:

| Error | HTTP | Description |
|---|---|---|
| `AuthenticationError` | 401 | Invalid or missing API key |
| `InsufficientBalanceError` | 402 | Not enough credits |
| `EngineError` | 422 | Engine processing failed |
| `RateLimitError` | 429 | Too many requests |
| `OpenOCRError` | Other | Generic API error |

## Documentation

- [API Reference](https://open-ocr.com/docs/endpoints)
- [PDF Smart Routing](https://open-ocr.com/docs/pdf-routing)
- [Authentication](https://open-ocr.com/docs/authentication)
- [Error Codes](https://open-ocr.com/docs/errors)

## Repository Structure

```
openocr-client/
├── python/          # Python SDK (PyPI: openocr)
│   ├── openocr/
│   │   ├── client.py       # Main client (ocr, stream, engines)
│   │   ├── streaming.py    # StreamEvent, stream_ocr_sync
│   │   ├── webhooks.py     # verify_signature, WebhookEvent
│   │   ├── models.py       # OcrResult, Page, JobStatus
│   │   └── exceptions.py   # Typed error classes
│   └── tests/
├── typescript/      # TypeScript/JS SDK (npm: openocr)
│   ├── src/
│   │   ├── client.ts       # Main client (ocr, stream, engines)
│   │   ├── streaming.ts    # StreamEvent, streamJob
│   │   ├── webhooks.ts     # verifySignature, parseWebhookEvent
│   │   └── types.ts        # OcrResult, Page, error classes
│   └── tests/
└── README.md
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT — see [LICENSE](./LICENSE).
