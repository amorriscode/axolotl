/**
 * Borsh helpers for the Anchor IDL subset Axolotl generates.
 * Public keys are base58 strings. `u64` / `i64` / `u128` / `i128` are bigints.
 * `bytes32` is a 32-byte `Uint8Array` on the way in and a trailing-zero-trimmed
 * UTF-8 string on the way out.
 */

export interface IdlField {
  name: string;
  type: IdlType;
}

export type IdlType = string | { array: [string, number] } | { vec: IdlType | string } | { option: IdlType | string } | { defined: { name: string } };

export interface IdlInstruction {
  name: string;
  discriminator: number[];
  accounts?: unknown[];
  args: { name: string; type: IdlType }[];
}

export interface IdlLike {
  address?: string;
  instructions: IdlInstruction[];
  accounts?: { name: string; discriminator: number[] }[];
  types?: { name: string; type: { kind: string; fields?: IdlField[]; variants?: { name: string; fields?: IdlField[] }[] } }[];
  events?: { name: string; discriminator: number[] }[];
  errors?: { code: number; name: string; msg?: string }[];
}

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function encodeBase58(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  if (zeros === bytes.length) return "1".repeat(zeros);
  const digits = [0];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i]!;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j]! << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = "1".repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i--) out += ALPHABET[digits[i]!]!;
  return out;
}

export function decodeBase58(value: string): Uint8Array {
  let zeros = 0;
  while (zeros < value.length && value[zeros] === "1") zeros++;
  if (zeros === value.length) return new Uint8Array(zeros);
  const bytes = [0];
  for (let i = zeros; i < value.length; i++) {
    const code = ALPHABET.indexOf(value[i]!);
    if (code < 0) throw new Error(`invalid base58 character '${value[i]}'`);
    let carry = code;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j]! * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  const out = new Uint8Array(zeros + bytes.length);
  for (let i = 0; i < bytes.length; i++) out[out.length - 1 - i] = bytes[i]!;
  return out;
}

class Writer {
  readonly chunks: Uint8Array[] = [];
  u8(value: number): void { this.bytes(Uint8Array.of(value & 0xff)); }
  u16(value: number): void { this.uint(BigInt(value), 2); }
  u32(value: number): void { this.uint(BigInt(value), 4); }
  uint(value: bigint, size: number): void {
    const out = new Uint8Array(size);
    let current = value;
    const mod = 1n << BigInt(size * 8);
    if (current < 0n) current += mod;
    for (let i = 0; i < size; i++) {
      out[i] = Number(current & 0xffn);
      current >>= 8n;
    }
    this.bytes(out);
  }
  bytes(value: Uint8Array): void { this.chunks.push(value); }
  toUint8Array(): Uint8Array {
    const size = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const out = new Uint8Array(size);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }
}

class Reader {
  offset = 0;
  data: Uint8Array;
  constructor(data: Uint8Array) {
    this.data = data;
  }
  u8(): number { return this.data[this.offset++]!; }
  uint(size: number, signed = false): bigint {
    let value = 0n;
    for (let i = 0; i < size; i++) value |= BigInt(this.data[this.offset++]!) << BigInt(i * 8);
    if (signed) {
      const sign = 1n << BigInt(size * 8 - 1);
      if (value >= sign) value -= 1n << BigInt(size * 8);
    }
    return value;
  }
  bytes(size: number): Uint8Array {
    const out = this.data.subarray(this.offset, this.offset + size);
    this.offset += size;
    return out;
  }
}

const INT_SIZE: Record<string, number> = {
  u8: 1, u16: 2, u32: 4, u64: 8, u128: 16,
  i8: 1, i16: 2, i32: 4, i64: 8, i128: 16,
};

function asBigint(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string") return BigInt(value);
  throw new Error(`expected an integer, got ${typeof value}`);
}

