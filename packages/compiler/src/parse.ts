import ts from "typescript";
import { Diagnostics, locOf, type Loc } from "./diagnostics.ts";
import type {
  AccountKind,
  AccountOpts,
  AccountParam,
  ArgParam,
  EnumModel,
  FieldModel,
  FieldTy,
  Param,
  Scalar,
  SeedModel,
  StructModel,
} from "./model.ts";
import { BUILTIN_SCALARS, RESERVED_STRUCTS, isRustKeyword, snake } from "./util.ts";

export interface ParsedInstruction {
  name: string;
  rustName: string;
  params: Param[];
  returnType?: Scalar;
  loc: Loc;
  file: string;
  sourceFile: ts.SourceFile;
  body: ts.Block;
}

export interface ParsedHelper {
  name: string;
  rustName: string;
  params: { name: string; rustName: string; ty: Scalar; loc: Loc }[];
  returnType?: Scalar;
  loc: Loc;
  file: string;
  sourceFile: ts.SourceFile;
  body: ts.Block;
}

export interface ParsedProgram {
  structs: StructModel[];
  enums: EnumModel[];
  helpers: ParsedHelper[];
  instructions: ParsedInstruction[];
}

const ACCOUNT_WRAPPERS = new Set(["Account"]);
const SIMPLE_ACCOUNTS: Record<string, AccountKind> = {
  Signer: "signer",
  SystemProgram: "system",
  TokenProgram: "tokenProgram",
  UncheckedAccount: "unchecked",
  SystemAccount: "systemAccount",
  Clock: "clock",
  Rent: "rent",
  Program: "program",
  TokenAccount: "tokenAccount",
  Mint: "mint",
  Token2022Program: "token2022",
  AssociatedTokenProgram: "associatedToken",
  RemainingAccounts: "remaining",
  Instructions: "instructions",
  EpochSchedule: "epochSchedule",
  SlotHashes: "slotHashes",
  StakeHistory: "stakeHistory",
};

function entityName(name: ts.EntityName | ts.Expression): string {
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isQualifiedName(name)) return name.right.text;
  if (ts.isPropertyAccessExpression(name)) return name.name.text;
  return "";
}

function scalarOf(name: string): Scalar | null {
  if (name === "boolean" || name === "bool") return "bool";
  if (name === "string") return "string";
  if (name === "Pubkey") return "pubkey";
  if (name === "bytes32") return "bytes32";
  if (BUILTIN_SCALARS.has(name) && name !== "boolean") return name as Scalar;
  return null;
}

function emptyOpts(): AccountOpts {
  return { mut: false, init: false, initIfNeeded: false, seeds: [], bump: false, hasOne: [], optional: false };
}

