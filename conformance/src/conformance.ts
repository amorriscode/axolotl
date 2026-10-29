import {
  cpi,
  cpiReturn,
  emit,
  emitCpi,
  log,
  present,
  push,
  require,
  system,
  token,
  type Account,
  type AssociatedTokenProgram,
  type Clock,
  type EpochSchedule,
  type Event,
  type Instructions,
  type Mint,
  type Program,
  type Pubkey,
  type RemainingAccounts,
  type Rent,
  type Signer,
  type SlotHashes,
  type StakeHistory,
  type Str,
  type SystemAccount,
  type SystemProgram,
  type Token2022Program,
  type TokenAccount,
  type TokenProgram,
  type UncheckedAccount,
  type Vec,
  type ZeroCopy,
  type bytes32,
  type i64,
  type u128,
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

export interface Point {
  x: u64;
  y: u64;
}

export enum Side {
  Left,
  Right,
}

export interface Shape {
  point: Point;
  label: Str<8>;
  samples: Vec<u64, 4>;
  side: Side;
}

export interface PodCounter extends ZeroCopy {
  value: u64;
}

export interface Grown {
  authority: Pubkey;
  note: Str<16>;
}

function step(value: u64): u64 {
  return value + 1n;
}

export function walk(
  counter: Account<Counter, { mut: true }>,
  times: u64,
): void {
  let i: u64 = 0n;
  while (i < times) {
    counter.count = step(counter.count);
    i = i + 1n;
    if (i > 1000n) {
      break;
    }
  }
}

export function bumpOptional(
  counter: Account<Counter, { mut: true; optional: true }>,
): void {
  if (present(counter)) {
    counter.count = counter.count + 1n;
  }
}

export function countRemaining(extra: RemainingAccounts): u64 {
  return extra.count;
}

export function initShape(
  shape: Account<Shape, { init: true; payer: "authority" }>,
  authority: Signer<{ mut: true }>,
  systemProgram: SystemProgram,
): void {
  shape.point.x = 3n;
  shape.point.y = 4n;
  shape.label = "nest";
  shape.side = Side.Right;
  push(shape.samples, 9n);
}

export function initPod(
  pod: Account<PodCounter, { init: true; payer: "authority" }>,
  authority: Signer<{ mut: true }>,
  systemProgram: SystemProgram,
): void {
  pod.value = 11n;
}

export function initGrown(
  grown: Account<Grown, { init: true; payer: "authority" }>,
  authority: Signer<{ mut: true }>,
  systemProgram: SystemProgram,
): void {
  grown.authority = authority.key;
  grown.note = "a";
}

export function grow(
  grown: Account<Grown, { mut: true; realloc: 128; payer: "authority" }>,
  authority: Signer<{ mut: true }>,
  systemProgram: SystemProgram,
): void {
  grown.note = "bigger";
}

export function readSchedule(schedule: EpochSchedule): u64 {
  return schedule.slotsPerEpoch;
}

export function readIndex(instructions: Instructions): u16 {
  return instructions.index;
}

export function readHashes(slotHashes: SlotHashes, stakeHistory: StakeHistory): u64 {
  return slotHashes.bytes + stakeHistory.bytes;
}

export function openAta(
  payer: Signer<{ mut: true }>,
  ata: UncheckedAccount<{ mut: true }>,
  owner: Signer,
  mint: Mint,
  systemProgram: SystemProgram,
  tokenProgram: TokenProgram,
  associatedTokenProgram: AssociatedTokenProgram,
): void {
  token.createAssociatedAccount({ payer, account: ata, owner, mint });
}

export function readFee(mint: Mint, tokenProgram: Token2022Program): u16 {
  return token.transferFeeBasisPoints(mint);
}

export function pingCpi(clock: Clock, message: string): void {
  emitCpi<Pinged>({ slot: clock.slot, message });
}

export function askEcho(echoProgram: Program, value: u64): u64 {
  return cpiReturn<u64>({
    program: echoProgram,
    name: "double",
    accounts: [],
    args: [value],
  });
}

export function fanout(
  echoProgram: Program,
  left: UncheckedAccount<{ seeds: ["left", { account: "user" }]; bump: true }>,
  right: UncheckedAccount<{ seeds: ["right", { account: "user" }]; bump: true }>,
  user: Signer,
  value: u64,
): void {
  cpi({
    program: echoProgram,
    name: "setPair",
    accounts: [
      { account: left, signer: true },
      { account: right, signer: true },
    ],
    args: [value],
  });
}

export interface Wide {
  value: u128;
}

export function initWide(
  wide: Account<Wide, { init: true; payer: "authority" }>,
  authority: Signer<{ mut: true }>,
  systemProgram: SystemProgram,
  value: u128,
): void {
  wide.value = value;
}

export function divide(left: u64, right: u64): u64 {
  return left / right;
}

export function skipOdds(
  counter: Account<Counter, { mut: true }>,
  times: u64,
): void {
  let i: u64 = 0n;
  while (i < times) {
    i = i + 1n;
    if (i === 2n) {
      continue;
    }
    counter.count = counter.count + 1n;
  }
}

export function cap(
  counter: Account<Counter, { mut: true }>,
  times: u64,
): void {
  let i: u64 = 0n;
  while (i < times) {
    if (counter.count === 2n) {
      break;
    }
    counter.count = counter.count + 1n;
    i = i + 1n;
  }
}

export function touch(
  counter: Account<Counter, { mut: true; hasOne: ["authority"] }>,
  authority: Signer,
): void {
  counter.count = counter.count + 1n;
}

export function add(
  counter: Account<Counter, { mut: true }>,
  amount: u64,
): void {
  counter.count = counter.count + amount;
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
