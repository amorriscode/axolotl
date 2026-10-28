import {
  type Account,
  type Signer,
  type SystemProgram,
  type u64,
} from "@axolotl-sol/core";

export interface EchoData {
  value: u64;
}

export function initialize(
  data: Account<EchoData, { init: true; payer: "user" }>,
  user: Signer<{ mut: true }>,
  systemProgram: SystemProgram,
): void {
  data.value = 0n;
}

export function setValue(
  data: Account<EchoData, { mut: true }>,
  value: u64,
): void {
  data.value = value;
}
