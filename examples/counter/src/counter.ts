import {
  require,
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
  counter: Account<Counter, { init: true; payer: "authority" }>,
  authority: Signer<{ mut: true }>,
  systemProgram: SystemProgram,
): void {
  counter.authority = authority.key;
  counter.count = 0n;
}

export function increment(
  counter: Account<Counter, { mut: true; hasOne: ["authority"] }>,
  authority: Signer,
): void {
  counter.count = counter.count + 1n;
}

export function add(
  counter: Account<Counter, { mut: true; hasOne: ["authority"] }>,
  authority: Signer,
  amount: u64,
): void {
  require(amount > 0n, "Amount must be positive");
  counter.count = counter.count + amount;
}
