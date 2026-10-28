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
  { test: "init_if_needed creates once and then updates", id: "accounts.init-if-needed", group: "Accounts", feature: "init_if_needed", detail: "conformance" },
  { test: "compute budget limit rejects a loop that does not fit", id: "runtime.compute", group: "Runtime", feature: "Compute budget", detail: "conformance" },
  { test: "compiler discriminators match the Anchor build IDL", id: "idl.match", group: "IDL", feature: "Anchor IDL discriminators, events, and error codes", detail: "packages/compiler" },
];

const unsupported: Row[] = [
  { id: "accounts.zero-copy", group: "Accounts", feature: "Zero-copy and AccountLoader", status: "unsupported", detail: "No zero_copy / repr(C) lowering." },
  { id: "accounts.realloc", group: "Accounts", feature: "realloc and dynamic account growth", status: "unsupported", detail: "Account size is fixed at init." },
  { id: "accounts.optional", group: "Accounts", feature: "Optional and remaining accounts", status: "unsupported", detail: "Every account is required and positional." },
  { id: "accounts.nested", group: "Types", feature: "Vec, enums, and nested structs in accounts", status: "unsupported", detail: "Account fields are scalars, Pubkey, or bytes32." },
  { id: "tokens.extensions", group: "Tokens", feature: "Token-2022 extensions", status: "unsupported", detail: "transfer_checked uses the token interface, but extensions are not modeled." },
  { id: "tokens.ata", group: "Tokens", feature: "Associated token account creation inside the program", status: "unsupported", detail: "Tests create token accounts with the SPL Token program directly." },
  { id: "cpi.return-data", group: "CPI", feature: "CPI return data and multiple PDA signers", status: "unsupported", detail: "One PDA signer per cpi() call, no return data." },
  { id: "events.cpi", group: "Events", feature: "emit_cpi", status: "unsupported", detail: "Events use emit!, not the self-CPI event instruction." },
  { id: "runtime.lookup", group: "Runtime", feature: "Address lookup tables", status: "unsupported", detail: "Transactions are v0 without lookup tables." },
  { id: "sysvar.other", group: "Sysvars", feature: "Instructions, SlotHashes, StakeHistory, EpochSchedule", status: "unsupported", detail: "Only Clock and Rent are exposed." },
  { id: "lang.while", group: "Language", feature: "while, break, continue, and internal functions", status: "unsupported", detail: "Only the documented for-loop form and instruction functions." },
  { id: "backend.sbpf", group: "Compiler", feature: "Direct sBPF / SBF codegen", status: "unsupported", detail: "Axolotl emits Anchor Rust and uses the Agave toolchain. See the README." },
];

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

Failing rows are bugs. Unsupported rows are gaps in the TypeScript subset, documented in [docs/language.md](docs/language.md).
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
