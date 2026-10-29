import { existsSync } from "node:fs";
import path from "node:path";
import { getCreateAccountInstruction } from "@solana-program/system";
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
  createTransactionMessage,
  generateKeyPairSigner,
  lamports,
  pipe,
  setTransactionMessageFeePayerSigner,
  signTransactionMessageWithSigners,
  type Address,
  type Instruction,
  type KeyPairSigner,
} from "@solana/kit";
import { FailedTransactionMetadata, LiteSVM, type TransactionMetadata } from "litesvm";

export const MINT_SPACE = 82n;
export const TOKEN_ACCOUNT_SPACE = 165n;

export interface ProgramArtifact {
  id: string;
  soPath: string;
}

export interface TestWorld {
  svm: LiteSVM;
  payer: KeyPairSigner;
}

export async function createWorld(programs: ProgramArtifact[] = []): Promise<TestWorld> {
  const svm = new LiteSVM();
  const payer = await generateKeyPairSigner();
  const dropped = svm.airdrop(payer.address, lamports(100_000_000_000n));
  if (dropped instanceof FailedTransactionMetadata) {
    throw new Error(`airdrop failed: ${dropped.meta().prettyLogs()}`);
  }
  for (const program of programs) {
    if (!existsSync(program.soPath)) {
      throw new Error(`Program binary not found at ${program.soPath}. Run axolotl build first.`);
    }
    svm.addProgramFromFile(address(program.id), program.soPath);
  }
  return { svm, payer };
}

export function findProgramSo(projectRoot: string, name: string): string {
  const candidates = [
    path.join(projectRoot, "target", "deploy", `${name}.so`),
    process.env.CARGO_TARGET_DIR ? path.join(process.env.CARGO_TARGET_DIR, "deploy", `${name}.so`) : "",
  ].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`Could not find ${name}.so. Looked in ${candidates.join(", ")}`);
  return found;
}

export type Role = "r" | "w" | "rs" | "ws";

export function meta(addr: Address | string, role: Role, signer?: KeyPairSigner) {
  const roles = {
    r: AccountRole.READONLY,
    w: AccountRole.WRITABLE,
    rs: AccountRole.READONLY_SIGNER,
    ws: AccountRole.WRITABLE_SIGNER,
  } as const;
  const account = {
    address: typeof addr === "string" ? address(addr) : addr,
    role: roles[role],
  };
  if (signer) return { ...account, signer };
  return account;
}

export function instruction(programId: string, accounts: ReturnType<typeof meta>[], data: Uint8Array): Instruction {
  return {
    programAddress: address(programId),
    accounts,
    data,
  };
}

export async function send(
  world: TestWorld,
  instructions: Instruction[],
): Promise<TransactionMetadata> {
  const message = await pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayerSigner(world.payer, tx),
    (tx) => world.svm.setTransactionMessageLifetimeUsingLatestBlockhash(tx),
    (tx) => appendTransactionMessageInstructions(instructions, tx),
    (tx) => signTransactionMessageWithSigners(tx),
  );
  const result = world.svm.sendTransaction(message);
  if (result instanceof FailedTransactionMetadata) {
    const error = new Error(`Transaction failed: ${result.err().toString()}\n${result.meta().prettyLogs()}`);
    (error as Error & { result: FailedTransactionMetadata }).result = result;
    throw error;
  }
  return result;
}

export async function sendAllowingFailure(world: TestWorld, instructions: Instruction[]) {
  const message = await pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayerSigner(world.payer, tx),
    (tx) => world.svm.setTransactionMessageLifetimeUsingLatestBlockhash(tx),
    (tx) => appendTransactionMessageInstructions(instructions, tx),
    (tx) => signTransactionMessageWithSigners(tx),
  );
  return world.svm.sendTransaction(message);
}

export async function createMint(world: TestWorld, decimals: number, mintAuthority: Address): Promise<KeyPairSigner> {
  const mint = await generateKeyPairSigner();
  const rent = world.svm.minimumBalanceForRentExemption(MINT_SPACE);
  await send(world, [
    getCreateAccountInstruction({
      payer: world.payer,
      newAccount: mint,
      lamports: rent,
      space: MINT_SPACE,
      programAddress: TOKEN_PROGRAM_ADDRESS,
    }),
    getInitializeMintInstruction({
      mint: mint.address,
      decimals,
      mintAuthority,
    }),
  ]);
  return mint;
}

export async function createTokenAccount(world: TestWorld, mint: Address, owner: Address): Promise<KeyPairSigner> {
  const tokenAccount = await generateKeyPairSigner();
  const rent = world.svm.minimumBalanceForRentExemption(TOKEN_ACCOUNT_SPACE);
  await send(world, [
    getCreateAccountInstruction({
      payer: world.payer,
      newAccount: tokenAccount,
      lamports: rent,
      space: TOKEN_ACCOUNT_SPACE,
      programAddress: TOKEN_PROGRAM_ADDRESS,
    }),
    getInitializeAccount3Instruction({
      account: tokenAccount.address,
      mint,
      owner,
    }),
  ]);
  return tokenAccount;
}

export async function mintTo(world: TestWorld, mint: Address, tokenAccount: Address, amount: bigint): Promise<void> {
  await send(world, [
    getMintToInstruction({
      mint,
      token: tokenAccount,
      mintAuthority: world.payer,
      amount,
    }),
  ]);
}

export { FailedTransactionMetadata, address, lamports };
export type { KeyPairSigner, Instruction };
