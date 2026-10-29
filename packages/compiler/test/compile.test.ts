import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
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
      source: `export function initialize(): void {\n  class Foo {}\n}\n`,
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

function compileOne(source: string, filename = "probe.ts") {
  return compile({
    programName: "probe",
    programId: PROGRAM_ID,
    sources: [{ filename, source: `import { type Account, type Pubkey, type Signer, type SystemProgram, type UncheckedAccount, type u64 } from "@axolotl-sol/core";\n${source}` }],
  });
}

function messages(source: string): string {
  const result = compileOne(source);
  return result.diagnostics.map((item) => `${item.file}:${item.line}:${item.column}: ${item.message}`).join("\n");
}

test("hasOne on a non-signer is an error, and a Signer keeps has_one", () => {
  const bad = compileOne(`
export interface Counter { authority: Pubkey; count: u64; }
export function rob(counter: Account<Counter, { mut: true; hasOne: ["authority"] }>, authority: UncheckedAccount): void {
  counter.count = 0n;
}`);
  assert.equal(bad.ok, false);
  assert.match(messages(`
export interface Counter { authority: Pubkey; count: u64; }
export function rob(counter: Account<Counter, { mut: true; hasOne: ["authority"] }>, authority: UncheckedAccount): void {
  counter.count = 0n;
}`), /hasOne "authority" is only an equality check/);
  assert.equal(bad.rust, "");
  const good = compileOne(`
export interface Counter { authority: Pubkey; count: u64; }
export function increment(counter: Account<Counter, { mut: true; hasOne: ["authority"] }>, authority: Signer): void {
  counter.count = counter.count + 1n;
}`);
  assert.equal(good.ok, true, good.diagnostics.map((item) => item.message).join("\n"));
  assert.match(good.rust, /has_one = authority/);
  assert.match(good.client, /export function increment\(accounts: \{ counter: string; authority: string \}\)/);
});

test("close to an unchecked account is an error", () => {
  const result = compileOne(`
export interface Counter { authority: Pubkey; count: u64; }
export function shut(counter: Account<Counter, { close: "dest" }>, dest: UncheckedAccount<{ mut: true }>): void {}`);
  assert.equal(result.ok, false);
  assert.match(result.diagnostics.map((item) => item.message).join("\n"), /close sends the rent/);
});

test("seeds without bump are rejected", () => {
  const result = compileOne(`
export interface Counter { count: u64; }
export function init(counter: Account<Counter, { init: true; payer: "user"; seeds: ["c"] }>, user: Signer<{ mut: true }>, systemProgram: SystemProgram): void {}`);
  assert.equal(result.ok, false);
  assert.match(result.diagnostics.map((item) => item.message).join("\n"), /seeds require bump: true/);
});

