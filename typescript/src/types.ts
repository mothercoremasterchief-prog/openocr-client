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
}

export interface OcrOptions {
  engine: string;
  file?: string;
  url?: string;
  dataBase64?: string;
  mimeType?: string;
  options?: Record<string, unknown>;
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
