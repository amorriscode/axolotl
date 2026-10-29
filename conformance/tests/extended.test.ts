import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  AccountRole,
  address,
  generateKeyPairSigner,
  getAddressEncoder,
  getProgramDerivedAddress,
  lamports,
  type Instruction,
} from "@solana/kit";
import { getCreateAccountInstruction } from "@solana-program/system";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { decodeAccount, decodeEventInstructions, encodeInstruction } from "@axolotl-sol/client";
import { compile } from "@axolotl-sol/compiler";
import {
  createMint,
  createWorld,
  findProgramSo,
  instruction,
  meta,
  send,
  sendAllowingFailure,
  type TestWorld,
} from "@axolotl-sol/testing";
import { FailedTransactionMetadata } from "litesvm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const echoRoot = path.resolve(root, "../examples/cpi/echo");
const SYSTEM = "11111111111111111111111111111111";
const CLOCK = "SysvarC1ock11111111111111111111111111111111";
const EPOCH = "SysvarEpochSchedu1e111111111111111111111111";
const INSTRUCTIONS = "Sysvar1nstructions1111111111111111111111111";
const SLOT_HASHES = "SysvarS1otHashes111111111111111111111111111";
const STAKE_HISTORY = "SysvarStakeHistory1111111111111111111111111";
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const ATA_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const ALT_PROGRAM = "AddressLookupTab1e1111111111111111111111111";
/** Mint base padded to 165, plus account type, plus the TransferFeeConfig TLV. */
const TRANSFER_FEE_MINT_SPACE = 278n;

const toml = readFileSync(path.join(root, "axolotl.toml"), "utf8");
const programId = /^id\s*=\s*"([^"]+)"/m.exec(toml)![1]!;
const echoToml = readFileSync(path.join(echoRoot, "axolotl.toml"), "utf8");
const echoId = /^id\s*=\s*"([^"]+)"/m.exec(echoToml)![1]!;
const compiled = compile({
  programName: "conformance",
  programId,
  sources: [{ filename: "src/conformance.ts", source: readFileSync(path.join(root, "src/conformance.ts"), "utf8") }],
});
if (!compiled.ok) throw new Error(compiled.diagnostics.map((item) => item.message).join("\n"));
const idl = compiled.idl;

function ix(name: string, accounts: ReturnType<typeof meta>[], args: Record<string, unknown> = {}): Instruction {
  return instruction(idl.address, accounts, encodeInstruction(idl, name, args));
}

function u64le(data: Uint8Array): bigint {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(0, true);
}

async function boot(): Promise<TestWorld> {
  return createWorld([
    { id: idl.address, soPath: findProgramSo(root, "conformance") },
    { id: echoId, soPath: findProgramSo(echoRoot, "echo") },
  ]);
}

test("while loops and helper functions increment", async () => {
  const world = await boot();
  const counter = await generateKeyPairSigner();
  await send(world, [ix("initialize", [
    meta(counter.address, "ws", counter),
    meta(world.payer.address, "ws", world.payer),
    meta(SYSTEM, "r"),
  ])]);
  await send(world, [ix("walk", [meta(counter.address, "w")], { times: 4n })]);
  const account = world.svm.getAccount(counter.address);
  assert.equal(account.exists && decodeAccount(idl, "Counter", account.data).count, 4n);
});

test("optional accounts are skipped when absent", async () => {
  const world = await boot();
  const counter = await generateKeyPairSigner();
  await send(world, [ix("initialize", [
    meta(counter.address, "ws", counter),
    meta(world.payer.address, "ws", world.payer),
    meta(SYSTEM, "r"),
  ])]);
  await send(world, [ix("bump_optional", [meta(idl.address, "r")])]);
  let account = world.svm.getAccount(counter.address);
  assert.equal(account.exists && decodeAccount(idl, "Counter", account.data).count, 0n);
  await send(world, [ix("bump_optional", [meta(counter.address, "w")])]);
  account = world.svm.getAccount(counter.address);
  assert.equal(account.exists && decodeAccount(idl, "Counter", account.data).count, 1n);
});

test("remaining accounts are counted", async () => {
  const world = await boot();
  const extra = await generateKeyPairSigner();
  const result = await send(world, [ix("count_remaining", [meta(extra.address, "r"), meta(world.payer.address, "r")])]);
  assert.equal(u64le(result.returnData().data()), 2n);
});

