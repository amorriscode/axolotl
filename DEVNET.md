# Devnet

The example programs are **not deployed on devnet**. There are no transaction signatures and no Solana Explorer transaction links, because the throwaway deployer never received SOL.

Checked at `2026-10-29T16:14:14Z` against `https://api.devnet.solana.com`.

| | |
| --- | --- |
| Deployer (public only) | `HdbnHfE21fDb2fFZqvsK9Z96moYPbUJWSCaWABRUjjLv` |
| Balance | 0 lamports |
| Key file | `/tmp/axolotl-devnet-deployer.json` on the machine that tried. It is not in git. |

The program ids below are the ones in each `axolotl.toml`. `getAccountInfo` says none of them is an executable program on devnet. The explorer links open the address page, which has no account.

| Program | Id | Explorer |
| --- | --- | --- |
| counter | `8qUgK4vi5mPRKpGfTVto7FpWyBjNgfB6U6opToXWM585` | https://explorer.solana.com/address/8qUgK4vi5mPRKpGfTVto7FpWyBjNgfB6U6opToXWM585?cluster=devnet |
| token vault | `4mP1BL1yP9Rt1TSmuF4ht4wzmJig6hPJpumA5uVCQaQ3` | https://explorer.solana.com/address/4mP1BL1yP9Rt1TSmuF4ht4wzmJig6hPJpumA5uVCQaQ3?cluster=devnet |
| PDA profile | `5kYGWFrmwpgL8xsCtPCwzdxWjZ3itbtmPqjk8sRNGiU3` | https://explorer.solana.com/address/5kYGWFrmwpgL8xsCtPCwzdxWjZ3itbtmPqjk8sRNGiU3?cluster=devnet |
| echo | `5MWt5tcVEsYHTh2tPJxnM8gRtvUpWa4E72tn2PzhaoXU` | https://explorer.solana.com/address/5MWt5tcVEsYHTh2tPJxnM8gRtvUpWa4E72tn2PzhaoXU?cluster=devnet |
| relay | `6kkQrxZGUNnFnp9a82NAKDVv9ithwmPLz3oSLr4hnU7c` | https://explorer.solana.com/address/6kkQrxZGUNnFnp9a82NAKDVv9ithwmPLz3oSLr4hnU7c?cluster=devnet |

`site/public/devnet.json` is the same snapshot. The scoreboard reads it. `live` is false.

## Why the wallet stayed empty

`axolotl deploy` pays fees and rent from the Solana CLI keypair. A fresh keypair was generated and `solana config` was pointed at it and at devnet. Funding failed.

The official RPC method is closed, not rate-limited. `solana airdrop 2` was retried with backoff. The CLI says the rate limit was reached. The raw response from `https://api.devnet.solana.com` is:

```json
{"code":410,"message":"The RPC faucet is closed on this cluster. Request test SOL at https://faucet.solana.com"}
```

