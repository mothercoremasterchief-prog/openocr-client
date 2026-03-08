# Webhook Integration — Python SDK

OpenOCR can POST a signed payload to your server when an OCR job completes. This is useful for long-running jobs where polling isn't practical.

## Quick Start

### 1. Register a webhook URL when submitting a job

```python
import openocr

client = openocr.OpenOCR(api_key="sk-your-key")

result = client.ocr(
    engine="openocr/tesseract",
    url="https://example.com/document.pdf",
    webhook_url="https://your-server.com/webhooks/openocr",
)
print(f"Job submitted: {result.job_id}")
```

### 2. Receive and verify events in your server

```python
# Flask example
from flask import Flask, request, abort
from openocr.webhooks import WebhookEvent, verify_signature

app = Flask(__name__)
WEBHOOK_SECRET = "whsec_your-signing-secret"

@app.route("/webhooks/openocr", methods=["POST"])
def handle_webhook():
    payload = request.get_data(as_text=True)
    signature = request.headers.get("X-OpenOCR-Signature", "")

    if not verify_signature(payload, signature, WEBHOOK_SECRET):
        abort(400, "Invalid signature")

    event = WebhookEvent.from_json(payload)

    if event.event_type == "job.complete":
        print(f"Job {event.job_id} done: {event.extracted_text[:100]}")
    elif event.event_type == "job.failed":
        print(f"Job {event.job_id} failed: {event.error}")

    return "", 200
```

## API Reference

### `verify_signature(payload, signature, secret, tolerance_seconds=300)`

Verifies the `X-OpenOCR-Signature` header. Returns `True` if valid, `False` if the timestamp is outside the tolerance window.

**Parameters:**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `payload` | `str` | — | Raw request body (do not parse before verifying) |
| `signature` | `str` | — | Value of the `X-OpenOCR-Signature` header |
| `secret` | `str` | — | Your webhook signing secret |
| `tolerance_seconds` | `int` | `300` | Max age of signature in seconds (replay protection) |

**Raises:** `ValueError` if the signature format is invalid.

### `WebhookEvent`

```python
@dataclass
class WebhookEvent:
    event_type: str          # "job.complete" | "job.failed"
    job_id: str              # Async job ID
    request_id: str          # Request ID
    status: str              # "succeeded" | "failed"
    engine: str              # Engine used (e.g. "openocr/tesseract")
    total_pages: int         # Pages processed
    extracted_text: str | None   # Full text (job.complete only)
    error: str | None            # Error message (job.failed only)
    timestamp: float         # Unix timestamp of event
    usage: dict | None       # Cost/usage details
```

**Parse from request body:**

```python
# From raw JSON string/bytes
event = WebhookEvent.from_json(request.body)

# From parsed dict
event = WebhookEvent.from_dict(request.json())
```

## Signature Format

OpenOCR signs payloads using HMAC-SHA256:

```
X-OpenOCR-Signature: t=<unix_timestamp>,v1=<hex_hmac>
```

The signed message is: `<timestamp>.<raw_body>`

**Why use the raw body?** Parsing JSON and re-serializing can alter key order or whitespace, invalidating the signature. Always verify against the raw bytes.

## Testing Webhooks Locally

Use `construct_signature()` to generate valid test signatures:

```python
from openocr.webhooks import construct_signature
import json, time

secret = "whsec_test-secret"
payload = json.dumps({"event_type": "job.complete", "job_id": "job_123", "status": "succeeded"})
sig = construct_signature(payload, secret)

# Now call your endpoint with this signature
import requests
r = requests.post(
    "http://localhost:5000/webhooks/openocr",
    data=payload,
    headers={"X-OpenOCR-Signature": sig, "Content-Type": "application/json"},
)
```

## Security Checklist

- ✅ Always verify the signature before processing
- ✅ Use the **raw request body** for verification (not re-serialized JSON)
- ✅ Keep your signing secret out of version control
- ✅ Respond with `200` quickly — do heavy work asynchronously
- ✅ Make your handler idempotent (OpenOCR may retry on timeout)
