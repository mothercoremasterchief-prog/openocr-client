"""Unit tests for the Python SDK."""

import pytest
from openocr.models import OcrResult, Page, JobStatus, JobStatusResponse, JobResultResponse
from openocr.exceptions import (
    OpenOCRError,
    AuthenticationError,
    InsufficientBalanceError,
    EngineError,
)


# ── OcrResult ────────────────────────────────────────────────────────────


def test_ocr_result_from_dict_sync():
    data = {
        "request_id": "req_1",
        "status": "succeeded",
        "engine": "openocr/tesseract",
        "extracted_text": "Hello world",
        "cost_debited": 0.001,
        "remaining_balance": 9.999,
    }
    result = OcrResult.from_dict(data)
    assert result.extracted_text == "Hello world"
    assert result.is_async is False


def test_ocr_result_from_dict_async():
    data = {
        "request_id": "req_2",
        "status": "processing",
        "engine": "openocr/tesseract",
        "extracted_text": None,
        "cost_debited": 0.0,
        "remaining_balance": 10.0,
        "warning": "job_id: job_abc123",
    }
    result = OcrResult.from_dict(data)
    assert result.job_id == "job_abc123"
    assert result.is_async is True


def test_ocr_result_text_property():
    result = OcrResult(
        request_id="r1", status="succeeded", engine="e1",
        extracted_text="hello", cost_debited=0, remaining_balance=0,
    )
    assert result.text == "hello"


def test_ocr_result_text_property_none():
    result = OcrResult(
        request_id="r1", status="succeeded", engine="e1",
        extracted_text=None, cost_debited=0, remaining_balance=0,
    )
    assert result.text == ""


# ── Page splitting ───────────────────────────────────────────────────────


def test_pages_single_page():
    result = OcrResult(
        request_id="r1", status="succeeded", engine="e1",
        extracted_text="Just one page", cost_debited=0, remaining_balance=0,
    )
    pages = result.pages
    assert len(pages) == 1
    assert pages[0].number == 1
    assert pages[0].text == "Just one page"


def test_pages_multi_page():
    result = OcrResult(
        request_id="r1", status="succeeded", engine="e1",
        extracted_text="Page one\fPage two\fPage three",
        cost_debited=0, remaining_balance=0,
    )
    pages = result.pages
    assert len(pages) == 3
    assert pages[0].text == "Page one"
    assert pages[1].number == 2
    assert pages[2].text == "Page three"


def test_pages_trailing_formfeed():
    """Trailing form-feed should not create an extra empty page."""
    result = OcrResult(
        request_id="r1", status="succeeded", engine="e1",
        extracted_text="Page one\fPage two\f",
        cost_debited=0, remaining_balance=0,
    )
    pages = result.pages
    assert len(pages) == 2


def test_pages_empty_text():
    result = OcrResult(
        request_id="r1", status="succeeded", engine="e1",
        extracted_text=None, cost_debited=0, remaining_balance=0,
    )
    assert result.pages == []


def test_pages_empty_string():
    result = OcrResult(
        request_id="r1", status="succeeded", engine="e1",
        extracted_text="", cost_debited=0, remaining_balance=0,
    )
    assert result.pages == []


# ── Page repr ────────────────────────────────────────────────────────────


def test_page_repr_short():
    p = Page(number=1, text="short")
    assert "short" in repr(p)


def test_page_repr_long():
    p = Page(number=1, text="x" * 100)
    assert "..." in repr(p)


# ── JobStatusResponse ───────────────────────────────────────────────────


def test_job_status_response_from_dict():
    data = {
        "job_id": "job_abc123",
        "status": "processing",
        "total_pages": 60,
        "pages_completed": 15,
        "progress_pct": 25,
        "estimated_seconds_remaining": 135,
    }
    status = JobStatusResponse.from_dict(data)
    assert status.status == JobStatus.PROCESSING
    assert status.progress_pct == 25


# ── JobResultResponse ───────────────────────────────────────────────────


def test_job_result_response_from_dict():
    data = {
        "job_id": "job_abc123",
        "request_id": "req_2",
        "status": "succeeded",
        "engine": "openocr/tesseract",
        "total_pages": 60,
        "extracted_text": "Full document text...",
    }
    result = JobResultResponse.from_dict(data)
    assert result.status == JobStatus.SUCCEEDED
    assert result.extracted_text == "Full document text..."


# ── Exceptions ───────────────────────────────────────────────────────────


def test_openocr_error():
    err = OpenOCRError("something went wrong", status_code=500, code="server_error")
    assert err.status_code == 500
    assert err.code == "server_error"
    assert str(err) == "something went wrong"


def test_authentication_error_is_openocr_error():
    err = AuthenticationError("bad key", status_code=401, code="unauthorized")
    assert isinstance(err, OpenOCRError)


def test_insufficient_balance_error():
    err = InsufficientBalanceError("no funds", status_code=402, code="insufficient_balance")
    assert isinstance(err, OpenOCRError)
    assert err.status_code == 402


def test_engine_error_is_openocr_error():
    err = EngineError("processing failed", status_code=422, code="engine_error")
    assert isinstance(err, OpenOCRError)
    assert err.status_code == 422
    assert err.code == "engine_error"


# ── PDF routing fields ──────────────────────────────────────────────────


def test_ocr_result_pdf_routing_fields():
    data = {
        "request_id": "req_3",
        "status": "succeeded",
        "engine": "openocr/tesseract",
        "extracted_text": "text",
        "cost_debited": 0.01,
        "remaining_balance": 5.0,
        "stopped_at_page": 10,
        "stop_reason": "credit_limit",
        "remaining_pages": 5,
        "affordable_pages": 10,
    }
    result = OcrResult.from_dict(data)
    assert result.stopped_at_page == 10
    assert result.stop_reason == "credit_limit"
    assert result.remaining_pages == 5
    assert result.affordable_pages == 10
