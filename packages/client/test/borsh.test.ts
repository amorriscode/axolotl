import assert from "node:assert/strict";
import test from "node:test";
import { decodeAccount, decodeBase58, decodeEventInstructions, encodeBase58, encodeInstruction, EVENT_IX_TAG } from "../src/index.ts";

test("base58 round-trips the system program and a 32-byte key", () => {
  const system = "11111111111111111111111111111111";
  assert.equal(decodeBase58(system).length, 32);
  assert.equal(encodeBase58(decodeBase58(system)), system);
  const bytes = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
  assert.deepEqual(decodeBase58(encodeBase58(bytes)), bytes);
});

test("encodes a signed integer and a pubkey argument", () => {
  const idl = {
    instructions: [{
      name: "set_numbers",
      discriminator: [1, 2, 3, 4, 5, 6, 7, 8],
      args: [
        { name: "signed", type: "i64" },
        { name: "expected", type: "pubkey" },
      ],
    }],
    accounts: [{ name: "Ledger", discriminator: [9, 9, 9, 9, 9, 9, 9, 9] }],
    types: [{
      name: "Ledger",
      type: {
        kind: "struct",
        fields: [
          { name: "signed", type: "i64" },
          { name: "flag", type: "bool" },
        ],
      },
    }],
  };
  const data = encodeInstruction(idl, "set_numbers", {
    signed: -42n,
    expected: "11111111111111111111111111111111",
  });
  assert.equal(data.length, 8 + 8 + 32);
  assert.equal(data[8], 256 - 42);
  const account = new Uint8Array(8 + 8 + 1);
  account.set([9, 9, 9, 9, 9, 9, 9, 9]);
  account[8] = 256 - 42;
  account.fill(0xff, 9, 16);
  account[16] = 1;
  const decoded = decodeAccount(idl, "Ledger", account);
  assert.equal(decoded.signed, -42n);
  assert.equal(decoded.flag, true);
});

test("decodes an emit_cpi event from self-CPI instruction data", () => {
  const idl = {
    instructions: [],
    events: [{ name: "Pinged", discriminator: [9, 8, 7, 6, 5, 4, 3, 2] }],
    types: [{
      name: "Pinged",
      type: { kind: "struct", fields: [{ name: "message", type: "string" }] },
    }],
  };
  const body = Uint8Array.from([9, 8, 7, 6, 5, 4, 3, 2, 2, 0, 0, 0, 104, 105]);
  const data = new Uint8Array(EVENT_IX_TAG.length + body.length);
  data.set(EVENT_IX_TAG);
  data.set(body, EVENT_IX_TAG.length);
  const events = decodeEventInstructions(idl, [Uint8Array.of(1, 2, 3), data]);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.name, "Pinged");
  assert.equal(events[0]?.data.message, "hi");
});
