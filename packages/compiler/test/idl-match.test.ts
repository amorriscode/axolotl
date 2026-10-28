import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { compile } from "../src/index.ts";

const root = path.resolve(import.meta.dirname, "../../..");

const projects = [
  ["examples/counter", "counter", "8qUgK4vi5mPRKpGfTVto7FpWyBjNgfB6U6opToXWM585", "src/counter.ts"],
  ["examples/token-vault", "token_vault", "4mP1BL1yP9Rt1TSmuF4ht4wzmJig6hPJpumA5uVCQaQ3", "src/token_vault.ts"],
  ["examples/pda-profile", "pda_profile", "5kYGWFrmwpgL8xsCtPCwzdxWjZ3itbtmPqjk8sRNGiU3", "src/pda_profile.ts"],
  ["examples/cpi/echo", "echo", "5MWt5tcVEsYHTh2tPJxnM8gRtvUpWa4E72tn2PzhaoXU", "src/echo.ts"],
  ["examples/cpi/relay", "relay", "6kkQrxZGUNnFnp9a82NAKDVv9ithwmPLz3oSLr4hnU7c", "src/relay.ts"],
  ["conformance", "conformance", "AU6PWDE1vrLgrcJpFvhWwDupTVHASu1jEwKTCX5NUsr1", "src/conformance.ts"],
];

test("compiler discriminators match the Anchor build IDL", () => {
  for (const [dir, name, id, file] of projects) {
    const source = readFileSync(path.join(root, dir, file), "utf8");
    const compiled = compile({
      programName: name,
      programId: id,
      sources: [{ filename: file, source }],
    });
    assert.equal(compiled.ok, true, compiled.diagnostics.map((item) => item.message).join("\n"));
    const anchor = JSON.parse(readFileSync(path.join(root, dir, "target/idl", `${name}.json`), "utf8"));
    const byName = new Map(compiled.idl.instructions.map((instruction) => [instruction.name, instruction.discriminator]));
    for (const instruction of anchor.instructions) {
      assert.deepEqual(instruction.discriminator, byName.get(instruction.name), `${name}.${instruction.name}`);
    }
    const accounts = new Map(compiled.idl.accounts.map((account) => [account.name, account.discriminator]));
    for (const account of anchor.accounts ?? []) {
      assert.deepEqual(account.discriminator, accounts.get(account.name), `${name} account ${account.name}`);
    }
    for (const event of anchor.events ?? []) {
      const ours = compiled.idl.events.find((item) => item.name === event.name);
      assert.deepEqual(event.discriminator, ours?.discriminator, `${name} event ${event.name}`);
    }
    for (const error of anchor.errors ?? []) {
      const ours = compiled.idl.errors.find((item) => item.name === error.name);
      assert.equal(error.code, ours?.code, `${name} error ${error.name}`);
      assert.equal(error.msg, ours?.msg);
    }
  }
});
