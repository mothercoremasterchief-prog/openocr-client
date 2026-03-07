import { describe, expect, it } from "vitest";
import {
  AuthenticationError,
  EngineError,
  InsufficientBalanceError,
  OpenOCRError,
  RateLimitError,
  splitPages,
} from "../src/types";
import type { OcrResult, Page } from "../src/types";

// ── splitPages ──────────────────────────────────────────────────────────

describe("splitPages", () => {
  it("returns empty array for null", () => {
    expect(splitPages(null)).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(splitPages("")).toEqual([]);
  });

  it("returns single page for text without form-feeds", () => {
    const pages = splitPages("Hello world");
    expect(pages).toHaveLength(1);
    expect(pages[0]).toEqual({ number: 1, text: "Hello world" });
  });

  it("splits on form-feed characters", () => {
    const pages = splitPages("Page one\fPage two\fPage three");
    expect(pages).toHaveLength(3);
    expect(pages[0].text).toBe("Page one");
    expect(pages[1].number).toBe(2);
    expect(pages[2].text).toBe("Page three");
  });

  it("strips trailing empty page from trailing form-feed", () => {
    const pages = splitPages("Page one\fPage two\f");
    expect(pages).toHaveLength(2);
  });

  it("strips trailing whitespace-only page", () => {
    const pages = splitPages("Page one\f  \n  ");
    expect(pages).toHaveLength(1);
  });
});

// ── OcrResult types ─────────────────────────────────────────────────────

describe("OcrResult", () => {
  it("has PDF routing fields", () => {
    const result: OcrResult = {
      requestId: "r1",
      status: "succeeded",
      engine: "e1",
      extractedText: "text",
      costDebited: 0.01,
      remainingBalance: 5.0,
      stoppedAtPage: 10,
      stopReason: "credit_limit",
      remainingPages: 5,
      affordablePages: 10,
    };
    expect(result.stoppedAtPage).toBe(10);
    expect(result.stopReason).toBe("credit_limit");
  });
});

// ── Errors ──────────────────────────────────────────────────────────────

describe("Errors", () => {
  it("OpenOCRError has statusCode and code", () => {
    const err = new OpenOCRError("fail", 500, "server_error");
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe("server_error");
    expect(err.message).toBe("fail");
  });

  it("AuthenticationError extends OpenOCRError", () => {
    const err = new AuthenticationError();
    expect(err).toBeInstanceOf(OpenOCRError);
    expect(err.statusCode).toBe(401);
  });

  it("RateLimitError extends OpenOCRError", () => {
    const err = new RateLimitError();
    expect(err).toBeInstanceOf(OpenOCRError);
    expect(err.statusCode).toBe(429);
  });

  it("InsufficientBalanceError extends OpenOCRError", () => {
    const err = new InsufficientBalanceError();
    expect(err).toBeInstanceOf(OpenOCRError);
    expect(err.statusCode).toBe(402);
  });

  it("EngineError extends OpenOCRError", () => {
    const err = new EngineError("bad doc");
    expect(err).toBeInstanceOf(OpenOCRError);
    expect(err.statusCode).toBe(422);
    expect(err.code).toBe("engine_error");
  });
});
