/**
 * Compare pinned versions in toolchain.json with current stable releases.
 * Prints a JSON report. The update workflow uses this to open a pull request.
 *
 * No credentials are required. Registries are public.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, "toolchain.json");
const pinned = JSON.parse(readFileSync(file, "utf8")) as {
  anchor: string;
  solana: string;
  packages: Record<string, string>;
  notes?: string;
};

interface Update {
  name: string;
  from: string;
  to: string;
}

async function latestNpm(name: string): Promise<string> {
  const response = await fetch(`https://registry.npmjs.org/${name}/latest`);
  if (!response.ok) throw new Error(`npm ${name}: ${response.status}`);
  const body = await response.json() as { version: string };
  return body.version;
}

async function latestCrate(name: string): Promise<string> {
  const response = await fetch(`https://crates.io/api/v1/crates/${name}`, {
    headers: { "user-agent": "axolotl-update (github.com/amorriscode/axolotl)" },
  });
  if (!response.ok) throw new Error(`crates.io ${name}: ${response.status}`);
  const body = await response.json() as { crate: { max_stable_version: string } };
  return body.crate.max_stable_version;
}

async function latestAgave(): Promise<string> {
  const response = await fetch("https://api.github.com/repos/anza-xyz/agave/releases?per_page=30", {
    headers: { "user-agent": "axolotl-update", accept: "application/vnd.github+json" },
  });
  if (!response.ok) throw new Error(`github agave: ${response.status}`);
  const releases = await response.json() as { tag_name: string; prerelease: boolean; draft: boolean }[];
  const stable = releases.find((release) => !release.prerelease && !release.draft && /^v\d+\.\d+\.\d+$/.test(release.tag_name));
  if (!stable) throw new Error("no stable Agave release found");
  return stable.tag_name.replace(/^v/, "");
}

function cmp(left: string, right: string): number {
  const parse = (value: string) => value.replace(/^v/, "").split(/[.-]/).map((part) => /^\d+$/.test(part) ? Number(part) : part);
  const a = parse(left);
  const b = parse(right);
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x === y) continue;
    if (typeof x === "number" && typeof y === "number") return x - y;
    return String(x).localeCompare(String(y));
  }
  return 0;
}

const updates: Update[] = [];
const anchor = await latestCrate("anchor-lang");
if (cmp(anchor, pinned.anchor) > 0) updates.push({ name: "anchor", from: pinned.anchor, to: anchor });
const solana = await latestAgave();
if (cmp(solana, pinned.solana) > 0) updates.push({ name: "solana", from: pinned.solana, to: solana });
for (const [name, version] of Object.entries(pinned.packages)) {
  const latest = await latestNpm(name);
  if (cmp(latest, version) > 0) updates.push({ name, from: version, to: latest });
}

function rewrite(relative: string, from: string, to: string): void {
  const target = path.join(root, relative);
  if (!existsSync(target)) return;
  const text = readFileSync(target, "utf8");
  if (!text.includes(from)) return;
  writeFileSync(target, text.replaceAll(from, to));
}

const apply = process.argv.includes("--apply");
if (apply && updates.length > 0) {
  for (const update of updates) {
    if (update.name === "anchor") {
      pinned.anchor = update.to;
      rewrite("packages/cli/src/main.ts", `const ANCHOR = "${update.from}"`, `const ANCHOR = "${update.to}"`);
      for (const project of ["examples/counter", "examples/token-vault", "examples/pda-profile", "examples/cpi/echo", "examples/cpi/relay", "conformance"]) {
        rewrite(`${project}/axolotl.toml`, `anchor = "${update.from}"`, `anchor = "${update.to}"`);
      }
    } else if (update.name === "solana") {
      pinned.solana = update.to;
      rewrite("packages/cli/src/main.ts", `const SOLANA = "${update.from}"`, `const SOLANA = "${update.to}"`);
      for (const project of ["examples/counter", "examples/token-vault", "examples/pda-profile", "examples/cpi/echo", "examples/cpi/relay", "conformance"]) {
        rewrite(`${project}/axolotl.toml`, `solana = "${update.from}"`, `solana = "${update.to}"`);
      }
    } else {
      pinned.packages[update.name] = update.to;
      rewrite("packages/testing/package.json", `"${update.name}": "${update.from}"`, `"${update.name}": "${update.to}"`);
      rewrite("site/package.json", `"${update.name}": "${update.from}"`, `"${update.name}": "${update.to}"`);
    }
  }
  writeFileSync(file, `${JSON.stringify(pinned, null, 2)}\n`);
}

const report = { updates, pinned };
console.log(JSON.stringify(report, null, 2));
process.exit(0);
