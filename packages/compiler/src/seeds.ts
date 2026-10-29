/**
 * One description of a PDA seed.
 *
 * The account attribute inlines `inline`. A CPI signer binds `bind` when a
 * temporary would otherwise die before `invoke_signed`, then uses `read`.
 */

import type { SeedModel } from "./model.ts";
import { rustByteStr, snake } from "./util.ts";

export interface SeedBytes {
  /** `&[u8]` expression. Safe inside `seeds = [...]`. */
  inline: string;
  /** Right-hand side of a `let` that must outlive the signer seed array. */
  bind?: string;
  /** Type written on that `let`, when the expression is not inferred as we want. */
  bindTy?: string;
  /** How the signer array borrows the binding. Defaults to the binding itself. */
  read: (local: string) => string;
}

export function seedBytes(
  seed: SeedModel,
  resolve: {
    accountKey: (name: string) => string;
    arg: (name: string) => { name: string; ty: string };
  },
): SeedBytes {
  if (seed.kind === "const") {
    const inline = rustByteStr(seed.value);
    if (inline.startsWith("b")) return { inline, read: () => inline };
    return { inline, bind: inline, bindTy: "&[u8]", read: (local) => local };
  }
  if (seed.kind === "account") {
    const key = resolve.accountKey(seed.name);
    return { inline: `${key}.as_ref()`, bind: key, read: (local) => `${local}.as_ref()` };
  }
  const arg = resolve.arg(seed.name);
  const name = arg.name || snake(seed.name);
  const ty = arg.ty;
  if (ty === "pubkey") {
    return { inline: `${name}.as_ref()`, bind: name, read: (local) => `${local}.as_ref()` };
  }
  if (ty === "string") return { inline: `${name}.as_bytes()`, read: () => `${name}.as_bytes()` };
  if (ty === "bytes32") return { inline: `${name}.as_ref()`, read: () => `${name}.as_ref()` };
  if (ty === "u8" || ty === "i8" || ty === "bool") {
    return {
      inline: `&[${name} as u8]`,
      bind: `[${name} as u8]`,
      read: (local) => `&${local}[..]`,
    };
  }
  return {
    inline: `${name}.to_le_bytes().as_ref()`,
    bind: `${name}.to_le_bytes()`,
    read: (local) => `${local}.as_ref()`,
  };
}
