import {
  cpi,
  type Program,
  type Signer,
  type UncheckedAccount,
  type u64,
} from "@axolotl-sol/core";

export function relay(
  echoProgram: Program,
  data: UncheckedAccount<{ mut: true }>,
  authority: Signer,
  value: u64,
): void {
  cpi({
    program: echoProgram,
    name: "setValue",
    accounts: [
      { account: data, mut: true },
      { account: authority, signer: true },
    ],
    args: [value],
  });
}
