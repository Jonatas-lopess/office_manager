import { describe, it, expect } from "vitest";
import {
  SITE_ID_HEX_RE,
  siteIdHexToBytes,
  serializeMsg,
  deserializeMsg,
} from "./wire-protocol";

const VALID_HEX = "0123456789abcdef0123456789abcdef"; // 32 chars

describe("SITE_ID_HEX_RE", () => {
  it("accepts an exact 32-char lowercase hex string", () => {
    expect(VALID_HEX).toHaveLength(32);
    expect(SITE_ID_HEX_RE.test(VALID_HEX)).toBe(true);
  });

  it("accepts uppercase hex", () => {
    expect(SITE_ID_HEX_RE.test(VALID_HEX.toUpperCase())).toBe(true);
  });

  it("rejects wrong length", () => {
    expect(SITE_ID_HEX_RE.test(VALID_HEX.slice(0, 31))).toBe(false); // 31 chars
    expect(SITE_ID_HEX_RE.test(VALID_HEX + "0")).toBe(false); // 33 chars
    expect(SITE_ID_HEX_RE.test("")).toBe(false);
  });

  it("rejects non-hex characters", () => {
    expect(SITE_ID_HEX_RE.test("g" + VALID_HEX.slice(1))).toBe(false);
  });
});

describe("siteIdHexToBytes", () => {
  it("decodes a valid 32-char hex string into 16 bytes", () => {
    const bytes = siteIdHexToBytes("000102030405060708090a0b0c0d0e0f");
    expect(bytes).not.toBeNull();
    expect(bytes).toHaveLength(16);
    expect(Array.from(bytes!)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    ]);
  });

  it("round-trips ff bytes", () => {
    const bytes = siteIdHexToBytes("f".repeat(32));
    expect(Array.from(bytes!)).toEqual(new Array(16).fill(255));
  });

  it("returns null for malformed input instead of throwing", () => {
    // Guards against untrusted site_id hex arriving over the wire from
    // another device — must not throw and crash the message handler.
    expect(siteIdHexToBytes("not-hex")).toBeNull();
    expect(siteIdHexToBytes("")).toBeNull();
    expect(siteIdHexToBytes("0123456789abcdef")).toBeNull(); // 16 chars, too short
    expect(siteIdHexToBytes("0123456789abcdef0123456789abcdef0")).toBeNull(); // 33 chars
  });
});

describe("serializeMsg / deserializeMsg", () => {
  it("round-trips plain JSON values unchanged", () => {
    const msg = { type: "presence", peers: ["a", "b"], count: 2, ok: true, extra: null };
    expect(deserializeMsg(serializeMsg(msg))).toEqual(msg);
  });

  it("round-trips a bigint (db_version)", () => {
    const msg = { db_version: 9007199254740993n };
    const out = deserializeMsg(serializeMsg(msg));
    expect(out.db_version).toBe(9007199254740993n);
    expect(typeof out.db_version).toBe("bigint");
  });

  it("round-trips a Uint8Array (site_id bytes)", () => {
    const msg = { site_id: new Uint8Array([1, 2, 3, 255, 0]) };
    const out = deserializeMsg(serializeMsg(msg));
    expect(out.site_id).toBeInstanceOf(Uint8Array);
    expect(Array.from(out.site_id)).toEqual([1, 2, 3, 255, 0]);
  });

  it("round-trips nested crsql_changes-shaped rows with mixed bigint/bytes", () => {
    const msg = {
      type: "sync",
      changes: [
        {
          table: "clients",
          pk: new Uint8Array([1, 0, 0, 0]),
          cid: "name",
          val: "Acme",
          col_version: 1n,
          db_version: 42n,
          site_id: new Uint8Array(16).fill(9),
          cl: 1n,
          seq: 0n,
        },
      ],
    };
    const out = deserializeMsg(serializeMsg(msg));
    expect(out.changes[0].col_version).toBe(1n);
    expect(out.changes[0].db_version).toBe(42n);
    expect(out.changes[0].pk).toBeInstanceOf(Uint8Array);
    expect(Array.from(out.changes[0].site_id)).toEqual(new Array(16).fill(9));
  });

  it("does not mistake a plain object with a __type-like field for a tagged value", () => {
    const msg = { __type: "not-actually-tagged" };
    // No `value` key, so neither branch in the reviver matches — passes through.
    expect(deserializeMsg(serializeMsg(msg))).toEqual(msg);
  });
});
