# openocr (Python)

Python SDK for the [OpenOCR API](https://open-ocr.com).

## Installation

```bash
pip install openocr
```

## Quick Start

```python
from openocr import OpenOCR

client = OpenOCR(api_key="sk-ocr-your-api-key")

# From a local file
result = client.ocr(engine="openocr/tesseract", file="document.pdf")
print(result.extracted_text)

# From a URL
result = client.ocr(engine="openocr/tesseract", url="https://example.com/doc.pdf")
print(result.extracted_text)
```

## Large PDFs (async)

PDFs with >20 pages are processed asynchronously. The client waits by default:

```python
# wait=True (default) — blocks until done
result = client.ocr(engine="openocr/tesseract", file="annual-report.pdf")
print(result.extracted_text)

# wait=False — returns job_id immediately
result = client.ocr(engine="openocr/tesseract", file="annual-report.pdf", wait=False)
print(result.job_id)  # poll manually
```

## Context Manager

```python
with OpenOCR(api_key="sk-ocr-your-api-key") as client:
    result = client.ocr(engine="openocr/tesseract", file="scan.png")
```

## Streaming Progress

Stream page-by-page progress for multi-page documents:

```python
for event in client.stream(engine="openocr/tesseract", url="https://example.com/doc.pdf"):
    if event.type == "job_started":
        print(f"Processing {event.total_pages} pages…")
    elif event.type == "page_complete":
        print(f"  Page {event.page_number}/{event.total_pages} ({event.progress_pct}%)")
    elif event.type == "job_complete":
        print(f"Done: {event.result.extracted_text[:100]}")
    elif event.type == "error":
        print(f"Error: {event.error}")
```

Async variant: `async for event in client.stream_async(...):`

See [STREAMING.md](STREAMING.md) for full API reference.

## Webhooks

Receive a signed POST when a job completes:

```python
result = client.ocr(
    engine="openocr/tesseract",
    url="https://example.com/doc.pdf",
    webhook_url="https://your-server.com/hooks/openocr",
)

# In your webhook handler:
from openocr.webhooks import verify_signature, WebhookEvent

def handle_webhook(payload: str, signature: str):
    if not verify_signature(payload, signature, secret="whsec_..."):
        return 400
    event = WebhookEvent.from_json(payload)
    print(event.event_type, event.job_id)
    return 200
```

See [WEBHOOKS.md](WEBHOOKS.md) for full API reference and security checklist.
