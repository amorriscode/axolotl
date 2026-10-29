import { spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync, copyFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile, formatDiagnostics, pubkeyFromKeypair } from "@axolotl-sol/compiler";

const ANCHOR = "1.2.2";
const SOLANA = "4.1.2";

interface ProjectConfig {
  root: string;
  name: string;
  version: string;
  description: string;
  programId: string;
  keypairPath: string;
  cluster: string;
  wallet: string;
  anchor: string;
  solana: string;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

export function toolchainEnv(): NodeJS.ProcessEnv {
  const home = os.homedir();
  const prefix = [
    path.join(home, ".local/share/solana/install/active_release/bin"),
    path.join(home, ".local/bin"),
    path.join(home, ".cargo/bin"),
    path.join(home, ".avm/bin"),
  ].join(path.delimiter);
  return { ...process.env, PATH: `${prefix}${path.delimiter}${process.env.PATH ?? ""}` };
}

function findProject(start: string): string {
  let dir = path.resolve(start);
  while (true) {
    if (existsSync(path.join(dir, "axolotl.toml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) fail("No axolotl.toml found. Run this inside an Axolotl project, or use `axolotl init`.");
    dir = parent;
  }
}

function parseToml(text: string): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  let section = "default";
  result[section] = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const header = /^\[(.+)\]$/.exec(line);
    if (header) {
      section = header[1]!;
      result[section] ??= {};
      continue;
    }
    const match = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(line);
    if (!match) fail(`Could not parse axolotl.toml line: ${raw}`);
    let value = match[2]!.trim();
    if (value.startsWith('"') && value.endsWith('"')) value = JSON.parse(value);
    result[section]![match[1]!] = value;
  }
  return result;
}

export function loadProject(cwd = process.cwd()): ProjectConfig {
  const root = findProject(cwd);
  const toml = parseToml(readFileSync(path.join(root, "axolotl.toml"), "utf8"));
  const name = toml.package?.name;
  if (!name) fail("axolotl.toml is missing package.name");
  return {
    root,
    name,
    version: toml.package?.version ?? "0.1.0",
    description: toml.package?.description ?? "Created with Axolotl",
    programId: toml.program?.id ?? "",
    keypairPath: toml.program?.keypair ?? path.join("keys", `${name}.json`),
    cluster: toml.provider?.cluster ?? "localnet",
    wallet: toml.provider?.wallet ?? "~/.config/solana/id.json",
    anchor: toml.toolchain?.anchor ?? ANCHOR,
    solana: toml.toolchain?.solana ?? SOLANA,
  };
}

function walkTs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) files.push(...walkTs(full));
    else if (entry.endsWith(".ts")) files.push(full);
  }
  return files;
}

function writeProgramId(root: string, id: string): void {
  const file = path.join(root, "axolotl.toml");
  const text = readFileSync(file, "utf8");
  const next = /^id\s*=\s*".*"$/m.test(text)
    ? text.replace(/^id\s*=\s*".*"$/m, `id = "${id}"`)
    : text.replace(/\[program\]\n/, `[program]\nid = "${id}"\n`);
  writeFileSync(file, next);
}

function ensureKeypair(project: ProjectConfig): { id: string; secret: number[] } {
  const file = path.resolve(project.root, project.keypairPath);
  mkdirSync(path.dirname(file), { recursive: true });
  if (!existsSync(file)) {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const pkcs8 = privateKey.export({ format: "der", type: "pkcs8" });
    const spki = publicKey.export({ format: "der", type: "spki" });
    const seed = pkcs8.subarray(pkcs8.length - 32);
    const pub = spki.subarray(spki.length - 32);
    const secret = [...Buffer.concat([seed, pub])];
    writeFileSync(file, JSON.stringify(secret));
    const id = pubkeyFromKeypair(Uint8Array.from(secret));
    writeProgramId(project.root, id);
    console.log(`Generated program keypair ${file}`);
    console.log(`Program id ${id}`);
    return { id, secret };
  }
  const secret = JSON.parse(readFileSync(file, "utf8")) as number[];
  const id = pubkeyFromKeypair(Uint8Array.from(secret));
  if (project.programId && project.programId !== id) {
    fail(`program.id ${project.programId} does not match keypair ${file} (${id}).`);
  }
  if (!project.programId) writeProgramId(project.root, id);
  return { id, secret };
}

