import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { getAddressEncoder, getProgramDerivedAddress } from "@solana/kit";
import { decodeAccount, decodeEventLogs, encodeInstruction } from "@axolotl-sol/client";
import { compile } from "@axolotl-sol/compiler";
import { createWorld, findProgramSo, instruction, meta, send } from "@axolotl-sol/testing";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const compiled = compile({
  programName: "pda_profile",
  programId: "5kYGWFrmwpgL8xsCtPCwzdxWjZ3itbtmPqjk8sRNGiU3",
  sources: [{ filename: "src/pda_profile.ts", source: readFileSync(path.join(root, "src/pda_profile.ts"), "utf8") }],
});
if (!compiled.ok) throw new Error(compiled.diagnostics.map((item) => item.message).join("\n"));

test("creates a PDA profile and emits a visit event", async () => {
  const idl = compiled.idl;
  const world = await createWorld([{ id: idl.address, soPath: findProgramSo(root, "pda_profile") }]);
  const encoder = getAddressEncoder();
  const [profile] = await getProgramDerivedAddress({
    programAddress: idl.address,
    seeds: [new TextEncoder().encode("profile"), encoder.encode(world.payer.address)],
  });
  const nickname = new Uint8Array(32);
  nickname.set(new TextEncoder().encode("ada"));
  await send(world, [
    instruction(idl.address, [
      meta(profile, "w"),
      meta(world.payer.address, "ws", world.payer),
      meta("11111111111111111111111111111111", "r"),
    ], encodeInstruction(idl, "create_profile", { nickname })),
  ]);
  const created = world.svm.getAccount(profile);
  assert.equal(created.exists, true);
  if (!created.exists) return;
  const data = decodeAccount(idl, "Profile", created.data);
  assert.equal(data.authority, world.payer.address);
  assert.equal(data.visits, 0n);
  assert.equal(data.nickname, "ada");
  assert.ok(created.lamports >= world.svm.minimumBalanceForRentExemption(BigInt(created.data.length)));

  const result = await send(world, [
    instruction(idl.address, [
      meta(profile, "w"),
      meta(world.payer.address, "rs", world.payer),
    ], encodeInstruction(idl, "visit", { note: "hello" })),
  ]);
  const visited = world.svm.getAccount(profile);
  assert.equal(visited.exists && decodeAccount(idl, "Profile", visited.data).visits, 1n);
  const events = decodeEventLogs(idl, result.logs());
  assert.equal(events.length, 1);
  assert.equal(events[0]?.name, "Visited");
  assert.equal(events[0]?.data.note, "hello");
  assert.equal(events[0]?.data.visits, 1n);
});
