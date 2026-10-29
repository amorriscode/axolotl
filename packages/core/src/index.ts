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
  optional?: boolean;
  realloc?: number;
  /** Other account's name, or a base58 address. Anchor `owner =`. */
  owner?: string;
  /** Other account's name, or a base58 address. Anchor `address =`. */
  address?: string;
  /** Boolean expression in account and argument names. Anchor `constraint =`. */
  constraint?: string;
  /** Account whose program id is used for `seeds`. Anchor `seeds::program`. */
  program?: string;
  executable?: boolean;
  /** The client already created a zeroed account. Anchor `zero`. */
  zero?: boolean;
  /** Anchor `token::mint` / `token::authority`, naming other accounts. */
  tokenMint?: string;
  tokenAuthority?: string;
  /** Anchor `associated_token::mint` / `associated_token::authority`. */
  associatedMint?: string;
  associatedAuthority?: string;
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

/**
 * Associated Token Account program. Pass it on any instruction that calls
 * `token.createAssociatedAccount`. LiteSVM and Agave only load it for CPI when
 * the program account is part of the transaction.
 */
export interface AssociatedTokenProgram {
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

/** Marker for `#[account(zero_copy)]` accounts loaded with AccountLoader. */
export interface ZeroCopy {
  readonly __axolotlZeroCopy?: true;
}

/** Accounts that follow the fixed list. Read `count`. */
export interface RemainingAccounts {
  readonly count: u64;
}

export interface Instructions {
  readonly index: u16;
}

export interface EpochSchedule {
  readonly slotsPerEpoch: u64;
  readonly leaderScheduleSlotOffset: u64;
  readonly warmup: boolean;
  readonly firstNormalEpoch: u64;
  readonly firstNormalSlot: u64;
}

export interface SlotHashes {
  readonly bytes: u64;
}

export interface StakeHistory {
  readonly bytes: u64;
}

/** Legacy fee calculator. Agave still exposes the account; the value is lamports per signature. */
export interface Fees {
  readonly lamportsPerSignature: u64;
}

/** Deprecated recent-blockhashes sysvar. `bytes` is the account length. */
export interface RecentBlockhashes {
  readonly bytes: u64;
}

/** Slot history bitfield. `bytes` is the account length. */
export interface SlotHistory {
  readonly bytes: u64;
}

/** Slot of the last restart. Zero when the runtime has not restarted. */
export interface LastRestartSlot {
  readonly slot: u64;
}

/** Epoch rewards sysvar. `bytes` is the account length. */
export interface EpochRewards {
  readonly bytes: u64;
}

/**
 * `Vec<T, N>` is an account field with room for N elements.
 * `Vec<T>` is an unsized instruction argument.
 */
export type Vec<T, _Max extends number = number> = readonly T[];

/** Borsh option. `null` is None. `value ?? fallback` lowers to `unwrap_or`. */
export type Option<T> = T | null;

/** A string stored in an account, with space reserved for at most N bytes. */
export type Str<_Max extends number> = string;

export interface Token2022Program {
  readonly key: Pubkey;
}

export function present(_account: Account<unknown, { optional: true }>): boolean {
  unavailable("present");
}

export function push<T>(_vec: Vec<T, number>, _value: T): void {
  unavailable("push");
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

/** Emit an event through the event CPI instruction. The instruction must pass the event authority PDA. */
export function emitCpi<T extends Event>(_event: T): void {
  unavailable("emitCpi");
}

/** Invoke another program and decode its return data. */
export function cpiReturn<T>(_args: {
  program: Program;
  name: string;
  accounts: readonly CpiAccount[];
  args: readonly (u64 | u32 | u16 | u8 | i64 | boolean | string | Pubkey | bytes32 | bigint | number)[];
  signer?: Account<unknown> | Signer;
}): T {
  unavailable("cpiReturn");
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

/**
 * Confirm an ed25519 precompile instruction, read from the instructions sysvar.
 * The precompile has already checked the signature. This checks that instruction
 * `index` is the ed25519 program and carries this public key and message.
 */
export const ed25519: {
  check(instructions: Instructions, index: u16, publicKey: bytes32, message: string): boolean;
} = {
  check() {
    unavailable("ed25519.check");
  },
};

/**
 * Confirm a secp256k1 precompile instruction. `address` is a 32-byte value
 * whose first 20 bytes are the Ethereum address.
 */
export const secp256k1: {
  check(instructions: Instructions, index: u16, address: bytes32, message: string): boolean;
} = {
  check() {
    unavailable("secp256k1.check");
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
  createAssociatedAccount(args: {
    payer: Signer;
    account: UncheckedAccount;
    owner: Signer | Account<unknown>;
    mint: Mint;
  }): void;
  mintTo(args: { mint: Mint; to: TokenAccount; authority: Signer | Account<unknown>; amount: u64 }): void;
  transferFeeBasisPoints(mint: Mint): u16;
} = {
  transferChecked() {
    unavailable("token.transferChecked");
  },
  createAssociatedAccount() {
    unavailable("token.createAssociatedAccount");
  },
  mintTo() {
    unavailable("token.mintTo");
  },
  transferFeeBasisPoints() {
    unavailable("token.transferFeeBasisPoints");
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
