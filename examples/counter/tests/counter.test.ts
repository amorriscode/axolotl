import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { generateKeyPairSigner, lamports } from "@solana/kit";
import { decodeAccount, encodeInstruction } from "@axolotl-sol/client";
import { compile } from "@axolotl-sol/compiler";
import { createWorld, findProgramSo, instruction, meta, send, sendAllowingFailure } from "@axolotl-sol/testing";
import { FailedTransactionMetadata } from "litesvm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(path.join(root, "src/counter.ts"), "utf8");
const compiled = compile({
  programName: "counter",
  programId: "8qUgK4vi5mPRKpGfTVto7FpWyBjNgfB6U6opToXWM585",
  sources: [{ filename: "src/counter.ts", source }],
});
if (!compiled.ok) throw new Error(compiled.diagnostics.map((item) => item.message).join("\n"));
const idl = compiled.idl;
const SYSTEM = "11111111111111111111111111111111";

async function setup() {
  const world = await createWorld([{ id: idl.address, soPath: findProgramSo(root, "counter") }]);
  const counter = await generateKeyPairSigner();
  await send(world, [
    instruction(idl.address, [
      meta(counter.address, "ws", counter),
      meta(world.payer.address, "ws", world.payer),
      meta(SYSTEM, "r"),
    ], encodeInstruction(idl, "initialize")),
  ]);
  return { world, counter };
}

test("initialize and increment a counter", async () => {
  const { world, counter } = await setup();
  const opened = world.svm.getAccount(counter.address);
  assert.equal(opened.exists, true);
  if (!opened.exists) return;
  const decoded = decodeAccount(idl, "Counter", opened.data);
  assert.equal(decoded.count, 0n);
  assert.equal(decoded.authority, world.payer.address);
  const rent = world.svm.minimumBalanceForRentExemption(BigInt(opened.data.length));
  assert.ok(opened.lamports >= rent);

  await send(world, [
    instruction(idl.address, [
      meta(counter.address, "w"),
      meta(world.payer.address, "rs", world.payer),
    ], encodeInstruction(idl, "increment")),
  ]);
  const after = world.svm.getAccount(counter.address);
  assert.equal(after.exists && decodeAccount(idl, "Counter", after.data).count, 1n);

  await send(world, [
    instruction(idl.address, [
      meta(counter.address, "w"),
      meta(world.payer.address, "rs", world.payer),
    ], encodeInstruction(idl, "add", { amount: 4n })),
  ]);
  const added = world.svm.getAccount(counter.address);
  assert.equal(added.exists && decodeAccount(idl, "Counter", added.data).count, 5n);
});

test("rejects a positive-amount check and a missing signer", async () => {
  const { world, counter } = await setup();
  const zero = await sendAllowingFailure(world, [
    instruction(idl.address, [
      meta(counter.address, "w"),
      meta(world.payer.address, "rs", world.payer),
    ], encodeInstruction(idl, "add", { amount: 0n })),
  ]);
  assert.ok(zero instanceof FailedTransactionMetadata);

  const stranger = await generateKeyPairSigner();
  world.svm.airdrop(stranger.address, lamports(1_000_000_000n));
  const denied = await sendAllowingFailure(world, [
    instruction(idl.address, [
      meta(counter.address, "w"),
      meta(stranger.address, "rs", stranger),
    ], encodeInstruction(idl, "increment")),
  ]);
  assert.ok(denied instanceof FailedTransactionMetadata);
});
