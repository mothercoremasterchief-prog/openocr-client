"""OpenOCR Python client."""

from __future__ import annotations

import base64
import time
from pathlib import Path
from typing import Optional

import httpx

from .exceptions import (
    AuthenticationError,
    InsufficientBalanceError,
    NotFoundError,
    OpenOCRError,
    RateLimitError,
)
from .models import JobResultResponse, JobStatus, JobStatusResponse, OcrResult

DEFAULT_BASE_URL = "https://api.open-ocr.com"
DEFAULT_TIMEOUT = 60.0
POLL_INTERVAL = 3.0  # seconds between status polls


class OpenOCR:
    """Synchronous OpenOCR API client.

    Args:
        api_key: Your OpenOCR API key (``sk-ocr-...``).
        base_url: Override the API base URL (useful for self-hosted).
        timeout: HTTP request timeout in seconds.
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> None:
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._http = httpx.Client(
            base_url=self._base_url,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=timeout,
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def ocr(
        self,
        engine: str,
        *,
        file: Optional[str | Path] = None,
        url: Optional[str] = None,
        data_base64: Optional[str] = None,
        mime_type: str = "application/pdf",
        options: Optional[dict] = None,
        wait: bool = True,
        poll_interval: float = POLL_INTERVAL,
    ) -> OcrResult:
        """Run OCR on a file, URL, or base64-encoded bytes.

        If the document has >20 pages and ``wait=True`` (default), this method
        automatically polls until the async job completes and returns the full
        result.  Set ``wait=False`` to return immediately with the job_id.

        Args:
            engine: Engine ID, e.g. ``"openocr/tesseract"``.
            file: Local file path. Mutually exclusive with *url* and *data_base64*.
            url: Remote URL to a PDF or image.
            data_base64: Pre-encoded base64 string.
            mime_type: MIME type for base64 input (default: ``application/pdf``).
            options: Extra options passed to the API (e.g. ``{"max_pages": 50}``).
            wait: If ``True``, block until async jobs complete.
            poll_interval: Seconds between status polls (async mode only).

        Returns:
            :class:`OcrResult` with extracted text.
        """
        if file is not None:
            data_base64, mime_type = self._read_file(file)

        if data_base64 is not None:
            input_payload = {"type": "base64", "data_base64": data_base64, "mime_type": mime_type}
        elif url is not None:
            input_payload = {"type": "url", "url": url}
        else:
            raise ValueError("Provide one of: file, url, or data_base64")

        body: dict = {"engine": engine, "input": input_payload}
        if options:
            body["options"] = options

        resp = self._http.post("/v1/ocr", json=body)
        result = OcrResult.from_dict(self._handle(resp))

        if result.is_async and wait:
            result = self._wait_for_job(result.job_id, poll_interval=poll_interval)  # type: ignore[arg-type]

        return result

    def job_status(self, job_id: str) -> JobStatusResponse:
        """Poll the status of an async job."""
        resp = self._http.get(f"/v1/ocr/jobs/{job_id}/status")
        return JobStatusResponse.from_dict(self._handle(resp))

    def job_result(self, job_id: str) -> JobResultResponse:
        """Fetch the result of a completed async job."""
        resp = self._http.get(f"/v1/ocr/jobs/{job_id}/result")
        return JobResultResponse.from_dict(self._handle(resp))

    def engines(self) -> list[dict]:
        """List all available OCR engines."""
        resp = self._http.get("/v1/engines")
        return self._handle(resp).get("engines", [])

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> "OpenOCR":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _wait_for_job(self, job_id: str, poll_interval: float) -> OcrResult:
        while True:
            status = self.job_status(job_id)
            if status.status == JobStatus.SUCCEEDED:
                r = self.job_result(job_id)
                return OcrResult(
                    request_id=r.request_id,
                    status="succeeded",
                    engine=r.engine,
                    extracted_text=r.extracted_text,
                    cost_debited=0.0,
                    remaining_balance=0.0,
                    job_id=job_id,
                )
            if status.status == JobStatus.FAILED:
                r = self.job_result(job_id)
                raise OpenOCRError(r.error or "Async job failed")
            time.sleep(poll_interval)

    @staticmethod
    def _read_file(path: str | Path) -> tuple[str, str]:
        path = Path(path)
        data = path.read_bytes()
        b64 = base64.b64encode(data).decode()
        suffix = path.suffix.lower()
        mime = {
            ".pdf": "application/pdf",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".tiff": "image/tiff",
            ".tif": "image/tiff",
            ".webp": "image/webp",
        }.get(suffix, "application/octet-stream")
        return b64, mime

    @staticmethod
    def _handle(resp: httpx.Response) -> dict:
        if resp.status_code == 401:
            raise AuthenticationError("Invalid or missing API key", status_code=401, code="unauthorized")
        if resp.status_code == 402:
            raise InsufficientBalanceError("Insufficient balance", status_code=402, code="insufficient_balance")
        if resp.status_code == 404:
            raise NotFoundError("Resource not found", status_code=404, code="not_found")
        if resp.status_code == 429:
            raise RateLimitError("Rate limit exceeded", status_code=429, code="rate_limit_exceeded")
        if not resp.is_success and resp.status_code != 202:
            try:
                body = resp.json()
                msg = body.get("message") or body.get("error") or resp.text
                code = body.get("code", "api_error")
            except Exception:
                msg, code = resp.text, "api_error"
            raise OpenOCRError(msg, status_code=resp.status_code, code=code)
        return resp.json()
