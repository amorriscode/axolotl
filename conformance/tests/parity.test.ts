import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import {
  address,
  generateKeyPairSigner,
  getAddressEncoder,
  getProgramDerivedAddress,
  type Instruction,
} from "@solana/kit";
import { getCreateAccountInstruction } from "@solana-program/system";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { encodeInstruction } from "@axolotl-sol/client";
import { compile } from "@axolotl-sol/compiler";
import {
  createMint,
  createTokenAccount,
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
const INSTRUCTIONS = "Sysvar1nstructions1111111111111111111111111";
const FEES = "SysvarFees111111111111111111111111111111111";
const RECENT = "SysvarRecentB1ockHashes11111111111111111111";
const SLOT_HISTORY = "SysvarS1otHistory11111111111111111111111111";
const LAST_RESTART = "SysvarLastRestartS1ot1111111111111111111111";
const EPOCH_REWARDS = "SysvarEpochRewards1111111111111111111111111";
const ED25519 = "Ed25519SigVerify111111111111111111111111111";
const SECP = "KeccakSecp256k11111111111111111111111111111";
const ATA_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

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

async function initCounter(world: TestWorld) {
  const counter = await generateKeyPairSigner();
  await send(world, [ix("initialize", [
    meta(counter.address, "ws", counter),
    meta(world.payer.address, "ws", world.payer),
    meta(SYSTEM, "r"),
  ])]);
  return counter;
}

function ed25519Instruction(message: Uint8Array) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pub = new Uint8Array(publicKey.export({ format: "der", type: "spki" })).subarray(-32);
  const signature = new Uint8Array(sign(null, message, privateKey));
  const header = 16;
  const publicOffset = header;
  const signatureOffset = publicOffset + 32;
  const messageOffset = signatureOffset + 64;
  const data = new Uint8Array(messageOffset + message.length);
  data[0] = 1;
  const view = new DataView(data.buffer);
  let cursor = 2;
  const write16 = (value: number) => {
    view.setUint16(cursor, value, true);
    cursor += 2;
  };
  write16(signatureOffset);
  write16(0xffff);
  write16(publicOffset);
  write16(0xffff);
  write16(messageOffset);
  write16(message.length);
  write16(0xffff);
  data.set(pub, publicOffset);
  data.set(signature, signatureOffset);
  data.set(message, messageOffset);
  return {
    instruction: { programAddress: address(ED25519), accounts: [], data } satisfies Instruction,
    publicKey: pub,
  };
}

function secp256k1Instruction(message: Uint8Array) {
  const { secretKey, publicKey } = secp256k1.keygen();
  const uncompressed = secp256k1.Point.fromBytes(publicKey).toBytes(false);
  const hash = keccak_256(message);
  const recovered = secp256k1.sign(hash, secretKey, { prehash: false, format: "recovered" });
  const recovery = recovered[0]!;
  const signature = recovered.slice(1);
  const eth = keccak_256(uncompressed.slice(1)).slice(-20);
  const ethOffset = 12;
  const signatureOffset = ethOffset + 20;
  const messageOffset = signatureOffset + 65;
  const data = new Uint8Array(messageOffset + message.length);
  data[0] = 1;
  const view = new DataView(data.buffer);
  view.setUint16(1, signatureOffset, true);
  data[3] = 0;
  view.setUint16(4, ethOffset, true);
  data[6] = 0;
  view.setUint16(7, messageOffset, true);
  view.setUint16(9, message.length, true);
  data[11] = 0;
  data.set(eth, ethOffset);
  data.set(signature, signatureOffset);
  data[signatureOffset + 64] = recovery;
  data.set(message, messageOffset);
  const addressBytes = new Uint8Array(32);
  addressBytes.set(eth);
  return {
    instruction: { programAddress: address(SECP), accounts: [], data } satisfies Instruction,
    address: addressBytes,
  };
}

test("owner constraint accepts the token program and rejects another owner", async () => {
  const world = await boot();
  const mint = await createMint(world, 6, world.payer.address);
  const tokenAccount = await createTokenAccount(world, mint.address, world.payer.address);
  await send(world, [ix("check_owner", [meta(tokenAccount.address, "r"), meta(TOKEN_PROGRAM_ADDRESS, "r")])]);
  const bad = await sendAllowingFailure(world, [ix("check_owner", [meta(SYSTEM, "r"), meta(TOKEN_PROGRAM_ADDRESS, "r")])]);
  assert.ok(bad instanceof FailedTransactionMetadata);
});

