import {
  AuthenticationError,
  InsufficientBalanceError,
  JobResultResponse,
  JobStatusResponse,
  OcrOptions,
  OcrResult,
  OpenOCRError,
  OpenOCROptions,
  RateLimitError,
} from "./types";

const DEFAULT_BASE_URL = "https://api.open-ocr.com";
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_POLL_INTERVAL_MS = 3_000;

export class OpenOCR {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: OpenOCROptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** Run OCR. Automatically handles async jobs when wait=true (default). */
  async ocr(opts: OcrOptions): Promise<OcrResult> {
    const { engine, url, dataBase64, mimeType = "application/pdf", options, wait = true, pollIntervalMs = DEFAULT_POLL_INTERVAL_MS } = opts;

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
      jobId: raw.job_id,
      status: raw.status,
      totalPages: raw.total_pages,
      pagesCompleted: raw.pages_completed,
      progressPct: raw.progress_pct,
      estimatedSecondsRemaining: raw.estimated_seconds_remaining,
      currentPageType: raw.current_page_type,
    };
  }

  /** Fetch the result of a completed async job. */
  async jobResult(jobId: string): Promise<JobResultResponse> {
    const raw = await this._fetch(`/v1/ocr/jobs/${jobId}/result`);
    return {
      jobId: raw.job_id,
      requestId: raw.request_id,
      status: raw.status,
      engine: raw.engine,
      totalPages: raw.total_pages,
      extractedText: raw.extracted_text,
      error: raw.error,
    };
  }

  /** List available OCR engines. */
  async engines(): Promise<unknown[]> {
    const raw = await this._fetch("/v1/engines");
    return raw.engines ?? [];
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
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let resp: Response;
    try {
      resp = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          ...(init.headers as Record<string, string> | undefined),
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (resp.status === 401) throw new AuthenticationError();
    if (resp.status === 402) throw new InsufficientBalanceError();
    if (resp.status === 429) throw new RateLimitError();

    const body = await resp.json() as Record<string, unknown>;

    if (!resp.ok && resp.status !== 202) {
      const msg = (body.message ?? body.error ?? resp.statusText) as string;
      const code = (body.code ?? "api_error") as string;
      throw new OpenOCRError(msg, resp.status, code);
    }

    return body;
  }
}