test("nested structs, strings, vecs, and enums round-trip", async () => {
  const world = await boot();
  const shape = await generateKeyPairSigner();
  await send(world, [ix("init_shape", [
    meta(shape.address, "ws", shape),
    meta(world.payer.address, "ws", world.payer),
    meta(SYSTEM, "r"),
  ])]);
  const account = world.svm.getAccount(shape.address);
  assert.equal(account.exists, true);
  if (!account.exists) return;
  const data = decodeAccount(idl, "Shape", account.data);
  const point = data.point as { x: bigint; y: bigint };
  assert.equal(point.x, 3n);
  assert.equal(point.y, 4n);
  assert.equal(data.label, "nest");
  assert.deepEqual(data.samples, [9n]);
  assert.equal(data.side, "Right");
});

test("realloc grows an account", async () => {
  const world = await boot();
  const grown = await generateKeyPairSigner();
  await send(world, [ix("init_grown", [
    meta(grown.address, "ws", grown),
    meta(world.payer.address, "ws", world.payer),
    meta(SYSTEM, "r"),
  ])]);
  const before = world.svm.getAccount(grown.address);
  assert.equal(before.exists, true);
  if (!before.exists) return;
  await send(world, [ix("grow", [
    meta(grown.address, "w"),
    meta(world.payer.address, "ws", world.payer),
    meta(SYSTEM, "r"),
  ])]);
  const after = world.svm.getAccount(grown.address);
  assert.equal(after.exists && after.data.length, 128);
  assert.equal(after.exists && decodeAccount(idl, "Grown", after.data).note, "bigger");
  assert.ok(before.data.length < 128);
});

test("epoch schedule and the instructions sysvar are readable", async () => {
  const world = await boot();
  const schedule = await send(world, [ix("read_schedule", [meta(EPOCH, "r")])]);
  const expected = world.svm.getEpochSchedule().slotsPerEpoch;
  assert.equal(u64le(schedule.returnData().data()), expected);
  const index = await send(world, [ix("read_index", [meta(INSTRUCTIONS, "r")])]);
  assert.equal(new DataView(index.returnData().data().buffer, index.returnData().data().byteOffset, 2).getUint16(0, true), 0);
});

test("the program creates an associated token account", async () => {
  const world = await boot();
  // LiteSVM stores the associated-token program account but does not register it for CPI until it is added.
  const ataProgram = world.svm.getAccount(address(ATA_PROGRAM));
  if (!ataProgram?.exists) throw new Error("LiteSVM is missing the associated token program account");
  world.svm.addProgram(address(ATA_PROGRAM), ataProgram.data);
  const mint = await createMint(world, 6, world.payer.address);
  const encoder = getAddressEncoder();
  const [ata] = await getProgramDerivedAddress({
    programAddress: address(ATA_PROGRAM),
    seeds: [encoder.encode(world.payer.address), encoder.encode(TOKEN_PROGRAM_ADDRESS), encoder.encode(mint.address)],
  });
  await send(world, [ix("open_ata", [
    meta(world.payer.address, "ws", world.payer),
    meta(ata, "w"),
    meta(world.payer.address, "r"),
    meta(mint.address, "r"),
    meta(SYSTEM, "r"),
    meta(TOKEN_PROGRAM_ADDRESS, "r"),
    meta(ATA_PROGRAM, "r"),
  ])]);
  const created = world.svm.getAccount(ata);
  assert.equal(created.exists, true);
  if (!created.exists) return;
  assert.equal(created.programAddress, TOKEN_PROGRAM_ADDRESS);
});

test("emit_cpi writes an event through the event authority", async () => {
  const world = await boot();
  const clock = world.svm.getClock();
  clock.slot = 9n;
  world.svm.setClock(clock);
  const [eventAuthority] = await getProgramDerivedAddress({
    programAddress: idl.address,
    seeds: [new TextEncoder().encode("__event_authority")],
  });
  const result = await send(world, [ix("ping_cpi", [
    meta(CLOCK, "r"),
    meta(eventAuthority, "r"),
    meta(idl.address, "r"),
  ], { message: "cpi-event" })]);
  const datas = result.innerInstructions().flatMap((group) => group.map((inner) => inner.instruction().data()));
  const events = decodeEventInstructions(idl, datas);
  assert.equal(events[0]?.name, "Pinged");
  assert.equal(events[0]?.data.message, "cpi-event");
  assert.equal(events[0]?.data.slot, 9n);
});

test("CPI return data comes back to the caller", async () => {
  const world = await boot();
  const result = await send(world, [ix("ask_echo", [meta(echoId, "r")], { value: 21n })]);
  assert.equal(u64le(result.returnData().data()), 42n);
});

test("two PDA signers authorize one CPI", async () => {
  const world = await boot();
  const encoder = getAddressEncoder();
  const [left] = await getProgramDerivedAddress({
    programAddress: idl.address,
    seeds: [new TextEncoder().encode("left"), encoder.encode(world.payer.address)],
  });
  const [right] = await getProgramDerivedAddress({
    programAddress: idl.address,
    seeds: [new TextEncoder().encode("right"), encoder.encode(world.payer.address)],
  });
  const result = await send(world, [ix("fanout", [
    meta(echoId, "r"),
    meta(left, "r"),
    meta(right, "r"),
    meta(world.payer.address, "rs", world.payer),
  ], { value: 8n })]);
  assert.ok(result.logs().some((line) => line.includes("8")));
});

