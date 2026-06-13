import { describe, it, expect, vi } from "vitest";
import { retry, DEFAULT_RETRY_CONFIG } from "../../src/infrastructure/retry-pipeline";

describe("retry", () => {
  it("succeeds on first attempt", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await retry(fn, { ...DEFAULT_RETRY_CONFIG, maxAttempts: 3, initialDelayMs: 10 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and eventually succeeds", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("fail1"))
      .mockRejectedValueOnce(new Error("fail2"))
      .mockResolvedValue("ok");
    const result = await retry(fn, { ...DEFAULT_RETRY_CONFIG, maxAttempts: 3, initialDelayMs: 10 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws after exhausting all attempts", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("persistent"));
    await expect(retry(fn, { ...DEFAULT_RETRY_CONFIG, maxAttempts: 2, initialDelayMs: 10 })).rejects.toThrow("persistent");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("calls onRetry callback", async () => {
    const onRetry = vi.fn();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue("ok");
    await retry(fn, { ...DEFAULT_RETRY_CONFIG, maxAttempts: 3, initialDelayMs: 10 }, onRetry);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1);
  });
});
