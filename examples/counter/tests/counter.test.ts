import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { generateKeyPairSigner, lamports, type KeyPairSigner } from "@solana/kit";
import { decodeAccount } from "@axolotl-sol/client";
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
writeFileSync(path.join(root, "target/client.ts"), compiled.client);
const builders = await import(pathToFileURL(path.join(root, "target/client.ts")).href) as {
  initialize: (accounts: { counter: string; authority: string; systemProgram: string }) => Built;
  increment: (accounts: { counter: string; authority: string }) => Built;
  add: (accounts: { counter: string; authority: string }, args: { amount: bigint }) => Built;
};

type Built = { accounts: { name: string; address: string }[]; data: Uint8Array };

function fromBuilder(name: string, built: Built, signers: Record<string, KeyPairSigner>) {
  const spec = idl.instructions.find((item) => item.name === name);
  if (!spec) throw new Error(`IDL has no ${name}`);
  const accounts = built.accounts.map((account) => {
    const declared = spec.accounts.find((item) => item.name === account.name);
    if (!declared) throw new Error(`${name} builder account "${account.name}" is not in the IDL`);
    const role = `${declared.writable ? "w" : "r"}${declared.signer ? "s" : ""}` as "r" | "w" | "rs" | "ws";
    return meta(account.address, role, declared.signer ? signers[account.name] : undefined);
  });
  return instruction(idl.address, accounts, built.data);
}

async function setup() {
  const world = await createWorld([{ id: idl.address, soPath: findProgramSo(root, "counter") }]);
  const counter = await generateKeyPairSigner();
  await send(world, [
    fromBuilder("initialize", builders.initialize({
      counter: counter.address,
      authority: world.payer.address,
      systemProgram: SYSTEM,
    }), { counter, authority: world.payer }),
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
    fromBuilder("increment", builders.increment({
      counter: counter.address,
      authority: world.payer.address,
    }), { authority: world.payer }),
  ]);
  const after = world.svm.getAccount(counter.address);
  assert.equal(after.exists && decodeAccount(idl, "Counter", after.data).count, 1n);

  await send(world, [
    fromBuilder("add", builders.add({
      counter: counter.address,
      authority: world.payer.address,
    }, { amount: 4n }), { authority: world.payer }),
  ]);
  const added = world.svm.getAccount(counter.address);
  assert.equal(added.exists && decodeAccount(idl, "Counter", added.data).count, 5n);
});

test("rejects a positive-amount check and a missing signer", async () => {
  const { world, counter } = await setup();
  const zero = await sendAllowingFailure(world, [
    fromBuilder("add", builders.add({
      counter: counter.address,
      authority: world.payer.address,
    }, { amount: 0n }), { authority: world.payer }),
  ]);
  assert.ok(zero instanceof FailedTransactionMetadata);

  const stranger = await generateKeyPairSigner();
  world.svm.airdrop(stranger.address, lamports(1_000_000_000n));
  const denied = await sendAllowingFailure(world, [
    fromBuilder("increment", builders.increment({
      counter: counter.address,
      authority: stranger.address,
    }), { authority: stranger }),
  ]);
  assert.ok(denied instanceof FailedTransactionMetadata);
});