export function parseSources(
  files: { filename: string; source: string }[],
  diag: Diagnostics,
): ParsedProgram {
  const structs: StructModel[] = [];
  const enums: EnumModel[] = [];
  const helpers: ParsedHelper[] = [];
  const instructions: ParsedInstruction[] = [];
  const structNames = new Set<string>();
  const enumNames = new Set<string>();
  const sources = files.map((file) => ts.createSourceFile(file.filename, file.source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS));
  for (const sf of sources) {
    for (const statement of sf.statements) {
      if (ts.isEnumDeclaration(statement)) enumNames.add(statement.name.text);
    }
  }

  for (const sf of sources) {
    for (const statement of sf.statements) {
      if (ts.isImportDeclaration(statement)) {
        const spec = (statement.moduleSpecifier as ts.StringLiteral).text;
        if (spec !== "@axolotl-sol/core" && !spec.startsWith(".")) {
          diag.errorAt(sf, statement, `Only "@axolotl-sol/core" and relative imports are allowed (got "${spec}").`);
        }
        continue;
      }
      if (ts.isEnumDeclaration(statement)) {
        const parsed = parseEnum(sf, statement, diag);
        if (parsed) enums.push(parsed);
        continue;
      }
      if (ts.isInterfaceDeclaration(statement)) {
        const parsed = parseInterface(sf, statement, diag, enumNames);
        if (!parsed) continue;
        if (structNames.has(parsed.name)) {
          diag.errorAt(sf, statement, `Duplicate type "${parsed.name}".`);
          continue;
        }
        if (RESERVED_STRUCTS.has(parsed.name)) {
          diag.errorAt(sf, statement, `"${parsed.name}" is reserved by Axolotl.`);
          continue;
        }
        structNames.add(parsed.name);
        structs.push(parsed);
        continue;
      }
      if (ts.isFunctionDeclaration(statement)) {
        const exported = statement.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword);
        if (exported) {
          const parsed = parseFunction(sf, statement, diag);
          if (parsed) instructions.push(parsed);
        } else {
          const helper = parseHelper(sf, statement, diag);
          if (helper) helpers.push(helper);
        }
        continue;
      }
      if (ts.isEmptyStatement(statement)) continue;
      if (statement.kind === ts.SyntaxKind.EndOfFileToken) continue;
      diag.errorAt(
        sf,
        statement,
        "Unsupported top-level statement. Axolotl files contain imports, interfaces, and exported instruction functions.",
      );
    }
  }

  if (instructions.length === 0) {
    const file = files[0]?.filename ?? "program.ts";
    diag.error(file, 1, 1, "No instruction functions found. Export at least one function.");
  }

  const rustNames = new Map<string, string>();
  for (const ix of instructions) {
    const prev = rustNames.get(ix.rustName);
    if (prev) diag.error(ix.file, ix.loc.line, ix.loc.column, `"${ix.name}" and "${prev}" lower to the same Rust name "${ix.rustName}".`);
    rustNames.set(ix.rustName, ix.name);
  }

  for (const ix of instructions) {
    for (const param of ix.params) {
      if (param.kind === "account" && param.accountKind === "user") {
        const found = structs.find((item) => item.name === param.accountType);
        if (!found) {
          diag.error(ix.file, param.loc.line, param.loc.column, `Unknown account type "${param.accountType}". Declare it as an interface.`);
        } else if (found.kind === "event") {
          diag.error(ix.file, param.loc.line, param.loc.column, `"${param.accountType}" is an event, not an account.`);
        } else {
          found.kind = "account";
        }
      }
    }
  }

  return { structs, enums, helpers, instructions };
}

function parseEnum(sf: ts.SourceFile, node: ts.EnumDeclaration, diag: Diagnostics): EnumModel | null {
  const variants = [];
  for (const member of node.members) {
    if (!ts.isIdentifier(member.name) || member.initializer) {
      diag.errorAt(sf, member, "Enums must be unit variants with no explicit values.");
      continue;
    }
    variants.push({ name: member.name.text, rustName: member.name.text });
  }
  return { name: node.name.text, variants, loc: locOf(sf, node) };
}

function parseInterface(sf: ts.SourceFile, node: ts.InterfaceDeclaration, diag: Diagnostics, enumNames: Set<string>): StructModel | null {
  const heritageNames = node.heritageClauses?.flatMap((clause) => clause.types.map((heritage) => entityName(heritage.expression))) ?? [];
  const isEvent = heritageNames.includes("Event");
  const zeroCopy = heritageNames.includes("ZeroCopy");
  if (heritageNames.some((name) => name !== "Event" && name !== "ZeroCopy")) {
    diag.errorAt(sf, node, "Interfaces may only extend Event or ZeroCopy.");
  }
  const fields: FieldModel[] = [];
  const seen = new Set<string>();
  for (const member of node.members) {
    if (!ts.isPropertySignature(member) || !member.name || !ts.isIdentifier(member.name) || !member.type) {
      diag.errorAt(sf, member, "Account and event fields must be `name: type` properties.");
      continue;
    }
    const name = member.name.text;
    const rustName = snake(name);
    if (isRustKeyword(rustName)) {
      diag.errorAt(sf, member, `Field "${name}" lowers to the Rust keyword "${rustName}". Rename it.`);
      continue;
    }
    if (seen.has(rustName)) {
      diag.errorAt(sf, member, `Field "${name}" collides with another field when converted to snake_case.`);
      continue;
    }
    seen.add(rustName);
    const ty = fieldType(sf, member.type, diag, !isEvent, enumNames);
    if (!ty) continue;
    if (zeroCopy && typeof ty !== "string") {
      diag.errorAt(sf, member, "Zero-copy accounts only support integer, bool, Pubkey, and bytes32 fields.");
      continue;
    }
    fields.push({ name, rustName, ty, loc: locOf(sf, member) });
  }
  return {
    name: node.name.text,
    kind: isEvent ? "event" : "struct",
    zeroCopy,
    fields,
    loc: locOf(sf, node),
    file: sf.fileName,
  };
}

