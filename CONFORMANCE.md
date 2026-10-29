# Axolotl conformance

Generated 2026-10-29. 50 passing, 0 failing, 0 unsupported. **Pass rate 100%** (50/50).

Programs are compiled to Anchor Rust, built with Anchor 1.2.2 / Agave 4.1.2, and executed in [LiteSVM](https://www.litesvm.com/) 1.6.1.

| Group | Feature | Status | Detail |
| --- | --- | --- | --- |
| Examples | Counter init, has_one, and checked add | pass | examples/counter |
| Examples | Signer and custom error constraints | pass | examples/counter |
| Tokens | SPL Token transfer_checked, including a PDA signer | pass | examples/token-vault |
| Tokens | token::authority rejects the wrong destination | pass | examples/token-vault |
| PDAs | PDA seeds, stored bump, bytes32, and events | pass | examples/pda-profile |
| CPI | CPI into another Anchor program | pass | examples/cpi |
| Accounts | init, payer, rent exemption, program ownership | pass | conformance |
| Accounts | close returns lamports | pass | conformance |
| Language | if / else | pass | conformance |
| Language | Bounded for loop | pass | conformance |
| CPI | System program transfer | pass | conformance |
| Types | u8, u16, u32, u64, i64, bool, bytes32 | pass | conformance |
| Sysvars | Clock sysvar | pass | conformance |
| Sysvars | Rent sysvar minimum_balance | pass | conformance |
| Types | String arguments, require, and log | pass | conformance |
| Types | Pubkey instruction arguments | pass | conformance |
| Events | Anchor events in transaction logs | pass | conformance |
| PDAs | Seeds from constants, args, and account keys | pass | conformance |
| Language | continue inside for runs the increment | pass | Ten iterations, skip one, counter ends at 9. |
| IDL | Anchor IDL discriminators, events, and error codes | pass | packages/compiler |
| Language | while loops and scalar helper functions | pass | conformance |
| Language | continue | pass | conformance |
| Language | break | pass | conformance |
| Accounts | Optional accounts | pass | Absent accounts are the program id. present() guards the body. |
| Accounts | Remaining accounts | pass | conformance |
| Types | Nested structs, Str, Vec, and unit enums | pass | conformance |
| Accounts | realloc | pass | conformance |
| Sysvars | EpochSchedule and the instructions sysvar | pass | conformance |
| Tokens | Associated token account creation inside the program | pass | conformance |
| Events | emit_cpi self-CPI events | pass | Decoded from the inner instruction. Anchor 1.2 does not sol_log_data these. |
| CPI | CPI return data | pass | conformance |
| CPI | Multiple PDA signers in one CPI | pass | conformance |
| Types | u128 account fields | pass | conformance |
| Language | Checked division | pass | conformance |
| Accounts | has_one constraint failure | pass | conformance |
| Language | Checked addition overflow | pass | conformance |
| PDAs | PDA seeds constraint failure | pass | conformance |
| Accounts | owner constraint | pass | conformance |
| Accounts | address constraint | pass | conformance |
| Accounts | constraint expressions | pass | conformance |
| PDAs | seeds::program | pass | PDA derived under the echo program. |
| Types | Option and unsized Vec instruction arguments | pass | conformance |
| Language | switch on unit enums | pass | conformance |
| Types | Data-carrying enums and match | pass | Discriminated unions lower to Anchor enums with fields. |
| Runtime | ed25519 precompile via the instructions sysvar | pass | Indexes other than this instruction do not count, even when the bytes are present. |
| Runtime | secp256k1 precompile via the instructions sysvar | pass | conformance |
| Accounts | executable constraint | pass | conformance |
| Tokens | token::mint and token::authority | pass | conformance |
| Tokens | associated_token mint and authority | pass | conformance |
| Accounts | zero constraint | pass | The client creates the account. The program writes the discriminator. |

## How to reproduce

```sh
npm install
npm test
CARGO_TARGET_DIR=$PWD/.anchor-target npm run build:programs
npm run conformance
```

Failing rows are bugs. The language is defined in docs/language.md. This table is a regression list.

## Not on this scoreboard

Direct sBPF emission is not an Anchor feature, so it is not a row. Anchor compiles Rust; the Agave toolchain emits the sBPF program and the IDL. Axolotl does the same after lowering TypeScript to that Rust. A second backend that called syscalls itself would be a different compiler, and it would have to be rewritten whenever Agave changes the syscall surface. That choice is the architecture in the README, not a missing Solana feature.
