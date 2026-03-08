import { describe, it, expect } from "vitest";
import {
  parseWebhookEvent,
  verifySignature,
  constructSignature,
} from "../src/webhooks";

describe("parseWebhookEvent", () => {
  it("parses from object", () => {
    const event = parseWebhookEvent({
      event_type: "job.complete",
      job_id: "job-123",
      request_id: "req-456",
      status: "succeeded",
      engine: "openocr/tesseract",
      total_pages: 5,
      extracted_text: "Hello World",
      timestamp: 1700000000,
      usage: { cost: 0.005, pages: 5 },
    });
    expect(event.eventType).toBe("job.complete");
    expect(event.jobId).toBe("job-123");
    expect(event.requestId).toBe("req-456");
    expect(event.status).toBe("succeeded");
    expect(event.engine).toBe("openocr/tesseract");
    expect(event.totalPages).toBe(5);
    expect(event.extractedText).toBe("Hello World");
    expect(event.timestamp).toBe(1700000000);
    expect(event.usage).toEqual({ cost: 0.005, pages: 5 });
  });

  it("parses from JSON string", () => {
    const event = parseWebhookEvent(
      '{"event_type":"job.failed","job_id":"job-999","error":"timeout"}'
    );
    expect(event.eventType).toBe("job.failed");
    expect(event.jobId).toBe("job-999");
    expect(event.error).toBe("timeout");
  });

  it("handles missing fields with defaults", () => {
    const event = parseWebhookEvent({});
    expect(event.eventType).toBe("");
    expect(event.jobId).toBe("");
    expect(event.totalPages).toBe(0);
    expect(event.extractedText).toBeUndefined();
  });

  it("handles 'event' alias for 'event_type'", () => {
    const event = parseWebhookEvent({ event: "job.complete" });
    expect(event.eventType).toBe("job.complete");
  });
});

describe("signature verification", () => {
  const SECRET = "whsec_test_secret_123";
  const PAYLOAD = '{"event_type":"job.complete","job_id":"job-1"}';

  it("verifies valid signature", () => {
    const sig = constructSignature(PAYLOAD, SECRET);
    expect(verifySignature(PAYLOAD, sig, SECRET)).toBe(true);
  });

  it("rejects invalid secret", () => {
    const sig = constructSignature(PAYLOAD, SECRET);
    expect(verifySignature(PAYLOAD, sig, "wrong_secret")).toBe(false);
  });

  it("rejects tampered payload", () => {
    const sig = constructSignature(PAYLOAD, SECRET);
    const tampered = PAYLOAD.replace("job-1", "job-EVIL");
    expect(verifySignature(tampered, sig, SECRET)).toBe(false);
  });

  it("rejects expired signature", () => {
    const oldTs = Math.floor(Date.now() / 1000) - 600; // 10 min ago
    const sig = constructSignature(PAYLOAD, SECRET, oldTs);
    // Default 5-min tolerance
    expect(verifySignature(PAYLOAD, sig, SECRET)).toBe(false);
  });

  it("accepts with custom tolerance", () => {
    const oldTs = Math.floor(Date.now() / 1000) - 600; // 10 min ago
    const sig = constructSignature(PAYLOAD, SECRET, oldTs);
    // 15-min tolerance
    expect(verifySignature(PAYLOAD, sig, SECRET, 900)).toBe(true);
  });

  it("throws on invalid format", () => {
    expect(() => verifySignature(PAYLOAD, "garbage", SECRET)).toThrow(
      "Invalid signature format"
    );
  });

  it("throws on invalid timestamp", () => {
    expect(() =>
      verifySignature(PAYLOAD, "t=notanumber,v1=abc123", SECRET)
    ).toThrow("Invalid timestamp");
  });

  it("constructs with explicit timestamp", () => {
    const sig = constructSignature(PAYLOAD, SECRET, 1700000000);
    expect(sig.startsWith("t=1700000000,v1=")).toBe(true);
  });

  it("roundtrip construct → verify always valid", () => {
    for (const payload of ["{}", '{"x":1}', "hello world"]) {
      const sig = constructSignature(payload, SECRET);
      expect(verifySignature(payload, sig, SECRET)).toBe(true);
    }
  });
});
