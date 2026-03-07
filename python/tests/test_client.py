"""Basic unit tests for the Python SDK."""

import pytest
from openocr.models import OcrResult, JobStatus, JobStatusResponse, JobResultResponse
from openocr.exceptions import OpenOCRError, AuthenticationError, InsufficientBalanceError


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
