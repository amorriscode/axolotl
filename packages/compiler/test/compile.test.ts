import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { discriminator, sha256 } from "../src/codec.ts";
import { compile } from "../src/index.ts";

const PROGRAM_ID = "8qUgK4vi5mPRKpGfTVto7FpWyBjNgfB6U6opToXWM585";

const COUNTER = `
import { require, type Account, type Pubkey, type Signer, type SystemProgram, type u64 } from "@axolotl-sol/core";

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
  counter: Account<Counter, { mut: true }>,
  amount: u64,
): void {
  require(amount > 0n, "Amount must be positive");
  const next: u64 = counter.count + amount;
  counter.count = next;
}
`;

test("sha256 matches node and anchor discriminators", () => {
  const digest = sha256(new TextEncoder().encode("global:initialize"));
  const nodeDigest = createHash("sha256").update("global:initialize").digest();
  assert.deepEqual(Buffer.from(digest), nodeDigest);
  assert.deepEqual(discriminator("global", "initialize"), [175, 175, 109, 31, 13, 152, 155, 237]);
  assert.deepEqual(discriminator("account", "NewAccount"), [176, 95, 4, 118, 91, 177, 125, 232]);
  assert.deepEqual(discriminator("event", "SimpleEvent"), [72, 103, 116, 133, 133, 111, 132, 229]);
});

test("compiles a counter to anchor rust and an idl", () => {
  const result = compile({
    programName: "counter",
    programId: PROGRAM_ID,
    sources: [{ filename: "counter.ts", source: COUNTER }],
  });
  assert.equal(result.ok, true, result.diagnostics.map((item) => item.message).join("\n"));
  assert.match(result.rust, /declare_id!\("8qUgK4vi5mPRKpGfTVto7FpWyBjNgfB6U6opToXWM585"\)/);
  assert.match(result.rust, /pub fn initialize\(ctx: Context<Initialize>\)/);
  assert.match(result.rust, /#\[account\(init, payer = authority, space = 8 \+ Counter::INIT_SPACE\)\]/);
  assert.match(result.rust, /has_one = authority/);
  assert.match(result.rust, /checked_add\(1u64\)/);
  assert.match(result.rust, /require!\(\(amount > 0u64\), AxolotlError::AmountMustBePositive\)/);
  assert.equal(result.idl.instructions[0]?.name, "initialize");
  assert.deepEqual(result.idl.instructions[0]?.discriminator, [175, 175, 109, 31, 13, 152, 155, 237]);
  assert.equal(result.idl.accounts[0]?.name, "Counter");
  assert.equal(result.idl.errors[0]?.code, 6000);
  assert.equal(result.idl.errors[0]?.name, "AmountMustBePositive");
  assert.equal(result.idl.errors[1]?.name, "ArithmeticOverflow");
});

test("reports source locations for unsupported syntax", () => {
  const result = compile({
    programName: "counter",
    programId: PROGRAM_ID,
    sources: [{
      filename: "bad.ts",
      source: `export function initialize(): void {\n  while (true) {}\n}\n`,
    }],
  });
  assert.equal(result.ok, false);
  const error = result.diagnostics.find((item) => item.message.includes("Unsupported statement"));
  assert.ok(error);
  assert.equal(error.file, "bad.ts");
  assert.equal(error.line, 2);
});

test("lowers pda seeds, events, and system cpi", () => {
  const source = `
import { emit, system, type Account, type Event, type Pubkey, type Signer, type SystemAccount, type SystemProgram, type u64, type u8 } from "@axolotl-sol/core";
export interface Page { authority: Pubkey; bump: u8; visits: u64; }
export interface Visited extends Event { user: Pubkey; visits: u64; }
export function initPage(
  page: Account<Page, { init: true; payer: "user"; seeds: ["page", { account: "user" }]; bump: true }>,
  user: Signer<{ mut: true }>,
  systemProgram: SystemProgram,
): void {
  page.authority = user.key;
  page.visits = 0n;
}
export function visit(
  page: Account<Page, { mut: true; seeds: ["page", { account: "user" }]; bump: true }>,
  user: Signer,
): void {
  page.visits = page.visits + 1n;
  emit<Visited>({ user: user.key, visits: page.visits });
}
export function pay(
  from: Signer<{ mut: true }>,
  to: SystemAccount<{ mut: true }>,
  systemProgram: SystemProgram,
  amount: u64,
): void {
  system.transfer({ from, to, amount });
}
`;
  const result = compile({
    programName: "pda_profile",
    programId: PROGRAM_ID,
    sources: [{ filename: "pda.ts", source }],
  });
  assert.equal(result.ok, true, result.diagnostics.map((item) => `${item.line}: ${item.message}`).join("\n"));
  assert.match(result.rust, /seeds = \[b"page", user\.key\(\)\.as_ref\(\)\], bump\)/);
  assert.match(result.rust, /bump = page\.bump/);
  assert.match(result.rust, /ctx\.accounts\.page\.bump = ctx\.bumps\.page/);
  assert.match(result.rust, /emit!\(Visited \{/);
  assert.match(result.rust, /system_program::transfer\(/);
  assert.deepEqual(result.idl.events[0]?.discriminator, discriminator("event", "Visited"));
});