function writeAnchorProject(project: ProjectConfig, id: string, secret: number[], rust: string, idlJson: string, client: string, sourceMap: unknown): void {
  const programDir = path.join(project.root, "programs", project.name);
  mkdirSync(path.join(programDir, "src"), { recursive: true });
  writeFileSync(path.join(programDir, "src", "lib.rs"), rust);
  const usesSpl = rust.includes("anchor_spl");
  const usesInit = rust.includes("init_if_needed");
  const usesEventCpi = rust.includes("emit_cpi!");
  const usesZeroCopy = rust.includes("account(zero_copy)");
  const defaults = [usesInit ? "init-if-needed" : "", usesEventCpi ? "event-cpi" : ""].filter(Boolean);
  const features = [
    "no-entrypoint = []",
    "no-idl = []",
    "no-log-ix-name = []",
    'cpi = ["no-entrypoint"]',
    `idl-build = ["anchor-lang/idl-build"${usesSpl ? ', "anchor-spl/idl-build"' : ""}]`,
    usesInit ? 'init-if-needed = ["anchor-lang/init-if-needed"]' : "",
    usesEventCpi ? 'event-cpi = ["anchor-lang/event-cpi"]' : "",
    defaults.length > 0 ? `default = [${defaults.map((name) => `"${name}"`).join(", ")}]` : "default = []",
  ].filter(Boolean);
  const cargo = `[package]
name = "${project.name.replaceAll("_", "-")}"
version = "${project.version}"
description = ${JSON.stringify(project.description)}
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]
name = "${project.name}"

[features]
${features.join("\n")}

[dependencies]
anchor-lang = "${project.anchor}"
${usesSpl ? `anchor-spl = "${project.anchor}"\n` : ""}${usesZeroCopy ? 'bytemuck = { version = "1.23", features = ["derive", "min_const_generics"] }\n' : ""}`;
  writeFileSync(path.join(programDir, "Cargo.toml"), cargo);
  const workspace = path.join(project.root, "Cargo.toml");
  if (!existsSync(workspace)) {
    writeFileSync(workspace, `[workspace]
members = ["programs/*"]
resolver = "2"

[profile.release]
overflow-checks = true
lto = "thin"
codegen-units = 16
`);
  }
  writeFileSync(path.join(project.root, "Anchor.toml"), `[toolchain]
anchor_version = "${project.anchor}"
solana_version = "${project.solana}"

[features]
resolution = true
skip-lint = false

[programs.localnet]
${project.name} = "${id}"

[provider]
cluster = "${project.cluster}"
wallet = "${project.wallet}"

[scripts]
test = "axolotl test"
`);
  const deployDir = path.join(project.root, "target", "deploy");
  mkdirSync(deployDir, { recursive: true });
  writeFileSync(path.join(deployDir, `${project.name}-keypair.json`), JSON.stringify(secret));
  if (process.env.CARGO_TARGET_DIR) {
    const sharedDeploy = path.join(process.env.CARGO_TARGET_DIR, "deploy");
    mkdirSync(sharedDeploy, { recursive: true });
    writeFileSync(path.join(sharedDeploy, `${project.name}-keypair.json`), JSON.stringify(secret));
  }
  mkdirSync(path.join(project.root, "target", "idl"), { recursive: true });
  mkdirSync(path.join(project.root, "target", "axolotl"), { recursive: true });
  writeFileSync(path.join(project.root, "target", "idl", `${project.name}.json`), idlJson);
  writeFileSync(path.join(project.root, "target", "axolotl", "idl.json"), idlJson);
  writeFileSync(path.join(project.root, "target", "client.ts"), client);
  writeFileSync(path.join(project.root, "target", "axolotl", "sourcemap.json"), JSON.stringify(sourceMap, null, 2));
}

function mapRustError(project: ProjectConfig, stderr: string): string {
  const mapPath = path.join(project.root, "target", "axolotl", "sourcemap.json");
  if (!existsSync(mapPath)) return stderr;
  const sourceMap = JSON.parse(readFileSync(mapPath, "utf8")) as { lines: Record<string, { file: string; line: number; column: number }> };
  return stderr.replace(/lib\.rs:(\d+)/g, (full, line: string) => {
    const origin = sourceMap.lines[line];
    if (!origin) return full;
    return `${full} (from ${origin.file}:${origin.line}:${origin.column})`;
  });
}

