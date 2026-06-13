import { EventBus } from "../core/event-bus";
import type { SEOEventType } from "../types/events";

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitStateChange {
  from: CircuitState;
  to: CircuitState;
  key: string;
}

export interface CircuitBreakerConfig {
  enabled: boolean;
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxRequests: number;
}

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  enabled: true,
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  halfOpenMaxRequests: 3,
};

interface CircuitStateEntry {
  state: CircuitState;
  failureCount: number;
  lastFailureTime?: number;
  halfOpenSuccessCount: number;
}

export class CircuitBreaker {
  private circuits: Map<string, CircuitStateEntry> = new Map();
  private bus?: EventBus;

  constructor(private config: CircuitBreakerConfig = DEFAULT_CIRCUIT_BREAKER_CONFIG, bus?: EventBus) {
    this.bus = bus;
  }

  isAllowed(key: string): boolean {
    const entry = this.getOrCreateEntry(key);
    if (entry.state === "closed") return true;
    if (entry.state === "open") {
      if (Date.now() - (entry.lastFailureTime ?? Date.now()) >= this.config.resetTimeoutMs) {
        this.transition(key, entry, "half-open");
        return true;
      }
      return false;
    }
    // half-open: allow limited requests
    return entry.halfOpenSuccessCount < this.config.halfOpenMaxRequests;
  }

  onSuccess(key: string): void {
    const entry = this.getOrCreateEntry(key);
    entry.failureCount = 0;
    if (entry.state === "half-open") {
      entry.halfOpenSuccessCount++;
      if (entry.halfOpenSuccessCount >= this.config.halfOpenMaxRequests) {
        this.transition(key, entry, "closed");
      }
    }
  }

  onFailure(key: string): void {
    const entry = this.getOrCreateEntry(key);
    entry.failureCount++;
    entry.lastFailureTime = Date.now();
    if (
      entry.state === "half-open" ||
      (entry.state === "closed" && entry.failureCount >= this.config.failureThreshold)
    ) {
      this.transition(key, entry, "open");
    }
  }

  getState(key: string): CircuitState {
    return this.getOrCreateEntry(key).state;
  }

  reset(key: string): void {
    this.circuits.delete(key);
  }

  resetAll(): void {
    this.circuits.clear();
  }

  private getOrCreateEntry(key: string): CircuitStateEntry {
    if (!this.circuits.has(key)) {
      this.circuits.set(key, { state: "closed", failureCount: 0, halfOpenSuccessCount: 0 });
    }
    return this.circuits.get(key)!;
  }

  private transition(key: string, entry: CircuitStateEntry, newState: CircuitState): void {
    if (entry.state !== newState) {
      const change: CircuitStateChange = { from: entry.state, to: newState, key };
      entry.state = newState;
      if (newState === "open") {
        entry.halfOpenSuccessCount = 0;
      }
      if (newState === "closed") {
        entry.failureCount = 0;
        entry.halfOpenSuccessCount = 0;
      }
      this.bus?.emit(
        newState === "open" ? "circuit:open" : newState === "closed" ? "circuit:close" : "circuit:half-open",
        change
      );
    }
  }
}
