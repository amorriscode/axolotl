import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projects = [
  "examples/counter",
  "examples/token-vault",
  "examples/pda-profile",
  "examples/cpi/echo",
  "examples/cpi/relay",
  "conformance",
];

const env = {
  ...process.env,
  PATH: `${path.join(process.env.HOME ?? "", ".local/share/solana/install/active_release/bin")}:${path.join(process.env.HOME ?? "", ".local/bin")}:${path.join(process.env.HOME ?? "", ".cargo/bin")}:${process.env.PATH ?? ""}`,
  CARGO_TARGET_DIR: process.env.CARGO_TARGET_DIR ?? path.join(root, ".anchor-target"),
};

for (const project of projects) {
  console.log(`\n=== ${project} ===`);
  const result = spawnSync(process.execPath, [path.join(root, "packages/cli/bin/axolotl.js"), "build"], {
    cwd: path.join(root, project),
    env,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log("\nAll programs built.");
