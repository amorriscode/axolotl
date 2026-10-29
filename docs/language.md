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
| `payer: "authority"` | Name of the signer who pays rent |
| `seeds: ["profile", { account: "user" }, { arg: "id" }]` | PDA seeds. `bump: true` is required whenever seeds are set |
| `bump: true` | Canonical bump. A `bump: u8` field is filled in on init |
| `hasOne: ["authority"]` | Field `authority` must equal that account's key. This is not a signature check. The named account must be a `Signer`, or the compiler rejects the instruction |
| `close: "authority"` | At the end of the instruction, lamports go to this account. The destination must be a `Signer` or a base58 address |
| `owner: "tokenProgram"` | Account owner must be that account's key, or a base58 address |
| `address: "1111..."` | Account address must be that key, or another account's key |
| `constraint: "counter.count > 0"` | Boolean expression over accounts and arguments. No arithmetic. Cannot be placed on an optional account |
| `program: "echoProgram"` | `seeds::program`. The PDA is derived under that program |
| `executable: true` | The account must be a program |
| `zero: true` | The client already created a zeroed account owned by this program |
| `tokenMint` / `tokenAuthority` | Anchor `token::mint` and `token::authority` |
| `associatedMint` / `associatedAuthority` | Anchor `associated_token` constraints |

Other account types: `Signer`, `SystemProgram`, `TokenProgram`, `Token2022Program`, `TokenAccount`, `Mint`, `UncheckedAccount`, `SystemAccount`, `Clock`, `Rent`, `EpochSchedule`, `Instructions`, `Program`, `RemainingAccounts`.

`UncheckedAccount` does not check the owner. Do not use it for an authority. `hasOne` and `close` reject it.

`optional: true` makes an account `Option`. Pass the program id when it is absent. A field read, including `.key`, must sit inside `if (present(account)) { ... }`. A `constraint`, `hasOne`, `close`, `realloc`, `owner`, or token constraint cannot be placed on an optional account: Anchor checks those before the body, so they cannot sit inside `present()`. `realloc: N` grows the account; the payer is the same `payer` option. `Vec<T, N>` stores at most N elements, and `push` fails with `VecFull` past that. `Str<N>` stores at most N bytes, and assignment fails with `StringTooLong`. Unit enums are one byte.

`TokenAccount` and `Mint` may be wrapped in `Account<TokenAccount, { mut: true }>`. `TokenProgram` is the SPL token interface and is not pinned to the classic token program, in the IDL or in the program. `Token2022Program` is pinned to Token-2022 in both. `Program` means the account is executable. The owner is the loader. Use `UncheckedAccount` when the caller does not know the owner.

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
| `bytes32` | `[u8; 32]` | a string of at most 32 bytes. `tsc` does not check the length |

Account fields cannot be an unbounded `string`. Use `Str<N>`, `bytes32`, or pass the string as an argument. `u128` and `i128` are account fields and arguments.

Integer arithmetic uses checked math and returns `ArithmeticOverflow` instead of wrapping. Comparisons are `===`, `!==`, `<`, `<=`, `>`, `>=`.

## What `tsc` checks, and what Axolotl checks

| | `tsc` | Axolotl |
| --- | --- | --- |
| `u8` … `u32`, `i8` … `i32` | `number`. `1000` is a valid `u8` | a literal must fit the type |
| `u64`, `u128`, `i64`, `i128` | `bigint` | a literal must fit the type |
| `bytes32` | `string`, any length | at most 32 bytes |
| `hasOne: ["typo"]` | allowed. The option is a string | the name must be a `Signer` parameter |
| `seeds` without `bump` | allowed | error |

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

`if` bodies are blocks. `while` conditions are expressions. `break` and `continue` apply to the innermost loop. The `for` form is still only `for (let i: T = start; i < bound; i = i + 1n)`. `return;` exits an instruction that returns nothing. `return expr;` is allowed when the function's return type is a scalar.

A non-exported function with scalar parameters and an optional scalar return type is a helper. Helpers are emitted outside `#[program]` so Anchor does not turn them into instructions.

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

`Clock` exposes `unixTimestamp`, `slot`, and `epoch`. `Rent` exposes `minimumBalance(space)`. `EpochSchedule` exposes `slotsPerEpoch`, `leaderScheduleSlotOffset`, `warmup`, `firstNormalEpoch`, and `firstNormalSlot`. `Instructions` exposes `index`, and a short sysvar is `AccountTooSmall`.

`token.createAssociatedAccount` creates an associated token account. The instruction must also take `AssociatedTokenProgram`, because the runtime only loads that program for CPI when its account is in the transaction. `token.mintTo` and `token.transferChecked` require `tokenMint` and `tokenAuthority` on every token account they touch. `cpiReturn<T>` reads the callee's return data and checks that it came from that program. `emitCpi` writes an Anchor self-CPI event. Clients decode that event from the inner instruction (`decodeEventInstructions`), not from `Program data:` logs.

## What is rejected

Imports other than `@axolotl-sol/core`, including relative paths. Classes, `async`, destructuring, template strings, and arbitrary calls. `switch` covers enums and does not fall through: a case that is followed by another case must end with `break`. `continue` inside `for` runs the increment, then continues. `Option<T>` and `Vec<T>` are instruction arguments; account vectors stay `Vec<T, N>`. Data-carrying enums are exported unions of `{ kind: "Name"; ... }` objects. `initIfNeeded`, zero-copy accounts, and sysvars that only expose a byte length are not in the language. The diagnostic points at the TypeScript source line. `axolotl build` also maps `lib.rs` line numbers from a failed `anchor build` back to that source. Axolotl lowers to Anchor Rust and does not emit sBPF itself; that is the compiler backend, not a missing Anchor feature.