export function buildProject(cwd = process.cwd(), options: { idlOnly?: boolean } = {}): ProjectConfig {
  const project = loadProject(cwd);
  const sources = walkTs(path.join(project.root, "src")).map((file) => ({
    filename: path.relative(project.root, file),
    source: readFileSync(file, "utf8"),
  }));
  if (sources.length === 0) fail(`No TypeScript sources in ${path.join(project.root, "src")}`);
  const { id, secret } = ensureKeypair(project);
  const result = compile({
    programName: project.name,
    programId: id,
    version: project.version,
    description: project.description,
    sources,
  });
  if (!result.ok) fail(formatDiagnostics(result.diagnostics));
  for (const warning of result.diagnostics.filter((item) => item.severity === "warning")) {
    console.error(`${warning.file}:${warning.line}:${warning.column}: warning: ${warning.message}`);
  }
  writeAnchorProject(project, id, secret, result.rust, `${JSON.stringify(result.idl, null, 2)}\n`, result.client, result.sourceMap);
  console.log(`Compiled ${project.name} (${id})`);
  console.log(`  programs/${project.name}/src/lib.rs`);
  console.log(`  target/idl/${project.name}.json`);
  if (options.idlOnly) return project;
  ensureWallet(project);
  console.log("Running anchor build...");
  const build = spawnSync("anchor", ["build"], { cwd: project.root, env: toolchainEnv(), encoding: "utf8" });
  if (build.stdout) process.stdout.write(build.stdout);
  if (build.status !== 0) {
    const stderr = mapRustError(project, `${build.stderr ?? ""}\n${build.stdout ?? ""}`);
    fail(stderr || "anchor build failed");
  }
  if (process.env.CARGO_TARGET_DIR) {
    const sharedSo = path.join(process.env.CARGO_TARGET_DIR, "deploy", `${project.name}.so`);
    const localSo = path.join(project.root, "target", "deploy", `${project.name}.so`);
    if (existsSync(sharedSo)) copyFileSync(sharedSo, localSo);
    const sharedIdl = path.join(process.env.CARGO_TARGET_DIR, "idl", `${project.name}.json`);
    const localIdl = path.join(project.root, "target", "idl", `${project.name}.json`);
    if (existsSync(sharedIdl)) {
      mkdirSync(path.dirname(localIdl), { recursive: true });
      copyFileSync(sharedIdl, localIdl);
    }
  }
  console.log(`Built target/deploy/${project.name}.so`);
  return project;
}

function ensureWallet(project: ProjectConfig): void {
  const wallet = project.wallet.startsWith("~") ? path.join(os.homedir(), project.wallet.slice(1)) : path.resolve(project.wallet);
  if (existsSync(wallet)) return;
  mkdirSync(path.dirname(wallet), { recursive: true });
  const created = spawnSync("solana-keygen", ["new", "--no-bip39-passphrase", "--force", "-o", wallet], {
    env: toolchainEnv(),
    encoding: "utf8",
  });
  if (created.status !== 0) fail(created.stderr || "Failed to create a Solana wallet for Anchor.");
}