function writeField(writer: Writer, type: IdlType, value: unknown, idl?: IdlLike): void {
  if (typeof type === "object" && "array" in type) {
    const [inner, length] = type.array;
    const bytes = value instanceof Uint8Array ? value : new TextEncoder().encode(String(value));
    const out = new Uint8Array(length);
    out.set(bytes.subarray(0, length));
    if (inner !== "u8") throw new Error(`unsupported array element ${inner}`);
    writer.bytes(out);
    return;
  }
  if (typeof type === "object" && type && "option" in type) {
    if (value === null || value === undefined) writer.u8(0);
    else {
      writer.u8(1);
      writeField(writer, type.option, value, idl);
    }
    return;
  }
  if (typeof type === "object" && type && "vec" in type) {
    if (!Array.isArray(value)) throw new Error("vec argument must be an array");
    writer.u32(value.length);
    for (const item of value) writeField(writer, type.vec, item, idl);
    return;
  }
  if (typeof type === "object" && type && "defined" in type) {
    const defined = idl?.types?.find((item) => item.name === type.defined.name);
    if (defined?.type.kind !== "enum") throw new Error(`Unknown enum ${type.defined.name}`);
    const kind = typeof value === "string" ? value : (value as { kind?: string }).kind;
    const index = defined.type.variants?.findIndex((variant) => variant.name === kind) ?? -1;
    if (index < 0) throw new Error(`Unknown variant ${String(kind)}`);
    writer.u8(index);
    const variant = defined.type.variants?.[index];
    if (variant?.fields && value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      for (const field of variant.fields) writeField(writer, field.type, record[field.name], idl);
    }
    return;
  }
  if (typeof type !== "string") throw new Error(`unsupported IDL type ${JSON.stringify(type)}`);
  if (type === "bool") {
    writer.u8(value ? 1 : 0);
    return;
  }
  if (type === "string") {
    const bytes = new TextEncoder().encode(String(value));
    writer.u32(bytes.length);
    writer.bytes(bytes);
    return;
  }
  if (type === "pubkey") {
    const bytes = typeof value === "string" ? decodeBase58(value) : value as Uint8Array;
    if (bytes.length !== 32) throw new Error("pubkey must be 32 bytes");
    writer.bytes(bytes);
    return;
  }
  const size = INT_SIZE[type];
  if (!size) throw new Error(`unsupported IDL type ${type}`);
  const signed = type.startsWith("i");
  let numberValue = asBigint(value);
  if (signed && numberValue < 0n) {
    /* encoded by writer.uint */
  }
  if (size <= 4 && !signed) writer.uint(numberValue, size);
  else writer.uint(numberValue, size);
}

function readField(reader: Reader, type: IdlType, idl?: IdlLike): unknown {
  if (typeof type === "object" && type && "option" in type) {
    if (reader.u8() === 0) return null;
    return readField(reader, type.option, idl);
  }
  if (typeof type === "object" && type && "vec" in type && !("array" in type)) {
    const length = Number(reader.uint(4));
    const items = [];
    for (let i = 0; i < length; i++) items.push(readField(reader, type.vec, idl));
    return items;
  }
  if (typeof type === "object" && type && "defined" in type) {
    const defined = idl?.types?.find((item) => item.name === type.defined.name);
    if (!defined) throw new Error(`Unknown type ${type.defined.name}`);
    if (defined.type.kind === "enum") {
      const index = reader.u8();
      const variant = defined.type.variants?.[index];
      if (!variant) return index;
      if (!variant.fields?.length) return variant.name;
      const record: Record<string, unknown> = { kind: variant.name };
      for (const field of variant.fields) record[field.name] = readField(reader, field.type, idl);
      return record;
    }
    const result: Record<string, unknown> = {};
    for (const field of defined.type.fields ?? []) result[field.name] = readField(reader, field.type, idl);
    return result;
  }
  if (typeof type === "object" && "array" in type) {
    const bytes = reader.bytes(type.array[1]);
    let end = bytes.length;
    while (end > 0 && bytes[end - 1] === 0) end--;
    return new TextDecoder().decode(bytes.subarray(0, end));
  }
  if (typeof type !== "string") throw new Error(`unsupported IDL type ${JSON.stringify(type)}`);
  if (type === "bool") return reader.u8() !== 0;
  if (type === "string") {
    const length = Number(reader.uint(4));
    return new TextDecoder().decode(reader.bytes(length));
  }
  if (type === "pubkey") return encodeBase58(reader.bytes(32));
  const size = INT_SIZE[type];
  if (!size) throw new Error(`unsupported IDL type ${type}`);
  const signed = type.startsWith("i");
  const value = reader.uint(size, signed);
  if (size <= 4 && !signed) return Number(value);
  if (size <= 2 && signed) return Number(value);
  if ((type === "u32" || type === "i32") && value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER)) {
    return type === "u32" ? Number(value) : Number(value);
  }
  if (size <= 4) return Number(value);
  return value;
}