test("assigning cpiReturn keeps the invoke", () => {
  const result = compileOne(`
import { cpiReturn, type Program } from "@axolotl-sol/core";
export interface Counter { count: u64; }
export function take(counter: Account<Counter, { mut: true }>, echo: Program, value: u64): void {
  counter.count = cpiReturn<u64>({ program: echo, name: "double", accounts: [], args: [value] });
}`);
  assert.equal(result.ok, true, result.diagnostics.map((item) => item.message).join("\n"));
  assert.match(result.rust, /invoke\(/);
  assert.match(result.rust, /WrongReturnProgram/);
  assert.match(result.rust, /read_u64\(/);
});

test("optional account reads outside present() are rejected", () => {
  const result = compileOne(`
export interface Counter { count: u64; }
export function touch(counter: Account<Counter, { mut: true; optional: true }>): void {
  counter.count = counter.count + 1n;
}`);
  assert.equal(result.ok, false);
  assert.match(result.diagnostics.map((item) => item.message).join("\n"), /optional/);
  assert.doesNotMatch(result.rust, /unwrap\(/);
});

test("switch fallthrough and a for-loop continue are explicit", () => {
  const fall = compileOne(`
export enum Side { Left, Right }
export interface Counter { count: u64; }
export function go(counter: Account<Counter, { mut: true }>, side: Side): void {
  switch (side) {
    case Side.Left:
      counter.count = 1n;
    case Side.Right:
      counter.count = 2n;
      break;
  }
}`);
  assert.equal(fall.ok, false);
  assert.match(fall.diagnostics.map((item) => item.message).join("\n"), /falls through/);
  const loop = compileOne(`
export interface Counter { count: u64; }
export function spin(counter: Account<Counter, { mut: true }>, times: u64): void {
  for (let i: u64 = 0n; i < times; i = i + 1n) {
    if (i === 5n) { continue; }
    counter.count = counter.count + 1n;
  }
}`);
  assert.equal(loop.ok, true, loop.diagnostics.map((item) => item.message).join("\n"));
  const firstAdd = loop.rust.indexOf("i = i.checked_add");
  const continued = loop.rust.indexOf("continue;");
  const secondAdd = loop.rust.indexOf("i = i.checked_add", firstAdd + 1);
  assert.ok(firstAdd >= 0 && continued > firstAdd && secondAdd > continued);
  const keyword = compileOne(`
export interface Counter { count: u64; }
export function spin(counter: Account<Counter, { mut: true }>, times: u64): void {
  for (let type: u64 = 0n; type < times; type = type + 1n) { counter.count = counter.count + 1n; }
}`);
  assert.equal(keyword.ok, false);
  assert.match(keyword.diagnostics.map((item) => item.message).join("\n"), /keyword "type"/);
});

test("a broken constraint points at the account, and a relative import is not loaded", () => {
  const constraint = compileOne(`
export interface Counter { count: u64; }
export function gated(counter: Account<Counter, { constraint: "counter.count +" }>): void {}`);
  assert.equal(constraint.ok, false);
  const hit = constraint.diagnostics.find((item) => item.severity === "error");
  assert.ok(hit);
  assert.equal(hit.file, "probe.ts");
  assert.ok(hit.line > 1);
  assert.doesNotMatch(hit.message, /without arithmetic/);
  const imported = compile({
    programName: "probe",
    programId: PROGRAM_ID,
    sources: [{ filename: "probe.ts", source: `import { helper } from "./nope.ts";\nexport function go(): void { helper(); }\n` }],
  });
  assert.match(imported.diagnostics.map((item) => item.message).join("\n"), /no such file "\.\/nope\.ts"/);
});

test("Vec and Str bounds are checked, and an unknown struct is a diagnostic", () => {
  const full = compileOne(`
import { push, type Vec } from "@axolotl-sol/core";
export interface Bag { samples: Vec<u64, 2>; }
export function add(bag: Account<Bag, { mut: true }>, value: u64): void { push(bag.samples, value); }`);
  assert.equal(full.ok, true, full.diagnostics.map((item) => item.message).join("\n"));
  assert.match(full.rust, /VecFull/);
  assert.match(full.rust, /len\(\) >= 2/);
  const missing = compileOne(`export interface Holder { item: Missing; }\nexport function go(): void {}`);
  assert.equal(missing.ok, false);
  assert.match(missing.diagnostics.map((item) => item.message).join("\n"), /Unknown struct Missing/);
  assert.equal(missing.rust, "");
});

test("cpiReturn in an if or while condition invokes before the value is read", () => {
  const source = `
import { cpiReturn, type Program } from "@axolotl-sol/core";
export interface Counter { count: u64; }
export function take(counter: Account<Counter, { mut: true }>, echo: Program, value: u64): void {
  if (cpiReturn<u64>({ program: echo, name: "double", accounts: [], args: [value] }) > 0n) {
    counter.count = 1n;
  }
  while (cpiReturn<u64>({ program: echo, name: "double", accounts: [], args: [value] }) > 0n) {
    break;
  }
}`;
  const result = compileOne(source);
  assert.equal(result.ok, true, result.diagnostics.map((item) => item.message).join("\n"));
  const invokeAt = result.rust.indexOf("invoke(");
  const ifAt = result.rust.search(/if \(ax_codec::read_/);
  const bindAt = result.rust.indexOf("get_return_data()");
  const readAt = result.rust.indexOf("read_u64");
  assert.ok(invokeAt >= 0 && ifAt > invokeAt && bindAt < ifAt && ifAt < readAt, result.rust);
  const whileAt = result.rust.search(/while \(ax_codec::read_/);
  const secondInvoke = result.rust.indexOf("invoke(", invokeAt + 1);
  const secondBind = result.rust.indexOf("get_return_data()", bindAt + 1);
  assert.ok(secondInvoke >= 0 && secondBind > secondInvoke && whileAt > secondBind, result.rust);
});

test("optional accounts cannot be read through .key or a constraint", () => {
  const key = compileOne(`
export interface Counter { count: u64; }
export function touch(counter: Account<Counter, { optional: true }>, user: Signer): void {
  require(counter.key === user.key, "no");
}`);
  assert.equal(key.ok, false);
  assert.match(key.diagnostics.map((item) => item.message).join("\n"), /optional/);
  assert.equal(key.rust, "");
  const constraint = compileOne(`
export interface Counter { count: u64; }
export function gated(counter: Account<Counter, { optional: true; constraint: "counter.count > 0" }>): void {}`);
  assert.equal(constraint.ok, false);
  assert.match(constraint.diagnostics.map((item) => item.message).join("\n"), /constraint cannot read its fields/);
  assert.equal(constraint.rust, "");
});

test("tokenProgram is not pinned in only one of the IDL and the Rust", () => {
  const result = compileOne(`
import { type Mint, type TokenAccount, type TokenProgram } from "@axolotl-sol/core";
export function sendTokens(tokenProgram: TokenProgram, mint: Mint, from: Account<TokenAccount, { mut: true; tokenMint: "mint"; tokenAuthority: "user" }>, user: Signer): void {}`);
  assert.equal(result.ok, true, result.diagnostics.map((item) => item.message).join("\n"));
  const idlAccount = result.idl.instructions[0]?.accounts.find((account) => account.name === "token_program");
  assert.equal(idlAccount?.address, undefined);
  assert.doesNotMatch(result.rust, /token_program:[\s\S]*address = pubkey!/);
  const pinned = compileOne(`
import { type Token2022Program } from "@axolotl-sol/core";
export function touch(tokenProgram: Token2022Program): void {}`);
  const idl2022 = pinned.idl.instructions[0]?.accounts.find((account) => account.name === "token_program");
  assert.ok(idl2022?.address);
  assert.match(pinned.rust, new RegExp(`address = pubkey!\\("${idl2022?.address}"\\)`));
});

test("Program accounts are executable", () => {
  const result = compileOne(`
import { type Program } from "@axolotl-sol/core";
export function touch(echo: Program): void { log(echo.key); }`);
  assert.equal(result.ok, true, result.diagnostics.map((item) => item.message).join("\n"));
  assert.match(result.rust, /#\[account\(executable\)\][\s\S]*echo:/);
});

test("a misspelled constraint field keeps the inner reason", () => {
  const result = compileOne(`
export interface Counter { count: u64; }
export function gated(counter: Account<Counter, { constraint: "counter.coun > 0" }>): void {}`);
  assert.equal(result.ok, false);
  const text = result.diagnostics.map((item) => item.message).join("\n");
  assert.match(text, /no field "coun"/);
  assert.doesNotMatch(text, /without arithmetic/);
});

test("for loops are an IR node, not a Rust string", () => {
  const result = compileOne(`
export interface Counter { count: u64; }
export function spin(counter: Account<Counter, { mut: true }>, times: u64): void {
  for (let i: u64 = 0n; i < times; i = i + 1n) {
    if (i === 5n) { continue; }
    counter.count = counter.count + 1n;
  }
}`);
  assert.equal(result.ok, true, result.diagnostics.map((item) => item.message).join("\n"));
  const body = result.program?.instructions.find((item) => item.name === "spin")?.body ?? [];
  assert.ok(body.some((stmt) => stmt.ir?.t === "for"));
});

test("echo setValue names a signer", () => {
  const source = readFileSync(new URL("../../../examples/cpi/echo/src/echo.ts", import.meta.url), "utf8");
  const result = compile({
    programName: "echo",
    programId: PROGRAM_ID,
    sources: [{ filename: "echo.ts", source }],
  });
  assert.equal(result.ok, true, result.diagnostics.map((item) => item.message).join("\n"));
  assert.match(result.rust, /fn set_value\([\s\S]*has_one = authority/);
});

test("builder arguments use bigint and number, not unknown", () => {
  const result = compileOne(`
export function add(amount: u64, flag: u8): void {}`);
  assert.equal(result.ok, true, result.diagnostics.map((item) => item.message).join("\n"));
  assert.match(result.client, /amount: bigint/);
  assert.match(result.client, /flag: number/);
  assert.doesNotMatch(result.client, /unknown/);
});

test("cpiReturn in a for bound is invoked before the loop variable is read", () => {
  const loop = compileOne(`
import { cpiReturn, type Program } from "@axolotl-sol/core";
export interface Counter { count: u64; }
export function spin(counter: Account<Counter, { mut: true }>, echo: Program, value: u64): void {
  for (let i: u64 = 0n; i < cpiReturn<u64>({ program: echo, name: "double", accounts: [], args: [value] }); i = i + 1n) {
    counter.count = counter.count + 1n;
  }
}`);
  assert.equal(loop.ok, true, loop.diagnostics.map((item) => item.message).join("\n"));
  const invokeAt = loop.rust.indexOf("invoke(");
  const bindAt = loop.rust.indexOf("get_return_data()");
  const letAt = loop.rust.indexOf("let mut i");
  const readAt = loop.rust.indexOf("read_u64");
  assert.ok(invokeAt >= 0 && bindAt > invokeAt && letAt > bindAt && readAt > letAt, loop.rust);
});

test("optional accounts reject constraints that run before the body", () => {
  const hasOne = compileOne(`
export interface Counter { count: u64; authority: Pubkey; }
export function touch(counter: Account<Counter, { optional: true; hasOne: ["authority"] }>, authority: Signer): void {}`);
  assert.equal(hasOne.ok, false);
  assert.match(hasOne.diagnostics.map((item) => item.message).join("\n"), /optional/);
  assert.equal(hasOne.rust, "");
  const closed = compileOne(`
export interface Counter { count: u64; }
export function touch(counter: Account<Counter, { optional: true; close: "user" }>, user: Signer): void {}`);
  assert.equal(closed.ok, false);
  assert.match(closed.diagnostics.map((item) => item.message).join("\n"), /optional/);
  const inside = compileOne(`
export interface Counter { count: u64; }
export function touch(counter: Account<Counter, { optional: true }>, user: Signer): void {
  if (present(counter)) { require(counter.key === user.key, "no"); }
}`);
  assert.equal(inside.ok, true, inside.diagnostics.map((item) => item.message).join("\n"));
  assert.match(inside.rust, /as_ref\(\)\.ok_or\(AxolotlError::MissingAccount\)\?\.key\(\)/);
  assert.doesNotMatch(inside.rust, /ctx\.accounts\.counter\.key\(\)/);
});

test("pinned addresses are one decision for the IDL and the Rust", () => {
  const system = compileOne(`
import { type SystemProgram } from "@axolotl-sol/core";
export function touch(systemProgram: SystemProgram): void {}`);
  assert.equal(system.ok, true, system.diagnostics.map((item) => item.message).join("\n"));
  const systemAccount = system.idl.instructions[0]?.accounts.find((account) => account.name === "system_program");
  assert.equal(systemAccount?.address, "11111111111111111111111111111111");
  assert.match(system.rust, /system_program: Program<'info, System>/);
  assert.doesNotMatch(system.rust, /system_program[\s\S]*address = pubkey!/);
  const ix = compileOne(`
import { type Instructions } from "@axolotl-sol/core";
export function touch(instructions: Instructions): u16 { return instructions.index; }`);
  assert.equal(ix.ok, true, ix.diagnostics.map((item) => item.message).join("\n"));
  const ixAccount = ix.idl.instructions[0]?.accounts.find((account) => account.name === "instructions");
  assert.ok(ixAccount?.address);
  assert.match(ix.rust, new RegExp(`address = pubkey!\\("${ixAccount?.address}"\\)`));
  assert.match(ix.rust, /AccountTooSmall/);
  assert.doesNotMatch(ix.rust, /__ax_data\[__ax_len - 2\]/);
});