function fieldType(sf: ts.SourceFile, node: ts.TypeNode, diag: Diagnostics, inAccount: boolean, enumNames: Set<string>): FieldTy | null {
  let name = "";
  if (node.kind === ts.SyntaxKind.StringKeyword) name = "string";
  else if (node.kind === ts.SyntaxKind.BooleanKeyword) name = "bool";
  else if (node.kind === ts.SyntaxKind.NumberKeyword) {
    diag.errorAt(sf, node, "Use an explicit integer type (u8, u32, u64, i64, …) instead of `number`.");
    return null;
  } else if (ts.isTypeReferenceNode(node)) name = entityName(node.typeName);
  else {
    diag.errorAt(sf, node, "Unsupported field type.");
    return null;
  }
  if (ts.isTypeReferenceNode(node) && (name === "Vec" || name === "Str") && node.typeArguments?.length) {
    if (name === "Str") {
      const max = literalNumber(node.typeArguments[0]);
      if (max === null) diag.errorAt(sf, node, "Str<N> needs a numeric length, for example Str<32>.");
      return max === null ? null : { kind: "str", max };
    }
    const innerName = ts.isTypeReferenceNode(node.typeArguments[0]!) ? entityName(node.typeArguments[0].typeName) : "";
    const inner = scalarOf(innerName);
    const max = node.typeArguments[1] ? literalNumber(node.typeArguments[1]) : null;
    if (!inner || inner === "string" || max === null) {
      diag.errorAt(sf, node, "Vec<T, N> needs a scalar element type and a maximum length, for example Vec<u64, 4>.");
      return null;
    }
    return { kind: "vec", inner, max };
  }
  const scalar = scalarOf(name);
  if (scalar) {
    if (inAccount && scalar === "string") {
      diag.errorAt(sf, node, "Account fields cannot be unbounded strings. Use Str<N>, bytes32, or pass a string as an instruction argument.");
      return null;
    }
    return scalar;
  }
  if (enumNames.has(name)) return { kind: "enum", name };
  if (name) return { kind: "struct", name };
  diag.errorAt(sf, node, "Unsupported field type.");
  return null;
}

function literalNumber(node: ts.TypeNode | undefined): number | null {
  if (!node || !ts.isLiteralTypeNode(node) || !ts.isNumericLiteral(node.literal)) return null;
  return Number(node.literal.text);
}

function parseHelper(sf: ts.SourceFile, node: ts.FunctionDeclaration, diag: Diagnostics): ParsedHelper | null {
  if (!node.name || !node.body) {
    diag.errorAt(sf, node, "Helper functions must be named and have a body.");
    return null;
  }
  const rustName = snake(node.name.text);
  const params = [];
  for (const param of node.parameters) {
    if (!ts.isIdentifier(param.name) || !param.type) {
      diag.errorAt(sf, param, "Helper parameters must be named scalars.");
      continue;
    }
    const ty = annotatedScalarName(param.type);
    if (!ty) {
      diag.errorAt(sf, param, "Helpers can only take scalar arguments.");
      continue;
    }
    params.push({ name: param.name.text, rustName: snake(param.name.text), ty, loc: locOf(sf, param) });
  }
  const returnType = node.type && node.type.kind !== ts.SyntaxKind.VoidKeyword ? annotatedScalarName(node.type) : undefined;
  if (node.type && node.type.kind !== ts.SyntaxKind.VoidKeyword && !returnType) {
    diag.errorAt(sf, node.type, "Helper return types must be scalars.");
  }
  return {
    name: node.name.text,
    rustName,
    params,
    returnType: returnType ?? undefined,
    loc: locOf(sf, node),
    file: sf.fileName,
    sourceFile: sf,
    body: node.body,
  };
}

function annotatedScalarName(node: ts.TypeNode): Scalar | null {
  if (node.kind === ts.SyntaxKind.StringKeyword) return "string";
  if (node.kind === ts.SyntaxKind.BooleanKeyword) return "bool";
  if (!ts.isTypeReferenceNode(node)) return null;
  return scalarOf(entityName(node.typeName));
}

