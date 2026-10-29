/**
 * Exercise the example programs with @solana/kit and the Anchor IDL.
 *
 *   node scripts/devnet-smoke.ts --dry-run
 *   node scripts/devnet-smoke.ts --cluster devnet --keypair /path/to/id.json --out site/public/devnet.json
 *
 * The keypair is the fee payer. It is never written to the repo. Program ids
 * come from each axolotl.toml, and instruction bytes come from target/idl
 * (the file `anchor build` wrote) or, if that file is missing, from compile().
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodeAccount, decodeEventLogs, encodeInstruction, type IdlLike } from "@axolotl-sol/client";
import { compile } from "@axolotl-sol/compiler";
import {
  getCreateAccountInstruction,
} from "@solana-program/system";
import {
  getInitializeAccount3Instruction,
  getInitializeMintInstruction,
  getMintToInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createTransactionMessage,
  generateKeyPairSigner,
  getAddressEncoder,
  getBase64EncodedWireTransaction,
  getProgramDerivedAddress,
  getSignatureFromTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
  type Instruction,
  type KeyPairSigner,
} from "@solana/kit";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SYSTEM = address("11111111111111111111111111111111");
const LOADER = "BPFLoaderUpgradeab1e11111111111111111111111";
const MINT_SPACE = 82n;
const TOKEN_ACCOUNT_SPACE = 165n;
const SMOKE_LAMPORTS = 50_000_000n;

const PROJECTS = [
  { name: "counter", dir: "examples/counter", so: "counter", source: "src/counter.ts" },
  { name: "token_vault", dir: "examples/token-vault", so: "token_vault", source: "src/token_vault.ts" },
  { name: "pda_profile", dir: "examples/pda-profile", so: "pda_profile", source: "src/pda_profile.ts" },
  { name: "echo", dir: "examples/cpi/echo", so: "echo", source: "src/echo.ts" },
  { name: "relay", dir: "examples/cpi/relay", so: "relay", source: "src/relay.ts" },
] as const;

interface ProgramRow {
  name: string;
  id: string;
  deployed: boolean;
  idl: string;
  explorer: string | null;
}

interface TxRow {
  name: string;
  program: string;
  signature: string | null;
  explorer: string | null;
  ok: boolean;
  detail: string;
}

interface Report {
  cluster: string;
  url: string;
  generated: string;
  status: "live" | "partial" | "unfunded" | "not-deployed";
  live: boolean;
  headline: string;
  deployer: string | null;
  balanceLamports: string | null;
  programs: ProgramRow[];
  transactions: TxRow[];
  notes: string[];
}

function show(value: unknown, space?: number): string {
  return JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item), space);
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function clusterUrl(cluster: string): string {
  if (cluster === "devnet") return "https://api.devnet.solana.com";
  if (cluster === "testnet") return "https://api.testnet.solana.com";
  if (cluster === "localnet" || cluster === "localhost") return "http://127.0.0.1:8899";
  return cluster;
}

function explorerAddress(id: string, cluster: string): string | null {
  if (cluster !== "devnet" && cluster !== "testnet" && cluster !== "mainnet-beta") return null;
  return `https://explorer.solana.com/address/${id}?cluster=${cluster}`;
}

function explorerTx(signature: string, cluster: string): string | null {
  if (cluster !== "devnet" && cluster !== "testnet" && cluster !== "mainnet-beta") return null;
  return `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`;
}

function readProgramId(dir: string): string {
  const text = readFileSync(path.join(root, dir, "axolotl.toml"), "utf8");
  const match = text.match(/^id\s*=\s*"([^"]+)"/m);
  if (!match) throw new Error(`No program id in ${dir}/axolotl.toml`);
  return match[1]!;
}

function loadIdl(project: (typeof PROJECTS)[number]): { idl: IdlLike; source: string } {
  const idlPath = path.join(root, project.dir, "target", "idl", `${project.so}.json`);
  try {
    return { idl: JSON.parse(readFileSync(idlPath, "utf8")) as IdlLike, source: path.relative(root, idlPath) };
  } catch {
    const sourcePath = path.join(root, project.dir, project.source);
    const compiled = compile({
      programName: project.so,
      programId: readProgramId(project.dir),
      sources: [{ filename: project.source, source: readFileSync(sourcePath, "utf8") }],
    });
    if (!compiled.ok) throw new Error(compiled.diagnostics.map((item) => item.message).join("\n"));
    return { idl: compiled.idl, source: `${project.dir}/${project.source} (compile)` };
  }
}

function meta(addr: Address | string, role: "r" | "w" | "rs" | "ws", signer?: KeyPairSigner) {
  const roles = {
    r: AccountRole.READONLY,
    w: AccountRole.WRITABLE,
    rs: AccountRole.READONLY_SIGNER,
    ws: AccountRole.WRITABLE_SIGNER,
  } as const;
  const account = { address: typeof addr === "string" ? address(addr) : addr, role: roles[role] };
  return signer ? { ...account, signer } : account;
}

function ix(programId: string, accounts: ReturnType<typeof meta>[], data: Uint8Array): Instruction {
  return { programAddress: address(programId), accounts, data };
}

function accountBytes(data: unknown): Uint8Array | null {
  if (!Array.isArray(data) || typeof data[0] !== "string") return null;
  return Uint8Array.from(Buffer.from(data[0], "base64"));
}

function tokenAmount(data: Uint8Array): bigint {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(64, true);
}

async function main(): Promise<number> {
  const cluster = arg("--cluster") ?? "devnet";
  const url = arg("--url") ?? clusterUrl(cluster);
  const dryRun = process.argv.includes("--dry-run");
  const out = arg("--out");
  const keypairPath = arg("--keypair") ?? process.env.AXOLOTL_DEPLOYER_KEYPAIR;
  const loaded = PROJECTS.map((project) => {
    const id = readProgramId(project.dir);
    const { idl, source } = loadIdl(project);
    if (idl.address && idl.address !== id) {
      throw new Error(`${project.name} IDL address ${idl.address} does not match axolotl.toml ${id}`);
    }
    return { project, id, idl, source };
  });

  if (dryRun) {
    for (const item of loaded) {
      const names = item.idl.instructions.map((instruction) => instruction.name).join(", ");
      console.log(`${item.project.name} ${item.id} [${item.source}] ${names}`);
    }
    const counter = loaded.find((item) => item.project.name === "counter");
    if (!counter) throw new Error("counter IDL missing");
    encodeInstruction(counter.idl, "initialize");
    encodeInstruction(counter.idl, "increment");
    encodeInstruction(counter.idl, "add", { amount: 0n });
    console.log("dry-run encoded counter initialize, increment, and add");
    return 0;
  }

  if (!keypairPath) {
    throw new Error("Pass --keypair or set AXOLOTL_DEPLOYER_KEYPAIR. The file is a Solana JSON keypair and must stay out of git.");
  }
  const secret = Uint8Array.from(JSON.parse(readFileSync(keypairPath, "utf8")) as number[]);
  const payer = await createKeyPairSignerFromBytes(secret);
  const rpc = createSolanaRpc(url);
  const balance = await rpc.getBalance(payer.address, { commitment: "confirmed" }).send();
  const balanceLamports = balance.value;

  const programs: ProgramRow[] = [];
  for (const item of loaded) {
    const info = await rpc.getAccountInfo(address(item.id), { encoding: "base64", commitment: "confirmed" }).send();
    const deployed = info.value?.executable === true && info.value.owner === LOADER;
    programs.push({
      name: item.project.name,
      id: item.id,
      deployed,
      idl: item.source,
      explorer: explorerAddress(item.id, cluster),
    });
  }

  const transactions: TxRow[] = [];
  const notes: string[] = [];
  const missing = programs.filter((program) => !program.deployed).map((program) => program.name);
  let status: Report["status"] = "live";

  if (balanceLamports < SMOKE_LAMPORTS) {
    status = "unfunded";
    notes.push(
      `Deployer ${payer.address} has ${balanceLamports} lamports on ${url}. Smoke needs at least ${SMOKE_LAMPORTS} lamports after the programs are deployed, and deploy itself needs roughly two rent-exempt copies of each .so. No instructions were sent.`,
    );
  } else if (missing.length === programs.length) {
    status = "not-deployed";
    notes.push("None of the example program ids is an executable upgradeable program on this cluster. Deploy with `axolotl deploy --cluster devnet` first.");
  } else {
    const present = new Set(programs.filter((program) => program.deployed).map((program) => program.name));
    if (missing.length > 0) notes.push(`Skipped because the program account is missing: ${missing.join(", ")}.`);
    const send = makeSender(rpc, payer, cluster);
    let threw = false;
    try {
      if (present.has("counter")) await runCounter(loaded, payer, rpc, send, transactions, cluster);
      if (present.has("token_vault")) await runVault(loaded, payer, rpc, send, transactions, cluster);
      if (present.has("pda_profile")) await runProfile(loaded, payer, rpc, send, transactions, cluster);
      if (present.has("echo") && present.has("relay")) await runCpi(loaded, payer, rpc, send, transactions, cluster);
      else if (present.has("echo") || present.has("relay")) notes.push("CPI smoke needs both echo and relay deployed.");
    } catch (error) {
      threw = true;
      notes.push(error instanceof Error ? error.message : String(error));
    }
    if (threw || missing.length > 0 || transactions.some((row) => !row.ok) || transactions.length === 0) status = "partial";
  }

  const failed = transactions.filter((row) => !row.ok);
  const headline = status === "live"
    ? `Live on ${cluster}. ${transactions.length} smoke transactions confirmed.`
    : status === "partial"
      ? `Partial ${cluster} run. ${failed.length} smoke check${failed.length === 1 ? "" : "s"} failed.`
      : status === "unfunded"
        ? `Not live on ${cluster}. The deployer has ${balanceLamports} lamports, so nothing was deployed or invoked.`
        : `Not live on ${cluster}. Program accounts are missing, so the smoke transactions were not sent.`;

  const report: Report = {
    cluster,
    url,
    generated: new Date().toISOString(),
    status,
    live: status === "live",
    headline,
    deployer: payer.address,
    balanceLamports: balanceLamports.toString(),
    programs,
    transactions,
    notes,
  };
  console.log(show(report, 2));
  if (out) writeFileSync(out, `${show(report, 2)}\n`);
  return status === "live" ? 0 : 1;
}

interface Sent {
  signature: string;
  err: unknown;
  logs: string[];
}

function makeSender(
  rpc: ReturnType<typeof createSolanaRpc>,
  payer: KeyPairSigner,
  cluster: string,
) {
  async function confirm(signature: string): Promise<unknown> {
    for (let attempt = 0; attempt < 40; attempt++) {
      const status = await rpc.getSignatureStatuses([signature as never], { searchTransactionHistory: true }).send();
      const row = status.value[0];
      if (row && (row.confirmationStatus === "confirmed" || row.confirmationStatus === "finalized")) return row.err;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error(`Timed out waiting for ${explorerTx(signature, cluster) ?? signature}`);
  }

  return async function send(name: string, program: string, instructions: Instruction[], expectError = false): Promise<Sent> {
    const build = async () => {
      const latest = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
      const message = await pipe(
        createTransactionMessage({ version: 0 }),
        (tx) => setTransactionMessageFeePayerSigner(payer, tx),
        (tx) => setTransactionMessageLifetimeUsingBlockhash(latest.value, tx),
        (tx) => appendTransactionMessageInstructions(instructions, tx),
        (tx) => signTransactionMessageWithSigners(tx),
      );
      return message;
    };
    let signed = await build();
    let signature = getSignatureFromTransaction(signed);
    const submit = async (skipPreflight: boolean) => {
      await rpc.sendTransaction(getBase64EncodedWireTransaction(signed), {
        encoding: "base64",
        skipPreflight,
        preflightCommitment: "confirmed",
        maxRetries: 5n,
      }).send();
    };
    try {
      await submit(expectError);
    } catch (error) {
      if (!expectError) throw new Error(`${name} rejected before it landed: ${error instanceof Error ? error.message : String(error)}`);
      signed = await build();
      signature = getSignatureFromTransaction(signed);
      await submit(true);
    }
    const err = await confirm(signature);
    const logs = await logsFor(rpc, signature);
    return { signature, err, logs };
  };
}

async function logsFor(rpc: ReturnType<typeof createSolanaRpc>, signature: string): Promise<string[]> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const tx = await rpc.getTransaction(signature as never, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
      encoding: "json",
    }).send();
    const meta = (tx as { meta?: { logMessages?: string[] | null } } | null)?.meta;
    if (meta?.logMessages) return meta.logMessages;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return [];
}

function record(rows: TxRow[], cluster: string, name: string, program: string, sent: Sent, ok: boolean, detail: string): void {
  rows.push({
    name,
    program,
    signature: sent.signature,
    explorer: explorerTx(sent.signature, cluster),
    ok,
    detail,
  });
  console.log(`${ok ? "ok" : "FAIL"} ${name} ${sent.signature}`);
}

type Send = (name: string, program: string, instructions: Instruction[], expectError?: boolean) => Promise<Sent>;
type Loaded = { project: (typeof PROJECTS)[number]; id: string; idl: IdlLike; source: string };

async function runCounter(
  loaded: Loaded[],
  payer: KeyPairSigner,
  rpc: ReturnType<typeof createSolanaRpc>,
  send: Send,
  rows: TxRow[],
  cluster: string,
): Promise<void> {
  const counter = loaded.find((item) => item.project.name === "counter");
  if (!counter) throw new Error("counter missing");
  const idl = counter.idl;
  const account = await generateKeyPairSigner();
  const init = await send("counter initialize", "counter", [
    ix(counter.id, [
      meta(account.address, "ws", account),
      meta(payer.address, "ws", payer),
      meta(SYSTEM, "r"),
    ], encodeInstruction(idl, "initialize")),
  ]);
  record(rows, cluster, "counter initialize", "counter", init, init.err == null, init.err == null ? "count starts at 0" : `initialize failed: ${show(init.err)}`);
  if (init.err) throw new Error("counter initialize failed");

  const bump = await send("counter increment", "counter", [
    ix(counter.id, [
      meta(account.address, "w"),
      meta(payer.address, "rs", payer),
    ], encodeInstruction(idl, "increment")),
  ]);
  record(rows, cluster, "counter increment", "counter", bump, bump.err == null, bump.err == null ? "incremented" : `increment failed: ${show(bump.err)}`);

  const added = await send("counter add 4", "counter", [
    ix(counter.id, [
      meta(account.address, "w"),
      meta(payer.address, "rs", payer),
    ], encodeInstruction(idl, "add", { amount: 4n })),
  ]);
  const stored = await rpc.getAccountInfo(account.address, { encoding: "base64", commitment: "confirmed" }).send();
  const storedBytes = accountBytes(stored.value?.data);
  const count = storedBytes ? decodeAccount(idl, "Counter", storedBytes).count : null;
  const countOk = added.err == null && count === 5n;
  record(rows, cluster, "counter add 4", "counter", added, countOk, countOk ? "count is 5" : `count=${String(count)} err=${show(added.err)}`);

  const zero = await send("counter add 0", "counter", [
    ix(counter.id, [
      meta(account.address, "w"),
      meta(payer.address, "rs", payer),
    ], encodeInstruction(idl, "add", { amount: 0n })),
  ], true);
  const zeroOk = zero.err != null;
  record(rows, cluster, "counter add 0 rejected", "counter", zero, zeroOk, zeroOk ? `program error ${show(zero.err)}` : "add 0 was accepted");

  const stranger = await generateKeyPairSigner();
  const denied = await send("counter stranger increment", "counter", [
    ix(counter.id, [
      meta(account.address, "w"),
      meta(stranger.address, "rs", stranger),
    ], encodeInstruction(idl, "increment")),
  ], true);
  const deniedOk = denied.err != null;
  record(rows, cluster, "counter missing authority", "counter", denied, deniedOk, deniedOk ? `program error ${show(denied.err)}` : "stranger increment was accepted");
}

async function runVault(
  loaded: Loaded[],
  payer: KeyPairSigner,
  rpc: ReturnType<typeof createSolanaRpc>,
  send: Send,
  rows: TxRow[],
  cluster: string,
): Promise<void> {
  const vaultProgram = loaded.find((item) => item.project.name === "token_vault");
  if (!vaultProgram) throw new Error("token vault missing");
  const idl = vaultProgram.idl;
  const encoder = getAddressEncoder();
  const mint = await generateKeyPairSigner();
  const mintRent = await rpc.getMinimumBalanceForRentExemption(MINT_SPACE).send();
  const tokenRent = await rpc.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_SPACE).send();
  const openedMint = await send("vault create mint", "token_vault", [
    getCreateAccountInstruction({
      payer,
      newAccount: mint,
      lamports: mintRent,
      space: MINT_SPACE,
      programAddress: TOKEN_PROGRAM_ADDRESS,
    }),
    getInitializeMintInstruction({ mint: mint.address, decimals: 6, mintAuthority: payer.address }),
  ]);
  record(rows, cluster, "vault create mint", "token_vault", openedMint, openedMint.err == null, openedMint.err == null ? "mint initialized" : show(openedMint.err));
  if (openedMint.err) throw new Error("mint init failed");

  const ownerToken = await generateKeyPairSigner();
  const openedOwner = await send("vault create owner token account", "token_vault", [
    getCreateAccountInstruction({
      payer,
      newAccount: ownerToken,
      lamports: tokenRent,
      space: TOKEN_ACCOUNT_SPACE,
      programAddress: TOKEN_PROGRAM_ADDRESS,
    }),
    getInitializeAccount3Instruction({ account: ownerToken.address, mint: mint.address, owner: payer.address }),
    getMintToInstruction({ mint: mint.address, token: ownerToken.address, mintAuthority: payer, amount: 1_000_000n }),
  ]);
  record(rows, cluster, "vault mint to owner", "token_vault", openedOwner, openedOwner.err == null, openedOwner.err == null ? "minted 1000000" : show(openedOwner.err));
  if (openedOwner.err) throw new Error("mintTo failed");

  const [vault] = await getProgramDerivedAddress({
    programAddress: address(vaultProgram.id),
    seeds: [new TextEncoder().encode("vault"), encoder.encode(mint.address), encoder.encode(payer.address)],
  });
  const initialized = await send("vault initialize", "token_vault", [
    ix(vaultProgram.id, [
      meta(vault, "w"),
      meta(payer.address, "ws", payer),
      meta(mint.address, "r"),
      meta(SYSTEM, "r"),
    ], encodeInstruction(idl, "initialize")),
  ]);
  record(rows, cluster, "vault initialize", "token_vault", initialized, initialized.err == null, initialized.err == null ? `pda ${vault}` : show(initialized.err));
  if (initialized.err) throw new Error("vault initialize failed");

  const vaultToken = await generateKeyPairSigner();
  const openedVaultToken = await send("vault create vault token account", "token_vault", [
    getCreateAccountInstruction({
      payer,
      newAccount: vaultToken,
      lamports: tokenRent,
      space: TOKEN_ACCOUNT_SPACE,
      programAddress: TOKEN_PROGRAM_ADDRESS,
    }),
    getInitializeAccount3Instruction({ account: vaultToken.address, mint: mint.address, owner: vault }),
  ]);
  record(rows, cluster, "vault token account", "token_vault", openedVaultToken, openedVaultToken.err == null, openedVaultToken.err == null ? "owned by the vault PDA" : show(openedVaultToken.err));
  if (openedVaultToken.err) throw new Error("vault token account failed");

  const deposit = await send("vault deposit", "token_vault", [
    ix(vaultProgram.id, [
      meta(vault, "w"),
      meta(payer.address, "rs", payer),
      meta(mint.address, "r"),
      meta(ownerToken.address, "w"),
      meta(vaultToken.address, "w"),
      meta(TOKEN_PROGRAM_ADDRESS, "r"),
    ], encodeInstruction(idl, "deposit", { amount: 400_000n })),
  ]);
  record(rows, cluster, "vault deposit", "token_vault", deposit, deposit.err == null, deposit.err == null ? "PDA signed the token transfer" : show(deposit.err));
  if (deposit.err) throw new Error("deposit failed");

  const withdraw = await send("vault withdraw", "token_vault", [
    ix(vaultProgram.id, [
      meta(vault, "w"),
      meta(payer.address, "rs", payer),
      meta(mint.address, "r"),
      meta(ownerToken.address, "w"),
      meta(vaultToken.address, "w"),
      meta(TOKEN_PROGRAM_ADDRESS, "r"),
    ], encodeInstruction(idl, "withdraw", { amount: 150_000n })),
  ]);
  const vaultInfo = await rpc.getAccountInfo(vault, { encoding: "base64", commitment: "confirmed" }).send();
  const vaultData = accountBytes(vaultInfo.value?.data);
  const deposited = vaultData ? decodeAccount(idl, "Vault", vaultData).deposited : null;
  const ownerInfo = await rpc.getAccountInfo(ownerToken.address, { encoding: "base64", commitment: "confirmed" }).send();
  const ownerData = accountBytes(ownerInfo.value?.data);
  const ownerBalance = ownerData ? tokenAmount(ownerData) : null;
  const balancesOk = withdraw.err == null && deposited === 250_000n && ownerBalance === 750_000n;
  record(
    rows,
    cluster,
    "vault withdraw",
    "token_vault",
    withdraw,
    balancesOk,
    balancesOk ? "deposited 250000, owner token 750000" : `deposited=${deposited} owner=${ownerBalance} err=${show(withdraw.err)}`,
  );
}

async function runProfile(
  loaded: Loaded[],
  payer: KeyPairSigner,
  rpc: ReturnType<typeof createSolanaRpc>,
  send: Send,
  rows: TxRow[],
  cluster: string,
): Promise<void> {
  const profileProgram = loaded.find((item) => item.project.name === "pda_profile");
  if (!profileProgram) throw new Error("pda profile missing");
  const encoder = getAddressEncoder();
  const [profile] = await getProgramDerivedAddress({
    programAddress: address(profileProgram.id),
    seeds: [new TextEncoder().encode("profile"), encoder.encode(payer.address)],
  });
  const nickname = new Uint8Array(32);
  nickname.set(new TextEncoder().encode("ada"));
  const created = await send("profile create", "pda_profile", [
    ix(profileProgram.id, [
      meta(profile, "w"),
      meta(payer.address, "ws", payer),
      meta(SYSTEM, "r"),
    ], encodeInstruction(profileProgram.idl, "create_profile", { nickname })),
  ]);
  record(rows, cluster, "profile create", "pda_profile", created, created.err == null, created.err == null ? `pda ${profile}` : show(created.err));
  if (created.err) throw new Error("create_profile failed");

  const visit = await send("profile visit", "pda_profile", [
    ix(profileProgram.id, [
      meta(profile, "w"),
      meta(payer.address, "rs", payer),
    ], encodeInstruction(profileProgram.idl, "visit", { note: "hello" })),
  ]);
  const events = decodeEventLogs(profileProgram.idl, visit.logs);
  const info = await rpc.getAccountInfo(profile, { encoding: "base64", commitment: "confirmed" }).send();
  const data = accountBytes(info.value?.data);
  const decoded = data ? decodeAccount(profileProgram.idl, "Profile", data) : null;
  const eventOk = visit.err == null && events[0]?.name === "Visited" && events[0]?.data.note === "hello" && decoded?.visits === 1n;
  record(
    rows,
    cluster,
    "profile visit event",
    "pda_profile",
    visit,
    eventOk,
    eventOk ? "Visited event decoded from Program data logs" : `events=${show(events)} visits=${String(decoded?.visits)} err=${show(visit.err)}`,
  );
}

async function runCpi(
  loaded: Loaded[],
  payer: KeyPairSigner,
  rpc: ReturnType<typeof createSolanaRpc>,
  send: Send,
  rows: TxRow[],
  cluster: string,
): Promise<void> {
  const echo = loaded.find((item) => item.project.name === "echo");
  const relay = loaded.find((item) => item.project.name === "relay");
  if (!echo || !relay) throw new Error("cpi programs missing");
  const dataAccount = await generateKeyPairSigner();
  const initialized = await send("echo initialize", "echo", [
    ix(echo.id, [
      meta(dataAccount.address, "ws", dataAccount),
      meta(payer.address, "ws", payer),
      meta(SYSTEM, "r"),
    ], encodeInstruction(echo.idl, "initialize")),
  ]);
  record(rows, cluster, "echo initialize", "echo", initialized, initialized.err == null, initialized.err == null ? "echo data created" : show(initialized.err));
  if (initialized.err) throw new Error("echo initialize failed");

  const relayed = await send("relay cpi", "relay", [
    ix(relay.id, [
      meta(echo.id, "r"),
      meta(dataAccount.address, "w"),
      meta(payer.address, "rs", payer),
    ], encodeInstruction(relay.idl, "relay", { value: 42n })),
  ]);
  const stored = await rpc.getAccountInfo(dataAccount.address, { encoding: "base64", commitment: "confirmed" }).send();
  const storedBytes = accountBytes(stored.value?.data);
  const value = storedBytes ? decodeAccount(echo.idl, "EchoData", storedBytes).value : null;
  const valueOk = relayed.err == null && value === 42n;
  record(rows, cluster, "relay cpi", "relay", relayed, valueOk, valueOk ? "echo value is 42" : `value=${String(value)} err=${show(relayed.err)}`);
}

const code = await main();
process.exit(code);
