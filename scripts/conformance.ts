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
  { test: "while loops and helper functions increment", id: "lang.while", group: "Language", feature: "while loops and scalar helper functions", detail: "conformance" },
  { test: "continue skips one iteration of a while loop", id: "lang.continue", group: "Language", feature: "continue", detail: "conformance" },
  { test: "break leaves a while loop early", id: "lang.break", group: "Language", feature: "break", detail: "conformance" },
  { test: "optional accounts are skipped when absent", id: "accounts.optional", group: "Accounts", feature: "Optional accounts", detail: "Absent accounts are the program id. present() guards the body." },
  { test: "remaining accounts are counted", id: "accounts.remaining", group: "Accounts", feature: "Remaining accounts", detail: "conformance" },
  { test: "nested structs, strings, vecs, and enums round-trip", id: "accounts.nested", group: "Types", feature: "Nested structs, Str, Vec, and unit enums", detail: "conformance" },
  { test: "zero-copy accounts load and store", id: "accounts.zero-copy", group: "Accounts", feature: "Zero-copy AccountLoader", detail: "conformance" },
  { test: "realloc grows an account", id: "accounts.realloc", group: "Accounts", feature: "realloc", detail: "conformance" },
  { test: "epoch schedule, instructions, slot hashes, and stake history sysvars", id: "sysvar.other", group: "Sysvars", feature: "EpochSchedule, Instructions, SlotHashes, and StakeHistory", detail: "conformance" },
  { test: "the program creates an associated token account", id: "tokens.ata", group: "Tokens", feature: "Associated token account creation inside the program", detail: "conformance" },
  { test: "Token-2022 transfer fee extension is readable", id: "tokens.extensions", group: "Tokens", feature: "Token-2022 transfer-fee extension", detail: "conformance" },
  { test: "emit_cpi writes an event through the event authority", id: "events.cpi", group: "Events", feature: "emit_cpi self-CPI events", detail: "Decoded from the inner instruction. Anchor 1.2 does not sol_log_data these." },
  { test: "CPI return data comes back to the caller", id: "cpi.return-data", group: "CPI", feature: "CPI return data", detail: "conformance" },
  { test: "two PDA signers authorize one CPI", id: "cpi.multi-signer", group: "CPI", feature: "Multiple PDA signers in one CPI", detail: "conformance" },
  { test: "address lookup tables can supply an account", id: "runtime.lookup", group: "Runtime", feature: "Address lookup tables", detail: "A v0 transaction loads the counter through a table created in a previous slot." },
  { test: "u128 account fields round-trip", id: "types.u128", group: "Types", feature: "u128 account fields", detail: "conformance" },
  { test: "checked division and division by zero", id: "math.div", group: "Language", feature: "Checked division", detail: "conformance" },
  { test: "has_one rejects the wrong authority", id: "accounts.has-one", group: "Accounts", feature: "has_one constraint failure", detail: "conformance" },
  { test: "checked addition rejects overflow", id: "math.overflow", group: "Language", feature: "Checked addition overflow", detail: "conformance" },
  { test: "a PDA constraint rejects the wrong address", id: "pda.mismatch", group: "PDAs", feature: "PDA seeds constraint failure", detail: "conformance" },
];

const unsupported: Row[] = [
  { id: "backend.sbpf", group: "Compiler", feature: "Direct sBPF / SBF codegen", status: "unsupported", detail: "Axolotl emits Anchor Rust and uses the Agave toolchain. A private syscall backend would track every Agave release." },
  { id: "constraints.expr", group: "Accounts", feature: "constraint, owner, and address expressions", status: "unsupported", detail: "Account options are mut, init, initIfNeeded, payer, seeds, bump, has_one, close, optional, and realloc." },
  { id: "pda.external", group: "PDAs", feature: "PDAs derived under another program", status: "unsupported", detail: "Seeds are always derived from the program being compiled. There is no seeds::program." },
  { id: "args.dynamic", group: "Types", feature: "Option and unsized Vec instruction arguments", status: "unsupported", detail: "Instruction arguments are scalars, Pubkey, bytes32, or string. Account Vec fields have a declared maximum." },
  { id: "lang.match", group: "Language", feature: "switch / match", status: "unsupported", detail: "Unit enums can be stored and compared. There is no match or switch." },
  { id: "sysvar.history", group: "Sysvars", feature: "Fees, RecentBlockhashes, and SlotHistory", status: "unsupported", detail: "Clock, Rent, EpochSchedule, Instructions, SlotHashes, and StakeHistory are the exposed sysvars." },
  { id: "crypto.precompile", group: "Runtime", feature: "ed25519 and secp256k1 precompiles", status: "unsupported", detail: "No instruction for signature precompiles. The instructions sysvar exposes only the current index." },
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
