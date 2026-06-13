import { describe, it, expect } from "vitest";
import { CredentialManager } from "../../src/infrastructure/credential-manager";

describe("CredentialManager", () => {
  it("stores and retrieves credentials", () => {
    const cm = new CredentialManager("a".repeat(64));
    cm.store("site-1", "my-api-key-123");
    expect(cm.retrieve("site-1")).toBe("my-api-key-123");
  });

  it("returns undefined for unknown site", () => {
    const cm = new CredentialManager("a".repeat(64));
    expect(cm.retrieve("unknown")).toBeUndefined();
  });

  it("rotates credentials", () => {
    const cm = new CredentialManager("a".repeat(64));
    cm.store("site-1", "old-key");
    cm.rotate("site-1", "new-key");
    expect(cm.retrieve("site-1")).toBe("new-key");
  });

  it("deletes credentials", () => {
    const cm = new CredentialManager("a".repeat(64));
    cm.store("site-1", "key");
    cm.delete("site-1");
    expect(cm.has("site-1")).toBe(false);
  });

  it("throws on invalid key length", () => {
    expect(() => new CredentialManager("tooshort")).toThrow();
  });

  it("isolates credentials by site", () => {
    const cm = new CredentialManager("a".repeat(64));
    cm.store("site-a", "key-a");
    cm.store("site-b", "key-b");
    expect(cm.retrieve("site-a")).toBe("key-a");
    expect(cm.retrieve("site-b")).toBe("key-b");
  });
});
