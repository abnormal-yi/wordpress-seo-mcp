import { describe, it, expect, vi } from "vitest";
import { ShutdownHandler } from "../../src/infrastructure/shutdown-handler";

describe("ShutdownHandler", () => {
  it("executes registered callbacks on shutdown", async () => {
    const sh = new ShutdownHandler();
    const cb = vi.fn();
    sh.onShutdown(cb);
    await sh.shutdown(100);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("supports async callbacks", async () => {
    const sh = new ShutdownHandler();
    let resolved = false;
    sh.onShutdown(async () => { await Promise.resolve(); resolved = true; });
    await sh.shutdown(100);
    expect(resolved).toBe(true);
  });

  it("prevents double shutdown", async () => {
    const sh = new ShutdownHandler();
    const cb = vi.fn();
    sh.onShutdown(cb);
    await sh.shutdown(100);
    await sh.shutdown(100);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("returns deregister function to remove callback", async () => {
    const sh = new ShutdownHandler();
    const cb = vi.fn();
    const deregister = sh.onShutdown(cb);
    deregister();
    await sh.shutdown(100);
    expect(cb).not.toHaveBeenCalled();
  });

  it("handles timeout gracefully", async () => {
    const sh = new ShutdownHandler();
    sh.onShutdown(async () => { await new Promise(r => setTimeout(r, 1000)); });
    await sh.shutdown(50);
    expect(sh.isShuttingDown()).toBe(true);
  });
});
