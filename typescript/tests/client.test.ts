import { OpenOCRError, AuthenticationError, InsufficientBalanceError, RateLimitError } from "../src/types";

describe("Error types", () => {
  test("OpenOCRError has correct properties", () => {
    const err = new OpenOCRError("oops", 500, "server_error");
    expect(err.message).toBe("oops");
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe("server_error");
    expect(err).toBeInstanceOf(Error);
  });

  test("AuthenticationError is OpenOCRError with 401", () => {
    const err = new AuthenticationError();
    expect(err).toBeInstanceOf(OpenOCRError);
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe("unauthorized");
  });

  test("RateLimitError is OpenOCRError with 429", () => {
    const err = new RateLimitError();
    expect(err).toBeInstanceOf(OpenOCRError);
    expect(err.statusCode).toBe(429);
  });

  test("InsufficientBalanceError is OpenOCRError with 402", () => {
    const err = new InsufficientBalanceError();
    expect(err).toBeInstanceOf(OpenOCRError);
    expect(err.statusCode).toBe(402);
  });
});
