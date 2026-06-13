type ShutdownCallback = () => void | Promise<void>;

export class ShutdownHandler {
  private callbacks: ShutdownCallback[] = [];
  private shuttingDown = false;

  onShutdown(callback: ShutdownCallback): () => void {
    this.callbacks.push(callback);
    return () => {
      const idx = this.callbacks.indexOf(callback);
      if (idx >= 0) this.callbacks.splice(idx, 1);
    };
  }

  async shutdown(timeoutMs: number = 10000): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    const timeout = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error("Shutdown timed out")), timeoutMs)
    );
    const cleanup = (async () => {
      for (const cb of this.callbacks) {
        try { await cb(); } catch { /* ignore cleanup errors */ }
      }
    })();
    try {
      await Promise.race([cleanup, timeout]);
    } catch {
      // timeout reached, force exit
    }
    this.callbacks = [];
  }

  isShuttingDown(): boolean {
    return this.shuttingDown;
  }
}
