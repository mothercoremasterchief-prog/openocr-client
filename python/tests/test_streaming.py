"""Tests for OpenOCR streaming support."""

import pytest
from unittest.mock import MagicMock, patch

from openocr.streaming import StreamEvent, StreamEventType, stream_ocr_sync
from openocr.models import JobStatus, JobStatusResponse, JobResultResponse


class TestStreamEventType:
    def test_values(self):
        assert StreamEventType.JOB_STARTED == "job_started"
        assert StreamEventType.PAGE_COMPLETE == "page_complete"
        assert StreamEventType.JOB_COMPLETE == "job_complete"
        assert StreamEventType.ERROR == "error"


class TestStreamEvent:
    def test_repr_page_complete(self):
        event = StreamEvent(
            type=StreamEventType.PAGE_COMPLETE,
            job_id="job-123",
            page_number=2,
            total_pages=5,
        )
        assert "page=2/5" in repr(event)

    def test_repr_job_complete(self):
        event = StreamEvent(
            type=StreamEventType.JOB_COMPLETE,
            job_id="job-123",
        )
        assert "job_complete" in repr(event)
        assert "job-123" in repr(event)

    def test_repr_error(self):
        event = StreamEvent(
            type=StreamEventType.ERROR,
            job_id="job-123",
            error="something broke",
        )
        assert "error" in repr(event)
        assert "something broke" in repr(event)


class TestStreamOcrSync:
    def test_emits_job_started_then_complete(self):
        """Single-page job: started → page_complete → job_complete."""
        client = MagicMock()

        # First poll: processing, 0 pages done
        # Second poll: succeeded, 1 page done
        client.job_status.side_effect = [
            JobStatusResponse(
                job_id="job-1", status=JobStatus.PROCESSING,
                total_pages=1, pages_completed=0, progress_pct=0,
            ),
            JobStatusResponse(
                job_id="job-1", status=JobStatus.SUCCEEDED,
                total_pages=1, pages_completed=1, progress_pct=100,
            ),
        ]
        client.job_result.return_value = JobResultResponse(
            job_id="job-1", request_id="req-1", status=JobStatus.SUCCEEDED,
            engine="openocr/tesseract", total_pages=1,
            extracted_text="Hello World",
        )

        events = list(stream_ocr_sync(client, "job-1", poll_interval=0))

        types = [e.type for e in events]
        assert types == [
            StreamEventType.JOB_STARTED,
            StreamEventType.PAGE_COMPLETE,
            StreamEventType.JOB_COMPLETE,
        ]
        assert events[0].total_pages == 1
        assert events[1].page_number == 1
        assert events[2].result is not None
        assert events[2].result.text == "Hello World"

    def test_multi_page_emits_per_page_events(self):
        """3-page job should emit 3 page_complete events."""
        client = MagicMock()

        client.job_status.side_effect = [
            JobStatusResponse(
                job_id="job-2", status=JobStatus.PROCESSING,
                total_pages=3, pages_completed=0, progress_pct=0,
            ),
            JobStatusResponse(
                job_id="job-2", status=JobStatus.PROCESSING,
                total_pages=3, pages_completed=2, progress_pct=66,
            ),
            JobStatusResponse(
                job_id="job-2", status=JobStatus.SUCCEEDED,
                total_pages=3, pages_completed=3, progress_pct=100,
            ),
        ]
        client.job_result.return_value = JobResultResponse(
            job_id="job-2", request_id="req-2", status=JobStatus.SUCCEEDED,
            engine="openocr/tesseract", total_pages=3,
            extracted_text="Page1\fPage2\fPage3",
        )

        events = list(stream_ocr_sync(client, "job-2", poll_interval=0))

        page_events = [e for e in events if e.type == StreamEventType.PAGE_COMPLETE]
        assert len(page_events) == 3
        assert [e.page_number for e in page_events] == [1, 2, 3]

        # Progress should increase
        assert page_events[0].progress_pct == 33
        assert page_events[1].progress_pct == 66
        assert page_events[2].progress_pct == 100

    def test_failed_job_emits_error(self):
        """Failed job should emit error event."""
        client = MagicMock()

        client.job_status.side_effect = [
            JobStatusResponse(
                job_id="job-3", status=JobStatus.FAILED,
                total_pages=1, pages_completed=0, progress_pct=0,
            ),
        ]
        client.job_result.return_value = JobResultResponse(
            job_id="job-3", request_id="req-3", status=JobStatus.FAILED,
            engine="openocr/tesseract", total_pages=1,
            error="Engine crashed",
        )

        events = list(stream_ocr_sync(client, "job-3", poll_interval=0))

        types = [e.type for e in events]
        assert StreamEventType.JOB_STARTED in types
        assert StreamEventType.ERROR in types
        error_event = [e for e in events if e.type == StreamEventType.ERROR][0]
        assert error_event.error == "Engine crashed"

    def test_status_poll_exception_emits_error(self):
        """Network error during polling should emit error event."""
        client = MagicMock()
        client.job_status.side_effect = ConnectionError("Network down")

        events = list(stream_ocr_sync(client, "job-4", poll_interval=0))

        assert len(events) == 1
        assert events[0].type == StreamEventType.ERROR
        assert "Network down" in events[0].error
