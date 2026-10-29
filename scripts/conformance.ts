import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const files = [
  "examples/counter/tests/counter.test.ts",
  "examples/token-vault/tests/token-vault.test.ts",
  "examples/pda-profile/tests/pda-profile.test.ts",
  "examples/cpi/echo/tests/cpi.test.ts",
  "conformance/tests/conformance.test.ts",
  "conformance/tests/extended.test.ts",
  "conformance/tests/parity.test.ts",
  "packages/compiler/test/idl-match.test.ts",
];

interface Row {
  id: string;
  group: string;
  feature: string;
  status: "pass" | "fail" | "unsupported";
  detail: string;
}

const catalog: { test: string; id: string; group: string; feature: string; detail: string }[] = [
  { test: "initialize and increment a counter", id: "counter.lifecycle", group: "Examples", feature: "Counter init, has_one, and checked add", detail: "examples/counter" },
  { test: "rejects a positive-amount check and a missing signer", id: "counter.errors", group: "Examples", feature: "Signer and custom error constraints", detail: "examples/counter" },
  { test: "deposit and withdraw SPL tokens through a PDA vault", id: "token.vault", group: "Tokens", feature: "SPL Token transfer_checked, including a PDA signer", detail: "examples/token-vault" },
  { test: "deposit rejects a same-mint token account the vault does not own", id: "token.vault-owner", group: "Tokens", feature: "token::authority rejects the wrong destination", detail: "examples/token-vault" },
  { test: "creates a PDA profile and emits a visit event", id: "pda.profile", group: "PDAs", feature: "PDA seeds, stored bump, bytes32, and events", detail: "examples/pda-profile" },
  { test: "relay sets echo state through CPI", id: "cpi.relay", group: "CPI", feature: "CPI into another Anchor program", detail: "examples/cpi" },
  { test: "account init is rent-exempt and owned by the program", id: "accounts.init", group: "Accounts", feature: "init, payer, rent exemption, program ownership", detail: "conformance" },
  { test: "close returns lamports to the authority", id: "accounts.close", group: "Accounts", feature: "close returns lamports", detail: "conformance" },
  { test: "if/else updates the counter from both branches", id: "control.if", group: "Language", feature: "if / else", detail: "conformance" },
  { test: "bounded loop increments once per iteration", id: "control.loop", group: "Language", feature: "Bounded for loop", detail: "conformance" },
  { test: "system program CPI transfers lamports", id: "cpi.system", group: "CPI", feature: "System program transfer", detail: "conformance" },
  { test: "integer, bool, and bytes32 fields round-trip", id: "types.scalars", group: "Types", feature: "u8, u16, u32, u64, i64, bool, bytes32", detail: "conformance" },
  { test: "clock sysvar is visible to the program", id: "sysvar.clock", group: "Sysvars", feature: "Clock sysvar", detail: "conformance" },
  { test: "rent sysvar minimum balance matches the runtime", id: "sysvar.rent", group: "Sysvars", feature: "Rent sysvar minimum_balance", detail: "conformance" },
  { test: "string arguments, custom errors, and program logs", id: "types.string", group: "Types", feature: "String arguments, require, and log", detail: "conformance" },
  { test: "pubkey arguments must match the signer", id: "types.pubkey", group: "Types", feature: "Pubkey instruction arguments", detail: "conformance" },
  { test: "events are emitted and decodable from logs", id: "events.emit", group: "Events", feature: "Anchor events in transaction logs", detail: "conformance" },
  { test: "PDA seeds can mix a constant, a u64 arg, and an account", id: "pda.mixed", group: "PDAs", feature: "Seeds from constants, args, and account keys", detail: "conformance" },
  { test: "continue in a for loop still increments", id: "control.for-continue", group: "Language", feature: "continue inside for runs the increment", detail: "Ten iterations, skip one, counter ends at 9." },
  { test: "compiler discriminators match the Anchor build IDL", id: "idl.match", group: "IDL", feature: "Anchor IDL discriminators, events, and error codes", detail: "packages/compiler" },
  { test: "while loops and helper functions increment", id: "lang.while", group: "Language", feature: "while loops and scalar helper functions", detail: "conformance" },
  { test: "continue skips one iteration of a while loop", id: "lang.continue", group: "Language", feature: "continue", detail: "conformance" },
  { test: "break leaves a while loop early", id: "lang.break", group: "Language", feature: "break", detail: "conformance" },
  { test: "optional accounts are skipped when absent", id: "accounts.optional", group: "Accounts", feature: "Optional accounts", detail: "Absent accounts are the program id. present() guards the body." },
  { test: "remaining accounts are counted", id: "accounts.remaining", group: "Accounts", feature: "Remaining accounts", detail: "conformance" },
  { test: "nested structs, strings, vecs, and enums round-trip", id: "accounts.nested", group: "Types", feature: "Nested structs, Str, Vec, and unit enums", detail: "conformance" },
  { test: "realloc grows an account", id: "accounts.realloc", group: "Accounts", feature: "realloc", detail: "conformance" },
  { test: "epoch schedule and the instructions sysvar are readable", id: "sysvar.other", group: "Sysvars", feature: "EpochSchedule and the instructions sysvar", detail: "conformance" },
  { test: "the program creates an associated token account", id: "tokens.ata", group: "Tokens", feature: "Associated token account creation inside the program", detail: "conformance" },
  { test: "emit_cpi writes an event through the event authority", id: "events.cpi", group: "Events", feature: "emit_cpi self-CPI events", detail: "Decoded from the inner instruction. Anchor 1.2 does not sol_log_data these." },
  { test: "CPI return data comes back to the caller", id: "cpi.return-data", group: "CPI", feature: "CPI return data", detail: "conformance" },
  { test: "two PDA signers authorize one CPI", id: "cpi.multi-signer", group: "CPI", feature: "Multiple PDA signers in one CPI", detail: "conformance" },
  { test: "u128 account fields round-trip", id: "types.u128", group: "Types", feature: "u128 account fields", detail: "conformance" },
  { test: "checked division and division by zero", id: "math.div", group: "Language", feature: "Checked division", detail: "conformance" },
  { test: "has_one rejects the wrong authority", id: "accounts.has-one", group: "Accounts", feature: "has_one constraint failure", detail: "conformance" },
  { test: "checked addition rejects overflow", id: "math.overflow", group: "Language", feature: "Checked addition overflow", detail: "conformance" },
  { test: "a PDA constraint rejects the wrong address", id: "pda.mismatch", group: "PDAs", feature: "PDA seeds constraint failure", detail: "conformance" },
  { test: "owner constraint accepts the token program and rejects another owner", id: "accounts.owner", group: "Accounts", feature: "owner constraint", detail: "conformance" },
  { test: "address constraint pins an account to a public key", id: "accounts.address", group: "Accounts", feature: "address constraint", detail: "conformance" },
  { test: "constraint expressions see account fields", id: "accounts.constraint", group: "Accounts", feature: "constraint expressions", detail: "conformance" },
  { test: "seeds::program checks a PDA derived under another program", id: "pda.external", group: "PDAs", feature: "seeds::program", detail: "PDA derived under the echo program." },
  { test: "Option and unsized Vec instruction arguments round-trip", id: "args.dynamic", group: "Types", feature: "Option and unsized Vec instruction arguments", detail: "conformance" },
  { test: "switch matches every unit-enum variant", id: "lang.match", group: "Language", feature: "switch on unit enums", detail: "conformance" },
  { test: "match binds fields of a data-carrying enum", id: "types.enum-data", group: "Types", feature: "Data-carrying enums and match", detail: "Discriminated unions lower to Anchor enums with fields." },
  { test: "ed25519 precompile data is checked through the instructions sysvar", id: "crypto.ed25519", group: "Runtime", feature: "ed25519 precompile via the instructions sysvar", detail: "Indexes other than this instruction do not count, even when the bytes are present." },
  { test: "secp256k1 precompile data is checked through the instructions sysvar", id: "crypto.secp256k1", group: "Runtime", feature: "secp256k1 precompile via the instructions sysvar", detail: "conformance" },
  { test: "executable constraint accepts a program and rejects a data account", id: "accounts.executable", group: "Accounts", feature: "executable constraint", detail: "conformance" },
  { test: "token mint and authority constraints match the token account", id: "tokens.constraints", group: "Tokens", feature: "token::mint and token::authority", detail: "conformance" },
  { test: "associated token constraints check the derived address", id: "tokens.associated", group: "Tokens", feature: "associated_token mint and authority", detail: "conformance" },
  { test: "zero initializes a client-created account", id: "accounts.zero", group: "Accounts", feature: "zero constraint", detail: "The client creates the account. The program writes the discriminator." },
];

