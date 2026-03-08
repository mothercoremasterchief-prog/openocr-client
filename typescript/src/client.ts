import {
  AuthenticationError,
  EngineError,
  InsufficientBalanceError,
  JobResultResponse,
  JobStatusResponse,
  OcrOptions,
  OcrResult,
  OpenOCRError,
  OpenOCROptions,
  RateLimitError,
} from "./types";
import { StreamEvent, StreamOptions, streamJob } from "./streaming";

const DEFAULT_BASE_URL = "https://api.open-ocr.com";
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_POLL_INTERVAL_MS = 3_000;
const DEFAULT_MAX_RETRIES = 3;
const MAX_BACKOFF_MS = 30_000;
const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);

export class OpenOCR {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(options: OpenOCROptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  }

  /** Run OCR. Automatically handles async jobs when wait=true (default). */
  async ocr(opts: OcrOptions): Promise<OcrResult> {
    const {
      engine,
      url,
      dataBase64,
      mimeType = "application/pdf",
      options,
      fallbackEngine,
      scannedHandling,
      wait = true,
      pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    } = opts;

    let input: Record<string, string>;
    if (dataBase64 != null) {
      input = { type: "base64", data_base64: dataBase64, mime_type: mimeType };
    } else if (url != null) {
      input = { type: "url", url };
    } else {
      throw new OpenOCRError("Provide one of: url or dataBase64");
    }

    const body: Record<string, unknown> = { engine, input };
    if (options) body.options = options;
    if (fallbackEngine) body.fallback_engine = fallbackEngine;
    if (scannedHandling) body.scanned_handling = scannedHandling;

    const raw = await this._fetch("/v1/ocr", { method: "POST", body: JSON.stringify(body) });
    const result = this._toOcrResult(raw);

    if (result.jobId && wait) {
      return this._waitForJob(result.jobId, pollIntervalMs);
    }

    return result;
  }

  /** Poll the status of an async job. */
  async jobStatus(jobId: string): Promise<JobStatusResponse> {
    const raw = await this._fetch(`/v1/ocr/jobs/${jobId}/status`);
    return {
      jobId: raw.job_id as string,
      status: raw.status as JobStatusResponse["status"],
      totalPages: raw.total_pages as number,
      pagesCompleted: raw.pages_completed as number,
      progressPct: raw.progress_pct as number,
      estimatedSecondsRemaining: raw.estimated_seconds_remaining as number | undefined,
      currentPageType: raw.current_page_type as string | undefined,
    };
  }

  /** Fetch the result of a completed async job. */
  async jobResult(jobId: string): Promise<JobResultResponse> {
    const raw = await this._fetch(`/v1/ocr/jobs/${jobId}/result`);
    return {
      jobId: raw.job_id as string,
      requestId: raw.request_id as string,
      status: raw.status as JobResultResponse["status"],
      engine: raw.engine as string,
      totalPages: raw.total_pages as number,
      extractedText: raw.extracted_text as string | undefined,
      error: raw.error as string | undefined,
    };
  }

  /**
   * Stream OCR progress as async iterable events.
   *
   * Submits the job in async mode and yields StreamEvent objects as
   * pages complete. Use this for real-time progress tracking on large
   * documents.
   *
   * @example
   * ```typescript
   * for await (const event of client.stream({ engine: "openocr/tesseract", url: "..." })) {
   *   if (event.type === "page_complete") {
   *     console.log(`Page ${event.pageNumber}/${event.totalPages}`);
   *   } else if (event.type === "job_complete") {
   *     console.log(event.result?.extractedText);
   *   }
   * }
   * ```
   */
  async *stream(opts: StreamOptions): AsyncGenerator<StreamEvent> {
    const {
      engine,
      url,
      dataBase64,
      mimeType = "application/pdf",
      options,
      fallbackEngine,
      scannedHandling,
      pollIntervalMs = 1000,
      webhookUrl,
    } = opts;

    let input: Record<string, string>;
    if (dataBase64 != null) {
      input = { type: "base64", data_base64: dataBase64, mime_type: mimeType };
    } else if (url != null) {
      input = { type: "url", url };
    } else {
      throw new OpenOCRError("Provide one of: url or dataBase64");
    }

    const body: Record<string, unknown> = { engine, input, mode: "async" };
    if (options) body.options = options;
    if (fallbackEngine) body.fallback_engine = fallbackEngine;
    if (scannedHandling) body.scanned_handling = scannedHandling;
    if (webhookUrl) body.webhook_url = webhookUrl;

    const raw = await this._fetch("/v1/ocr", { method: "POST", body: JSON.stringify(body) });
    const result = this._toOcrResult(raw);

    if (!result.jobId) {
      // Synchronous result — emit as single job_complete
      yield {
        type: "job_complete",
        jobId: result.requestId,
        result,
        totalPages: 1,
        pagesCompleted: 1,
        progressPct: 100,
      };
      return;
    }

    yield* streamJob(
      (path, init) => this._fetch(path, init),
      result.jobId,
      pollIntervalMs
    );
  }

