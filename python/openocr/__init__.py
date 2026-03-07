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

__all__ = [
    "OpenOCR",
    "OcrResult",
    "Page",
    "JobStatus",
    "JobStatusResponse",
    "JobResultResponse",
    "OpenOCRError",
    "AuthenticationError",
    "EngineError",
    "InsufficientBalanceError",
    "RateLimitError",
]
__version__ = "0.2.0"
