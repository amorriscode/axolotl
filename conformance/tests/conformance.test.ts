import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  address,
  generateKeyPairSigner,
  getAddressEncoder,
  getProgramDerivedAddress,
  lamports,
  type Instruction,
} from "@solana/kit";
import { decodeAccount, decodeEventLogs, encodeInstruction } from "@axolotl-sol/client";
import { compile } from "@axolotl-sol/compiler";
import {
  createWorld,
  findProgramSo,
  instruction,
  meta,
  send,
  sendAllowingFailure,
  type TestWorld,
} from "@axolotl-sol/testing";
import { FailedTransactionMetadata } from "litesvm";
import type { KeyPairSigner } from "@solana/kit";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SYSTEM = "11111111111111111111111111111111";
const CLOCK = "SysvarC1ock11111111111111111111111111111111";
const RENT = "SysvarRent111111111111111111111111111111111";

const compiled = compile({
  programName: "conformance",
  programId: "AU6PWDE1vrLgrcJpFvhWwDupTVHASu1jEwKTCX5NUsr1",
  sources: [{ filename: "src/conformance.ts", source: readFileSync(path.join(root, "src/conformance.ts"), "utf8") }],
});
if (!compiled.ok) throw new Error(compiled.diagnostics.map((item) => item.message).join("\n"));
const idl = compiled.idl;

function setComputeUnitLimit(units: number): Instruction {
  const data = new Uint8Array(5);
  data[0] = 2;
  new DataView(data.buffer).setUint32(1, units, true);
  return {
    programAddress: address("ComputeBudget111111111111111111111111111111"),
    accounts: [],
    data,
  };
}

function ix(world: TestWorld, name: string, accounts: ReturnType<typeof meta>[], args: Record<string, unknown> = {}) {
  return instruction(idl.address, accounts, encodeInstruction(idl, name, args));
}

async function freshCounter(world: TestWorld): Promise<KeyPairSigner> {
  const counter = await generateKeyPairSigner();
  await send(world, [ix(world, "initialize", [
    meta(counter.address, "ws", counter),
    meta(world.payer.address, "ws", world.payer),
    meta(SYSTEM, "r"),
  ])]);
  return counter;
}

async function freshLedger(world: TestWorld): Promise<KeyPairSigner> {
  const ledger = await generateKeyPairSigner();
  await send(world, [ix(world, "init_ledger", [
    meta(ledger.address, "ws", ledger),
    meta(world.payer.address, "ws", world.payer),
    meta(SYSTEM, "r"),
  ])]);
  return ledger;
}

async function boot(): Promise<TestWorld> {
  return createWorld([{ id: idl.address, soPath: findProgramSo(root, "conformance") }]);
}

test("account init is rent-exempt and owned by the program", async () => {
  const world = await boot();
  const counter = await freshCounter(world);
  const account = world.svm.getAccount(counter.address);
  assert.equal(account.exists, true);
  if (!account.exists) return;
  assert.equal(account.programAddress, idl.address);
  assert.ok(account.lamports >= world.svm.minimumBalanceForRentExemption(BigInt(account.data.length)));
  assert.equal(decodeAccount(idl, "Counter", account.data).count, 0n);
});

test("close returns lamports to the authority", async () => {
  const world = await boot();
  const counter = await freshCounter(world);
  const before = world.svm.getBalance(world.payer.address) ?? lamports(0n);
  const account = world.svm.getAccount(counter.address);
  assert.equal(account.exists, true);
  if (!account.exists) return;
  await send(world, [ix(world, "close_counter", [
    meta(counter.address, "w"),
    meta(world.payer.address, "ws", world.payer),
  ])]);
  const closed = world.svm.getAccount(counter.address);
  const after = world.svm.getBalance(world.payer.address) ?? lamports(0n);
  assert.equal(closed.exists, false);
  assert.ok(after > before);
});

test("if/else updates the counter from both branches", async () => {
  const world = await boot();
  const counter = await freshCounter(world);
  await send(world, [ix(world, "branch", [meta(counter.address, "w")], { amount: 9n })]);
  let account = world.svm.getAccount(counter.address);
  assert.equal(account.exists && decodeAccount(idl, "Counter", account.data).count, 9n);
  await send(world, [ix(world, "branch", [meta(counter.address, "w")], { amount: 4n })]);
  account = world.svm.getAccount(counter.address);
  assert.equal(account.exists && decodeAccount(idl, "Counter", account.data).count, 5n);
});

test("bounded loop increments once per iteration", async () => {
  const world = await boot();
  const counter = await freshCounter(world);
  await send(world, [ix(world, "spin", [meta(counter.address, "w")], { times: 5n })]);
  const account = world.svm.getAccount(counter.address);
  assert.equal(account.exists && decodeAccount(idl, "Counter", account.data).count, 5n);
});

test("system program CPI transfers lamports", async () => {
  const world = await boot();
  const recipient = await generateKeyPairSigner();
  world.svm.airdrop(recipient.address, lamports(1_000_000n));
  const before = world.svm.getBalance(recipient.address)!;
  await send(world, [ix(world, "pay", [
    meta(world.payer.address, "ws", world.payer),
    meta(recipient.address, "w"),
    meta(SYSTEM, "r"),
  ], { amount: 250_000n })]);
  assert.equal(world.svm.getBalance(recipient.address)! - before, lamports(250_000n));
});

