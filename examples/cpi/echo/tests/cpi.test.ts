import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { generateKeyPairSigner } from "@solana/kit";
import { decodeAccount, encodeInstruction } from "@axolotl-sol/client";
import { compile } from "@axolotl-sol/compiler";
import { createWorld, findProgramSo, instruction, meta, send } from "@axolotl-sol/testing";

const echoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const relayRoot = path.resolve(echoRoot, "../relay");

function load(root: string, name: string, id: string, file: string) {
  const compiled = compile({
    programName: name,
    programId: id,
    sources: [{ filename: file, source: readFileSync(path.join(root, file), "utf8") }],
  });
  if (!compiled.ok) throw new Error(compiled.diagnostics.map((item) => item.message).join("\n"));
  return compiled.idl;
}

test("relay sets echo state through CPI", async () => {
  const echo = load(echoRoot, "echo", "5MWt5tcVEsYHTh2tPJxnM8gRtvUpWa4E72tn2PzhaoXU", "src/echo.ts");
  const relay = load(relayRoot, "relay", "6kkQrxZGUNnFnp9a82NAKDVv9ithwmPLz3oSLr4hnU7c", "src/relay.ts");
  const world = await createWorld([
    { id: echo.address, soPath: findProgramSo(echoRoot, "echo") },
    { id: relay.address, soPath: findProgramSo(relayRoot, "relay") },
  ]);
  const data = await generateKeyPairSigner();
  await send(world, [
    instruction(echo.address, [
      meta(data.address, "ws", data),
      meta(world.payer.address, "ws", world.payer),
      meta("11111111111111111111111111111111", "r"),
    ], encodeInstruction(echo, "initialize")),
  ]);
  await send(world, [
    instruction(relay.address, [
      meta(echo.address, "r"),
      meta(data.address, "w"),
    ], encodeInstruction(relay, "relay", { value: 42n })),
  ]);
  const stored = world.svm.getAccount(data.address);
  assert.equal(stored.exists && decodeAccount(echo, "EchoData", stored.data).value, 42n);
});