const unsupported: Row[] = [];

function parseTap(output: string): Map<string, "pass" | "fail"> {
  const results = new Map<string, "pass" | "fail">();
  for (const line of output.split("\n")) {
    const ok = /^ok \d+ - (.+)$/.exec(line.trim());
    const bad = /^not ok \d+ - (.+)$/.exec(line.trim());
    if (ok) results.set(ok[1]!, "pass");
    if (bad && !bad[1]!.endsWith(".test.ts")) results.set(bad[1]!, "fail");
  }
  return results;
}

const child = spawnSync(process.execPath, ["--test", "--test-concurrency=1", ...files.map((file) => path.join(root, file))], {
  cwd: root,
  encoding: "utf8",
});
const output = `${child.stdout ?? ""}\n${child.stderr ?? ""}`;
process.stdout.write(output);
const tap = parseTap(output);

const rows: Row[] = catalog.map((item) => ({
  id: item.id,
  group: item.group,
  feature: item.feature,
  status: tap.get(item.test) ?? "fail",
  detail: tap.has(item.test) ? item.detail : `Missing test result for "${item.test}"`,
}));
rows.push(...unsupported);

const passed = rows.filter((row) => row.status === "pass").length;
const failed = rows.filter((row) => row.status === "fail").length;
const held = rows.filter((row) => row.status === "unsupported").length;
const rate = Math.round((passed / rows.length) * 1000) / 10;