test("address constraint pins an account to a public key", async () => {
  const world = await boot();
  await send(world, [ix("check_address", [meta(SYSTEM, "r")])]);
  const bad = await sendAllowingFailure(world, [ix("check_address", [meta(world.payer.address, "r")])]);
  assert.ok(bad instanceof FailedTransactionMetadata);
});

test("constraint expressions see account fields", async () => {
  const world = await boot();
  const counter = await initCounter(world);
  const bad = await sendAllowingFailure(world, [ix("gated", [meta(counter.address, "w")])]);
  assert.ok(bad instanceof FailedTransactionMetadata);
  await send(world, [ix("add", [meta(counter.address, "w")], { amount: 1n })]);
  world.svm.expireBlockhash();
  await send(world, [ix("gated", [meta(counter.address, "w")])]);
  const account = world.svm.getAccount(counter.address);
  assert.equal(account.exists && account.data[8 + 32], 2);
});

test("seeds::program checks a PDA derived under another program", async () => {
  const world = await boot();
  const [foreign] = await getProgramDerivedAddress({
    programAddress: address(echoId),
    seeds: [new TextEncoder().encode("mark")],
  });
  await send(world, [ix("check_foreign", [meta(foreign, "r"), meta(echoId, "r")])]);
  const [local] = await getProgramDerivedAddress({
    programAddress: idl.address,
    seeds: [new TextEncoder().encode("mark")],
  });
  const bad = await sendAllowingFailure(world, [ix("check_foreign", [meta(local, "r"), meta(echoId, "r")])]);
  assert.ok(bad instanceof FailedTransactionMetadata);
});

test("Option and unsized Vec instruction arguments round-trip", async () => {
  const world = await boot();
  const none = await send(world, [ix("shape_args", [], { value: null, items: [1n, 2n, 3n] })]);
  assert.equal(u64le(none.returnData().data()), 3n);
  const some = await send(world, [ix("shape_args", [], { value: 4n, items: [9n] })]);
  assert.equal(u64le(some.returnData().data()), 5n);
});

test("switch matches every unit-enum variant", async () => {
  const world = await boot();
  const counter = await initCounter(world);
  await send(world, [ix("classify", [meta(counter.address, "w")], { side: "Left" })]);
  let account = world.svm.getAccount(counter.address);
  assert.equal(account.exists && account.data[40], 1);
  await send(world, [ix("classify", [meta(counter.address, "w")], { side: "Right" })]);
  account = world.svm.getAccount(counter.address);
  assert.equal(account.exists && account.data[40], 2);
});

test("match binds fields of a data-carrying enum", async () => {
  const world = await boot();
  const counter = await initCounter(world);
  await send(world, [ix("apply", [meta(counter.address, "w")], { action: { kind: "Set", amount: 9n } })]);
  let account = world.svm.getAccount(counter.address);
  assert.equal(account.exists && account.data[40], 9);
  await send(world, [ix("apply", [meta(counter.address, "w")], { action: { kind: "Clear" } })]);
  account = world.svm.getAccount(counter.address);
  assert.equal(account.exists && account.data[40], 0);
});

