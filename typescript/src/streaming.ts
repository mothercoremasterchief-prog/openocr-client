import type { OcrResult, JobStatusResponse } from "./types";

/** Event types emitted during streaming OCR processing. */
export type StreamEventType = "job_started" | "page_complete" | "job_complete" | "error";

/** A single event from an OCR streaming session. */
export interface StreamEvent {
  type: StreamEventType;
  jobId: string;
  pageNumber?: number;
  totalPages?: number;
  pagesCompleted?: number;
  progressPct?: number;
  result?: OcrResult;
  error?: string;
}

/** Options for streaming OCR. */
export interface StreamOptions {
  engine: string;
  url?: string;
  dataBase64?: string;
  mimeType?: string;
  options?: Record<string, unknown>;
  fallbackEngine?: string;
  scannedHandling?: string;
  /** Seconds between status polls (default: 1.0). */
  pollIntervalMs?: number;
  /** Optional webhook URL for completion notification. */
  webhookUrl?: string;
}

/**
 * Async generator that yields StreamEvent objects as an OCR job progresses.
 *
 * @param fetchFn - Function to make authenticated API requests (from OpenOCR client).
 * @param jobId - The async job ID to stream.
 * @param pollIntervalMs - Milliseconds between status polls.
 */
export async function* streamJob(
  fetchFn: (path: string, init?: RequestInit) => Promise<Record<string, unknown>>,
  jobId: string,
  pollIntervalMs: number = 1000
): AsyncGenerator<StreamEvent> {
  let lastPagesCompleted = 0;
  let started = false;

  while (true) {
    let status: JobStatusResponse;
    try {
      const raw = await fetchFn(`/v1/ocr/jobs/${jobId}/status`);
      status = {
        jobId: raw.job_id as string,
        status: raw.status as JobStatusResponse["status"],
        totalPages: raw.total_pages as number,
        pagesCompleted: raw.pages_completed as number,
        progressPct: raw.progress_pct as number,
        estimatedSecondsRemaining: raw.estimated_seconds_remaining as number | undefined,
        currentPageType: raw.current_page_type as string | undefined,
      };
    } catch (e) {
      yield {
        type: "error",
        jobId,
        error: e instanceof Error ? e.message : String(e),
      };
      return;
    }

    if (!started) {
      yield {
        type: "job_started",
        jobId,
        totalPages: status.totalPages,
        pagesCompleted: 0,
        progressPct: 0,
      };
      started = true;
    }

    // Emit page_complete events for newly completed pages
    if (status.pagesCompleted > lastPagesCompleted) {
      for (let page = lastPagesCompleted + 1; page <= status.pagesCompleted; page++) {
        yield {
          type: "page_complete",
          jobId,
          pageNumber: page,
          totalPages: status.totalPages,
          pagesCompleted: page,
          progressPct: status.totalPages > 0 ? Math.round((page / status.totalPages) * 100) : 0,
        };
      }
      lastPagesCompleted = status.pagesCompleted;
    }

    if (status.status === "succeeded") {
      try {
        const raw = await fetchFn(`/v1/ocr/jobs/${jobId}/result`);
        const result: OcrResult = {
          requestId: raw.request_id as string,
          status: "succeeded",
          engine: raw.engine as string,
          extractedText: (raw.extracted_text as string | null) ?? null,
          costDebited: 0,
          remainingBalance: 0,
          jobId,
        };
        yield {
          type: "job_complete",
          jobId,
          result,
          totalPages: status.totalPages,
          pagesCompleted: status.totalPages,
          progressPct: 100,
        };
      } catch (e) {
        yield {
          type: "error",
          jobId,
          error: `Failed to fetch result: ${e instanceof Error ? e.message : String(e)}`,
        };
      }
      return;
    }

    if (status.status === "failed") {
      try {
        const raw = await fetchFn(`/v1/ocr/jobs/${jobId}/result`);
        yield {
          type: "error",
          jobId,
          error: (raw.error as string) || "Job failed",
        };
      } catch {
        yield { type: "error", jobId, error: "Job failed (could not fetch details)" };
      }
      return;
    }

    await new Promise((res) => setTimeout(res, pollIntervalMs));
  }
}