function runTests(project: ProjectConfig): void {
  const testDir = path.join(project.root, "tests");
  if (!existsSync(testDir)) fail("This project has no tests/ directory.");
  const files = readdirSync(testDir).filter((file) => file.endsWith(".test.ts")).map((file) => path.join(testDir, file));
  if (files.length === 0) fail("No tests/*.test.ts files found.");
  const result = spawnSync(process.execPath, ["--test", ...files], {
    cwd: project.root,
    stdio: "inherit",
    env: { ...toolchainEnv(), AXOLOTL_ROOT: project.root },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function deploy(project: ProjectConfig, cluster?: string): void {
  const target = cluster ?? project.cluster;
  const so = path.join(project.root, "target", "deploy", `${project.name}.so`);
  const keypair = path.join(project.root, "target", "deploy", `${project.name}-keypair.json`);
  if (!existsSync(so)) fail("Program is not built. Run `axolotl build` first.");
  const args = ["program", "deploy", so, "--program-id", keypair, "--url", target === "localnet" ? "localhost" : target];
  const result = spawnSync("solana", args, { cwd: project.root, env: toolchainEnv(), stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function init(name: string | undefined): void {
  if (!name || !/^[a-z][a-z0-9_]*$/.test(name)) fail("Usage: axolotl init <snake_case_name>");
  const dir = path.resolve(name);
  if (existsSync(dir)) fail(`${dir} already exists.`);
  mkdirSync(path.join(dir, "src"), { recursive: true });
  mkdirSync(path.join(dir, "tests"), { recursive: true });
  const here = path.dirname(fileURLToPath(import.meta.url));
  const core = path.resolve(here, "../../core/src/index.ts");
  const coreSource = existsSync(core) ? readFileSync(core, "utf8") : readFileSync(new URL("../../core/src/index.ts", import.meta.url), "utf8");
  mkdirSync(path.join(dir, "node_modules", "@axolotl-sol", "core"), { recursive: true });
  writeFileSync(path.join(dir, "node_modules", "@axolotl-sol", "core", "index.ts"), coreSource);
  writeFileSync(path.join(dir, "node_modules", "@axolotl-sol", "core", "package.json"), JSON.stringify({
    name: "@axolotl-sol/core",
    version: "0.2.0",
    type: "module",
    exports: { ".": "./index.ts" },
    types: "./index.ts",
  }, null, 2));
  writeFileSync(path.join(dir, "axolotl.toml"), `[package]
name = "${name}"
version = "0.1.0"
description = "An Axolotl program"

[program]
keypair = "keys/${name}.json"

[provider]
cluster = "localnet"
wallet = "~/.config/solana/id.json"

[toolchain]
anchor = "${ANCHOR}"
solana = "${SOLANA}"
`);
  writeFileSync(path.join(dir, "src", `${name}.ts`), `import {
  type Account,
  type Pubkey,
  type Signer,
  type SystemProgram,
  type u64,
} from "@axolotl-sol/core";

export interface Counter {
  authority: Pubkey;
  count: u64;
}

export function initialize(
  counter: Account<Counter, { init: true; payer: "user" }>,
  user: Signer<{ mut: true }>,
  systemProgram: SystemProgram,
): void {
  counter.authority = user.key;
  counter.count = 0n;
}

export function increment(
  counter: Account<Counter, { mut: true; hasOne: ["authority"] }>,
  authority: Signer,
): void {
  counter.count = counter.count + 1n;
}
`);
  writeFileSync(path.join(dir, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "Bundler",
      strict: true,
      noEmit: true,
      types: [],
    },
    include: ["src"],
  }, null, 2));
  writeFileSync(path.join(dir, "README.md"), `# ${name}\n\nAn [Axolotl](https://github.com/amorriscode/axolotl) program.\n\n\`\`\`sh\naxolotl build\naxolotl test\naxolotl deploy --cluster localhost\n\`\`\`\n`);
  ensureKeypair({
    root: dir,
    name,
    version: "0.1.0",
    description: "An Axolotl program",
    programId: "",
    keypairPath: `keys/${name}.json`,
    cluster: "localnet",
    wallet: "~/.config/solana/id.json",
    anchor: ANCHOR,
    solana: SOLANA,
  });
  console.log(`Initialized ${dir}`);
  console.log(`Open src/${name}.ts, then run axolotl build.`);
}

function help(): void {
  console.log(`Axolotl — Anchor-compatible Solana programs in TypeScript

Usage:
  axolotl init <name>          Create a project
  axolotl build [--idl-only]   Compile TypeScript to Anchor Rust and build the program
  axolotl test                 Build, then run tests/*.test.ts on LiteSVM
  axolotl deploy [--cluster]   Deploy target/deploy/<name>.so
  axolotl compile [file]       Print generated Rust for one file or a project
`);
}

const argv = process.argv.slice(2);
const command = argv[0];
const flags = new Set(argv.filter((arg) => arg.startsWith("--")));
const positionals = argv.filter((arg) => !arg.startsWith("--"));

if (!command || command === "help" || flags.has("--help") || flags.has("-h")) {
  help();
} else if (command === "init") {
  init(positionals[1]);
} else if (command === "build") {
  buildProject(process.cwd(), { idlOnly: flags.has("--idl-only") });
} else if (command === "test") {
  const project = buildProject(process.cwd(), { idlOnly: flags.has("--idl-only") });
  runTests(project);
} else if (command === "deploy") {
  const clusterFlag = argv.indexOf("--cluster");
  deploy(loadProject(), clusterFlag >= 0 ? argv[clusterFlag + 1] : undefined);
} else if (command === "compile") {
  const file = positionals[1];
  if (file) {
    const source = readFileSync(file, "utf8");
    const result = compile({
      programName: path.basename(file, ".ts").replace(/-/g, "_"),
      programId: "11111111111111111111111111111111",
      sources: [{ filename: file, source }],
    });
    if (!result.ok) fail(formatDiagnostics(result.diagnostics));
    process.stdout.write(result.rust);
  } else {
    buildProject(process.cwd(), { idlOnly: true });
  }
} else {
  fail(`Unknown command "${command}". Run axolotl --help.`);
}