function parseFunction(sf: ts.SourceFile, node: ts.FunctionDeclaration, diag: Diagnostics): ParsedInstruction | null {
  const exported = node.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword);
  if (!node.name) {
    diag.errorAt(sf, node, "Instruction functions must be named.");
    return null;
  }
  if (!exported) {
    diag.errorAt(sf, node, `Function "${node.name.text}" is not exported. Exported functions become program instructions; nested helpers are not supported.`);
    return null;
  }
  if (!node.body) {
    diag.errorAt(sf, node, "Instruction functions need a body.");
    return null;
  }
  const rustName = snake(node.name.text);
  if (isRustKeyword(rustName)) {
    diag.errorAt(sf, node.name, `"${node.name.text}" lowers to the Rust keyword "${rustName}". Rename it.`);
    return null;
  }
  const params: Param[] = [];
  const seen = new Set<string>();
  for (const param of node.parameters) {
    if (!ts.isIdentifier(param.name)) {
      diag.errorAt(sf, param, "Destructured parameters are not supported.");
      continue;
    }
    if (!param.type) {
      diag.errorAt(sf, param, `Parameter "${param.name.text}" needs a type annotation.`);
      continue;
    }
    const parsed = parseParam(sf, param.name.text, param.type, diag);
    if (!parsed) continue;
    if (seen.has(parsed.rustName)) {
      diag.errorAt(sf, param, `"${param.name.text}" collides with another parameter in snake_case.`);
      continue;
    }
    seen.add(parsed.rustName);
    params.push(parsed);
  }
  const returnType = node.type && node.type.kind !== ts.SyntaxKind.VoidKeyword ? annotatedScalarName(node.type) : undefined;
  if (node.type && node.type.kind !== ts.SyntaxKind.VoidKeyword && !returnType) {
    diag.errorAt(sf, node.type, "Instruction return types must be scalars. Use `void` for no return data.");
  }
  return {
    name: node.name.text,
    rustName,
    params,
    returnType: returnType ?? undefined,
    loc: locOf(sf, node),
    file: sf.fileName,
    sourceFile: sf,
    body: node.body,
  };
}

function parseParam(sf: ts.SourceFile, name: string, typeNode: ts.TypeNode, diag: Diagnostics): Param | null {
  const rustName = snake(name);
  if (isRustKeyword(rustName)) {
    diag.errorAt(sf, typeNode, `Parameter "${name}" lowers to the Rust keyword "${rustName}". Rename it.`);
    return null;
  }
  const loc = locOf(sf, typeNode);
  if (typeNode.kind === ts.SyntaxKind.StringKeyword || typeNode.kind === ts.SyntaxKind.BooleanKeyword || typeNode.kind === ts.SyntaxKind.NumberKeyword || ts.isTypeReferenceNode(typeNode)) {
    const typeName = typeNode.kind === ts.SyntaxKind.StringKeyword
      ? "string"
      : typeNode.kind === ts.SyntaxKind.BooleanKeyword
        ? "bool"
        : typeNode.kind === ts.SyntaxKind.NumberKeyword
          ? "number"
          : entityName((typeNode as ts.TypeReferenceNode).typeName);
    if (typeName === "number") {
      diag.errorAt(sf, typeNode, `Parameter "${name}" uses \`number\`. Use u8, u16, u32, u64, i64, or another explicit integer type.`);
      return null;
    }
    const scalar = scalarOf(typeName);
    if (scalar) {
      return { kind: "arg", name, rustName, ty: scalar, loc };
    }
    if (SIMPLE_ACCOUNTS[typeName]) {
      const opts = readWrapperOpts(sf, typeNode, diag);
      return accountParam(name, rustName, SIMPLE_ACCOUNTS[typeName]!, undefined, opts, loc);
    }
    if (typeName === "Account" && ts.isTypeReferenceNode(typeNode)) {
      const args = typeNode.typeArguments ?? [];
      if (args.length < 1 || args.length > 2) {
        diag.errorAt(sf, typeNode, "Account<T> or Account<T, { ...constraints }> expected.");
        return null;
      }
      const inner = args[0]!;
      const innerName = ts.isTypeReferenceNode(inner) ? entityName(inner.typeName) : "";
      const opts = args[1] ? readOptsNode(sf, args[1], diag) : emptyOpts();
      if (innerName === "TokenAccount" || innerName === "Mint") {
        return accountParam(name, rustName, innerName === "Mint" ? "mint" : "tokenAccount", undefined, opts, loc);
      }
      if (!innerName) {
        diag.errorAt(sf, inner, "Account type argument must be an interface name, TokenAccount, or Mint.");
        return null;
      }
      return accountParam(name, rustName, "user", innerName, opts, loc);
    }
  }
  diag.errorAt(sf, typeNode, `Unsupported parameter type for "${name}".`);
  return null;
}

function accountParam(
  name: string,
  rustName: string,
  accountKind: AccountKind,
  accountType: string | undefined,
  opts: AccountOpts,
  loc: Loc,
): AccountParam {
  return { kind: "account", name, rustName, accountKind, accountType, opts, loc };
}

