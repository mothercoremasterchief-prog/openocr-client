"""OpenOCR response models."""

from __future__ import annotations
from dataclasses import dataclass
from enum import Enum
from typing import Optional


@dataclass
class OcrResult:
    request_id: str
    status: str
    engine: str
    extracted_text: Optional[str]
    cost_debited: float
    remaining_balance: float
    provider_latency_ms: Optional[int] = None
    confidence: Optional[float] = None
    # Async job fields
    job_id: Optional[str] = None
    # PDF routing fields
    stopped_at_page: Optional[int] = None
    stop_reason: Optional[str] = None
    remaining_pages: Optional[int] = None
    affordable_pages: Optional[int] = None

    @classmethod
    def from_dict(cls, data: dict) -> "OcrResult":
        job_id = None
        warning = data.get("warning", "")
        if warning and warning.startswith("job_id: "):
            job_id = warning.replace("job_id: ", "")
        return cls(
            request_id=data.get("request_id", ""),
            status=data.get("status", ""),
            engine=data.get("engine", ""),
            extracted_text=data.get("extracted_text"),
            cost_debited=data.get("cost_debited", 0.0),
            remaining_balance=data.get("remaining_balance", 0.0),
            provider_latency_ms=data.get("provider_latency_ms"),
            confidence=data.get("confidence"),
            job_id=job_id,
            stopped_at_page=data.get("stopped_at_page"),
            stop_reason=data.get("stop_reason"),
            remaining_pages=data.get("remaining_pages"),
            affordable_pages=data.get("affordable_pages"),
        )

    @property
    def is_async(self) -> bool:
        return self.status == "processing" and self.job_id is not None


class JobStatus(str, Enum):
    PROCESSING = "processing"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


@dataclass
class JobStatusResponse:
    job_id: str
    status: JobStatus
    total_pages: int
    pages_completed: int
    progress_pct: int
    estimated_seconds_remaining: Optional[int] = None
    current_page_type: Optional[str] = None

    @classmethod
    def from_dict(cls, data: dict) -> "JobStatusResponse":
        return cls(
            job_id=data["job_id"],
            status=JobStatus(data["status"]),
            total_pages=data["total_pages"],
            pages_completed=data["pages_completed"],
            progress_pct=data["progress_pct"],
            estimated_seconds_remaining=data.get("estimated_seconds_remaining"),
            current_page_type=data.get("current_page_type"),
        )


@dataclass
class JobResultResponse:
    job_id: str
    request_id: str
    status: JobStatus
    engine: str
    total_pages: int
    extracted_text: Optional[str] = None
    error: Optional[str] = None

    @classmethod
    def from_dict(cls, data: dict) -> "JobResultResponse":
        return cls(
            job_id=data["job_id"],
            request_id=data["request_id"],
            status=JobStatus(data["status"]),
            engine=data["engine"],
            total_pages=data["total_pages"],
            extracted_text=data.get("extracted_text"),
            error=data.get("error"),
        )
