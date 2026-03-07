"""OpenOCR SDK exceptions."""


class OpenOCRError(Exception):
    """Base exception for all OpenOCR errors."""

    def __init__(self, message: str, status_code: int | None = None, code: str | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.code = code


class AuthenticationError(OpenOCRError):
    """Raised when the API key is missing or invalid."""


class RateLimitError(OpenOCRError):
    """Raised when the rate limit is exceeded."""


class InsufficientBalanceError(OpenOCRError):
    """Raised when the account has insufficient balance."""


class NotFoundError(OpenOCRError):
    """Raised when a resource (e.g. async job) is not found."""


class EngineError(OpenOCRError):
    """Raised when the OCR engine fails to process the document (HTTP 422)."""