function readWrapperOpts(sf: ts.SourceFile, node: ts.TypeNode, diag: Diagnostics): AccountOpts {
  if (!ts.isTypeReferenceNode(node) || !node.typeArguments || node.typeArguments.length === 0) return emptyOpts();
  if (node.typeArguments.length > 1) {
    diag.errorAt(sf, node, "This account type accepts at most one options argument.");
    return emptyOpts();
  }
  return readOptsNode(sf, node.typeArguments[0]!, diag);
}

function readOptsNode(sf: ts.SourceFile, node: ts.TypeNode, diag: Diagnostics): AccountOpts {
  if (!ts.isTypeLiteralNode(node)) {
    diag.errorAt(sf, node, "Account options must be a type literal, for example `{ mut: true; seeds: [\"vault\"]; bump: true }`.");
    return emptyOpts();
  }
  const opts = emptyOpts();
  for (const member of node.members) {
    if (!ts.isPropertySignature(member) || !member.name || !ts.isIdentifier(member.name) || !member.type) {
      diag.errorAt(sf, member, "Invalid account option.");
      continue;
    }
    const key = member.name.text;
    const value = member.type;
    switch (key) {
      case "mut":
      case "init":
      case "initIfNeeded":
      case "bump": {
        const flag = readBool(value);
        if (flag === null) diag.errorAt(sf, value, `\`${key}\` must be the literal type \`true\` or \`false\`.`);
        else opts[key] = flag;
        break;
      }
      case "payer":
      case "close": {
        const text = readString(value);
        if (text === null) diag.errorAt(sf, value, `\`${key}\` must be a string literal type.`);
        else opts[key] = text;
        break;
      }
      case "hasOne":
        opts.hasOne = readStringTuple(sf, value, diag);
        break;
      case "seeds":
        opts.seeds = readSeeds(sf, value, diag);
        break;
      case "optional": {
        const flag = readBool(value);
        if (flag === null) diag.errorAt(sf, value, "`optional` must be `true` or `false`.");
        else opts.optional = flag;
        break;
      }
      case "realloc": {
        if (!ts.isLiteralTypeNode(value) || !ts.isNumericLiteral(value.literal)) {
          diag.errorAt(sf, value, "`realloc` must be a numeric byte length, for example `realloc: 128`.");
        } else opts.realloc = Number(value.literal.text);
        break;
      }
      default:
        diag.errorAt(sf, member, `Unknown account option "${key}".`);
    }
  }
  return opts;
}

function readBool(node: ts.TypeNode): boolean | null {
  if (!ts.isLiteralTypeNode(node)) return null;
  if (node.literal.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.literal.kind === ts.SyntaxKind.FalseKeyword) return false;
  return null;
}

function readString(node: ts.TypeNode): string | null {
  if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)) return node.literal.text;
  return null;
}

function readStringTuple(sf: ts.SourceFile, node: ts.TypeNode, diag: Diagnostics): string[] {
  if (!ts.isTupleTypeNode(node)) {
    diag.errorAt(sf, node, "Expected a tuple of string literal types.");
    return [];
  }
  const values: string[] = [];
  for (const element of node.elements) {
    const text = readString(element);
    if (text === null) diag.errorAt(sf, element, "Expected a string literal type.");
    else values.push(text);
  }
  return values;
}

function readSeeds(sf: ts.SourceFile, node: ts.TypeNode, diag: Diagnostics): SeedModel[] {
  if (!ts.isTupleTypeNode(node)) {
    diag.errorAt(sf, node, "seeds must be a tuple type, for example `[\"profile\", { account: \"user\" }]`.");
    return [];
  }
  const seeds: SeedModel[] = [];
  for (const element of node.elements) {
    const text = readString(element);
    if (text !== null) {
      seeds.push({ kind: "const", value: text });
      continue;
    }
    if (ts.isTypeLiteralNode(element) && element.members.length === 1) {
      const member = element.members[0]!;
      if (ts.isPropertySignature(member) && member.name && ts.isIdentifier(member.name) && member.type) {
        const key = member.name.text;
        const value = readString(member.type);
        if ((key === "account" || key === "arg") && value !== null) {
          seeds.push(key === "account" ? { kind: "account", name: value } : { kind: "arg", name: value });
          continue;
        }
      }
    }
    diag.errorAt(sf, element, "A seed must be a string literal, `{ account: \"name\" }`, or `{ arg: \"name\" }`.");
  }
  return seeds;
}