test("ed25519 precompile data is checked through the instructions sysvar", async () => {
  const world = await boot();
  const message = new TextEncoder().encode("axolotl");
  const signed = ed25519Instruction(message);
  const key = new Uint8Array(32);
  key.set(signed.publicKey);
  await send(world, [
    signed.instruction,
    ix("accept_ed25519", [meta(INSTRUCTIONS, "r")], { public_key: key, message: "axolotl" }),
  ]);
  const bad = await sendAllowingFailure(world, [
    signed.instruction,
    ix("accept_ed25519", [meta(INSTRUCTIONS, "r")], { public_key: key, message: "other" }),
  ]);
  assert.ok(bad instanceof FailedTransactionMetadata);
  assert.match(bad.meta().prettyLogs(), /Precompile mismatch/);

  const attacker = new TextEncoder().encode("attacker");
  const victim = "victim!!";
  const signedAttack = ed25519Instruction(attacker);
  const data = signedAttack.instruction.data;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const messageOffset = view.getUint16(10, true);
  view.setUint16(14, 1, true);
  data.set(new TextEncoder().encode(victim), messageOffset);
  const attackKey = new Uint8Array(32);
  attackKey.set(signedAttack.publicKey);
  const missed = await sendAllowingFailure(world, [
    signedAttack.instruction,
    ix("note", [], { text: `${"x".repeat(messageOffset - 12)}attacker` }),
    ix("accept_ed25519", [meta(INSTRUCTIONS, "r")], { public_key: attackKey, message: victim }),
  ]);
  assert.ok(missed instanceof FailedTransactionMetadata);
  assert.match(missed.meta().prettyLogs(), /Precompile mismatch/);
});

test("secp256k1 precompile data is checked through the instructions sysvar", async () => {
  const world = await boot();
  const message = new TextEncoder().encode("axolotl");
  const signed = secp256k1Instruction(message);
  await send(world, [
    signed.instruction,
    ix("accept_secp256k1", [meta(INSTRUCTIONS, "r")], { address: signed.address, message: "axolotl" }),
  ]);
  const bad = await sendAllowingFailure(world, [
    signed.instruction,
    ix("accept_secp256k1", [meta(INSTRUCTIONS, "r")], { address: signed.address, message: "other" }),
  ]);
  assert.ok(bad instanceof FailedTransactionMetadata);
  assert.match(bad.meta().prettyLogs(), /Precompile mismatch/);
});

test("executable constraint accepts a program and rejects a data account", async () => {
  const world = await boot();
  await send(world, [ix("check_executable", [meta(SYSTEM, "r")])]);
  const bad = await sendAllowingFailure(world, [ix("check_executable", [meta(world.payer.address, "r")])]);
  assert.ok(bad instanceof FailedTransactionMetadata);
});

test("token mint and authority constraints match the token account", async () => {
  const world = await boot();
  const mint = await createMint(world, 6, world.payer.address);
  const tokenAccount = await createTokenAccount(world, mint.address, world.payer.address);
  await send(world, [ix("check_token", [
    meta(tokenAccount.address, "r"),
    meta(mint.address, "r"),
    meta(world.payer.address, "rs", world.payer),
  ])]);
  const other = await createMint(world, 6, world.payer.address);
  const bad = await sendAllowingFailure(world, [ix("check_token", [
    meta(tokenAccount.address, "r"),
    meta(other.address, "r"),
    meta(world.payer.address, "rs", world.payer),
  ])]);
  assert.ok(bad instanceof FailedTransactionMetadata);
});

test("zero initializes a client-created account", async () => {
  const world = await boot();
  const sample = await initCounter(world);
  const existing = world.svm.getAccount(sample.address);
  if (!existing.exists) throw new Error("sample counter missing");
  const space = BigInt(existing.data.length);
  const fresh = await generateKeyPairSigner();
  await send(world, [getCreateAccountInstruction({
    payer: world.payer,
    newAccount: fresh,
    lamports: world.svm.minimumBalanceForRentExemption(space),
    space,
    programAddress: idl.address,
  })]);
  await send(world, [ix("init_zero", [meta(fresh.address, "w"), meta(world.payer.address, "rs", world.payer)])]);
  const account = world.svm.getAccount(fresh.address);
  assert.equal(account.exists && account.data[40], 3);
});

test("associated token constraints check the derived address", async () => {
  const world = await boot();
  const ataProgram = world.svm.getAccount(address(ATA_PROGRAM));
  if (!ataProgram?.exists) throw new Error("LiteSVM is missing the associated token program");
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
  await send(world, [ix("check_ata", [
    meta(ata, "r"),
    meta(mint.address, "r"),
    meta(world.payer.address, "rs", world.payer),
  ])]);
  const other = await createMint(world, 6, world.payer.address);
  const bad = await sendAllowingFailure(world, [ix("check_ata", [
    meta(ata, "r"),
    meta(other.address, "r"),
    meta(world.payer.address, "rs", world.payer),
  ])]);
  assert.ok(bad instanceof FailedTransactionMetadata);
});
