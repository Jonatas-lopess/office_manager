import { describe, it, expect, vi } from "vitest";
import { parseEpoch, resolveEpochConflict } from "./epoch";

describe("parseEpoch", () => {
  it("parses a numeric string", () => {
    expect(parseEpoch("42")).toBe(42);
    expect(parseEpoch("0")).toBe(0);
  });

  it("defaults to 0 for empty string", () => {
    expect(parseEpoch("")).toBe(0);
  });

  it("defaults to 0 for non-numeric strings instead of NaN", () => {
    // Guards against a corrupt/malicious epoch value on the wire silently
    // becoming NaN and comparing false against every epoch.
    expect(parseEpoch("abc")).toBe(0);
    expect(parseEpoch("12abc")).toBe(0);
    expect(parseEpoch("-1")).toBe(0);
    expect(parseEpoch("1.5")).toBe(0);
  });
});

describe("resolveEpochConflict", () => {
  it("does nothing when remote epoch is undefined", async () => {
    const onWipe = vi.fn();
    const onSendCorrective = vi.fn();
    const handled = await resolveEpochConflict(undefined, {
      localEpoch: "5",
      onWipe,
      onSendCorrective,
    });
    expect(handled).toBe(false);
    expect(onWipe).not.toHaveBeenCalled();
    expect(onSendCorrective).not.toHaveBeenCalled();
  });

  it("does nothing when remote epoch equals local epoch", async () => {
    const onWipe = vi.fn();
    const onSendCorrective = vi.fn();
    const handled = await resolveEpochConflict("5", {
      localEpoch: "5",
      onWipe,
      onSendCorrective,
    });
    expect(handled).toBe(false);
    expect(onWipe).not.toHaveBeenCalled();
    expect(onSendCorrective).not.toHaveBeenCalled();
  });

  it("wipes and adopts when remote epoch is newer", async () => {
    const onWipe = vi.fn();
    const onSendCorrective = vi.fn();
    const handled = await resolveEpochConflict("7", {
      localEpoch: "5",
      onWipe,
      onSendCorrective,
    });
    expect(handled).toBe(true);
    expect(onWipe).toHaveBeenCalledWith("7");
    expect(onSendCorrective).not.toHaveBeenCalled();
  });

  it("sends a corrective reset when remote epoch is older", async () => {
    const onWipe = vi.fn();
    const onSendCorrective = vi.fn();
    const handled = await resolveEpochConflict("3", {
      localEpoch: "5",
      onWipe,
      onSendCorrective,
    });
    expect(handled).toBe(true);
    expect(onSendCorrective).toHaveBeenCalledWith("5");
    expect(onWipe).not.toHaveBeenCalled();
  });

  it("treats a malformed remote epoch as older (0) and sends corrective, never wipes", async () => {
    const onWipe = vi.fn();
    const onSendCorrective = vi.fn();
    const handled = await resolveEpochConflict("not-a-number", {
      localEpoch: "5",
      onWipe,
      onSendCorrective,
    });
    expect(handled).toBe(true);
    expect(onSendCorrective).toHaveBeenCalledWith("5");
    expect(onWipe).not.toHaveBeenCalled();
  });

  it("awaits an async onWipe before returning", async () => {
    let wiped = false;
    const onWipe = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 0));
      wiped = true;
    });
    await resolveEpochConflict("9", {
      localEpoch: "1",
      onWipe,
      onSendCorrective: vi.fn(),
    });
    expect(wiped).toBe(true);
  });
});