test("continue skips one iteration of a while loop", async () => {
  const world = await boot();
  const counter = await generateKeyPairSigner();
  await send(world, [ix("initialize", [
    meta(counter.address, "ws", counter),
    meta(world.payer.address, "ws", world.payer),
    meta(SYSTEM, "r"),
  ])]);
  await send(world, [ix("skip_odds", [meta(counter.address, "w")], { times: 3n })]);
  const account = world.svm.getAccount(counter.address);
  assert.equal(account.exists && decodeAccount(idl, "Counter", account.data).count, 2n);
});

test("break leaves a while loop early", async () => {
  const world = await boot();
  const counter = await generateKeyPairSigner();
  await send(world, [ix("initialize", [
    meta(counter.address, "ws", counter),
    meta(world.payer.address, "ws", world.payer),
    meta(SYSTEM, "r"),
  ])]);
  await send(world, [ix("cap", [meta(counter.address, "w")], { times: 10n })]);
  const account = world.svm.getAccount(counter.address);
  assert.equal(account.exists && decodeAccount(idl, "Counter", account.data).count, 2n);
});

test("u128 account fields round-trip", async () => {
  const world = await boot();
  const wide = await generateKeyPairSigner();
  const value = 1n << 100n;
  await send(world, [ix("init_wide", [
    meta(wide.address, "ws", wide),
    meta(world.payer.address, "ws", world.payer),
    meta(SYSTEM, "r"),
  ], { value })]);
  const account = world.svm.getAccount(wide.address);
  assert.equal(account.exists && decodeAccount(idl, "Wide", account.data).value, value);
});

test("checked division and division by zero", async () => {
  const world = await boot();
  const result = await send(world, [ix("divide", [], { left: 20n, right: 4n })]);
  assert.equal(u64le(result.returnData().data()), 5n);
  const bad = await sendAllowingFailure(world, [ix("divide", [], { left: 1n, right: 0n })]);
  assert.ok(bad instanceof FailedTransactionMetadata);
  assert.match(bad.meta().prettyLogs(), /Arithmetic overflow or division by zero/);
});

test("has_one rejects the wrong authority", async () => {
  const world = await boot();
  const counter = await generateKeyPairSigner();
  await send(world, [ix("initialize", [
    meta(counter.address, "ws", counter),
    meta(world.payer.address, "ws", world.payer),
    meta(SYSTEM, "r"),
  ])]);
  const stranger = await generateKeyPairSigner();
  const dropped = world.svm.airdrop(stranger.address, lamports(1_000_000n));
  assert.ok(!(dropped instanceof FailedTransactionMetadata));
  const bad = await sendAllowingFailure(world, [ix("touch", [
    meta(counter.address, "w"),
    meta(stranger.address, "rs", stranger),
  ])]);
  assert.ok(bad instanceof FailedTransactionMetadata);
  await send(world, [ix("touch", [
    meta(counter.address, "w"),
    meta(world.payer.address, "rs", world.payer),
  ])]);
  const account = world.svm.getAccount(counter.address);
  assert.equal(account.exists && decodeAccount(idl, "Counter", account.data).count, 1n);
});

test("checked addition rejects overflow", async () => {
  const world = await boot();
  const counter = await generateKeyPairSigner();
  await send(world, [ix("initialize", [
    meta(counter.address, "ws", counter),
    meta(world.payer.address, "ws", world.payer),
    meta(SYSTEM, "r"),
  ])]);
  const max = (1n << 64n) - 1n;
  await send(world, [ix("add", [meta(counter.address, "w")], { amount: max })]);
  const bad = await sendAllowingFailure(world, [ix("add", [meta(counter.address, "w")], { amount: 1n })]);
  assert.ok(bad instanceof FailedTransactionMetadata);
  assert.match(bad.meta().prettyLogs(), /Arithmetic overflow or division by zero/);
});

test("a PDA constraint rejects the wrong address", async () => {
  const world = await boot();
  const wrong = await generateKeyPairSigner();
  const bad = await sendAllowingFailure(world, [ix("init_item", [
    meta(wrong.address, "ws", wrong),
    meta(world.payer.address, "ws", world.payer),
    meta(SYSTEM, "r"),
  ], { id: 7n })]);
  assert.ok(bad instanceof FailedTransactionMetadata);
  assert.match(bad.meta().prettyLogs(), /seeds constraint was violated|ConstraintSeeds/);
});
