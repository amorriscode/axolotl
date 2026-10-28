# Axolotl language

Axolotl programs are a strict subset of TypeScript. The compiler reads the AST with the TypeScript compiler API. It does not execute the program, and it rejects syntax it cannot lower. The same compiler runs in the CLI and in the browser playground.

A program is a set of exported functions. Each function is one instruction. Parameters are either accounts or instruction arguments, decided by their type.

## Accounts

```ts
import {
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
```

Account options are a type literal so both `tsc` and Axolotl can see them:

| Option | Meaning |
| --- | --- |
| `mut: true` | The account is writable |
| `init: true` | Create the account, paid by `payer` |
| `initIfNeeded: true` | Create it only when it does not exist |
| `payer: "authority"` | Name of the signer who pays rent |
| `seeds: ["profile", { account: "user" }, { arg: "id" }]` | PDA seeds |
| `bump: true` | Canonical bump. A `bump: u8` field is filled in on init |
| `hasOne: ["authority"]` | Field `authority` must equal that account's key |
| `close: "authority"` | At the end of the instruction, lamports go to this account |

Other account types: `Signer`, `SystemProgram`, `TokenProgram`, `TokenAccount`, `Mint`, `UncheckedAccount`, `SystemAccount`, `Clock`, `Rent`, `Program`.

`TokenAccount` and `Mint` may be wrapped in `Account<TokenAccount, { mut: true }>`. `TokenProgram` accepts the SPL Token interface, so a client can pass the classic token program.

Parameter order is the on-chain account order. `camelCase` names become `snake_case` in Rust and in the IDL, which is what Anchor emits.

## Arguments and fields

Instruction arguments and account fields use these types:

| Axolotl | Rust | Notes |
| --- | --- | --- |
| `u8` `u16` `u32` | same | number literals |
| `u64` `u128` | same | bigint literals (`0n`) |
| `i8` `i16` `i32` `i64` `i128` | same | |
| `boolean` | `bool` | |
| `string` | `String` | arguments and events only |
| `Pubkey` | `Pubkey` | |
| `bytes32` | `[u8; 32]` | assign a string of at most 32 bytes |

Account fields cannot be `string`. Strings are dynamically sized. Use `bytes32` or pass the string as an argument.

Integer arithmetic uses checked math and returns `ArithmeticOverflow` instead of wrapping. Comparisons are `===`, `!==`, `<`, `<=`, `>`, `>=`.

## Control flow

```ts
if (amount > counter.count) {
  counter.count = amount;
} else {
  counter.count = counter.count - amount;
}

for (let i: u64 = 0n; i < times; i = i + 1n) {
  counter.count = counter.count + 1n;
}
```

`if` bodies are blocks. The only loop is `for (let i: T = start; i < bound; i = i + 1n)`. There is no `while`, `break`, or `continue`. `return;` exits the instruction. Helper functions are not supported.

## Checks, logs, and events

```ts
import { emit, log, require, type Event } from "@axolotl-sol/core";

export interface Visited extends Event {
  user: Pubkey;
  visits: u64;
  note: string;
}

require(authority.key === counter.authority, "Unauthorized");
log("hello");
emit<Visited>({ user: authority.key, visits: counter.visits, note });
```

`require`'s message must be a string literal. Each distinct message becomes an Anchor error starting at code 6000.

## CPI

```ts
system.transfer({ from, to, amount });

token.transferChecked({
  from: ownerToken,
  to: vaultToken,
  mint,
  authority: vault, // a PDA signs when that account has seeds
  amount,
});

cpi({
  program: echoProgram,
  name: "setValue",
  accounts: [{ account: data, mut: true }],
  args: [value],
});
```

`name` is the callee's TypeScript function name. Axolotl snake-cases it the same way it names the generated Rust function, then uses Anchor's `sha256("global:" + name)[..8]` discriminator.

`Clock` exposes `unixTimestamp`, `slot`, and `epoch`. `Rent` exposes `minimumBalance(space)`.

## What is rejected

Imports other than `@axolotl-sol/core` and relative files, classes, `async`, destructuring, template strings, `while`, arbitrary calls, and account fields Axolotl cannot size. The diagnostic points at the TypeScript source line. `axolotl build` also maps `lib.rs` line numbers from a failed `anchor build` back to that source.
