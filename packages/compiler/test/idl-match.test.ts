import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { compile } from "../src/index.ts";

const root = path.resolve(import.meta.dirname, "../../..");

/** Public program ids live in each project's axolotl.toml, not in this test. */
function programId(dir: string): string {
  const text = readFileSync(path.join(root, dir, "axolotl.toml"), "utf8");
  const match = /^id\s*=\s*"([^"]+)"/m.exec(text);
  if (!match) throw new Error(`No program id in ${dir}/axolotl.toml`);
  return match[1]!;
}

const projects = [
  ["examples/counter", "counter", "src/counter.ts"],
  ["examples/token-vault", "token_vault", "src/token_vault.ts"],
  ["examples/pda-profile", "pda_profile", "src/pda_profile.ts"],
  ["examples/cpi/echo", "echo", "src/echo.ts"],
  ["examples/cpi/relay", "relay", "src/relay.ts"],
  ["conformance", "conformance", "src/conformance.ts"],
].map(([dir, name, file]) => [dir, name, programId(dir), file]);

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
