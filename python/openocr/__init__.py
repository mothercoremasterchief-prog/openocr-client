"""OpenOCR Python SDK."""

from .client import OpenOCR
from .exceptions import (
    AuthenticationError,
    EngineError,
    InsufficientBalanceError,
    OpenOCRError,
    RateLimitError,
)
from .models import JobResultResponse, JobStatus, JobStatusResponse, OcrResult, Page
from .streaming import StreamEvent, StreamEventType
from .webhooks import WebhookEvent, construct_signature, verify_signature

__all__ = [
    "OpenOCR",
    "OcrResult",
    "Page",
    "JobStatus",
    "JobStatusResponse",
    "JobResultResponse",
    "StreamEvent",
    "StreamEventType",
    "WebhookEvent",
    "verify_signature",
    "construct_signature",
    "OpenOCRError",
    "AuthenticationError",
    "EngineError",
    "InsufficientBalanceError",
    "RateLimitError",
]
__version__ = "0.3.0"
