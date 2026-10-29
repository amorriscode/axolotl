import {
  require,
  token,
  type Account,
  type Mint,
  type Pubkey,
  type Signer,
  type SystemProgram,
  type TokenAccount,
  type TokenProgram,
  type u64,
  type u8,
} from "@axolotl-sol/core";

export interface Vault {
  authority: Pubkey;
  bump: u8;
  deposited: u64;
}

export function initialize(
  vault: Account<Vault, {
    init: true;
    payer: "authority";
    seeds: ["vault", { account: "mint" }, { account: "authority" }];
    bump: true;
  }>,
  authority: Signer<{ mut: true }>,
  mint: Mint,
  systemProgram: SystemProgram,
): void {
  vault.authority = authority.key;
  vault.deposited = 0n;
}

export function deposit(
  vault: Account<Vault, {
    mut: true;
    seeds: ["vault", { account: "mint" }, { account: "authority" }];
    bump: true;
    hasOne: ["authority"];
  }>,
  authority: Signer,
  mint: Mint,
  ownerToken: Account<TokenAccount, { mut: true; tokenMint: "mint"; tokenAuthority: "authority" }>,
  vaultToken: Account<TokenAccount, { mut: true; tokenMint: "mint"; tokenAuthority: "vault" }>,
  tokenProgram: TokenProgram,
  amount: u64,
): void {
  token.transferChecked({
    from: ownerToken,
    to: vaultToken,
    mint,
    authority,
    amount,
  });
  vault.deposited = vault.deposited + amount;
}

export function withdraw(
  vault: Account<Vault, {
    mut: true;
    seeds: ["vault", { account: "mint" }, { account: "authority" }];
    bump: true;
    hasOne: ["authority"];
  }>,
  authority: Signer,
  mint: Mint,
  ownerToken: Account<TokenAccount, { mut: true; tokenMint: "mint"; tokenAuthority: "authority" }>,
  vaultToken: Account<TokenAccount, { mut: true; tokenMint: "mint"; tokenAuthority: "vault" }>,
  tokenProgram: TokenProgram,
  amount: u64,
): void {
  require(amount <= vault.deposited, "Insufficient funds");
  token.transferChecked({
    from: vaultToken,
    to: ownerToken,
    mint,
    authority: vault,
    amount,
  });
  vault.deposited = vault.deposited - amount;
}
