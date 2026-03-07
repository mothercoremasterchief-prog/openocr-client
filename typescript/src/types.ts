export interface OcrInput {
  type: "base64" | "url";
  data_base64?: string;
  mime_type?: string;
  url?: string;
}

export interface OcrRequest {
  engine: string;
  input: OcrInput;
  options?: Record<string, unknown>;
  fallback_engine?: string;
  scanned_handling?: string;
}

export interface Page {
  /** 1-indexed page number. */
  number: number;
  /** Extracted text for this page. */
  text: string;
}

export interface OcrResult {
  requestId: string;
  status: string;
  engine: string;
  extractedText: string | null;
  costDebited: number;
  remainingBalance: number;
  providerLatencyMs?: number;
  confidence?: number;
  /** Set when status is "processing" (async job triggered). */
  jobId?: string;
  stoppedAtPage?: number;
  stopReason?: string;
  remainingPages?: number;
  affordablePages?: number;
}

/**
 * Split extracted text into per-page objects (split on form-feed).
 */
export function splitPages(extractedText: string | null): Page[] {
  if (!extractedText) return [];
  const raw = extractedText.split("\f");
  // Strip trailing empty page from trailing form-feed
  if (raw.length > 0 && raw[raw.length - 1].trim() === "") {
    raw.pop();
  }
  return raw.map((text, i) => ({ number: i + 1, text }));
}

export type JobStatus = "processing" | "succeeded" | "failed";

export interface JobStatusResponse {
  jobId: string;
  status: JobStatus;
  totalPages: number;
  pagesCompleted: number;
  progressPct: number;
  estimatedSecondsRemaining?: number;
  currentPageType?: string;
}

export interface JobResultResponse {
  jobId: string;
  requestId: string;
  status: JobStatus;
  engine: string;
  totalPages: number;
  extractedText?: string;
  error?: string;
}

export interface OpenOCROptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  /** Number of retries for transient errors (default: 3). */
  maxRetries?: number;
}

export interface OcrOptions {
  engine: string;
  file?: string;
  url?: string;
  dataBase64?: string;
  mimeType?: string;
  options?: Record<string, unknown>;
  /** Engine to use for scanned/image pages in PDFs. */
  fallbackEngine?: string;
  /** How to handle scanned pages: "fallback", "skip", or "error". */
  scannedHandling?: string;
  /** If true (default), wait for async jobs to complete before returning. */
  wait?: boolean;
  pollIntervalMs?: number;
}

export class OpenOCRError extends Error {
  statusCode?: number;
  code?: string;

  constructor(message: string, statusCode?: number, code?: string) {
    super(message);
    this.name = "OpenOCRError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class AuthenticationError extends OpenOCRError {
  constructor(message = "Invalid or missing API key") {
    super(message, 401, "unauthorized");
    this.name = "AuthenticationError";
  }
}

export class RateLimitError extends OpenOCRError {
  constructor(message = "Rate limit exceeded") {
    super(message, 429, "rate_limit_exceeded");
    this.name = "RateLimitError";
  }
}

export class InsufficientBalanceError extends OpenOCRError {
  constructor(message = "Insufficient balance") {
    super(message, 402, "insufficient_balance");
    this.name = "InsufficientBalanceError";
  }
}

export class EngineError extends OpenOCRError {
  constructor(message = "Engine processing error") {
    super(message, 422, "engine_error");
    this.name = "EngineError";
  }
}
