# Axolotl conformance

Generated 2026-10-29. 40 passing, 0 failing, 7 unsupported. **Pass rate 85.1%** (40/47).

Programs are compiled to Anchor Rust, built with Anchor 1.2.2 / Agave 4.1.2, and executed in [LiteSVM](https://www.litesvm.com/) 1.6.1.

| Group | Feature | Status | Detail |
| --- | --- | --- | --- |
| Examples | Counter init, has_one, and checked add | pass | examples/counter |
| Examples | Signer and custom error constraints | pass | examples/counter |
| Tokens | SPL Token transfer_checked, including a PDA signer | pass | examples/token-vault |
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
| Accounts | init_if_needed | pass | conformance |
| Runtime | Compute budget | pass | conformance |
| IDL | Anchor IDL discriminators, events, and error codes | pass | packages/compiler |
| Language | while loops and scalar helper functions | pass | conformance |
| Language | continue | pass | conformance |
| Language | break | pass | conformance |
| Accounts | Optional accounts | pass | Absent accounts are the program id. present() guards the body. |
| Accounts | Remaining accounts | pass | conformance |
| Types | Nested structs, Str, Vec, and unit enums | pass | conformance |
| Accounts | Zero-copy AccountLoader | pass | conformance |
| Accounts | realloc | pass | conformance |
| Sysvars | EpochSchedule, Instructions, SlotHashes, and StakeHistory | pass | conformance |
| Tokens | Associated token account creation inside the program | pass | conformance |
| Tokens | Token-2022 transfer-fee extension | pass | conformance |
| Events | emit_cpi self-CPI events | pass | Decoded from the inner instruction. Anchor 1.2 does not sol_log_data these. |
| CPI | CPI return data | pass | conformance |
| CPI | Multiple PDA signers in one CPI | pass | conformance |
| Runtime | Address lookup tables | pass | A v0 transaction loads the counter through a table created in a previous slot. |
| Types | u128 account fields | pass | conformance |
| Language | Checked division | pass | conformance |
| Accounts | has_one constraint failure | pass | conformance |
| Language | Checked addition overflow | pass | conformance |
| PDAs | PDA seeds constraint failure | pass | conformance |
| Compiler | Direct sBPF / SBF codegen | unsupported | Axolotl emits Anchor Rust and uses the Agave toolchain. A private syscall backend would track every Agave release. |
| Accounts | constraint, owner, and address expressions | unsupported | Account options are mut, init, initIfNeeded, payer, seeds, bump, has_one, close, optional, and realloc. |
| PDAs | PDAs derived under another program | unsupported | Seeds are always derived from the program being compiled. There is no seeds::program. |
| Types | Option and unsized Vec instruction arguments | unsupported | Instruction arguments are scalars, Pubkey, bytes32, or string. Account Vec fields have a declared maximum. |
| Language | switch / match | unsupported | Unit enums can be stored and compared. There is no match or switch. |
| Sysvars | Fees, RecentBlockhashes, and SlotHistory | unsupported | Clock, Rent, EpochSchedule, Instructions, SlotHashes, and StakeHistory are the exposed sysvars. |
| Runtime | ed25519 and secp256k1 precompiles | unsupported | No instruction for signature precompiles. The instructions sysvar exposes only the current index. |

## How to reproduce

```sh
npm install
npm test
CARGO_TARGET_DIR=$PWD/.anchor-target npm run build:programs
npm run conformance
```

Failing rows are bugs. Unsupported rows are gaps in the TypeScript subset, documented in [docs/language.md](docs/language.md).
