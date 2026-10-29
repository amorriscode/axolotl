/** Public program id of the counter example. Not a secret. */
export const PROGRAM_ID = "8qUgK4vi5mPRKpGfTVto7FpWyBjNgfB6U6opToXWM585";

export const SAMPLE = `import {
  require,
  type Account,
  type Pubkey,
  type Signer,
  type SystemProgram,
  type u64,
} from "@axolotl-sol/core";

export interface Counter {
  authority: Pubkey;
  count: u64;
}

export function initialize(
  counter: Account<Counter, { init: true; payer: "authority" }>,
  authority: Signer<{ mut: true }>,
  systemProgram: SystemProgram,
): void {
  counter.authority = authority.key;
  counter.count = 0n;
}

export function increment(
  counter: Account<Counter, { mut: true; hasOne: ["authority"] }>,
  authority: Signer,
): void {
  require(authority.key === counter.authority, "Unauthorized");
  counter.count = counter.count + 1n;
}
`;

export function sliceFunction(rust: string, name: string): string {
  const marker = `fn ${name}(`;
  const start = rust.indexOf(marker);
  if (start < 0) return rust.trim();
  const lineStart = rust.lastIndexOf("\n", start) + 1;
  const implClose = rust.indexOf("\n}\n", start);
  const nextAttr = rust.indexOf("\n#[", start);
  const candidates = [implClose, nextAttr].filter((index) => index > start);
  const end = candidates.length ? Math.min(...candidates) : rust.length;
  return rust.slice(lineStart, end).trim();
}
