"""OpenOCR webhook utilities — registration + signature verification."""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class WebhookEvent:
    """A parsed webhook event payload.

    Attributes:
        event_type: Event type (e.g. "job.complete", "job.failed").
        job_id: The OCR job ID.
        request_id: The OCR request ID.
        status: Job status ("succeeded" or "failed").
        engine: Engine ID used for processing.
        total_pages: Total pages in the document.
        extracted_text: Full extracted text (on success).
        error: Error message (on failure).
        timestamp: Unix timestamp of the event.
        usage: Usage/cost details.
    """
    event_type: str
    job_id: str
    request_id: str
    status: str
    engine: str
    total_pages: int = 0
    extracted_text: Optional[str] = None
    error: Optional[str] = None
    timestamp: float = 0.0
    usage: Optional[dict] = None

    @classmethod
    def from_dict(cls, data: dict) -> "WebhookEvent":
        """Parse a webhook event from a dictionary (JSON body)."""
        return cls(
            event_type=data.get("event_type", data.get("event", "")),
            job_id=data.get("job_id", ""),
            request_id=data.get("request_id", ""),
            status=data.get("status", ""),
            engine=data.get("engine", ""),
            total_pages=data.get("total_pages", 0),
            extracted_text=data.get("extracted_text"),
            error=data.get("error"),
            timestamp=data.get("timestamp", 0.0),
            usage=data.get("usage"),
        )

    @classmethod
    def from_json(cls, body: str | bytes) -> "WebhookEvent":
        """Parse a webhook event from a JSON string or bytes."""
        if isinstance(body, bytes):
            body = body.decode("utf-8")
        return cls.from_dict(json.loads(body))


def verify_signature(
    payload: str | bytes,
    signature: str,
    secret: str,
    *,
    tolerance_seconds: int = 300,
) -> bool:
    """Verify an OpenOCR webhook signature.

    The signature format is: ``t=<timestamp>,v1=<hex-hmac-sha256>``

    Verification:
    1. Parse the timestamp and HMAC from the signature header.
    2. Check the timestamp is within tolerance (default: 5 minutes).
    3. Compute ``HMAC-SHA256(secret, "<timestamp>.<payload>")``
    4. Compare against the provided HMAC using constant-time comparison.

    Args:
        payload: The raw request body (string or bytes).
        signature: The ``X-OpenOCR-Signature`` header value.
        secret: Your webhook signing secret.
        tolerance_seconds: Max age of the signature in seconds (default: 300).

    Returns:
        ``True`` if the signature is valid, ``False`` otherwise.

    Raises:
        ValueError: If the signature format is invalid.
    """
    if isinstance(payload, bytes):
        payload = payload.decode("utf-8")

    # Parse signature: t=<timestamp>,v1=<hmac>
    parts = {}
    for part in signature.split(","):
        if "=" in part:
            key, _, value = part.partition("=")
            parts[key.strip()] = value.strip()

    timestamp_str = parts.get("t")
    provided_hmac = parts.get("v1")

    if not timestamp_str or not provided_hmac:
        raise ValueError(
            f"Invalid signature format. Expected 't=<timestamp>,v1=<hmac>', got: {signature!r}"
        )

    # Check timestamp tolerance
    try:
        timestamp = int(timestamp_str)
    except ValueError:
        raise ValueError(f"Invalid timestamp in signature: {timestamp_str!r}")

    now = int(time.time())
    if abs(now - timestamp) > tolerance_seconds:
        return False

    # Compute expected HMAC
    signed_payload = f"{timestamp}.{payload}"
    expected_hmac = hmac.new(
        secret.encode("utf-8"),
        signed_payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    # Constant-time comparison
    return hmac.compare_digest(expected_hmac, provided_hmac)


def construct_signature(payload: str | bytes, secret: str, timestamp: Optional[int] = None) -> str:
    """Construct an OpenOCR webhook signature (for testing).

    Args:
        payload: The request body.
        secret: The webhook signing secret.
        timestamp: Optional unix timestamp (defaults to now).

    Returns:
        Signature string in format ``t=<timestamp>,v1=<hmac>``.
    """
    if isinstance(payload, bytes):
        payload = payload.decode("utf-8")

    if timestamp is None:
        timestamp = int(time.time())

    signed_payload = f"{timestamp}.{payload}"
    sig = hmac.new(
        secret.encode("utf-8"),
        signed_payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    return f"t={timestamp},v1={sig}"
