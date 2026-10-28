/**
 * Types and statement-level helpers for Axolotl programs.
 *
 * These values exist so a program typechecks under `tsc`. The Axolotl compiler
 * never executes them: it reads the TypeScript AST and lowers it to Anchor Rust.
 * Calling them from ordinary JavaScript throws.
 */

declare const pubkeyBrand: unique symbol;
declare const bytes32Brand: unique symbol;

/** 32-byte Solana public key. Compare with `===`. */
export type Pubkey = string & { readonly [pubkeyBrand]: true };

export type u8 = number;
export type u16 = number;
export type u32 = number;
export type u64 = bigint;
export type u128 = bigint;
export type i8 = number;
export type i16 = number;
export type i32 = number;
export type i64 = bigint;
export type i128 = bigint;

/** Fixed 32-byte account field. Assign a string of at most 32 bytes. */
export type bytes32 = { readonly [bytes32Brand]: true };

export type bool = boolean;

/**
 * Account constraint options. Written in a type argument so they are visible
 * to both `tsc` and the Axolotl compiler.
 *
 * Seeds are a tuple of string literals and `{ account: "name" }` or
 * `{ arg: "name" }` type literals.
 */
export interface AccountOptions {
  mut?: boolean;
  init?: boolean;
  initIfNeeded?: boolean;
  payer?: string;
  seeds?: readonly (string | { readonly account: string } | { readonly arg: string })[];
  bump?: boolean;
  hasOne?: readonly string[];
  close?: string;
}

/** A program-owned account of type `T`, with optional Anchor constraints. */
export type Account<T, _Opts extends AccountOptions = AccountOptions> = T & {
  readonly key: Pubkey;
};

/** A transaction signer. `mut: true` when it pays rent or receives lamports. */
export type Signer<_Opts extends { mut?: boolean } = { mut?: boolean }> = {
  readonly key: Pubkey;
};

export interface SystemProgram {
  readonly key: Pubkey;
}

/** SPL Token or Token-2022 program (Anchor `TokenInterface`). */
export interface TokenProgram {
  readonly key: Pubkey;
}

export interface TokenAccount {
  readonly key: Pubkey;
  readonly mint: Pubkey;
  readonly owner: Pubkey;
  readonly amount: u64;
}

export interface Mint {
  readonly key: Pubkey;
  readonly decimals: u8;
  readonly supply: u64;
  readonly isInitialized: bool;
}

/** Account whose owner is not checked by this instruction. */
export interface UncheckedAccount {
  readonly key: Pubkey;
}

/** An account owned by the System Program. */
export interface SystemAccount {
  readonly key: Pubkey;
}

export interface Clock {
  readonly unixTimestamp: i64;
  readonly slot: u64;
  readonly epoch: u64;
}

export interface Rent {
  minimumBalance(space: u64): u64;
}

/** Executable program account passed in for CPI. */
export interface Program {
  readonly key: Pubkey;
}

/** Marker extended by event interfaces. */
export interface Event {
  readonly __axolotlEvent?: true;
}

function unavailable(name: string): never {
  throw new Error(
    `${name}() is an Axolotl compiler intrinsic. It is lowered to Rust and cannot run in JavaScript.`,
  );
}

/** Abort the instruction with a client-visible error when `condition` is false. `message` must be a string literal. */
export function require(condition: boolean, message: string): asserts condition {
  unavailable(`require(${String(condition)}, ${message})`);
}

/** Emit an Anchor event. The type argument selects the event interface. */
export function emit<T extends Event>(_event: T): void {
  unavailable("emit");
}

/** Write a message to the program log. */
export function log(_value: string | bigint | number | boolean | Pubkey | bytes32): void {
  unavailable("log");
}

export const system: {
  transfer(args: { from: Signer; to: SystemAccount | UncheckedAccount | Signer; amount: u64 }): void;
} = {
  transfer() {
    unavailable("system.transfer");
  },
};

export const token: {
  transferChecked(args: {
    from: TokenAccount;
    to: TokenAccount;
    mint: Mint;
    authority: Signer | Account<unknown>;
    amount: u64;
  }): void;
} = {
  transferChecked() {
    unavailable("token.transferChecked");
  },
};

export interface CpiAccount {
  account: Account<unknown> | Signer | UncheckedAccount | SystemAccount | TokenAccount | Mint | Program;
  mut?: boolean;
  signer?: boolean;
}

/**
 * Invoke another program. `name` is the callee's TypeScript instruction name.
 * At most one PDA signer is supported; pass it as `signer` or mark that
 * account with `signer: true`.
 */
export function cpi(_args: {
  program: Program;
  name: string;
  accounts: readonly CpiAccount[];
  args: readonly (u64 | u32 | u16 | u8 | i64 | boolean | string | Pubkey | bytes32 | bigint | number)[];
  signer?: Account<unknown> | Signer;
}): void {
  unavailable("cpi");
}
