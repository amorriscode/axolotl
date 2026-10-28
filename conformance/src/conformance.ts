import {
  emit,
  log,
  require,
  system,
  type Account,
  type Clock,
  type Event,
  type Pubkey,
  type Rent,
  type Signer,
  type SystemAccount,
  type SystemProgram,
  type bytes32,
  type i64,
  type u16,
  type u32,
  type u64,
  type u8,
} from "@axolotl-sol/core";

export interface Counter {
  authority: Pubkey;
  count: u64;
  bump: u8;
}

export interface Ledger {
  authority: Pubkey;
  small: u8;
  medium: u16;
  wide: u32;
  signed: i64;
  flag: boolean;
  observedSlot: u64;
  observedTime: i64;
  rentFloor: u64;
  nickname: bytes32;
}

export interface Item {
  authority: Pubkey;
  id: u64;
  bump: u8;
}

export interface Pinged extends Event {
  slot: u64;
  message: string;
}

export function initialize(
  counter: Account<Counter, { init: true; payer: "authority" }>,
  authority: Signer<{ mut: true }>,
  systemProgram: SystemProgram,
): void {
  counter.authority = authority.key;
  counter.count = 0n;
}

export function closeCounter(
  counter: Account<Counter, { mut: true; close: "authority" }>,
  authority: Signer<{ mut: true }>,
): void {
  require(authority.key === counter.authority, "Unauthorized");
}

export function branch(
  counter: Account<Counter, { mut: true }>,
  amount: u64,
): void {
  if (amount > counter.count) {
    counter.count = amount;
  } else {
    counter.count = counter.count - amount;
  }
}

export function spin(
  counter: Account<Counter, { mut: true }>,
  times: u64,
): void {
  for (let i: u64 = 0n; i < times; i = i + 1n) {
    counter.count = counter.count + 1n;
  }
}

export function pay(
  from: Signer<{ mut: true }>,
  to: SystemAccount<{ mut: true }>,
  systemProgram: SystemProgram,
  amount: u64,
): void {
  system.transfer({ from, to, amount });
}

export function initLedger(
  ledger: Account<Ledger, { init: true; payer: "authority" }>,
  authority: Signer<{ mut: true }>,
  systemProgram: SystemProgram,
): void {
  ledger.authority = authority.key;
  ledger.small = 0;
  ledger.medium = 0;
  ledger.wide = 0;
  ledger.signed = 0n;
  ledger.flag = false;
  ledger.observedSlot = 0n;
  ledger.observedTime = 0n;
  ledger.rentFloor = 0n;
  ledger.nickname = "axolotl";
}

export function setNumbers(
  ledger: Account<Ledger, { mut: true }>,
  small: u8,
  medium: u16,
  wide: u32,
  signed: i64,
  flag: boolean,
): void {
  ledger.small = small;
  ledger.medium = medium;
  ledger.wide = wide;
  ledger.signed = signed;
  ledger.flag = flag;
}

export function stamp(
  ledger: Account<Ledger, { mut: true }>,
  clock: Clock,
): void {
  ledger.observedSlot = clock.slot;
  ledger.observedTime = clock.unixTimestamp;
}

export function quoteRent(
  ledger: Account<Ledger, { mut: true }>,
  rent: Rent,
  space: u64,
): void {
  ledger.rentFloor = rent.minimumBalance(space);
}

export function checkWord(
  ledger: Account<Ledger, { mut: true }>,
  word: string,
): void {
  require(word === "solana", "Wrong word");
  log(word);
}

export function checkKey(
  ledger: Account<Ledger, { mut: true }>,
  authority: Signer,
  expected: Pubkey,
): void {
  require(authority.key === expected, "Wrong key");
  require(authority.key === ledger.authority, "Unauthorized");
}

export function ping(
  clock: Clock,
  message: string,
): void {
  emit<Pinged>({ slot: clock.slot, message });
  log("ping");
}

export function initItem(
  item: Account<Item, {
    init: true;
    payer: "authority";
    seeds: ["item", { arg: "id" }, { account: "authority" }];
    bump: true;
  }>,
  authority: Signer<{ mut: true }>,
  systemProgram: SystemProgram,
  id: u64,
): void {
  item.authority = authority.key;
  item.id = id;
}

export function reopen(
  counter: Account<Counter, {
    initIfNeeded: true;
    payer: "authority";
    seeds: ["once"];
    bump: true;
  }>,
  authority: Signer<{ mut: true }>,
  systemProgram: SystemProgram,
): void {
  if (counter.count === 0n) {
    counter.authority = authority.key;
  }
  counter.count = counter.count + 1n;
}
