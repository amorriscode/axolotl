# Axolotl conformance

Generated 2026-10-28. 20 passing, 0 failing, 12 unsupported. **Pass rate 62.5%** (20/32).

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
| Accounts | Zero-copy and AccountLoader | unsupported | No zero_copy / repr(C) lowering. |
| Accounts | realloc and dynamic account growth | unsupported | Account size is fixed at init. |
| Accounts | Optional and remaining accounts | unsupported | Every account is required and positional. |
| Types | Vec, enums, and nested structs in accounts | unsupported | Account fields are scalars, Pubkey, or bytes32. |
| Tokens | Token-2022 extensions | unsupported | transfer_checked uses the token interface, but extensions are not modeled. |
| Tokens | Associated token account creation inside the program | unsupported | Tests create token accounts with the SPL Token program directly. |
| CPI | CPI return data and multiple PDA signers | unsupported | One PDA signer per cpi() call, no return data. |
| Events | emit_cpi | unsupported | Events use emit!, not the self-CPI event instruction. |
| Runtime | Address lookup tables | unsupported | Transactions are v0 without lookup tables. |
| Sysvars | Instructions, SlotHashes, StakeHistory, EpochSchedule | unsupported | Only Clock and Rent are exposed. |
| Language | while, break, continue, and internal functions | unsupported | Only the documented for-loop form and instruction functions. |
| Compiler | Direct sBPF / SBF codegen | unsupported | Axolotl emits Anchor Rust and uses the Agave toolchain. See the README. |

## How to reproduce

```sh
npm install
npm test
CARGO_TARGET_DIR=$PWD/.anchor-target npm run build:programs
npm run conformance
```

Failing rows are bugs. Unsupported rows are gaps in the TypeScript subset, documented in [docs/language.md](docs/language.md).
