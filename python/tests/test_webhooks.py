"""Tests for OpenOCR webhook utilities."""

import json
import time

import pytest

from openocr.webhooks import (
    WebhookEvent,
    construct_signature,
    verify_signature,
)


class TestWebhookEvent:
    def test_from_dict(self):
        data = {
            "event_type": "job.complete",
            "job_id": "job-123",
            "request_id": "req-456",
            "status": "succeeded",
            "engine": "openocr/tesseract",
            "total_pages": 5,
            "extracted_text": "Hello World",
            "timestamp": 1700000000,
            "usage": {"cost": 0.005, "pages": 5},
        }
        event = WebhookEvent.from_dict(data)
        assert event.event_type == "job.complete"
        assert event.job_id == "job-123"
        assert event.request_id == "req-456"
        assert event.status == "succeeded"
        assert event.engine == "openocr/tesseract"
        assert event.total_pages == 5
        assert event.extracted_text == "Hello World"
        assert event.timestamp == 1700000000
        assert event.usage == {"cost": 0.005, "pages": 5}

    def test_from_json_string(self):
        body = json.dumps({"event_type": "job.failed", "job_id": "job-999", "error": "timeout"})
        event = WebhookEvent.from_json(body)
        assert event.event_type == "job.failed"
        assert event.job_id == "job-999"
        assert event.error == "timeout"

    def test_from_json_bytes(self):
        body = json.dumps({"event_type": "job.complete", "job_id": "job-100"}).encode()
        event = WebhookEvent.from_json(body)
        assert event.event_type == "job.complete"
        assert event.job_id == "job-100"

    def test_missing_fields_default(self):
        event = WebhookEvent.from_dict({})
        assert event.event_type == ""
        assert event.job_id == ""
        assert event.total_pages == 0
        assert event.extracted_text is None
        assert event.error is None

    def test_event_field_alias(self):
        """Some payloads may use 'event' instead of 'event_type'."""
        event = WebhookEvent.from_dict({"event": "job.complete"})
        assert event.event_type == "job.complete"


class TestSignatureVerification:
    SECRET = "whsec_test_secret_123"
    PAYLOAD = '{"event_type":"job.complete","job_id":"job-1"}'

    def test_valid_signature(self):
        sig = construct_signature(self.PAYLOAD, self.SECRET)
        assert verify_signature(self.PAYLOAD, sig, self.SECRET) is True

    def test_invalid_signature(self):
        sig = construct_signature(self.PAYLOAD, self.SECRET)
        assert verify_signature(self.PAYLOAD, sig, "wrong_secret") is False

    def test_tampered_payload(self):
        sig = construct_signature(self.PAYLOAD, self.SECRET)
        tampered = self.PAYLOAD.replace("job-1", "job-EVIL")
        assert verify_signature(tampered, sig, self.SECRET) is False

    def test_expired_signature(self):
        old_ts = int(time.time()) - 600  # 10 minutes ago
        sig = construct_signature(self.PAYLOAD, self.SECRET, timestamp=old_ts)
        # Default tolerance is 5 minutes
        assert verify_signature(self.PAYLOAD, sig, self.SECRET) is False

    def test_custom_tolerance(self):
        old_ts = int(time.time()) - 600  # 10 minutes ago
        sig = construct_signature(self.PAYLOAD, self.SECRET, timestamp=old_ts)
        # With 15-minute tolerance, should pass
        assert verify_signature(self.PAYLOAD, sig, self.SECRET, tolerance_seconds=900) is True

    def test_invalid_format_raises(self):
        with pytest.raises(ValueError, match="Invalid signature format"):
            verify_signature(self.PAYLOAD, "garbage", self.SECRET)

    def test_invalid_timestamp_raises(self):
        with pytest.raises(ValueError, match="Invalid timestamp"):
            verify_signature(self.PAYLOAD, "t=notanumber,v1=abc123", self.SECRET)

    def test_bytes_payload(self):
        payload_bytes = self.PAYLOAD.encode()
        sig = construct_signature(payload_bytes, self.SECRET)
        assert verify_signature(payload_bytes, sig, self.SECRET) is True

    def test_construct_with_explicit_timestamp(self):
        sig = construct_signature(self.PAYLOAD, self.SECRET, timestamp=1700000000)
        assert sig.startswith("t=1700000000,v1=")

    def test_roundtrip_construct_verify(self):
        """Construct then verify is always valid."""
        for payload in ['{}', '{"x":1}', 'hello world', '{"nested":{"deep":"value"}}']:
            sig = construct_signature(payload, self.SECRET)
            assert verify_signature(payload, sig, self.SECRET) is True
