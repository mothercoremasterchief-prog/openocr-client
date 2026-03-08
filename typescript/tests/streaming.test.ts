import { describe, it, expect, vi } from "vitest";
import { streamJob, StreamEvent } from "../src/streaming";

describe("streamJob", () => {
  it("emits job_started → page_complete → job_complete for single page", async () => {
    const fetchFn = vi
      .fn()
      // First poll: processing, 0 pages
      .mockResolvedValueOnce({
        job_id: "job-1",
        status: "processing",
        total_pages: 1,
        pages_completed: 0,
        progress_pct: 0,
      })
      // Second poll: succeeded, 1 page
      .mockResolvedValueOnce({
        job_id: "job-1",
        status: "succeeded",
        total_pages: 1,
        pages_completed: 1,
        progress_pct: 100,
      })
      // Result fetch
      .mockResolvedValueOnce({
        request_id: "req-1",
        engine: "openocr/tesseract",
        extracted_text: "Hello World",
      });

    const events: StreamEvent[] = [];
    for await (const event of streamJob(fetchFn, "job-1", 0)) {
      events.push(event);
    }

    expect(events.map((e) => e.type)).toEqual([
      "job_started",
      "page_complete",
      "job_complete",
    ]);
    expect(events[0].totalPages).toBe(1);
    expect(events[1].pageNumber).toBe(1);
    expect(events[2].result?.extractedText).toBe("Hello World");
  });

  it("emits multiple page_complete events for multi-page job", async () => {
    const fetchFn = vi
      .fn()
      // Poll 1: processing, 0 pages
      .mockResolvedValueOnce({
        job_id: "job-2",
        status: "processing",
        total_pages: 3,
        pages_completed: 0,
        progress_pct: 0,
      })
      // Poll 2: processing, 2 pages
      .mockResolvedValueOnce({
        job_id: "job-2",
        status: "processing",
        total_pages: 3,
        pages_completed: 2,
        progress_pct: 66,
      })
      // Poll 3: succeeded, 3 pages
      .mockResolvedValueOnce({
        job_id: "job-2",
        status: "succeeded",
        total_pages: 3,
        pages_completed: 3,
        progress_pct: 100,
      })
      // Result fetch
      .mockResolvedValueOnce({
        request_id: "req-2",
        engine: "openocr/tesseract",
        extracted_text: "Page1\fPage2\fPage3",
      });

    const events: StreamEvent[] = [];
    for await (const event of streamJob(fetchFn, "job-2", 0)) {
      events.push(event);
    }

    const pageEvents = events.filter((e) => e.type === "page_complete");
    expect(pageEvents).toHaveLength(3);
    expect(pageEvents.map((e) => e.pageNumber)).toEqual([1, 2, 3]);
  });

  it("emits error event on failed job", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({
        job_id: "job-3",
        status: "failed",
        total_pages: 1,
        pages_completed: 0,
        progress_pct: 0,
      })
      .mockResolvedValueOnce({
        error: "Engine crashed",
      });

    const events: StreamEvent[] = [];
    for await (const event of streamJob(fetchFn, "job-3", 0)) {
      events.push(event);
    }

    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
    expect(errorEvent!.error).toBe("Engine crashed");
  });

  it("emits error event on network failure", async () => {
    const fetchFn = vi.fn().mockRejectedValueOnce(new Error("Network down"));

    const events: StreamEvent[] = [];
    for await (const event of streamJob(fetchFn, "job-4", 0)) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("error");
    expect(events[0].error).toContain("Network down");
  });
});