const generated = new Date().toISOString().slice(0, 10);
let markdown = `# Axolotl conformance

Generated ${generated}. ${passed} passing, ${failed} failing, ${held} unsupported. **Pass rate ${rate}%** (${passed}/${rows.length}).

Programs are compiled to Anchor Rust, built with Anchor 1.2.2 / Agave 4.1.2, and executed in [LiteSVM](https://www.litesvm.com/) ${JSON.parse(readFileSyncSafe())}.

| Group | Feature | Status | Detail |
| --- | --- | --- | --- |
`;
for (const row of rows) {
  const mark = row.status === "pass" ? "pass" : row.status === "fail" ? "fail" : "unsupported";
  markdown += `| ${row.group} | ${row.feature} | ${mark} | ${row.detail} |\n`;
}
markdown += `
## How to reproduce

\`\`\`sh
npm install
npm test
CARGO_TARGET_DIR=$PWD/.anchor-target npm run build:programs
npm run conformance
\`\`\`

Failing rows are bugs. The language is defined in docs/language.md. This table is a regression list.

## Not on this scoreboard

Direct sBPF emission is not an Anchor feature, so it is not a row. Anchor compiles Rust; the Agave toolchain emits the sBPF program and the IDL. Axolotl does the same after lowering TypeScript to that Rust. A second backend that called syscalls itself would be a different compiler, and it would have to be rewritten whenever Agave changes the syscall surface. That choice is the architecture in the README, not a missing Solana feature.
`;

function readFileSyncSafe(): string {
  return '"1.6.1"';
}

writeFileSync(path.join(root, "CONFORMANCE.md"), markdown);
mkdirSync(path.join(root, "site/public"), { recursive: true });
writeFileSync(path.join(root, "site/public/conformance.json"), JSON.stringify({
  generated,
  passed,
  failed,
  unsupported: held,
  total: rows.length,
  passRate: rate,
  anchor: "1.2.2",
  solana: "4.1.2",
  runtime: "litesvm 1.6.1",
  rows,
}, null, 2));
console.log(`\nScoreboard: ${passed}/${rows.length} passing (${rate}%). Wrote CONFORMANCE.md`);
process.exit(failed > 0 || child.status !== 0 ? 1 : 0);