export function encodeInstruction(idl: IdlLike, name: string, args: Record<string, unknown> = {}): Uint8Array {
  const instruction = idl.instructions.find((item) => item.name === name);
  if (!instruction) throw new Error(`Unknown instruction "${name}".`);
  const writer = new Writer();
  writer.bytes(Uint8Array.from(instruction.discriminator));
  for (const arg of instruction.args) {
    if (!(arg.name in args)) throw new Error(`Missing argument "${arg.name}" for ${name}.`);
    writeField(writer, arg.type, args[arg.name], idl);
  }
  return writer.toUint8Array();
}

export function decodeAccount(idl: IdlLike, account: string, data: Uint8Array): Record<string, unknown> {
  const defined = idl.types?.find((item) => item.name === account);
  const discriminator = idl.accounts?.find((item) => item.name === account)?.discriminator;
  if (!defined) throw new Error(`Unknown account type "${account}".`);
  const reader = new Reader(data);
  if (discriminator) {
    const got = [...reader.bytes(discriminator.length)];
    if (got.some((byte, index) => byte !== discriminator[index])) {
      throw new Error(`Account discriminator mismatch for ${account}.`);
    }
  }
  const result: Record<string, unknown> = {};
  for (const field of defined.type.fields ?? []) result[field.name] = readField(reader, field.type, idl);
  return result;
}

export function decodeEvent(idl: IdlLike, data: Uint8Array): { name: string; data: Record<string, unknown> } | null {
  if (!idl.events || data.length < 8) return null;
  const prefix = [...data.subarray(0, 8)];
  const event = idl.events.find((item) => item.discriminator.every((byte, index) => byte === prefix[index]));
  if (!event) return null;
  const defined = idl.types?.find((item) => item.name === event.name);
  if (!defined) return null;
  const reader = new Reader(data.subarray(8));
  const decoded: Record<string, unknown> = {};
  for (const field of defined.type.fields ?? []) decoded[field.name] = readField(reader, field.type, idl);
  return { name: event.name, data: decoded };
}

/** Anchor prints `emit!` events as `Program data: <base64>`. */
export function decodeEventLogs(idl: IdlLike, logs: string[]): { name: string; data: Record<string, unknown> }[] {
  const events = [];
  for (const line of logs) {
    const marker = "Program data: ";
    const at = line.indexOf(marker);
    if (at < 0) continue;
    const bytes = Uint8Array.from(atob(line.slice(at + marker.length).trim()), (char) => char.charCodeAt(0));
    const decoded = decodeEvent(idl, bytes);
    if (decoded) events.push(decoded);
  }
  return events;
}

/**
 * `sha256("anchor:event")[..8]`, little-endian. Anchor 1.2 `emit_cpi!` prefixes
 * the self-CPI instruction with this tag and does not call `sol_log_data`.
 */
export const EVENT_IX_TAG = Uint8Array.from([0xe4, 0x45, 0xa5, 0x2e, 0x51, 0xcb, 0x9a, 0x1d]);

/** Decode events carried in `emit_cpi!` self-CPI instruction data. */
export function decodeEventInstructions(idl: IdlLike, instructions: Uint8Array[]): { name: string; data: Record<string, unknown> }[] {
  const events = [];
  for (const data of instructions) {
    if (data.length < EVENT_IX_TAG.length + 8) continue;
    if (EVENT_IX_TAG.some((byte, index) => data[index] !== byte)) continue;
    const decoded = decodeEvent(idl, data.subarray(EVENT_IX_TAG.length));
    if (decoded) events.push(decoded);
  }
  return events;
}
