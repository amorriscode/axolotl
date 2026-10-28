import { isPubkey, pubkeyFromKeypair } from "./codec.ts";
export { pubkeyFromKeypair };
import { Diagnostics, type Diagnostic } from "./diagnostics.ts";
import { emitClient, emitIdl, emitRust } from "./emit.ts";
import { lowerProgram } from "./lower.ts";
import type { Idl, ProgramModel, SourceMap } from "./model.ts";
import { parseSources } from "./parse.ts";
import { snake } from "./util.ts";

export interface CompileInput {
  /** Program crate name, snake_case, for example `token_vault`. */
  programName: string;
  /** Base58 program id. Must match the deploy keypair. */
  programId: string;
  version?: string;
  description?: string;
  sources: { filename: string; source: string }[];
}

export interface CompileResult {
  ok: boolean;
  diagnostics: Diagnostic[];
  rust: string;
  idl: Idl;
  client: string;
  sourceMap: SourceMap;
  program: ProgramModel | null;
}

export function compile(input: CompileInput): CompileResult {
  const diag = new Diagnostics();
  if (!/^[a-z][a-z0-9_]*$/.test(input.programName)) {
    diag.error(input.sources[0]?.filename ?? "axolotl.toml", 1, 1, `Program name "${input.programName}" must be snake_case.`);
  }
  if (!isPubkey(input.programId)) {
    diag.error(input.sources[0]?.filename ?? "axolotl.toml", 1, 1, `Program id "${input.programId}" is not a valid base58 public key.`);
  }
  const parsed = parseSources(input.sources, diag);
  const program = lowerProgram(parsed, {
    programName: snake(input.programName),
    programId: input.programId,
    version: input.version ?? "0.1.0",
    description: input.description ?? "Created with Axolotl",
  }, diag);
  const idl = emitIdl(program);
  const { rust, sourceMap } = emitRust(program);
  const client = emitClient(program, idl);
  return {
    ok: diag.ok,
    diagnostics: diag.items,
    rust: diag.ok ? rust : rust,
    idl,
    client,
    sourceMap,
    program,
  };
}

export function formatDiagnostics(diagnostics: Diagnostic[]): string {
  return diagnostics
    .map((item) => `${item.file}:${item.line}:${item.column}: ${item.severity}: ${item.message}`)
    .join("\n");
}

export type { Diagnostic, Idl, ProgramModel, SourceMap };
