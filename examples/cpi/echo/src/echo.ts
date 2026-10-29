import {
  log,
  require,
  type Account,
  type Pubkey,
  type Signer,
  type SystemProgram,
  type u64,
} from "@axolotl-sol/core";

export interface EchoData {
  authority: Pubkey;
  value: u64;
}

export function initialize(
  data: Account<EchoData, { init: true; payer: "user" }>,
  user: Signer<{ mut: true }>,
  systemProgram: SystemProgram,
): void {
  data.authority = user.key;
  data.value = 0n;
}

export function setValue(
  data: Account<EchoData, { mut: true; hasOne: ["authority"] }>,
  authority: Signer,
  value: u64,
): void {
  data.value = value;
}

export function double(value: u64): u64 {
  return value + value;
}

export function setPair(left: Signer, right: Signer, value: u64): void {
  require(left.key !== right.key, "Same signer");
  log(value);
}
