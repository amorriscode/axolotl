import type { Loc } from "./diagnostics.ts";

export type Scalar =
  | "u8" | "u16" | "u32" | "u64" | "u128"
  | "i8" | "i16" | "i32" | "i64" | "i128"
  | "bool" | "string" | "pubkey" | "bytes32";

export const SCALAR_SIZE: Record<Exclude<Scalar, "string">, number> = {
  u8: 1, u16: 2, u32: 4, u64: 8, u128: 16,
  i8: 1, i16: 2, i32: 4, i64: 8, i128: 16,
  bool: 1, pubkey: 32, bytes32: 32,
};

export type FieldTy =
  | Scalar
  | { kind: "struct"; name: string }
  | { kind: "vec"; inner: Scalar; max: number }
  | { kind: "enum"; name: string }
  | { kind: "str"; max: number };

export interface FieldModel {
  name: string;
  rustName: string;
  ty: FieldTy;
  loc: Loc;
}

export interface StructModel {
  name: string;
  /** `struct` is embedded data. `account` is a program account. */
  kind: "account" | "event" | "struct";
  zeroCopy: boolean;
  fields: FieldModel[];
  loc: Loc;
  file: string;
}

export interface EnumModel {
  name: string;
  variants: { name: string; rustName: string }[];
  loc: Loc;
}

export type SeedModel =
  | { kind: "const"; value: string }
  | { kind: "account"; name: string }
  | { kind: "arg"; name: string };

export interface AccountOpts {
  mut: boolean;
  init: boolean;
  initIfNeeded: boolean;
  payer?: string;
  seeds: SeedModel[];
  bump: boolean;
  hasOne: string[];
  close?: string;
  optional: boolean;
  /** Reallocate the account to this many bytes. */
  realloc?: number;
}

export type AccountKind =
  | "user" | "signer" | "system" | "tokenProgram" | "token2022" | "associatedToken" | "tokenAccount" | "mint"
  | "unchecked" | "systemAccount" | "clock" | "rent" | "program" | "remaining"
  | "instructions" | "epochSchedule" | "slotHashes" | "stakeHistory";

export interface AccountParam {
  kind: "account";
  name: string;
  rustName: string;
  accountKind: AccountKind;
  accountType?: string;
  opts: AccountOpts;
  loc: Loc;
}

export interface ArgParam {
  kind: "arg";
  name: string;
  rustName: string;
  ty: Scalar;
  loc: Loc;
}

export type Param = AccountParam | ArgParam;

export interface Stmt {
  code: string;
  loc?: Loc;
}

export interface InstructionModel {
  name: string;
  rustName: string;
  params: Param[];
  loc: Loc;
  file: string;
  body: Stmt[];
  returnType?: Scalar;
  usesEventCpi: boolean;
  /** Set when the body could not be lowered. */
  failed: boolean;
}

export interface HelperModel {
  name: string;
  rustName: string;
  params: { name: string; rustName: string; ty: Scalar }[];
  returnType?: Scalar;
  body: Stmt[];
  loc: Loc;
}

export interface ErrorModel {
  name: string;
  msg: string;
}

export interface ProgramModel {
  name: string;
  rustName: string;
  programId: string;
  version: string;
  description: string;
  structs: StructModel[];
  enums: EnumModel[];
  helpers: HelperModel[];
  instructions: InstructionModel[];
  errors: ErrorModel[];
  usesSpl: boolean;
  usesInitIfNeeded: boolean;
  usesArithmetic: boolean;
  usesCpi: boolean;
  usesRawCpi: boolean;
  usesEventCpi: boolean;
}

export interface SourceMap {
  lines: Record<number, Loc>;
}

export type IdlType =
  | Scalar
  | "pubkey"
  | { array: ["u8", number] }
  | { defined: { name: string } };

export interface Idl {
  address: string;
  metadata: { name: string; version: string; spec: string; description: string };
  instructions: IdlInstruction[];
  accounts: { name: string; discriminator: number[] }[];
  types: {
    name: string;
    type:
      | { kind: "struct"; fields: { name: string; type: IdlType | string | { vec: string } | { defined: { name: string } } }[] }
      | { kind: "enum"; variants: { name: string }[] };
  }[];
  events: { name: string; discriminator: number[] }[];
  errors: { code: number; name: string; msg: string }[];
}

export interface IdlInstruction {
  name: string;
  discriminator: number[];
  accounts: IdlAccount[];
  args: { name: string; type: string | { array: ["u8", number] } }[];
}

export interface IdlAccount {
  name: string;
  writable?: boolean;
  signer?: boolean;
  address?: string;
  optional?: boolean;
  relations?: string[];
  pda?: {
    seeds: (
      | { kind: "const"; value: number[] }
      | { kind: "account"; path: string }
      | { kind: "arg"; path: string }
    )[];
  };
}