test("integer, bool, and bytes32 fields round-trip", async () => {
  const world = await boot();
  const ledger = await freshLedger(world);
  await send(world, [ix(world, "set_numbers", [
    meta(ledger.address, "w"),
  ], { small: 7, medium: 1000, wide: 100_000, signed: -42n, flag: true })]);
  const account = world.svm.getAccount(ledger.address);
  assert.equal(account.exists, true);
  if (!account.exists) return;
  const data = decodeAccount(idl, "Ledger", account.data);
  assert.equal(data.small, 7);
  assert.equal(data.medium, 1000);
  assert.equal(data.wide, 100_000);
  assert.equal(data.signed, -42n);
  assert.equal(data.flag, true);
  assert.equal(data.nickname, "axolotl".padEnd(32, "\0"));
});

test("clock sysvar is visible to the program", async () => {
  const world = await boot();
  const ledger = await freshLedger(world);
  const clock = world.svm.getClock();
  clock.slot = 42n;
  clock.unixTimestamp = 1_700_000_000n;
  world.svm.setClock(clock);
  await send(world, [ix(world, "stamp", [meta(ledger.address, "w"), meta(CLOCK, "r")])]);
  const account = world.svm.getAccount(ledger.address);
  assert.equal(account.exists, true);
  if (!account.exists) return;
  const data = decodeAccount(idl, "Ledger", account.data);
  assert.equal(data.observed_slot, 42n);
  assert.equal(data.observed_time, 1_700_000_000n);
});

test("rent sysvar minimum balance matches the runtime", async () => {
  const world = await boot();
  const ledger = await freshLedger(world);
  await send(world, [ix(world, "quote_rent", [
    meta(ledger.address, "w"),
    meta(RENT, "r"),
  ], { space: 128n })]);
  const account = world.svm.getAccount(ledger.address);
  assert.equal(account.exists, true);
  if (!account.exists) return;
  const data = decodeAccount(idl, "Ledger", account.data);
  assert.equal(data.rent_floor, world.svm.minimumBalanceForRentExemption(128n));
});

test("string arguments, custom errors, and program logs", async () => {
  const world = await boot();
  const ledger = await freshLedger(world);
  const bad = await sendAllowingFailure(world, [ix(world, "check_word", [meta(ledger.address, "w")], { word: "nope" })]);
  assert.ok(bad instanceof FailedTransactionMetadata);
  assert.match(bad.meta().prettyLogs(), /Wrong word/);
  const ok = await send(world, [ix(world, "check_word", [meta(ledger.address, "w")], { word: "solana" })]);
  assert.ok(ok.logs().some((line) => line.includes("solana")));
});

test("pubkey arguments must match the signer", async () => {
  const world = await boot();
  const ledger = await freshLedger(world);
  const bad = await sendAllowingFailure(world, [ix(world, "check_key", [
    meta(ledger.address, "w"),
    meta(world.payer.address, "rs", world.payer),
  ], { expected: "11111111111111111111111111111111" })]);
  assert.ok(bad instanceof FailedTransactionMetadata);
  const ok = await send(world, [ix(world, "check_key", [
    meta(ledger.address, "w"),
    meta(world.payer.address, "rs", world.payer),
  ], { expected: world.payer.address })]);
  assert.ok(ok.logs().length > 0);
});

test("events are emitted and decodable from logs", async () => {
  const world = await boot();
  const clock = world.svm.getClock();
  clock.slot = 7n;
  world.svm.setClock(clock);
  const result = await send(world, [ix(world, "ping", [meta(CLOCK, "r")], { message: "hi" })]);
  const events = decodeEventLogs(idl, result.logs());
  assert.equal(events[0]?.name, "Pinged");
  assert.equal(events[0]?.data.message, "hi");
  assert.equal(events[0]?.data.slot, 7n);
  assert.ok(result.logs().some((line) => line.includes("ping")));
});

test("PDA seeds can mix a constant, a u64 arg, and an account", async () => {
  const world = await boot();
  const encoder = getAddressEncoder();
  const id = 7n;
  const idBytes = new Uint8Array(8);
  new DataView(idBytes.buffer).setBigUint64(0, id, true);
  const [item] = await getProgramDerivedAddress({
    programAddress: idl.address,
    seeds: [new TextEncoder().encode("item"), idBytes, encoder.encode(world.payer.address)],
  });
  await send(world, [ix(world, "init_item", [
    meta(item, "w"),
    meta(world.payer.address, "ws", world.payer),
    meta(SYSTEM, "r"),
  ], { id })]);
  const account = world.svm.getAccount(item);
  assert.equal(account.exists, true);
  if (!account.exists) return;
  const data = decodeAccount(idl, "Item", account.data);
  assert.equal(data.id, id);
  assert.equal(data.authority, world.payer.address);
  assert.equal(typeof data.bump, "number");
});

test("continue in a for loop still increments", async () => {
  const world = await boot();
  const counter = await freshCounter(world);
  await send(world, [ix(world, "spin_skip", [meta(counter.address, "w")], { times: 10n })]);
  const account = world.svm.getAccount(counter.address);
  assert.equal(account.exists && decodeAccount(idl, "Counter", account.data).count, 9n);
});
