import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { getAddressEncoder, getProgramDerivedAddress } from "@solana/kit";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { decodeAccount, encodeInstruction } from "@axolotl-sol/client";
import { compile } from "@axolotl-sol/compiler";
import {
  createMint,
  createTokenAccount,
  createWorld,
  findProgramSo,
  instruction,
  meta,
  mintTo,
  send,
  sendAllowingFailure,
} from "@axolotl-sol/testing";
import { FailedTransactionMetadata } from "litesvm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const compiled = compile({
  programName: "token_vault",
  programId: "4mP1BL1yP9Rt1TSmuF4ht4wzmJig6hPJpumA5uVCQaQ3",
  sources: [{ filename: "src/token_vault.ts", source: readFileSync(path.join(root, "src/token_vault.ts"), "utf8") }],
});
if (!compiled.ok) throw new Error(compiled.diagnostics.map((item) => item.message).join("\n"));

function tokenAmount(data: Uint8Array): bigint {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(64, true);
}

test("deposit and withdraw SPL tokens through a PDA vault", async () => {
  const idl = compiled.idl;
  const world = await createWorld([{ id: idl.address, soPath: findProgramSo(root, "token_vault") }]);
  const mint = await createMint(world, 6, world.payer.address);
  const ownerToken = await createTokenAccount(world, mint.address, world.payer.address);
  await mintTo(world, mint.address, ownerToken.address, 1_000_000n);
  const encoder = getAddressEncoder();
  const [vault] = await getProgramDerivedAddress({
    programAddress: idl.address,
    seeds: [new TextEncoder().encode("vault"), encoder.encode(mint.address), encoder.encode(world.payer.address)],
  });
  await send(world, [
    instruction(idl.address, [
      meta(vault, "w"),
      meta(world.payer.address, "ws", world.payer),
      meta(mint.address, "r"),
      meta("11111111111111111111111111111111", "r"),
    ], encodeInstruction(idl, "initialize")),
  ]);
  const vaultToken = await createTokenAccount(world, mint.address, vault);
  await send(world, [
    instruction(idl.address, [
      meta(vault, "w"),
      meta(world.payer.address, "rs", world.payer),
      meta(mint.address, "r"),
      meta(ownerToken.address, "w"),
      meta(vaultToken.address, "w"),
      meta(TOKEN_PROGRAM_ADDRESS, "r"),
    ], encodeInstruction(idl, "deposit", { amount: 400_000n })),
  ]);
  const mid = world.svm.getAccount(vault);
  assert.equal(mid.exists && decodeAccount(idl, "Vault", mid.data).deposited, 400_000n);
  const vaultAccount = world.svm.getAccount(vaultToken.address);
  assert.equal(vaultAccount.exists && tokenAmount(vaultAccount.data), 400_000n);

  await send(world, [
    instruction(idl.address, [
      meta(vault, "w"),
      meta(world.payer.address, "rs", world.payer),
      meta(mint.address, "r"),
      meta(ownerToken.address, "w"),
      meta(vaultToken.address, "w"),
      meta(TOKEN_PROGRAM_ADDRESS, "r"),
    ], encodeInstruction(idl, "withdraw", { amount: 150_000n })),
  ]);
  const end = world.svm.getAccount(vault);
  assert.equal(end.exists && decodeAccount(idl, "Vault", end.data).deposited, 250_000n);
  const owner = world.svm.getAccount(ownerToken.address);
  assert.equal(owner.exists && tokenAmount(owner.data), 750_000n);
});

test("deposit rejects a same-mint token account the vault does not own", async () => {
  const idl = compiled.idl;
  const world = await createWorld([{ id: idl.address, soPath: findProgramSo(root, "token_vault") }]);
  const mint = await createMint(world, 6, world.payer.address);
  const ownerToken = await createTokenAccount(world, mint.address, world.payer.address);
  const stranger = await createTokenAccount(world, mint.address, world.payer.address);
  await mintTo(world, mint.address, ownerToken.address, 1_000_000n);
  const encoder = getAddressEncoder();
  const [vault] = await getProgramDerivedAddress({
    programAddress: idl.address,
    seeds: [new TextEncoder().encode("vault"), encoder.encode(mint.address), encoder.encode(world.payer.address)],
  });
  await send(world, [
    instruction(idl.address, [
      meta(vault, "w"),
      meta(world.payer.address, "ws", world.payer),
      meta(mint.address, "r"),
      meta("11111111111111111111111111111111", "r"),
    ], encodeInstruction(idl, "initialize")),
  ]);
  const denied = await sendAllowingFailure(world, [
    instruction(idl.address, [
      meta(vault, "w"),
      meta(world.payer.address, "rs", world.payer),
      meta(mint.address, "r"),
      meta(ownerToken.address, "w"),
      meta(stranger.address, "w"),
      meta(TOKEN_PROGRAM_ADDRESS, "r"),
    ], encodeInstruction(idl, "deposit", { amount: 1n })),
  ]);
  assert.ok(denied instanceof FailedTransactionMetadata);
  const after = world.svm.getAccount(ownerToken.address);
  assert.equal(after.exists && tokenAmount(after.data), 1_000_000n);
});
