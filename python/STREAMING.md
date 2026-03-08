# Streaming OCR — Python SDK

The Python SDK supports streaming OCR progress via sync and async iterators. Instead of polling manually, `stream()` yields events as each page completes.

## Quick Start

```python
import openocr

client = openocr.OpenOCR(api_key="sk-your-key")

# Submit a multi-page PDF and stream progress
for event in client.stream(engine="openocr/tesseract", url="https://example.com/document.pdf"):
    if event.type == "job_started":
        print(f"Processing {event.total_pages} pages…")
    elif event.type == "page_complete":
        print(f"  Page {event.page_number}/{event.total_pages} ({event.progress_pct}%)")
    elif event.type == "job_complete":
        print(f"Done! Text: {event.result.extracted_text[:100]}")
    elif event.type == "error":
        print(f"Error: {event.error}")
```

## Async Usage

```python
import asyncio
import openocr

async def main():
    client = openocr.OpenOCR(api_key="sk-your-key")
    async for event in client.stream_async(engine="openocr/tesseract", url="https://example.com/doc.pdf"):
        print(event)

asyncio.run(main())
```

## API Reference

### `client.stream(engine, url=None, data_base64=None, **options)`

Synchronous streaming iterator. Polls the job status endpoint and yields events.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `engine` | `str` | Engine ID (e.g. `"openocr/tesseract"`) |
| `url` | `str` | URL of the image or PDF to process |
| `data_base64` | `str` | Base64-encoded image data (alternative to `url`) |
| `poll_interval` | `float` | Seconds between polls (default: `1.0`) |
| `webhook_url` | `str` | Optional webhook URL for job completion |
| `**options` | | Additional engine options passed to the API |

**Yields:** `StreamEvent` objects (see below).

### `client.stream_async(engine, url=None, data_base64=None, **options)`

Same as `stream()` but returns an `AsyncIterator[StreamEvent]`. Use in `async for` loops.

---

### `StreamEvent`

```python
@dataclass
class StreamEvent:
    type: StreamEventType          # "job_started" | "page_complete" | "job_complete" | "error"
    job_id: str                    # Async job ID
    page_number: int | None        # Current page (page_complete only)
    total_pages: int | None        # Total pages in document
    pages_completed: int | None    # Pages completed so far
    progress_pct: int | None       # 0–100
    result: OcrResult | None       # Full result (job_complete only)
    error: str | None              # Error message (error only)
```

### `StreamEventType`

```python
class StreamEventType(str, Enum):
    JOB_STARTED    = "job_started"    # Emitted once when job is created
    PAGE_COMPLETE  = "page_complete"  # Emitted for each completed page
    JOB_COMPLETE   = "job_complete"   # Emitted once on success (carries result)
    ERROR          = "error"          # Emitted on failure
```

## Event Flow

```
job_started → [page_complete × N] → job_complete
                                  ↘ error
```

For single-page images, you will typically see: `job_started → page_complete(1/1) → job_complete`.

## Error Handling

```python
for event in client.stream(engine="openocr/tesseract", url="https://example.com/doc.pdf"):
    if event.type == "error":
        print(f"OCR failed: {event.error}")
        break
```

Errors can occur at any point. The iterator stops after emitting an `error` event.