The same 410 comes back from `https://api.testnet.solana.com` and from `https://devnet.rpcpool.com`. Other public RPCs refused the call before a faucet could answer (Helius and Shyft want an API key, Ankr wants an API key, Alchemy's demo key returned 429, Validation Cloud rejected the key, OnFinality rate-limited or rejected the body, `api.devnet.rpcpool.com` returned 403).

Hot-wallet faucets that still send their own SOL:

| Faucet | Result |
| --- | --- |
| https://faucet.solana.com/api/request | `400` GitHub authentication is required. Captcha is also required. The page tells agents not to use that faucet. |
| https://solfaucet.com | The page calls `requestAirdrop` on the public RPC, which is the closed faucet above. |
| https://faucet.quicknode.com/solana/devnet | Web drip. It asks for a bot check and a mainnet balance. This key has 0 SOL on mainnet. |
| https://www.devnetfaucet.org | GitHub sign-in (`/api/auth/signin`). |
| Pine Stake | GitHub plus Cloudflare Turnstile. The API is not an open POST. |
| https://faucet-api.blueshift.gg/check/`<address>` | `{"is_certified":false}`. Claims require a Blueshift certification. |
| Coinbase CDP `POST /v2/solana/faucet` | Needs a CDP API key. An unauthenticated POST returned 404. |
| https://faucet.triangleplatform.com | Service suspended. |

The proof-of-work faucet the Solana docs still recommend (`devnet-pow`, program `PoWSNH2hEZogtCg1Zgm51FnkmJperzYDgPK4fvs8taL`) cannot pay this wallet either. `getProgramAccounts` returned 24 spec accounts. The difficulty-3 / 0.02 SOL source that the docs name, `6yvwhesLJeE8fNWviosRoUtBP3VFUXE7SEhSP9fFRJ3Z`, has 0 lamports. Every documented reward tier with a non-zero spec is empty except two that cannot fund a deploy:

- Difficulty 2, reward 100 lamports, source `5NHijp3cQCTYpRJh9WayDHXzouvX7FQLqP8iNpJ946u7` holds about 1 SOL. A claim still has to create a receipt account, and 100 lamports does not cover that rent, so the transfer rolls back. The official miner ignores rewards below 895880 lamports for this reason.
- Difficulty 5, reward 0.019 SOL, source `CbWeC89FKgzZbo1wH8ydtfk4YmdhiudmNBWdaRngcY6Q` holds 900000 lamports, which is less than the configured reward. Difficulty 5 is not a practical way to scrape that dust, and it is far below the cost of a program deploy.

Deploy needs roughly two rent-exempt copies of the `.so` at once (the program account and the buffer). In order: counter (~137 KB, about 1 SOL peak), token vault (~183 KB, about 1.3 SOL), PDA profile, echo, relay (~74 KB, about 0.5 SOL). The wallet has none of that.

## What was proven instead

`scripts/devnet-smoke.ts` was run against a local `solana-test-validator` (Agave 4.1.2, the same CLI this repo pins), after `axolotl deploy --cluster localhost` of all five programs. That is a real Agave node, and it is not devnet. All 15 checks passed:

- counter initialize, increment, and add 4, then the account decodes to count 5
- add 0 lands and fails with custom error 6001
- an increment signed by a stranger fails with Anchor error 2001 (`ConstraintHasOne`)
- token-vault deposit and withdraw, with the vault PDA as the token-account owner; deposited ends at 250000 and the owner token account at 750000
- PDA profile `visit` emits `Visited`, decoded from `Program data:` logs
- relay CPI leaves echo `value` at 42

The LiteSVM tests assert those same end states (they check that the two counter failures fail, not the numeric error codes). Nothing in that local run disagreed with them. There is no devnet-versus-LiteSVM difference to report, because no devnet transaction was sent.

## Running it when a wallet has SOL

```sh
solana config set --url https://api.devnet.solana.com --keypair /path/to/deployer.json
node packages/cli/bin/axolotl.js deploy --cluster devnet   # from each example directory
node scripts/devnet-smoke.ts --cluster devnet --keypair /path/to/deployer.json --out site/public/devnet.json
```

`node scripts/devnet-smoke.ts --dry-run` only loads the IDLs and encodes the counter instructions. It does not need a key or a cluster.

Build before deploy. `axolotl deploy` shells out to `solana program deploy` and uses the CLI's configured keypair as the fee payer. Pass the key path to the smoke script as well. Do not commit that file.

## GitHub Action

[`.github/workflows/devnet-smoke.yml`](.github/workflows/devnet-smoke.yml) is `workflow_dispatch` and a Monday schedule. It does not run on pull requests.

Repository secret `DEVNET_DEPLOYER_KEYPAIR` is the fee-payer JSON array (the same format as `solana-keygen`). If that secret is unset or empty, the job prints a skip line and exits 0. If it is set, the job writes it to `$RUNNER_TEMP` (not the repo), retries `solana airdrop 2`, builds and deploys counter, then the token vault, then echo, relay, and the PDA profile, and stops when the balance cannot cover the next program. It then runs the smoke script and uploads `site/public/devnet.json` as an artifact. A wallet with 0 SOL fails the job. The public faucet is closed, so the secret has to be funded some other way before the job can go green.

`keys/` is gitignored. On a fresh runner, `axolotl build` generates new program ids, and the action deploys those rather than the addresses in the table above. To redeploy these ids, store a base64 tarball of the `keys/` directories as the optional secret `DEVNET_PROGRAM_KEYS`. The job extracts it before building when the secret is present.
