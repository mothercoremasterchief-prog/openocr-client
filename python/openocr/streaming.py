"""OpenOCR streaming support — async generators over job progress."""

from __future__ import annotations

import time
from dataclasses import dataclass
from enum import Enum
from typing import AsyncIterator, Iterator, Optional

from .models import OcrResult, Page


class StreamEventType(str, Enum):
    """Event types emitted during streaming OCR processing."""
    JOB_STARTED = "job_started"
    PAGE_COMPLETE = "page_complete"
    JOB_COMPLETE = "job_complete"
    ERROR = "error"


@dataclass
class StreamEvent:
    """A single event from an OCR streaming session.

    Attributes:
        type: Event type (job_started, page_complete, job_complete, error).
        job_id: The async job ID.
        page: Page data (only for page_complete events).
        page_number: Current page number (for page_complete).
        total_pages: Total pages in the document.
        pages_completed: Number of pages completed so far.
        progress_pct: Progress percentage (0-100).
        result: Full OCR result (only for job_complete events).
        error: Error message (only for error events).
    """
    type: StreamEventType
    job_id: str
    page: Optional[Page] = None
    page_number: Optional[int] = None
    total_pages: Optional[int] = None
    pages_completed: Optional[int] = None
    progress_pct: Optional[int] = None
    result: Optional[OcrResult] = None
    error: Optional[str] = None

    def __repr__(self) -> str:
        if self.type == StreamEventType.PAGE_COMPLETE:
            return f"StreamEvent(type={self.type.value}, page={self.page_number}/{self.total_pages})"
        if self.type == StreamEventType.JOB_COMPLETE:
            return f"StreamEvent(type={self.type.value}, job_id={self.job_id})"
        if self.type == StreamEventType.ERROR:
            return f"StreamEvent(type={self.type.value}, error={self.error!r})"
        return f"StreamEvent(type={self.type.value}, job_id={self.job_id})"


def stream_ocr_sync(client: "OpenOCR", job_id: str, poll_interval: float = 1.0) -> Iterator[StreamEvent]:  # type: ignore[name-defined]
    """Synchronous streaming iterator over OCR job progress.

    Yields StreamEvent objects as pages complete. Polls the job status
    endpoint at the given interval.

    Args:
        client: An OpenOCR client instance.
        job_id: The async job ID to stream.
        poll_interval: Seconds between status polls.

    Yields:
        StreamEvent objects for job_started, page_complete, job_complete, or error.
    """
    from .models import JobStatus

    last_pages_completed = 0
    started = False

    while True:
        try:
            status = client.job_status(job_id)
        except Exception as e:
            yield StreamEvent(
                type=StreamEventType.ERROR,
                job_id=job_id,
                error=str(e),
            )
            return

        if not started:
            yield StreamEvent(
                type=StreamEventType.JOB_STARTED,
                job_id=job_id,
                total_pages=status.total_pages,
                pages_completed=0,
                progress_pct=0,
            )
            started = True

        # Emit page_complete events for newly completed pages
        if status.pages_completed > last_pages_completed:
            for page_num in range(last_pages_completed + 1, status.pages_completed + 1):
                yield StreamEvent(
                    type=StreamEventType.PAGE_COMPLETE,
                    job_id=job_id,
                    page_number=page_num,
                    total_pages=status.total_pages,
                    pages_completed=page_num,
                    progress_pct=int((page_num / status.total_pages) * 100) if status.total_pages > 0 else 0,
                )
            last_pages_completed = status.pages_completed

        if status.status == JobStatus.SUCCEEDED:
            try:
                job_result = client.job_result(job_id)
                result = OcrResult(
                    request_id=job_result.request_id,
                    status="succeeded",
                    engine=job_result.engine,
                    extracted_text=job_result.extracted_text,
                    cost_debited=0.0,
                    remaining_balance=0.0,
                    job_id=job_id,
                )
                yield StreamEvent(
                    type=StreamEventType.JOB_COMPLETE,
                    job_id=job_id,
                    result=result,
                    total_pages=status.total_pages,
                    pages_completed=status.total_pages,
                    progress_pct=100,
                )
            except Exception as e:
                yield StreamEvent(
                    type=StreamEventType.ERROR,
                    job_id=job_id,
                    error=f"Failed to fetch result: {e}",
                )
            return

        if status.status == JobStatus.FAILED:
            try:
                job_result = client.job_result(job_id)
                error_msg = job_result.error or "Job failed"
            except Exception:
                error_msg = "Job failed (could not fetch details)"
            yield StreamEvent(
                type=StreamEventType.ERROR,
                job_id=job_id,
                error=error_msg,
            )
            return

        time.sleep(poll_interval)
