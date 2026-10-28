import type { Scalar } from "./model.ts";

const RUST_KEYWORDS = new Set([
  "as", "async", "await", "break", "const", "continue", "crate", "dyn", "else", "enum",
  "extern", "false", "fn", "for", "if", "impl", "in", "let", "loop", "match", "mod",
  "move", "mut", "pub", "ref", "return", "self", "Self", "static", "struct", "super",
  "trait", "true", "type", "unsafe", "use", "where", "while", "abstract", "become",
  "box", "do", "final", "macro", "override", "priv", "typeof", "unsized", "virtual",
  "yield", "try", "gen",
]);

export function snake(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();
}

export function isRustKeyword(name: string): boolean {
  return RUST_KEYWORDS.has(name);
}

export function variantName(message: string): string {
  const words = message.replace(/[^A-Za-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  let name = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join("");
  if (!name) name = "Error";
  if (/^[0-9]/.test(name)) name = `E${name}`;
  if (isRustKeyword(name)) name = `${name}Error`;
  return name;
}

const BIGINT_SCALARS = new Set<Scalar>(["u64", "u128", "i64", "i128"]);
const SIGNED = new Set<Scalar>(["i8", "i16", "i32", "i64", "i128"]);

export function isBigintScalar(ty: Scalar): boolean {
  return BIGINT_SCALARS.has(ty);
}

export function isSigned(ty: Scalar): boolean {
  return SIGNED.has(ty);
}

export function isInteger(ty: Scalar): boolean {
  return ty !== "bool" && ty !== "string" && ty !== "pubkey" && ty !== "bytes32";
}

const RANGES: Record<string, [bigint, bigint]> = {
  u8: [0n, 255n],
  u16: [0n, 65535n],
  u32: [0n, 4294967295n],
  u64: [0n, 18446744073709551615n],
  u128: [0n, 340282366920938463463374607431768211455n],
  i8: [-128n, 127n],
  i16: [-32768n, 32767n],
  i32: [-2147483648n, 2147483647n],
  i64: [-9223372036854775808n, 9223372036854775807n],
  i128: [
    -170141183460469231731687303715884105728n,
    170141183460469231731687303715884105727n,
  ],
};

export function fits(value: bigint, ty: Scalar): boolean {
  const range = RANGES[ty];
  if (!range) return false;
  return value >= range[0] && value <= range[1];
}

export function rustLiteral(value: bigint, ty: Scalar): string {
  return `${value}${ty}`;
}

export function rustType(ty: Scalar): string {
  if (ty === "pubkey") return "Pubkey";
  if (ty === "string") return "String";
  if (ty === "bytes32") return "[u8; 32]";
  if (ty === "bool") return "bool";
  return ty;
}

export function idlType(ty: Scalar): string | { array: ["u8", number] } {
  if (ty === "bytes32") return { array: ["u8", 32] };
  return ty;
}

export function rustString(value: string): string {
  return JSON.stringify(value);
}

export function rustByteStr(value: string): string {
  const bytes = new TextEncoder().encode(value);
  if ([...value].every((ch) => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) < 127 && ch !== '"' && ch !== "\\")) {
    return `b${JSON.stringify(value)}`;
  }
  return `&[${[...bytes].map((byte) => `${byte}u8`).join(", ")}][..]`;
}

export function accountSpace(fields: { ty: Scalar }[]): number {
  return fields.reduce((sum, field) => {
    if (field.ty === "string") throw new Error("string fields have no static size");
    const size = field.ty === "bytes32" ? 32 : field.ty === "pubkey" ? 32 : field.ty === "bool" ? 1 : (
      { u8: 1, i8: 1, u16: 2, i16: 2, u32: 4, i32: 4, u64: 8, i64: 8, u128: 16, i128: 16 } as Record<string, number>
    )[field.ty];
    if (!size) throw new Error(`no size for ${field.ty}`);
    return sum + size;
  }, 0);
}

export const RESERVED_STRUCTS = new Set([
  "Mint", "TokenAccount", "TokenInterface", "System", "Clock", "Rent", "Signer",
  "Account", "Pubkey", "Interface", "UncheckedAccount", "SystemAccount", "Program",
  "AxolotlError", "Transfer", "TransferChecked",
]);

export const BUILTIN_SCALARS = new Set<string>([
  "u8", "u16", "u32", "u64", "u128", "i8", "i16", "i32", "i64", "i128",
  "bool", "boolean", "string", "Pubkey", "bytes32",
]);