  /** List available OCR engines. */
  async engines(): Promise<unknown[]> {
    const raw = await this._fetch("/v1/engines");
    return (raw.engines ?? []) as unknown[];
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private _toOcrResult(raw: Record<string, unknown>): OcrResult {
    let jobId: string | undefined;
    const warning = raw.warning as string | undefined;
    if (warning?.startsWith("job_id: ")) {
      jobId = warning.replace("job_id: ", "");
    }

    return {
      requestId: raw.request_id as string,
      status: raw.status as string,
      engine: raw.engine as string,
      extractedText: (raw.extracted_text as string | null) ?? null,
      costDebited: (raw.cost_debited as number) ?? 0,
      remainingBalance: (raw.remaining_balance as number) ?? 0,
      providerLatencyMs: raw.provider_latency_ms as number | undefined,
      confidence: raw.confidence as number | undefined,
      jobId,
      stoppedAtPage: raw.stopped_at_page as number | undefined,
      stopReason: raw.stop_reason as string | undefined,
      remainingPages: raw.remaining_pages as number | undefined,
      affordablePages: raw.affordable_pages as number | undefined,
    };
  }

  private async _waitForJob(jobId: string, pollIntervalMs: number): Promise<OcrResult> {
    for (;;) {
      const status = await this.jobStatus(jobId);
      if (status.status === "succeeded") {
        const r = await this.jobResult(jobId);
        return {
          requestId: r.requestId,
          status: "succeeded",
          engine: r.engine,
          extractedText: r.extractedText ?? null,
          costDebited: 0,
          remainingBalance: 0,
          jobId,
        };
      }
      if (status.status === "failed") {
        const r = await this.jobResult(jobId);
        throw new OpenOCRError(r.error ?? "Async job failed");
      }
      await new Promise((res) => setTimeout(res, pollIntervalMs));
    }
  }

  private async _fetch(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
    let lastError: Error | undefined;
    let lastResp: Response | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const resp = await fetch(`${this.baseUrl}${path}`, {
          ...init,
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
            ...(init.headers as Record<string, string> | undefined),
          },
        });
        clearTimeout(timer);

        if (RETRYABLE_STATUS_CODES.has(resp.status) && attempt < this.maxRetries) {
          let delay = Math.min(2 ** attempt * 1000 + Math.random() * 1000, MAX_BACKOFF_MS);
          if (resp.status === 429) {
            const retryAfter = resp.headers.get("retry-after");
            if (retryAfter) {
              const parsed = parseFloat(retryAfter);
              if (!isNaN(parsed)) delay = Math.max(parsed * 1000, delay);
            }
          }
          await new Promise((res) => setTimeout(res, delay));
          continue;
        }

        if (resp.status === 401) throw new AuthenticationError();
        if (resp.status === 402) throw new InsufficientBalanceError();
        if (resp.status === 422) {
          const body = (await resp.json()) as Record<string, unknown>;
          throw new EngineError(
            (body.message ?? body.error ?? "Engine processing error") as string
          );
        }
        if (resp.status === 429) throw new RateLimitError();

        const body = (await resp.json()) as Record<string, unknown>;

        if (!resp.ok && resp.status !== 202) {
          const msg = (body.message ?? body.error ?? resp.statusText) as string;
          const code = (body.code ?? "api_error") as string;
          throw new OpenOCRError(msg, resp.status, code);
        }

        return body;
      } catch (e) {
        clearTimeout(timer);
        if (
          e instanceof OpenOCRError ||
          e instanceof AuthenticationError ||
          e instanceof InsufficientBalanceError ||
          e instanceof EngineError ||
          e instanceof RateLimitError
        ) {
          throw e;
        }
        lastError = e as Error;
        if (attempt < this.maxRetries) {
          const delay = Math.min(2 ** attempt * 1000 + Math.random() * 1000, MAX_BACKOFF_MS);
          await new Promise((res) => setTimeout(res, delay));
          continue;
        }
        throw e;
      }
    }

    throw lastError ?? new OpenOCRError("Request failed after retries");
  }
}
