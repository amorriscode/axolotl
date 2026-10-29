/**
 * Lowers a parsed program to an intermediate model.
 *
 * This pass may know Axolotl's statement language and which accounts must sign.
 * It may not print Rust. `print.ts` does that.
 */

import ts from "typescript";
import { Diagnostics, locOf, type Loc } from "./diagnostics.ts";
import type { IrExpr } from "./ir.ts";
import { renderExpr, renderStmt } from "./print.ts";
import type {
  AccountParam,
  ArgParam,
  ErrorModel,
  FieldTy,
  HelperModel,
  InstructionModel,
  Param,
  ProgramModel,
  Scalar,
  SeedModel,
  Stmt,
  StructModel,
} from "./model.ts";
import type { ParsedHelper, ParsedInstruction, ParsedProgram } from "./parse.ts";
import { discriminator, isPubkey } from "./codec.ts";
import { fits, isInteger, isRustKeyword, rustByteStr, rustLiteral, rustString, snake, variantName } from "./util.ts";

interface Local {
  rustName: string;
  ty: Scalar;
  mutable: boolean;
}

interface Scope {
  accounts: Map<string, AccountParam>;
  args: Map<string, ArgParam>;
  locals: Map<string, Local>;
}

type ValueTy = Scalar | { struct: string } | { enum: string } | { vec: Scalar; max: number } | { str: number } | { option: Scalar };

interface Expr {
  rust: string;
  ir?: IrExpr;
  ty: ValueTy;
  adaptable?: { kind: "int"; value: bigint };
}

function irOf(value: Expr): IrExpr {
  return value.ir ?? { t: "text", rust: value.rust };
}

function expr(rust: string, ty: ValueTy, ir?: IrExpr, adaptable?: Expr["adaptable"]): Expr {
  return { rust, ty, ir: ir ?? { t: "text", rust }, adaptable };
}

function fromIr(ir: IrExpr, ty: ValueTy, adaptable?: Expr["adaptable"]): Expr {
  return expr(renderExpr(ir), ty, ir, adaptable);
}

function statement(ir: import("./ir.ts").IrStmt, loc?: Loc): Stmt {
  return { ir, code: renderStmt(ir), loc };
}

interface LowerContext {
  diag: Diagnostics;
  sf: ts.SourceFile;
  scope: Scope;
  structs: StructModel[];
  enums: Map<string, { name: string; rustName: string; fields: { name: string; rustName: string; ty: FieldTy }[] }[]>;
  helpers: Map<string, HelperModel>;
  errors: ErrorModel[];
  usesArithmetic: boolean;
  temps: number;
  pending: Stmt[];
  returnType?: Scalar;
  usesEventCpi: boolean;
  inConstraint: boolean;
  inMatch: boolean;
  guarded: Set<string>;
  loops: ("for" | "while")[];
  forStep: string | null;
  armFields: Map<string, Expr>;
  cpiRead?: Expr;
}

export function lowerProgram(
  parsed: ParsedProgram,
  options: { programName: string; programId: string; version: string; description: string },
  diag: Diagnostics,
): ProgramModel {
  const instructions: InstructionModel[] = [];
  const errors: ErrorModel[] = [];
  let usesSpl = false;
  let usesInitIfNeeded = false;
  let usesArithmetic = false;
  let usesCpi = false;
  let usesRawCpi = false;
  let usesEventCpi = false;
  const enums = new Map(parsed.enums.map((item) => [item.name, item.variants]));
  const helpers = new Map<string, HelperModel>();
  for (const helper of parsed.helpers) {
    helpers.set(helper.name, { ...helper, body: [] });
  }
  for (const helper of parsed.helpers) {
    const model = helpers.get(helper.name)!;
    const ctx = helperContext(helper, parsed.structs, enums, helpers, errors, diag);
    model.body = lowerBlock(helper.body, ctx, true).stmts;
    if (ctx.usesArithmetic) usesArithmetic = true;
  }

  for (const instruction of parsed.instructions) {
    validateAccounts(instruction, parsed.structs, diag);
    for (const param of instruction.params) {
      if (param.kind === "account" && (param.accountKind === "tokenAccount" || param.accountKind === "mint" || param.accountKind === "tokenProgram" || param.accountKind === "token2022")) {
        usesSpl = true;
      }
      if (param.kind === "account" && param.opts.initIfNeeded) usesInitIfNeeded = true;
    }
    const ctx: LowerContext = {
      diag,
      sf: instruction.sourceFile,
      scope: scopeOf(instruction.params),
      structs: parsed.structs,
      enums,
      helpers,
      errors,
      usesArithmetic: false,
      temps: 0,
      pending: [],
      returnType: instruction.returnType,
      usesEventCpi: false,
      inConstraint: false,
      inMatch: false,
      guarded: new Set(),
      loops: [],
      forStep: null,
      armFields: new Map(),
    };
    const before = diag.items.length;
    lowerConstraints(ctx);
    const body = lowerBlock(instruction.body, ctx, true).stmts;
    if (ctx.usesArithmetic) usesArithmetic = true;
    if (body.some((stmt) => stmt.code.includes("invoke") || stmt.code.includes("transfer_checked") || stmt.code.includes("system_program::transfer"))) {
      usesCpi = true;
    }
    if (body.some((stmt) => stmt.code.includes("ax_codec"))) usesRawCpi = true;
    if (ctx.usesEventCpi) usesEventCpi = true;
    const failed = diag.items.slice(before).some((item) => item.severity === "error");
    instructions.push({
      name: instruction.name,
      rustName: instruction.rustName,
      params: instruction.params,
      loc: instruction.loc,
      file: instruction.file,
      body: failed ? [] : body,
      returnType: instruction.returnType,
      usesEventCpi: ctx.usesEventCpi,
      failed,
    });
  }

  if (usesArithmetic && !errors.some((item) => item.name === "ArithmeticOverflow")) {
    errors.push({ name: "ArithmeticOverflow", msg: "Arithmetic overflow or division by zero" });
  }
  if (usesRawCpi && !errors.some((item) => item.name === "AccountTooSmall")) {
    errors.push({ name: "AccountTooSmall", msg: "Account or return data is shorter than the read" });
  }

  return {
    name: options.programName,
    rustName: snake(options.programName),
    programId: options.programId,
    version: options.version,
    description: options.description,
    structs: parsed.structs,
    enums: parsed.enums,
    helpers: [...helpers.values()],
    instructions,
    errors,
    usesSpl,
    usesInitIfNeeded,
    usesArithmetic,
    usesCpi,
    usesRawCpi,
    usesEventCpi,
  };
}

function helperContext(
  helper: ParsedHelper,
  structs: StructModel[],
  enums: Map<string, { name: string; rustName: string }[]>,
  helpers: Map<string, HelperModel>,
  errors: ErrorModel[],
  diag: Diagnostics,
): LowerContext {
  const args = new Map<string, ArgParam>();
  for (const param of helper.params) {
    args.set(param.name, { kind: "arg", name: param.name, rustName: param.rustName, ty: param.ty, loc: param.loc });
  }
  return {
    diag,
    sf: helper.sourceFile,
    scope: { accounts: new Map(), args, locals: new Map() },
    structs,
    enums,
    helpers,
    errors,
    usesArithmetic: false,
    temps: 0,
    pending: [],
    returnType: helper.returnType,
    usesEventCpi: false,
    inConstraint: false,
    inMatch: false,
    guarded: new Set(),
    loops: [],
    forStep: null,
    armFields: new Map(),
  };
}

function scopeOf(params: Param[]): Scope {
  const accounts = new Map<string, AccountParam>();
  const args = new Map<string, ArgParam>();
  for (const param of params) {
    if (param.kind === "account") accounts.set(param.name, param);
    else args.set(param.name, param);
  }
  return { accounts, args, locals: new Map() };
}

function validateAccounts(instruction: ParsedInstruction, structs: StructModel[], diag: Diagnostics): void {
  const names = new Set(instruction.params.map((param) => param.name));
  let needsSystem = false;
  for (const param of instruction.params) {
    if (param.kind !== "account") continue;
    const { opts } = param;
    if (opts.init || opts.initIfNeeded) {
      needsSystem = true;
      if (!opts.payer) diag.error(instruction.file, param.loc.line, param.loc.column, `Account "${param.name}" is initialized but has no payer.`);
      else if (!names.has(opts.payer)) diag.error(instruction.file, param.loc.line, param.loc.column, `Payer "${opts.payer}" is not an account of this instruction.`);
      if (opts.init && opts.initIfNeeded) diag.error(instruction.file, param.loc.line, param.loc.column, "Use either init or initIfNeeded, not both.");
      if (param.accountKind !== "user") diag.error(instruction.file, param.loc.line, param.loc.column, "Only program accounts (Account<YourType>) can be initialized.");
    }
    if (opts.initIfNeeded) {
      diag.error(instruction.file, param.loc.line, param.loc.column, `initIfNeeded is not part of this language. Anchor's init_if_needed can reinitialize an account that already has data. Use init.`);
    }
    if (opts.close) {
      const dest = instruction.params.find((item) => item.name === opts.close);
      const literal = isPubkey(opts.close);
      if (!dest && !literal) diag.error(instruction.file, param.loc.line, param.loc.column, `close target "${opts.close}" is not an account of this instruction.`);
      if (dest && dest.kind === "account" && dest.accountKind !== "signer") {
        diag.error(instruction.file, param.loc.line, param.loc.column, `close sends the rent to "${opts.close}", which is not a Signer. Any transaction could name that account and take the lamports. Declare it as Signer, or pass a base58 address.`);
      }
    }
    if (opts.realloc !== undefined && !opts.payer) diag.error(instruction.file, param.loc.line, param.loc.column, `realloc on "${param.name}" needs a payer.`);
    if (opts.optional && (opts.init || opts.initIfNeeded)) diag.error(instruction.file, param.loc.line, param.loc.column, "Optional accounts cannot be initialized in the same instruction.");
    if (opts.seeds.length > 0 && !opts.bump) {
      diag.error(instruction.file, param.loc.line, param.loc.column, `seeds require bump: true.`);
    }
    for (const rel of opts.hasOne) {
      if (!names.has(rel)) diag.error(instruction.file, param.loc.line, param.loc.column, `hasOne account "${rel}" is not a parameter.`);
      const target = instruction.params.find((item) => item.name === rel);
      if (target && target.kind === "account" && target.accountKind !== "signer") {
        diag.error(
          instruction.file,
          param.loc.line,
          param.loc.column,
          `hasOne "${rel}" is only an equality check. The account "${rel}" is not a Signer, so any transaction can pass that public key without signing. Declare it as Signer, or use address: "..." if it is a fixed key.`,
        );
      }
      if (param.accountKind === "user" && param.accountType) {
        const struct = structs.find((item) => item.name === param.accountType);
        const field = struct?.fields.find((item) => item.name === rel || item.rustName === snake(rel));
        if (struct && (!field || field.ty !== "pubkey")) {
          diag.error(instruction.file, param.loc.line, param.loc.column, `hasOne = ${rel} requires a Pubkey field named "${rel}" on ${struct.name}.`);
        }
      }
    }
    if (opts.seedsProgram && !names.has(opts.seedsProgram)) {
      diag.error(instruction.file, param.loc.line, param.loc.column, `seeds program "${opts.seedsProgram}" is not an account of this instruction.`);
    }
    if (opts.seedsProgram && opts.seeds.length === 0) {
      diag.error(instruction.file, param.loc.line, param.loc.column, `program = "${opts.seedsProgram}" requires seeds.`);
    }
    for (const name of [opts.tokenMint, opts.tokenAuthority, opts.associatedMint, opts.associatedAuthority]) {
      if (name && !names.has(name)) diag.error(instruction.file, param.loc.line, param.loc.column, `Account "${name}" is not a parameter.`);
    }
    for (const seed of opts.seeds) {
      if (seed.kind === "account" && !names.has(seed.name)) diag.error(instruction.file, param.loc.line, param.loc.column, `Seed account "${seed.name}" is not a parameter.`);
      if (seed.kind === "arg") {
        const arg = instruction.params.find((item) => item.kind === "arg" && item.name === seed.name);
        if (!arg || arg.kind !== "arg") diag.error(instruction.file, param.loc.line, param.loc.column, `Seed arg "${seed.name}" is not an instruction argument.`);
        else if (!isInteger(arg.ty) && arg.ty !== "pubkey" && arg.ty !== "string" && arg.ty !== "bytes32") {
          diag.error(instruction.file, param.loc.line, param.loc.column, `Argument "${seed.name}" cannot be used as a PDA seed.`);
        }
      }
    }
    if (opts.payer) {
      const payer = instruction.params.find((item) => item.name === opts.payer);
      if (payer && payer.kind === "account" && payer.accountKind !== "signer") {
        diag.error(instruction.file, param.loc.line, param.loc.column, `Payer "${opts.payer}" must be a Signer.`);
      }
      if (payer && payer.kind === "account" && !payer.opts.mut) {
        payer.opts.mut = true;
        diag.warn(payer.loc.file, payer.loc.line, payer.loc.column, `Payer "${opts.payer}" was marked mutable because it pays for account creation.`);
      }
    }
  }
  if (needsSystem && !instruction.params.some((param) => param.kind === "account" && param.accountKind === "system")) {
    diag.error(instruction.file, instruction.loc.line, instruction.loc.column, `Instruction "${instruction.name}" initializes an account and needs a SystemProgram parameter.`);
  }
}

function lowerBlock(block: ts.Block, ctx: LowerContext, isFunction: boolean): { stmts: Stmt[] } {
  const saved = new Map(ctx.scope.locals);
  const stmts: Stmt[] = [];
  if (isFunction) stmts.push(...bumpAssignments(ctx));
  for (const statement of block.statements) stmts.push(...lowerStmt(statement, ctx));
  stmts.push(...takePending(ctx));
  if (!isFunction) ctx.scope.locals = saved;
  return { stmts };
}

function bumpAssignments(ctx: LowerContext): Stmt[] {
  const stmts: Stmt[] = [];
  for (const account of ctx.scope.accounts.values()) {
    if (!(account.opts.init || account.opts.initIfNeeded) || !account.opts.bump || !account.accountType) continue;
    const struct = ctx.structs.find((item) => item.name === account.accountType);
    const bump = struct?.fields.find((field) => field.name === "bump" && field.ty === "u8");
    if (!bump) continue;
    stmts.push({ code: `ctx.accounts.${account.rustName}.${bump.rustName} = ctx.bumps.${account.rustName};` });
  }
  return stmts;
}

function lowerStmt(node: ts.Statement, ctx: LowerContext): Stmt[] {
  const loc = locOf(ctx.sf, node);
  if (ts.isBlock(node)) return lowerBlock(node, ctx, false).stmts;
  if (ts.isEmptyStatement(node)) return [];
  if (ts.isReturnStatement(node)) return lowerReturn(node, ctx, loc);
  if (ts.isBreakStatement(node)) return ctx.inMatch ? [] : [{ code: "break;", loc }];
  if (ts.isContinueStatement(node)) {
    if (ctx.loops.at(-1) === "for" && ctx.forStep) return [{ code: `${ctx.forStep};`, loc }, { code: "continue;", loc }];
    return [{ code: "continue;", loc }];
  }
  if (ts.isVariableStatement(node)) return lowerVar(node, ctx, loc);
  if (ts.isIfStatement(node)) return lowerIf(node, ctx, loc);
  if (ts.isWhileStatement(node)) return lowerWhile(node, ctx, loc);
  if (ts.isForStatement(node)) return lowerFor(node, ctx, loc);
  if (ts.isSwitchStatement(node)) return lowerSwitch(node, ctx, loc);
  if (ts.isExpressionStatement(node)) return lowerExprStmt(node.expression, ctx, loc);
  ctx.diag.errorAt(ctx.sf, node, "Unsupported statement. Use assignments, if/else, while, a restricted for loop, require, emit, log, system.transfer, token.transferChecked, or cpi.");
  return [];
}

function lowerReturn(node: ts.ReturnStatement, ctx: LowerContext, loc: Loc): Stmt[] {
  if (!node.expression) return [{ code: "return Ok(());", loc }];
  if (!ctx.returnType) {
    ctx.diag.errorAt(ctx.sf, node, "This function does not return a value. Use `return;` or add a scalar return type.");
    return [];
  }
  const expr = lowerExpr(node.expression, ctx, ctx.returnType);
  if (!expr) return [];
  const concrete = adapt(expr, ctx.returnType, ctx, node.expression);
  if (!concrete) return [];
  return [...takePending(ctx), { code: `return Ok(${concrete.rust});`, loc }];
}

function lowerWhile(node: ts.WhileStatement, ctx: LowerContext, loc: Loc): Stmt[] {
  if (!ts.isBlock(node.statement)) {
    ctx.diag.errorAt(ctx.sf, node, "while bodies must be blocks.");
    return [];
  }
  const cond = lowerExpr(node.expression, ctx, "bool");
  if (!cond) return [];
  const concrete = adapt(cond, "bool", ctx, node.expression);
  if (!concrete) return [];
  ctx.loops.push("while");
  const body = lowerBlock(node.statement, ctx, false).stmts;
  ctx.loops.pop();
  const ir: import("./ir.ts").IrStmt = {
    t: "while",
    cond: irOf(concrete),
    body: body.map((item) => item.ir ?? { t: "text", text: item.code }),
  };
  return [...takePending(ctx), statement(ir, loc)];
}

function takePending(ctx: LowerContext): Stmt[] {
  const pending = ctx.pending;
  ctx.pending = [];
  return pending;
}

function lowerVar(node: ts.VariableStatement, ctx: LowerContext, loc: Loc): Stmt[] {
  if (node.declarationList.declarations.length !== 1) {
    ctx.diag.errorAt(ctx.sf, node, "Declare one variable at a time.");
    return [];
  }
  const decl = node.declarationList.declarations[0]!;
  if (!ts.isIdentifier(decl.name)) {
    ctx.diag.errorAt(ctx.sf, decl, "Destructuring is not supported.");
    return [];
  }
  if (!decl.initializer) {
    ctx.diag.errorAt(ctx.sf, decl, "Variables need an initializer.");
    return [];
  }
  const name = decl.name.text;
  if (ctx.scope.accounts.has(name) || ctx.scope.args.has(name) || ctx.scope.locals.has(name)) {
    ctx.diag.errorAt(ctx.sf, decl, `"${name}" is already defined.`);
    return [];
  }
  const rustName = snake(name);
  if (isRustKeyword(rustName)) {
    ctx.diag.errorAt(ctx.sf, decl, `"${name}" lowers to the Rust keyword "${rustName}".`);
    return [];
  }
  const annotated = decl.type ? annotatedScalar(ctx, decl.type) : undefined;
  const expr = lowerExpr(decl.initializer, ctx, annotated);
  if (!expr) return [];
  const concrete = annotated ? adapt(expr, annotated, ctx, decl.initializer) : expr;
  if (!concrete || concrete.adaptable || typeof concrete.ty !== "string") {
    ctx.diag.errorAt(ctx.sf, decl, `Give "${name}" a type annotation such as \`: u64\`.`);
    return [];
  }
  const mutable = (node.declarationList.flags & ts.NodeFlags.Const) === 0;
  ctx.scope.locals.set(name, { rustName, ty: concrete.ty, mutable });
  return [...takePending(ctx), statement({
    t: "let",
    mutable,
    name: rustName,
    ty: rustTy(concrete.ty),
    value: irOf(concrete),
  }, loc)];
}

function lowerIf(node: ts.IfStatement, ctx: LowerContext, loc: Loc): Stmt[] {
  if (!ts.isBlock(node.thenStatement) || (node.elseStatement && !ts.isBlock(node.elseStatement) && !ts.isIfStatement(node.elseStatement))) {
    ctx.diag.errorAt(ctx.sf, node, "if / else bodies must be blocks.");
    return [];
  }
  const cond = lowerExpr(node.expression, ctx, "bool");
  if (!cond) return [];
  const concrete = adapt(cond, "bool", ctx, node.expression);
  if (!concrete) return [];
  const saved = new Set(ctx.guarded);
  for (const name of guardedBy(node.expression)) ctx.guarded.add(name);
  const thenStmts = lowerBlock(node.thenStatement, ctx, false).stmts;
  ctx.guarded = saved;
  let elseStmts: Stmt[] = [];
  if (node.elseStatement) {
    if (ts.isIfStatement(node.elseStatement)) elseStmts = lowerIf(node.elseStatement, ctx, locOf(ctx.sf, node.elseStatement));
    else if (ts.isBlock(node.elseStatement)) elseStmts = lowerBlock(node.elseStatement, ctx, false).stmts;
  }
  return [...takePending(ctx), statement({
    t: "if",
    cond: irOf(concrete),
    then: thenStmts.map((item) => item.ir ?? { t: "text", text: item.code }),
    else: elseStmts.map((item) => item.ir ?? { t: "text", text: item.code }),
  }, loc)];
}

function guardedBy(node: ts.Expression): string[] {
  if (ts.isParenthesizedExpression(node)) return guardedBy(node.expression);
  if (ts.isCallExpression(node) && callName(node.expression) === "present" && node.arguments[0] && ts.isIdentifier(node.arguments[0])) {
    return [node.arguments[0].text];
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    return [...guardedBy(node.left), ...guardedBy(node.right)];
  }
  return [];
}

function lowerConstraints(ctx: LowerContext): void {
  for (const account of ctx.scope.accounts.values()) {
    if (!account.opts.constraint) continue;
    const where = account.opts.constraintLoc ?? account.loc;
    const rust = lowerConstraint(account.opts.constraint, ctx, where);
    if (rust) account.opts.constraintRust = rust;
  }
}

function lowerConstraint(source: string, ctx: LowerContext, where: Loc): string | null {
  const sf = ts.createSourceFile("constraint.ts", `const __ax: boolean = (${source});\n`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const stmt = sf.statements[0];
  if (!stmt || !ts.isVariableStatement(stmt)) {
    ctx.diag.error(where.file, where.line, where.column, `constraint \`${source}\`: expected an expression.`);
    return null;
  }
  const init = stmt.declarationList.declarations[0]?.initializer;
  if (!init) return null;
  const savedSf = ctx.sf;
  const saved = ctx.inConstraint;
  const before = ctx.diag.items.length;
  ctx.sf = sf;
  ctx.inConstraint = true;
  const expr = lowerExpr(init, ctx, "bool");
  const concrete = expr ? adapt(expr, "bool", ctx, init) : null;
  ctx.sf = savedSf;
  ctx.inConstraint = saved;
  ctx.diag.items.splice(before);
  if (!concrete || concrete.rust.includes("?")) {
    ctx.diag.error(where.file, where.line, where.column, `constraint \`${source}\` must be a boolean expression without arithmetic.`);
    return null;
  }
  return concrete.rust;
}

function lowerSwitch(node: ts.SwitchStatement, ctx: LowerContext, loc: Loc): Stmt[] {
  let enumName = "";
  let rustScrutinee = "";
  let dataArg: string | null = null;
  const scrutinee = node.expression;
  if (ts.isPropertyAccessExpression(scrutinee) && scrutinee.name.text === "kind" && ts.isIdentifier(scrutinee.expression)) {
    const arg = ctx.scope.args.get(scrutinee.expression.text);
    if (arg && typeof arg.ty !== "string" && "enum" in arg.ty) {
      enumName = arg.ty.enum;
      rustScrutinee = arg.rustName;
      dataArg = scrutinee.expression.text;
    }
  }
  if (!enumName) {
    const expr = lowerExpr(scrutinee, ctx);
    if (!expr || typeof expr.ty === "string" || !("enum" in expr.ty)) {
      ctx.diag.errorAt(ctx.sf, scrutinee, "switch must be on an enum or on `value.kind` for a data-carrying enum.");
      return [];
    }
    enumName = expr.ty.enum;
    rustScrutinee = expr.rust;
  }
  const variants = ctx.enums.get(enumName);
  if (!variants) {
    ctx.diag.errorAt(ctx.sf, scrutinee, `Unknown enum ${enumName}.`);
    return [];
  }
  const clauses = [...node.caseBlock.clauses];
  for (let index = 0; index < clauses.length - 1; index++) {
    const clause = clauses[index]!;
    if (!endsWithBreak(clause.statements[clause.statements.length - 1])) {
      ctx.diag.errorAt(ctx.sf, clause, "This case falls through. Axolotl lowers switch to a Rust match, which does not fall through. End the case with `break`.");
      return [];
    }
  }
  const arms: string[] = [];
  const seen = new Set<string>();
  let hasDefault = false;
  for (const clause of node.caseBlock.clauses) {
    if (ts.isDefaultClause(clause)) {
      hasDefault = true;
      const savedMatch = ctx.inMatch;
      ctx.inMatch = true;
      const body = lowerCase(clause.statements, ctx);
      ctx.inMatch = savedMatch;
      arms.push(`_ => {\n${indent(body)}\n}`);
      continue;
    }
    const label = clause.expression;
    let variantName = "";
    if (ts.isStringLiteral(label)) variantName = label.text;
    else if (ts.isPropertyAccessExpression(label)) variantName = label.name.text;
    else {
      ctx.diag.errorAt(ctx.sf, label, "case labels must be Enum.Variant or \"Variant\".");
      continue;
    }
    const variant = variants.find((item) => item.name === variantName);
    if (!variant) {
      ctx.diag.errorAt(ctx.sf, label, `${enumName} has no variant "${variantName}".`);
      continue;
    }
    seen.add(variant.name);
    const saved = new Map(ctx.armFields);
    const savedMatch = ctx.inMatch;
    ctx.inMatch = true;
    if (dataArg) {
      for (const field of variant.fields) {
        if (typeof field.ty !== "string") continue;
        ctx.armFields.set(`${dataArg}.${field.name}`, { rust: field.rustName, ty: field.ty });
      }
    }
    const body = lowerCase(clause.statements, ctx);
    ctx.armFields = saved;
    ctx.inMatch = savedMatch;
    const pattern = variant.fields.length
      ? `${enumName}::${variant.rustName} { ${variant.fields.map((field) => field.rustName).join(", ")} }`
      : `${enumName}::${variant.rustName}`;
    arms.push(`${pattern} => {\n${indent(body)}\n}`);
  }
  if (!hasDefault && seen.size !== variants.length) {
    ctx.diag.errorAt(ctx.sf, node, `switch on ${enumName} must cover every variant or have a default.`);
    return [];
  }
  return [{ code: `match ${rustScrutinee} {\n${indent(arms.map((arm) => ({ code: arm })))}\n}`, loc }];
}

function endsWithBreak(statement: ts.Statement | undefined): boolean {
  if (!statement) return false;
  if (ts.isBreakStatement(statement)) return true;
  if (ts.isBlock(statement)) return endsWithBreak(statement.statements[statement.statements.length - 1]);
  return false;
}

function lowerCase(statements: ts.NodeArray<ts.Statement>, ctx: LowerContext): Stmt[] {
  const stmts: Stmt[] = [];
  for (const statement of statements) {
    if (ts.isBreakStatement(statement)) continue;
    stmts.push(...lowerStmt(statement, ctx));
  }
  return stmts;
}

function lowerFor(node: ts.ForStatement, ctx: LowerContext, loc: Loc): Stmt[] {
  if (!node.initializer || !ts.isVariableDeclarationList(node.initializer) || node.initializer.declarations.length !== 1) {
    ctx.diag.errorAt(ctx.sf, node, "for loops must start with `for (let i: u64 = 0n; i < bound; i = i + 1n)`.");
    return [];
  }
  const decl = node.initializer.declarations[0]!;
  if (!ts.isIdentifier(decl.name) || !decl.initializer || !node.condition || !node.incrementor || !node.statement || !ts.isBlock(node.statement)) {
    ctx.diag.errorAt(ctx.sf, node, "Unsupported for loop. Use `for (let i: u64 = start; i < bound; i = i + 1n) { ... }`.");
    return [];
  }
  const name = decl.name.text;
  const annotated = decl.type ? annotatedScalar(ctx, decl.type) : undefined;
  const init = lowerExpr(decl.initializer, ctx, annotated);
  if (!init) return [];
  const initConcrete = adapt(init, annotated ?? init.ty, ctx, decl.initializer);
  if (!initConcrete || !isInteger(initConcrete.ty)) {
    ctx.diag.errorAt(ctx.sf, decl, "Loop variables must be integers.");
    return [];
  }
  if (!ts.isBinaryExpression(node.condition) || node.condition.operatorToken.kind !== ts.SyntaxKind.LessThanToken || !ts.isIdentifier(node.condition.left) || node.condition.left.text !== name) {
    ctx.diag.errorAt(ctx.sf, node.condition, "Loop condition must be `i < bound`.");
    return [];
  }
  const bound = lowerExpr(node.condition.right, ctx, initConcrete.ty);
  if (!bound) return [];
  const boundConcrete = adapt(bound, initConcrete.ty, ctx, node.condition.right);
  if (!boundConcrete) return [];
  if (!isPlusOne(node.incrementor, name)) {
    ctx.diag.errorAt(ctx.sf, node.incrementor, "Loop increment must be `i = i + 1` or `i = i + 1n`.");
    return [];
  }
  const rustName = snake(name);
  if (isRustKeyword(rustName)) {
    ctx.diag.errorAt(ctx.sf, decl, `"${name}" lowers to the Rust keyword "${rustName}". Rename it.`);
    return [];
  }
  if (ctx.scope.locals.has(name) || ctx.scope.args.has(name) || ctx.scope.accounts.has(name)) {
    ctx.diag.errorAt(ctx.sf, decl, `"${name}" is already defined.`);
    return [];
  }
  ctx.scope.locals.set(name, { rustName, ty: initConcrete.ty, mutable: true });
  const step = `${rustName} = ${rustName}.checked_add(${rustLiteral(1n, initConcrete.ty)}).ok_or(AxolotlError::ArithmeticOverflow)?`;
  const savedStep = ctx.forStep;
  ctx.forStep = step;
  ctx.loops.push("for");
  const body = lowerBlock(node.statement, ctx, false).stmts;
  ctx.loops.pop();
  ctx.forStep = savedStep;
  ctx.scope.locals.delete(name);
  ctx.usesArithmetic = true;
  return [{
    code: `{\n    let mut ${rustName}: ${rustTy(initConcrete.ty)} = ${initConcrete.rust};\n    while ${rustName} < ${boundConcrete.rust} {\n${indent(body, 2)}\n        ${step};\n    }\n}`,
    loc,
  }];
}

function isPlusOne(node: ts.Expression, name: string): boolean {
  if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return false;
  if (!ts.isIdentifier(node.left) || node.left.text !== name) return false;
  if (!ts.isBinaryExpression(node.right) || node.right.operatorToken.kind !== ts.SyntaxKind.PlusToken) return false;
  if (!ts.isIdentifier(node.right.left) || node.right.left.text !== name) return false;
  const literal = node.right.right;
  if (ts.isNumericLiteral(literal)) return literal.text === "1";
  if (ts.isBigIntLiteral(literal)) return literal.text === "1" || literal.text === "1n";
  return false;
}

function lowerExprStmt(expr: ts.Expression, ctx: LowerContext, loc: Loc): Stmt[] {
  if (ts.isBinaryExpression(expr) && (expr.operatorToken.kind === ts.SyntaxKind.EqualsToken || expr.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken || expr.operatorToken.kind === ts.SyntaxKind.MinusEqualsToken)) {
    return lowerAssign(expr, ctx, loc);
  }
  if (ts.isCallExpression(expr)) return lowerCallStmt(expr, ctx, loc);
  ctx.diag.errorAt(ctx.sf, expr, "This expression has no effect. Axolotl only allows calls and assignments as statements.");
  return [];
}

function lowerAssign(expr: ts.BinaryExpression, ctx: LowerContext, loc: Loc): Stmt[] {
  const op = expr.operatorToken.kind;
  const target = assignTarget(expr.left, ctx);
  if (!target) return [];
  let valueNode = expr.right;
  if (op === ts.SyntaxKind.PlusEqualsToken || op === ts.SyntaxKind.MinusEqualsToken) {
    const token = op === ts.SyntaxKind.PlusEqualsToken ? ts.SyntaxKind.PlusToken : ts.SyntaxKind.MinusToken;
    valueNode = ts.factory.createBinaryExpression(expr.left, token, expr.right);
  }
  if (typeof target.ty !== "string" && "str" in target.ty) {
    const value = lowerExpr(valueNode, ctx, "string");
    if (!value) return [];
    const concrete = adapt(value, "string", ctx, expr.right);
    if (!concrete) return [];
    const temp = fresh(ctx);
    noteError(ctx, "StringTooLong", "String is longer than its Str<N> bound");
    return [
      ...takePending(ctx),
      { code: `if ${concrete.rust}.len() > ${target.ty.str} { return Err(AxolotlError::StringTooLong.into()); }`, loc },
      statement({ t: "assign", temp, place: { t: "text", rust: target.place }, value: irOf(concrete) }, loc),
    ];
  }
  if (typeof target.ty !== "string") {
    const value = lowerExpr(valueNode, ctx);
    if (!value || !sameTy(value.ty, target.ty)) {
      ctx.diag.errorAt(ctx.sf, expr.right, "Type mismatch.");
      return [];
    }
    const temp = fresh(ctx);
    return [...takePending(ctx), statement({ t: "assign", temp, place: { t: "text", rust: target.place }, value: irOf(value) }, loc)];
  }
  const value = lowerExpr(valueNode, ctx, target.ty);
  if (!value) return [];
  const concrete = adapt(value, target.ty, ctx, expr.right);
  if (!concrete) return [];
  if (target.kind === "local") {
    const local = ctx.scope.locals.get(target.name)!;
    if (!local.mutable) {
      ctx.diag.errorAt(ctx.sf, expr.left, `Cannot assign to const "${target.name}".`);
      return [];
    }
  }
  const temp = fresh(ctx);
  const limit = strLimit(target.ty);
  const guard = limit === null
    ? []
    : [{ code: `if ${concrete.rust}.len() > ${limit} { return Err(AxolotlError::StringTooLong.into()); }`, loc }];
  if (limit !== null) noteError(ctx, "StringTooLong", "String is longer than its Str<N> bound");
  return [
    ...takePending(ctx),
    ...guard,
    statement({ t: "assign", temp, place: { t: "text", rust: target.place }, value: irOf(concrete) }, loc),
  ];
}

function strLimit(ty: ValueTy): number | null {
  return typeof ty === "object" && ty && "str" in ty ? ty.str : null;
}

function noteError(ctx: LowerContext, name: string, msg: string): void {
  if (!ctx.errors.some((item) => item.name === name)) ctx.errors.push({ name, msg });
}

function assignTarget(node: ts.Expression, ctx: LowerContext): { place: string; ty: ValueTy; kind: "local" | "field"; name: string } | null {
  if (ts.isIdentifier(node)) {
    const local = ctx.scope.locals.get(node.text);
    if (!local) {
      ctx.diag.errorAt(ctx.sf, node, `Cannot assign to "${node.text}".`);
      return null;
    }
    return { place: local.rustName, ty: local.ty, kind: "local", name: node.text };
  }
  if (ts.isPropertyAccessExpression(node)) {
    let root: ts.Expression = node;
    while (ts.isPropertyAccessExpression(root)) root = root.expression;
    if (ts.isIdentifier(root)) {
      const account = ctx.scope.accounts.get(root.text);
      if (account && !account.opts.mut && !account.opts.init && !account.opts.initIfNeeded && !account.opts.realloc && !account.opts.zero) {
        ctx.diag.errorAt(ctx.sf, node, `Account "${account.name}" is not mutable. Add \`{ mut: true }\`.`);
        return null;
      }
    }
    const expr = lowerProp(node, ctx);
    if (!expr) return null;
    return { place: expr.rust, ty: expr.ty, kind: "field", name: node.name.text };
  }
  ctx.diag.errorAt(ctx.sf, node, "Unsupported assignment target.");
  return null;
}

function lowerCallStmt(node: ts.CallExpression, ctx: LowerContext, loc: Loc): Stmt[] {
  const called = callName(node.expression);
  if (called === "require") return lowerRequire(node, ctx, loc);
  if (called === "emit") return lowerEmit(node, ctx, loc);
  if (called === "emitCpi") return lowerEmit(node, ctx, loc, true);
  if (called === "log") return lowerLog(node, ctx, loc);
  if (called === "system.transfer") return lowerSystemTransfer(node, ctx, loc);
  if (called === "token.transferChecked") return lowerTokenTransfer(node, ctx, loc);
  if (called === "token.createAssociatedAccount") return lowerCreateAta(node, ctx, loc);
  if (called === "token.mintTo") return lowerMintTo(node, ctx, loc);
  if (called === "cpi") return [...takePending(ctx), ...lowerCpi(node, ctx, loc)];
  if (called === "push") return lowerPush(node, ctx, loc);
  const helper = called && ctx.helpers.get(called);
  if (helper && !helper.returnType) return lowerHelperCall(node, helper, ctx, loc);
  ctx.diag.errorAt(ctx.sf, node, `Unsupported call "${called ?? node.expression.getText(ctx.sf)}".`);
  return [];
}

function callName(expr: ts.Expression): string | null {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression)) return `${expr.expression.text}.${expr.name.text}`;
  return null;
}

function lowerRequire(node: ts.CallExpression, ctx: LowerContext, loc: Loc): Stmt[] {
  if (node.arguments.length !== 2 || !ts.isStringLiteral(node.arguments[1]!)) {
    ctx.diag.errorAt(ctx.sf, node, "require takes a condition and a string literal message: require(ok, \"Unauthorized\").");
    return [];
  }
  const cond = lowerExpr(node.arguments[0]!, ctx, "bool");
  if (!cond) return [];
  const concrete = adapt(cond, "bool", ctx, node.arguments[0]!);
  if (!concrete) return [];
  const message = node.arguments[1].text;
  let name = variantName(message);
  const existing = ctx.errors.find((item) => item.msg === message);
  if (existing) name = existing.name;
  else {
    if (ctx.errors.some((item) => item.name === name)) name = `${name}${ctx.errors.length}`;
    ctx.errors.push({ name, msg: message });
  }
  return [...takePending(ctx), statement({ t: "require", cond: irOf(concrete), error: name }, loc)];
}

function lowerEmit(node: ts.CallExpression, ctx: LowerContext, loc: Loc, asCpi = false): Stmt[] {
  const typeArg = node.typeArguments?.[0];
  if (!typeArg || !ts.isTypeReferenceNode(typeArg) || node.arguments.length !== 1 || !ts.isObjectLiteralExpression(node.arguments[0]!)) {
    ctx.diag.errorAt(ctx.sf, node, "emit<EventName>({ ...fields }) expected.");
    return [];
  }
  const eventName = typeArg.typeName.getText(ctx.sf).split(".").pop()!;
  const event = ctx.structs.find((item) => item.name === eventName && item.kind === "event");
  if (!event) {
    ctx.diag.errorAt(ctx.sf, typeArg, `"${eventName}" is not an interface that extends Event.`);
    return [];
  }
  const obj = node.arguments[0];
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const prop of obj.properties) {
    let fieldName = "";
    let initializer: ts.Expression | null = null;
    if (ts.isPropertyAssignment(prop) && prop.name && ts.isIdentifier(prop.name)) {
      fieldName = prop.name.text;
      initializer = prop.initializer;
    } else if (ts.isShorthandPropertyAssignment(prop)) {
      fieldName = prop.name.text;
      initializer = prop.name;
    } else {
      ctx.diag.errorAt(ctx.sf, prop, "Event fields must be `name: expression`.");
      continue;
    }
    const field = event.fields.find((item) => item.name === fieldName);
    if (!field) {
      ctx.diag.errorAt(ctx.sf, prop, `Event ${eventName} has no field "${fieldName}".`);
      continue;
    }
    seen.add(field.name);
    const expr = lowerExpr(initializer, ctx, field.ty);
    if (!expr) continue;
    const concrete = adapt(expr, field.ty, ctx, initializer);
    if (!concrete) continue;
    parts.push(`${field.rustName}: ${concrete.rust}`);
  }
  for (const field of event.fields) {
    if (!seen.has(field.name)) ctx.diag.errorAt(ctx.sf, obj, `Missing event field "${field.name}".`);
  }
  if (asCpi) ctx.usesEventCpi = true;
  const macro = asCpi ? "emit_cpi" : "emit";
  return [{ code: `${macro}!(${event.name} { ${parts.join(", ")} });`, loc }];
}

function lowerLog(node: ts.CallExpression, ctx: LowerContext, loc: Loc): Stmt[] {
  if (node.arguments.length !== 1) {
    ctx.diag.errorAt(ctx.sf, node, "log takes one value.");
    return [];
  }
  const arg = node.arguments[0]!;
  if (ts.isStringLiteral(arg)) return [{ code: `msg!(${rustString(arg.text)});`, loc }];
  const expr = lowerExpr(arg, ctx);
  if (!expr || expr.adaptable) {
    ctx.diag.errorAt(ctx.sf, arg, "Cannot log this value.");
    return [];
  }
  const fmt = expr.ty === "bytes32" ? "{:?}" : "{}";
  return [{ code: `msg!("${fmt}", ${expr.rust});`, loc }];
}

function lowerSystemTransfer(node: ts.CallExpression, ctx: LowerContext, loc: Loc): Stmt[] {
  const obj = objectArg(node, ctx);
  if (!obj) return [];
  const from = identProp(obj, "from", ctx);
  const to = identProp(obj, "to", ctx);
  const amountNode = prop(obj, "amount");
  if (!from || !to || !amountNode) {
    ctx.diag.errorAt(ctx.sf, node, "system.transfer({ from, to, amount }) expected.");
    return [];
  }
  const fromAcc = ctx.scope.accounts.get(from);
  const toAcc = ctx.scope.accounts.get(to);
  if (!fromAcc || !toAcc) {
    ctx.diag.errorAt(ctx.sf, obj, "from and to must be instruction accounts.");
    return [];
  }
  if (fromAcc.accountKind !== "signer" && fromAcc.opts.seeds.length === 0) {
    ctx.diag.errorAt(ctx.sf, obj, `system.transfer \`from\` must be a Signer or a PDA with seeds.`);
    return [];
  }
  const amount = lowerExpr(amountNode, ctx, "u64");
  if (!amount) return [];
  const amountConcrete = adapt(amount, "u64", ctx, amountNode);
  if (!amountConcrete) return [];
  const system = [...ctx.scope.accounts.values()].find((account) => account.accountKind === "system");
  if (!system) {
    ctx.diag.errorAt(ctx.sf, node, "system.transfer requires a SystemProgram account.");
    return [];
  }
  const seeds = pdaSeeds(fromAcc, ctx);
  const cpi = seeds
    ? `CpiContext::new_with_signer(ctx.accounts.${system.rustName}.key(), anchor_lang::system_program::Transfer { from: ctx.accounts.${fromAcc.rustName}.to_account_info(), to: ctx.accounts.${toAcc.rustName}.to_account_info() }, &[${seeds.name}])`
    : `CpiContext::new(ctx.accounts.${system.rustName}.key(), anchor_lang::system_program::Transfer { from: ctx.accounts.${fromAcc.rustName}.to_account_info(), to: ctx.accounts.${toAcc.rustName}.to_account_info() })`;
  return [
    ...(seeds?.prelude ?? []),
    { code: `anchor_lang::system_program::transfer(${cpi}, ${amountConcrete.rust})?;`, loc },
  ];
}

function tokenConstrained(account: AccountParam, mint: string, authority: string | null, ctx: LowerContext, node: ts.Node): boolean {
  if (account.accountKind !== "tokenAccount") return true;
  const mintName = account.opts.tokenMint ?? account.opts.associatedMint;
  const authorityName = account.opts.tokenAuthority ?? account.opts.associatedAuthority;
  if (!mintName || !authorityName) {
    ctx.diag.errorAt(ctx.sf, node, `Token account "${account.name}" needs tokenMint and tokenAuthority before a token instruction can use it.`);
    return false;
  }
  if (mintName !== mint) {
    ctx.diag.errorAt(ctx.sf, node, `Token account "${account.name}" is constrained to mint "${mintName}", not "${mint}".`);
    return false;
  }
  if (authority && authorityName !== authority) {
    ctx.diag.errorAt(ctx.sf, node, `Token account "${account.name}" must name tokenAuthority "${authority}".`);
    return false;
  }
  return true;
}

function lowerTokenTransfer(node: ts.CallExpression, ctx: LowerContext, loc: Loc): Stmt[] {
  const obj = objectArg(node, ctx);
  if (!obj) return [];
  const from = identProp(obj, "from", ctx);
  const to = identProp(obj, "to", ctx);
  const mint = identProp(obj, "mint", ctx);
  const authority = identProp(obj, "authority", ctx);
  const amountNode = prop(obj, "amount");
  if (!from || !to || !mint || !authority || !amountNode) {
    ctx.diag.errorAt(ctx.sf, node, "token.transferChecked({ from, to, mint, authority, amount }) expected.");
    return [];
  }
  const accounts = [from, to, mint, authority].map((name) => ctx.scope.accounts.get(name));
  if (accounts.some((account) => !account)) {
    ctx.diag.errorAt(ctx.sf, obj, "transferChecked accounts must be instruction parameters.");
    return [];
  }
  const [fromAcc, toAcc, mintAcc, authorityAcc] = accounts as AccountParam[];
  if (!tokenConstrained(fromAcc, mint, authority, ctx, obj) || !tokenConstrained(toAcc, mint, null, ctx, obj)) return [];
  const tokenProgram = [...ctx.scope.accounts.values()].find((account) => account.accountKind === "tokenProgram");
  if (!tokenProgram) {
    ctx.diag.errorAt(ctx.sf, node, "token.transferChecked requires a TokenProgram account.");
    return [];
  }
  const amount = lowerExpr(amountNode, ctx, "u64");
  if (!amount) return [];
  const amountConcrete = adapt(amount, "u64", ctx, amountNode);
  if (!amountConcrete) return [];
  const seeds = pdaSeeds(authorityAcc, ctx);
  const accountsLit = `anchor_spl::token_interface::TransferChecked { from: ctx.accounts.${fromAcc.rustName}.to_account_info(), mint: ctx.accounts.${mintAcc.rustName}.to_account_info(), to: ctx.accounts.${toAcc.rustName}.to_account_info(), authority: ctx.accounts.${authorityAcc.rustName}.to_account_info() }`;
  const cpi = seeds
    ? `CpiContext::new_with_signer(ctx.accounts.${tokenProgram.rustName}.key(), ${accountsLit}, &[${seeds.name}])`
    : `CpiContext::new(ctx.accounts.${tokenProgram.rustName}.key(), ${accountsLit})`;
  return [
    ...(seeds?.prelude ?? []),
    { code: `anchor_spl::token_interface::transfer_checked(${cpi}, ${amountConcrete.rust}, ctx.accounts.${mintAcc.rustName}.decimals)?;`, loc },
  ];
}

function lowerCpi(node: ts.CallExpression, ctx: LowerContext, loc: Loc): Stmt[] {
  const obj = objectArg(node, ctx);
  if (!obj) return [];
  const programName = identProp(obj, "program", ctx);
  const nameProp = prop(obj, "name");
  const accountsProp = prop(obj, "accounts");
  const argsProp = prop(obj, "args");
  if (!programName || !nameProp || !ts.isStringLiteral(nameProp) || !accountsProp || !ts.isArrayLiteralExpression(accountsProp) || !argsProp || !ts.isArrayLiteralExpression(argsProp)) {
    ctx.diag.errorAt(ctx.sf, node, "cpi({ program, name: \"instruction\", accounts: [...], args: [...] }) expected.");
    return [];
  }
  const program = ctx.scope.accounts.get(programName);
  if (!program || program.accountKind !== "program") {
    ctx.diag.errorAt(ctx.sf, obj, "cpi program must be a Program account.");
    return [];
  }
  const metas: string[] = [];
  const infos: string[] = [];
  const pdas: AccountParam[] = [];
  for (const element of accountsProp.elements) {
    if (!ts.isObjectLiteralExpression(element)) {
      ctx.diag.errorAt(ctx.sf, element, "Each CPI account is `{ account, mut?, signer? }`.");
      continue;
    }
    const accountName = identProp(element, "account", ctx);
    if (!accountName) continue;
    const account = ctx.scope.accounts.get(accountName);
    if (!account) {
      ctx.diag.errorAt(ctx.sf, element, `Unknown account "${accountName}".`);
      continue;
    }
    const mut = boolProp(element, "mut");
    const signer = boolProp(element, "signer");
    if (signer && account.opts.seeds.length > 0) {
      pdas.push(account);
    }
    const isSigner = signer || account.accountKind === "signer";
    const ctor = mut ? "new" : "new_readonly";
    metas.push(`anchor_lang::solana_program::instruction::AccountMeta::${ctor}(ctx.accounts.${account.rustName}.key(), ${isSigner})`);
    infos.push(`ctx.accounts.${account.rustName}.to_account_info()`);
  }
  const explicitSigner = identProp(obj, "signer", ctx);
  if (explicitSigner) {
    const account = ctx.scope.accounts.get(explicitSigner);
    if (!account || account.opts.seeds.length === 0) ctx.diag.errorAt(ctx.sf, obj, "cpi signer must be a PDA account with seeds.");
    else if (!pdas.includes(account)) pdas.push(account);
  }
  const argExprs: Expr[] = [];
  for (const arg of argsProp.elements) {
    const expr = lowerExpr(arg, ctx);
    if (!expr || expr.adaptable || typeof expr.ty !== "string") {
      ctx.diag.errorAt(ctx.sf, arg, "CPI arguments need a known scalar type. Use a typed local, account field, or instruction argument.");
      continue;
    }
    argExprs.push(expr);
  }
  const discBytes = discriminator("global", snake(nameProp.text)).map((byte) => `${byte}u8`).join(", ");
  const pushes = argExprs.map((expr) => `ax_codec::push_${expr.ty}(&mut __ax_data, ${refOf(expr)});`);
  const seeds = pdas.map((account) => pdaSeeds(account, ctx)).filter((item): item is { name: string; prelude: Stmt[] } => item !== null);
  const invoke = seeds.length > 0 ? "invoke_signed" : "invoke";
  const seedArg = seeds.length > 0 ? `, &[${seeds.map((item) => item.name).join(", ")}]` : "";
  const prelude = seeds.flatMap((item) => item.prelude);
  const invokeStmts: Stmt[] = [
    ...prelude,
    { code: `let mut __ax_data = Vec::new();`, loc },
    { code: `__ax_data.extend_from_slice(&[${discBytes}]);`, loc },
    ...pushes.map((code) => ({ code, loc })),
    {
      code: `let __ax_ix = anchor_lang::solana_program::instruction::Instruction { program_id: ctx.accounts.${program.rustName}.key(), accounts: vec![${metas.join(", ")}], data: __ax_data };`,
      loc,
    },
    {
      code: `anchor_lang::solana_program::program::${invoke}(&__ax_ix, &[${infos.join(", ")}]${seedArg})?;`,
      loc,
    },
  ];
  const readBack = node.typeArguments?.[0];
  if (readBack) {
    const scalar = annotatedScalar(ctx, readBack);
    if (!scalar) {
      ctx.diag.errorAt(ctx.sf, readBack, "cpi return data must be a scalar type.");
      return [];
    }
    const slot = fresh(ctx);
    noteError(ctx, "NoReturnData", "CPI wrote no return data");
    noteError(ctx, "WrongReturnProgram", "Return data came from a different program");
    noteError(ctx, "AccountTooSmall", "Account or return data is shorter than the read");
    ctx.pending.push(...invokeStmts, {
      code: `let (${slot}_pid, ${slot}) = anchor_lang::solana_program::program::get_return_data().ok_or(AxolotlError::NoReturnData)?;`,
      loc,
    }, {
      code: `if ${slot}_pid != ctx.accounts.${program.rustName}.key() { return Err(AxolotlError::WrongReturnProgram.into()); }`,
      loc,
    });
    ctx.cpiRead = expr(`ax_codec::read_${scalar}(&${slot})?`, scalar);
    return [];
  }
  return [
    ...prelude,
    { code: `let mut __ax_data = Vec::new();`, loc },
    { code: `__ax_data.extend_from_slice(&[${discBytes}]);`, loc },
    ...pushes.map((code) => ({ code, loc })),
    {
      code: `let __ax_ix = anchor_lang::solana_program::instruction::Instruction { program_id: ctx.accounts.${program.rustName}.key(), accounts: vec![${metas.join(", ")}], data: __ax_data };`,
      loc,
    },
    {
      code: `anchor_lang::solana_program::program::${invoke}(&__ax_ix, &[${infos.join(", ")}]${seedArg})?;`,
      loc,
    },
  ];
}

function refOf(expr: Expr): string {
  if (expr.ty === "string") return `&${expr.rust}`;
  if (expr.ty === "bytes32") return `&${expr.rust}`;
  return expr.rust;
}

function bumpSource(account: AccountParam, ctx: LowerContext): string {
  const struct = ctx.structs.find((item) => item.name === account.accountType);
  const stored = struct?.fields.find((field) => field.name === "bump" && field.ty === "u8");
  if (stored && !account.opts.init && !account.opts.initIfNeeded) {
    return `ctx.accounts.${account.rustName}.${stored.rustName}`;
  }
  return `ctx.bumps.${account.rustName}`;
}

function pdaSeeds(account: AccountParam, ctx: LowerContext): { name: string; prelude: Stmt[] } | null {
  if (account.opts.seeds.length === 0) return null;
  const prelude: Stmt[] = [];
  const parts: string[] = [];
  account.opts.seeds.forEach((seed, index) => {
    parts.push(seedExpr(seed, index, account, ctx, prelude));
  });
  const bump = fresh(ctx);
  prelude.push({ code: `let ${bump} = ${bumpSource(account, ctx)};` });
  parts.push(`&[${bump}][..]`);
  const name = fresh(ctx);
  prelude.push({ code: `let ${name}: &[&[u8]] = &[${parts.join(", ")}];` });
  return { name, prelude };
}

function seedExpr(seed: SeedModel, index: number, account: AccountParam, ctx: LowerContext, prelude: Stmt[]): string {
  if (seed.kind === "const") {
    const rendered = rustByteStr(seed.value);
    if (rendered.startsWith("b")) return rendered;
    const name = fresh(ctx);
    prelude.push({ code: `let ${name}: &[u8] = ${rendered};` });
    return name;
  }
  if (seed.kind === "account") {
    const acc = ctx.scope.accounts.get(seed.name);
    const rustName = acc?.rustName ?? snake(seed.name);
    const local = fresh(ctx);
    prelude.push({ code: `let ${local} = ctx.accounts.${rustName}.key();` });
    return `${local}.as_ref()`;
  }
  const arg = ctx.scope.args.get(seed.name);
  const rustName = arg?.rustName ?? snake(seed.name);
  const ty = arg?.ty ?? "u64";
  const local = fresh(ctx);
  if (ty === "pubkey") {
    prelude.push({ code: `let ${local} = ${rustName};` });
    return `${local}.as_ref()`;
  }
  if (ty === "string") return `${rustName}.as_bytes()`;
  if (ty === "bytes32") return `&${rustName}[..]`;
  if (ty === "u8" || ty === "i8" || ty === "bool") {
    prelude.push({ code: `let ${local} = [${rustName} as u8];` });
    return `&${local}[..]`;
  }
  prelude.push({ code: `let ${local} = ${rustName}.to_le_bytes();` });
  return `${local}.as_ref()`;
}

function objectArg(node: ts.CallExpression, ctx: LowerContext): ts.ObjectLiteralExpression | null {
  const arg = node.arguments[0];
  if (!arg || !ts.isObjectLiteralExpression(arg)) {
    ctx.diag.errorAt(ctx.sf, node, "Expected an object literal argument.");
    return null;
  }
  return arg;
}

function prop(obj: ts.ObjectLiteralExpression, name: string): ts.Expression | null {
  for (const property of obj.properties) {
    if (ts.isPropertyAssignment(property) && property.name && ts.isIdentifier(property.name) && property.name.text === name) return property.initializer;
    if (ts.isShorthandPropertyAssignment(property) && property.name.text === name) return property.name;
  }
  return null;
}

function identProp(obj: ts.ObjectLiteralExpression, name: string, ctx: LowerContext): string | null {
  const value = prop(obj, name);
  if (!value) return null;
  if (ts.isIdentifier(value)) return value.text;
  ctx.diag.errorAt(ctx.sf, value, `"${name}" must be an account name.`);
  return null;
}

function boolProp(obj: ts.ObjectLiteralExpression, name: string): boolean {
  const value = prop(obj, name);
  if (!value) return false;
  if (value.kind === ts.SyntaxKind.TrueKeyword) return true;
  return false;
}

function lowerExpr(node: ts.Expression, ctx: LowerContext, expected?: Scalar): Expr | null {
  if (ts.isParenthesizedExpression(node)) return lowerExpr(node.expression, ctx, expected);
  if (ts.isNumericLiteral(node) || ts.isBigIntLiteral(node)) return lowerInt(node, ctx, expected);
  if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) {
    return { rust: node.kind === ts.SyntaxKind.TrueKeyword ? "true" : "false", ty: "bool" };
  }
  if (ts.isStringLiteral(node)) {
    if (expected === "bytes32") return bytes32FromString(node.text, ctx, node);
    return { rust: `${rustString(node.text)}.to_string()`, ty: "string" };
  }
  if (ts.isIdentifier(node)) return lowerIdent(node, ctx);
  if (ts.isPropertyAccessExpression(node)) return lowerProp(node, ctx);
  if (ts.isPrefixUnaryExpression(node)) return lowerUnary(node, ctx, expected);
  if (ts.isBinaryExpression(node)) return lowerBinary(node, ctx, expected);
  if (ts.isCallExpression(node)) return lowerCallExpr(node, ctx, expected);
  ctx.diag.errorAt(ctx.sf, node, "Unsupported expression.");
  return null;
}

function lowerInt(node: ts.NumericLiteral | ts.BigIntLiteral, ctx: LowerContext, expected?: Scalar): Expr | null {
  const text = node.text.replace(/n$/, "");
  let value: bigint;
  try {
    value = BigInt(text);
  } catch {
    ctx.diag.errorAt(ctx.sf, node, "Invalid integer literal.");
    return null;
  }
  const preferred: Scalar = ts.isBigIntLiteral(node) ? "u64" : "u32";
  if (expected && isInteger(expected)) {
    if (!fits(value, expected)) {
      ctx.diag.errorAt(ctx.sf, node, `${value} does not fit in ${expected}.`);
      return null;
    }
    return { rust: rustLiteral(value, expected), ty: expected };
  }
  return { rust: rustLiteral(value, preferred), ty: preferred, adaptable: { kind: "int", value } };
}

function bytes32FromString(text: string, ctx: LowerContext, node: ts.Node): Expr | null {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length > 32) {
    ctx.diag.errorAt(ctx.sf, node, "bytes32 values must be at most 32 bytes.");
    return null;
  }
  const list = [...bytes, ...new Array(32 - bytes.length).fill(0)].map((byte) => `${byte}u8`).join(", ");
  return { rust: `[${list}]`, ty: "bytes32" };
}

function lowerIdent(node: ts.Identifier, ctx: LowerContext): Expr | null {
  const local = ctx.scope.locals.get(node.text);
  if (local) return { rust: local.rustName, ty: local.ty };
  const arg = ctx.scope.args.get(node.text);
  if (arg) return { rust: arg.rustName, ty: arg.ty };
  if (ctx.scope.accounts.has(node.text)) {
    ctx.diag.errorAt(ctx.sf, node, `Account "${node.text}" is not a value. Read \`${node.text}.key\` or a field.`);
    return null;
  }
  ctx.diag.errorAt(ctx.sf, node, `Unknown name "${node.text}".`);
  return null;
}

function asValue(ty: FieldTy): ValueTy {
  if (typeof ty === "string") return ty;
  if (ty.kind === "struct") return { struct: ty.name };
  if (ty.kind === "enum") return { enum: ty.name };
  if (ty.kind === "vec") return { vec: ty.inner, max: ty.max };
  if (ty.kind === "str") return { str: ty.max };
  return "string";
}

function lowerProp(node: ts.PropertyAccessExpression, ctx: LowerContext): Expr | null {
  if (ts.isIdentifier(node.expression)) {
    const bound = ctx.armFields.get(`${node.expression.text}.${node.name.text}`);
    if (bound) return bound;
    const arg = ctx.scope.args.get(node.expression.text);
    if (arg && typeof arg.ty !== "string" && "vec" in arg.ty && node.name.text === "length") {
      return { rust: `(${arg.rustName}.len() as u64)`, ty: "u64" };
    }
  }
  if (!ts.isIdentifier(node.expression)) {
    const base = lowerExpr(node.expression, ctx);
    if (!base || typeof base.ty === "string" || !("struct" in base.ty)) {
      ctx.diag.errorAt(ctx.sf, node, "Only fields of accounts and nested structs can be read.");
      return null;
    }
    const struct = ctx.structs.find((item) => item.name === base.ty.struct);
    const field = struct?.fields.find((item) => item.name === node.name.text);
    if (!struct || !field) {
      ctx.diag.errorAt(ctx.sf, node, `No field "${node.name.text}" on this value.`);
      return null;
    }
    return { rust: `${base.rust}.${field.rustName}`, ty: asValue(field.ty) };
  }
  const variants = ctx.enums.get(node.expression.text);
  if (variants) {
    const variant = variants.find((item) => item.name === node.name.text);
    if (!variant) {
      ctx.diag.errorAt(ctx.sf, node, `${node.expression.text} has no variant "${node.name.text}".`);
      return null;
    }
    return { rust: `${node.expression.text}::${variant.rustName}`, ty: { enum: node.expression.text } };
  }
  const account = ctx.scope.accounts.get(node.expression.text);
  if (!account) {
    ctx.diag.errorAt(ctx.sf, node, `Unknown name "${node.expression.text}".`);
    return null;
  }
  return accountField(account, node.name.text, ctx, node);
}

function accountRoot(account: AccountParam, ctx: LowerContext): string {
  if (ctx.inConstraint) return account.rustName;
  const struct = ctx.structs.find((item) => item.name === account.accountType);
  if (struct?.zeroCopy) {
    // load_mut rejects an account whose discriminator has not been written yet.
    const load = account.opts.init ? "load_init" : account.opts.mut || account.opts.initIfNeeded ? "load_mut" : "load";
    return `(*ctx.accounts.${account.rustName}.${load}()?)`;
  }
  if (account.opts.optional) {
    const method = account.opts.mut || account.opts.init || account.opts.initIfNeeded ? "as_mut" : "as_ref";
    noteError(ctx, "MissingAccount", "Optional account was read while absent");
    return `ctx.accounts.${account.rustName}.${method}().ok_or(AxolotlError::MissingAccount)?`;
  }
  return `ctx.accounts.${account.rustName}`;
}

function readU64(account: string, offset: number, ctx: LowerContext): string {
  noteError(ctx, "AccountTooSmall", "Account data is shorter than the read");
  return `{ let __ax_info = ctx.accounts.${account}.to_account_info(); let __ax_data = __ax_info.try_borrow_data()?; let __ax_bytes = __ax_data.get(${offset}..${offset + 8}).ok_or(AxolotlError::AccountTooSmall)?; u64::from_le_bytes(__ax_bytes.try_into().map_err(|_| AxolotlError::AccountTooSmall)?) }`;
}

function accountField(account: AccountParam, field: string, ctx: LowerContext, node: ts.Node): Expr | null {
  if (field === "key" && account.accountKind !== "remaining") {
    const prefix = ctx.inConstraint ? account.rustName : `ctx.accounts.${account.rustName}`;
    return { rust: `${prefix}.key()`, ty: "pubkey" };
  }
  if (account.accountKind === "fees" && field === "lamportsPerSignature") {
    return expr(readU64(account.rustName, 0, ctx), "u64");
  }
  if (account.accountKind === "lastRestart" && field === "slot") {
    return expr(readU64(account.rustName, 0, ctx), "u64");
  }
  if ((account.accountKind === "recentBlockhashes" || account.accountKind === "slotHistory" || account.accountKind === "epochRewards") && field === "bytes") {
    return { rust: `(ctx.accounts.${account.rustName}.to_account_info().data_len() as u64)`, ty: "u64" };
  }
  if (account.accountKind === "remaining" && field === "count") {
    return { rust: "(ctx.remaining_accounts.len() as u64)", ty: "u64" };
  }
  if (account.accountKind === "instructions" && field === "index") {
    const info = `ctx.accounts.${account.rustName}.to_account_info()`;
    return {
      rust: `{ let __ax_info = ${info}; let __ax_data = __ax_info.try_borrow_data()?; let __ax_len = __ax_data.len(); u16::from_le_bytes([__ax_data[__ax_len - 2], __ax_data[__ax_len - 1]]) }`,
      ty: "u16",
    };
  }
  if ((account.accountKind === "slotHashes" || account.accountKind === "stakeHistory") && field === "bytes") {
    return { rust: `(ctx.accounts.${account.rustName}.to_account_info().data_len() as u64)`, ty: "u64" };
  }
  if (account.accountKind === "epochSchedule") {
    const names: Record<string, { rust: string; ty: Scalar }> = {
      slotsPerEpoch: { rust: "slots_per_epoch", ty: "u64" },
      leaderScheduleSlotOffset: { rust: "leader_schedule_slot_offset", ty: "u64" },
      warmup: { rust: "warmup", ty: "bool" },
      firstNormalEpoch: { rust: "first_normal_epoch", ty: "u64" },
      firstNormalSlot: { rust: "first_normal_slot", ty: "u64" },
    };
    const found = names[field];
    if (!found) {
      ctx.diag.errorAt(ctx.sf, node, `EpochSchedule has no field "${field}".`);
      return null;
    }
    return { rust: `ctx.accounts.${account.rustName}.${found.rust}`, ty: found.ty };
  }
  if (account.accountKind === "user" && account.accountType) {
    if (account.opts.optional && !ctx.guarded.has(account.name) && !ctx.inConstraint) {
      ctx.diag.errorAt(ctx.sf, node, `"${account.name}" is optional. Read it inside \`if (present(${account.name})) { ... }\`.`);
      return null;
    }
    const struct = ctx.structs.find((item) => item.name === account.accountType);
    const found = struct?.fields.find((item) => item.name === field);
    if (!found) {
      ctx.diag.errorAt(ctx.sf, node, `${account.accountType} has no field "${field}".`);
      return null;
    }
    const root = accountRoot(account, ctx);
    const rust = `${root}.${found.rustName}`;
    return expr(rust, asValue(found.ty), { t: "field", root: { t: "text", rust: root }, name: found.rustName });
  }
  const builtin = builtinField(account, field);
  if (!builtin) {
    ctx.diag.errorAt(ctx.sf, node, `Cannot read "${field}" on this account.`);
    return null;
  }
  return { rust: `ctx.accounts.${account.rustName}.${builtin.rust}`, ty: builtin.ty };
}

function builtinField(account: AccountParam, field: string): { rust: string; ty: Scalar } | null {
  if (account.accountKind === "mint") {
    if (field === "decimals") return { rust: "decimals", ty: "u8" };
    if (field === "supply") return { rust: "supply", ty: "u64" };
    if (field === "isInitialized") return { rust: "is_initialized", ty: "bool" };
  }
  if (account.accountKind === "tokenAccount") {
    if (field === "mint") return { rust: "mint", ty: "pubkey" };
    if (field === "owner") return { rust: "owner", ty: "pubkey" };
    if (field === "amount") return { rust: "amount", ty: "u64" };
  }
  if (account.accountKind === "clock") {
    if (field === "unixTimestamp") return { rust: "unix_timestamp", ty: "i64" };
    if (field === "slot") return { rust: "slot", ty: "u64" };
    if (field === "epoch") return { rust: "epoch", ty: "u64" };
  }
  return null;
}

function lowerUnary(node: ts.PrefixUnaryExpression, ctx: LowerContext, expected?: Scalar): Expr | null {
  if (node.operator === ts.SyntaxKind.ExclamationToken) {
    const inner = lowerExpr(node.operand, ctx, "bool");
    if (!inner) return null;
    const concrete = adapt(inner, "bool", ctx, node.operand);
    if (!concrete) return null;
    return { rust: `!(${concrete.rust})`, ty: "bool" };
  }
  if (node.operator === ts.SyntaxKind.MinusToken) {
    const inner = lowerExpr(node.operand, ctx, expected);
    if (!inner) return null;
    if (inner.adaptable) {
      const value = -inner.adaptable.value;
      const ty = expected && isInteger(expected) ? expected : "i64";
      if (!fits(value, ty)) {
        ctx.diag.errorAt(ctx.sf, node, `${value} does not fit in ${ty}.`);
        return null;
      }
      return { rust: rustLiteral(value, ty), ty, adaptable: expected ? undefined : { kind: "int", value } };
    }
    if (typeof inner.ty !== "string" || !isInteger(inner.ty) || !inner.ty.startsWith("i")) {
      ctx.diag.errorAt(ctx.sf, node, "Unary minus is only supported on signed integers.");
      return null;
    }
    ctx.usesArithmetic = true;
    return { rust: `${inner.rust}.checked_neg().ok_or(AxolotlError::ArithmeticOverflow)?`, ty: inner.ty };
  }
  ctx.diag.errorAt(ctx.sf, node, "Unsupported unary operator.");
  return null;
}

function lowerBinary(node: ts.BinaryExpression, ctx: LowerContext, expected?: Scalar): Expr | null {
  const op = node.operatorToken.kind;
  if (op === ts.SyntaxKind.QuestionQuestionToken) {
    const left = lowerExpr(node.left, ctx);
    if (!left || typeof left.ty === "string" || !("option" in left.ty)) {
      ctx.diag.errorAt(ctx.sf, node.left, "`??` is only supported on Option<T>.");
      return null;
    }
    const right = lowerExpr(node.right, ctx, left.ty.option);
    if (!right) return null;
    const concrete = adapt(right, left.ty.option, ctx, node.right);
    if (!concrete) return null;
    return { rust: `${left.rust}.unwrap_or(${concrete.rust})`, ty: left.ty.option };
  }
  if (op === ts.SyntaxKind.AmpersandAmpersandToken || op === ts.SyntaxKind.BarBarToken) {
    const left = expectBool(node.left, ctx);
    const right = expectBool(node.right, ctx);
    if (!left || !right) return null;
    const token = op === ts.SyntaxKind.AmpersandAmpersandToken ? "&&" : "||";
    return fromIr({ t: "logic", op: token, left: irOf(left), right: irOf(right) }, "bool");
  }
  const compare: Partial<Record<ts.SyntaxKind, string>> = {
    [ts.SyntaxKind.EqualsEqualsToken]: "==",
    [ts.SyntaxKind.EqualsEqualsEqualsToken]: "==",
    [ts.SyntaxKind.ExclamationEqualsToken]: "!=",
    [ts.SyntaxKind.ExclamationEqualsEqualsToken]: "!=",
    [ts.SyntaxKind.LessThanToken]: "<",
    [ts.SyntaxKind.LessThanEqualsToken]: "<=",
    [ts.SyntaxKind.GreaterThanToken]: ">",
    [ts.SyntaxKind.GreaterThanEqualsToken]: ">=",
  };
  if (compare[op]) {
    const pair = pairExprs(node.left, node.right, ctx);
    if (!pair) return null;
    const cmp = compare[op] as "==" | "!=" | "<" | "<=" | ">" | ">=";
    return fromIr({ t: "cmp", op: cmp, left: irOf(pair.left), right: irOf(pair.right) }, "bool");
  }
  const math: Partial<Record<ts.SyntaxKind, string>> = {
    [ts.SyntaxKind.PlusToken]: "checked_add",
    [ts.SyntaxKind.MinusToken]: "checked_sub",
    [ts.SyntaxKind.AsteriskToken]: "checked_mul",
    [ts.SyntaxKind.SlashToken]: "checked_div",
    [ts.SyntaxKind.PercentToken]: "checked_rem",
  };
  const method = math[op];
  if (!method) {
    ctx.diag.errorAt(ctx.sf, node, "Unsupported operator.");
    return null;
  }
  const pair = pairExprs(node.left, node.right, ctx, expected);
  if (!pair) return null;
  if (!isInteger(pair.left.ty)) {
    ctx.diag.errorAt(ctx.sf, node, "Arithmetic is only supported on integer types.");
    return null;
  }
  ctx.usesArithmetic = true;
  const checkOp = method === "checked_add" ? "add" : method === "checked_sub" ? "sub" : method === "checked_mul" ? "mul" : method === "checked_div" ? "div" : "rem";
  const ir: IrExpr = { t: "check", op: checkOp, left: irOf(pair.left), right: irOf(pair.right) };
  return fromIr(ir, pair.left.ty);
}

function pairExprs(leftNode: ts.Expression, rightNode: ts.Expression, ctx: LowerContext, expected?: Scalar): { left: Expr; right: Expr } | null {
  const left = lowerExpr(leftNode, ctx, expected);
  const right = lowerExpr(rightNode, ctx, left && !left.adaptable ? left.ty : expected);
  if (!left || !right) return null;
  if (left.adaptable && !right.adaptable) {
    const adapted = adapt(left, right.ty, ctx, leftNode);
    if (!adapted) return null;
    return { left: adapted, right };
  }
  if (right.adaptable && !left.adaptable) {
    const adapted = adapt(right, left.ty, ctx, rightNode);
    if (!adapted) return null;
    return { left, right: adapted };
  }
  if (left.adaptable && right.adaptable) {
    const ty = expected && isInteger(expected) ? expected : (ts.isBigIntLiteral(leftNode) || ts.isBigIntLiteral(rightNode) ? "u64" : left.ty);
    const a = adapt(left, ty, ctx, leftNode);
    const b = adapt(right, ty, ctx, rightNode);
    if (!a || !b) return null;
    return { left: a, right: b };
  }
  if (!sameTy(left.ty, right.ty)) {
    ctx.diag.errorAt(ctx.sf, rightNode, "Type mismatch.");
    return null;
  }
  return { left, right };
}

function expectBool(node: ts.Expression, ctx: LowerContext): Expr | null {
  const expr = lowerExpr(node, ctx, "bool");
  if (!expr) return null;
  return adapt(expr, "bool", ctx, node);
}

function lowerCallExpr(node: ts.CallExpression, ctx: LowerContext, _expected?: Scalar): Expr | null {
  const called = callName(node.expression);
  if (called === "ed25519.check" || called === "secp256k1.check") return lowerPrecompile(node, ctx, called.startsWith("ed") ? "ed25519" : "secp256k1");
  if (called === "present" && node.arguments.length === 1 && ts.isIdentifier(node.arguments[0]!)) {
    const account = ctx.scope.accounts.get(node.arguments[0].text);
    if (!account?.opts.optional) {
      ctx.diag.errorAt(ctx.sf, node, "present() takes an optional account.");
      return null;
    }
    return { rust: `ctx.accounts.${account.rustName}.is_some()`, ty: "bool" };
  }
  if (called === "cpiReturn") {
    lowerCpi(node, ctx, locOf(ctx.sf, node));
    const read = ctx.cpiRead;
    ctx.cpiRead = undefined;
    if (!read) ctx.diag.errorAt(ctx.sf, node, "cpiReturn<T>(...) needs a scalar type argument.");
    return read ?? null;
  }
  if (called === "token.transferFeeBasisPoints") {
    ctx.diag.errorAt(ctx.sf, node, "Token-2022 fee config is not part of this language.");
    return null;
  }
  if (called && ctx.helpers.has(called)) {
    const helper = ctx.helpers.get(called)!;
    if (!helper.returnType) {
      ctx.diag.errorAt(ctx.sf, node, `Helper "${called}" does not return a value.`);
      return null;
    }
    const args = helperArgs(node, helper, ctx);
    if (!args) return null;
    return { rust: `${helper.rustName}(${args})?`, ty: helper.returnType };
  }
  if (ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression) && node.expression.name.text === "minimumBalance") {
    const account = ctx.scope.accounts.get(node.expression.expression.text);
    if (account?.accountKind !== "rent" || node.arguments.length !== 1) {
      ctx.diag.errorAt(ctx.sf, node, "rent.minimumBalance(space) expected.");
      return null;
    }
    const space = lowerExpr(node.arguments[0]!, ctx, "u64");
    if (!space) return null;
    const concrete = adapt(space, "u64", ctx, node.arguments[0]!);
    if (!concrete) return null;
    return { rust: `ctx.accounts.${account.rustName}.minimum_balance(${concrete.rust} as usize)`, ty: "u64" };
  }
  ctx.diag.errorAt(ctx.sf, node, "This call cannot be used as a value.");
  return null;
}

function lowerPrecompile(node: ts.CallExpression, ctx: LowerContext, kind: "ed25519" | "secp256k1"): Expr | null {
  const [ixNode, indexNode, keyNode, messageNode] = node.arguments;
  if (!ixNode || !indexNode || !keyNode || !messageNode || !ts.isIdentifier(ixNode) || !ts.isIdentifier(keyNode) || !ts.isIdentifier(messageNode)) {
    ctx.diag.errorAt(ctx.sf, node, `${kind}.check(instructions, index, key, message) expected.`);
    return null;
  }
  const ix = ctx.scope.accounts.get(ixNode.text);
  if (ix?.accountKind !== "instructions") {
    ctx.diag.errorAt(ctx.sf, ixNode, "The first argument must be the instructions sysvar.");
    return null;
  }
  const index = lowerExpr(indexNode, ctx, "u16");
  const key = lowerExpr(keyNode, ctx, "bytes32");
  const message = lowerExpr(messageNode, ctx, "string");
  if (!index || !key || !message) return null;
  const indexRust = adapt(index, "u16", ctx, indexNode);
  const keyRust = adapt(key, "bytes32", ctx, keyNode);
  const messageRust = adapt(message, "string", ctx, messageNode);
  if (!indexRust || !keyRust || !messageRust) return null;
  const fnName = kind === "ed25519" ? "check_ed25519" : "check_secp256k1";
  return {
    rust: `ax_codec::${fnName}(&ctx.accounts.${ix.rustName}.to_account_info(), ${indexRust.rust} as usize, &${keyRust.rust}, ${messageRust.rust}.as_bytes())?`,
    ty: "bool",
  };
}

function sameTy(left: ValueTy, right: ValueTy): boolean {
  if (typeof left === "string" || typeof right === "string") return left === right;
  return JSON.stringify(left) === JSON.stringify(right);
}

function helperArgs(node: ts.CallExpression, helper: HelperModel, ctx: LowerContext): string | null {
  if (node.arguments.length !== helper.params.length) {
    ctx.diag.errorAt(ctx.sf, node, `${helper.name} expects ${helper.params.length} arguments.`);
    return null;
  }
  const parts: string[] = [];
  for (let i = 0; i < helper.params.length; i++) {
    const param = helper.params[i]!;
    const expr = lowerExpr(node.arguments[i]!, ctx, param.ty);
    if (!expr) return null;
    const concrete = adapt(expr, param.ty, ctx, node.arguments[i]!);
    if (!concrete) return null;
    parts.push(concrete.rust);
  }
  return parts.join(", ");
}

function lowerHelperCall(node: ts.CallExpression, helper: HelperModel, ctx: LowerContext, loc: Loc): Stmt[] {
  const args = helperArgs(node, helper, ctx);
  if (!args) return [];
  return [...takePending(ctx), { code: `${helper.rustName}(${args})?;`, loc }];
}

function lowerPush(node: ts.CallExpression, ctx: LowerContext, loc: Loc): Stmt[] {
  if (node.arguments.length !== 2) {
    ctx.diag.errorAt(ctx.sf, node, "push(vecField, value) expected.");
    return [];
  }
  const target = lowerExpr(node.arguments[0]!, ctx);
  if (!target || typeof target.ty === "string" || !("vec" in target.ty)) {
    ctx.diag.errorAt(ctx.sf, node.arguments[0]!, "push() requires a Vec field.");
    return [];
  }
  const value = lowerExpr(node.arguments[1]!, ctx, target.ty.vec);
  if (!value) return [];
  const concrete = adapt(value, target.ty.vec, ctx, node.arguments[1]!);
  if (!concrete) return [];
  if (!("max" in target.ty)) {
    ctx.diag.errorAt(ctx.sf, node, "push() needs a Vec<T, N> field.");
    return [];
  }
  const max = target.ty.max;
  noteError(ctx, "VecFull", "Vec is already at its maximum length");
  return [
    ...takePending(ctx),
    { code: `if ${target.rust}.len() >= ${max} { return Err(AxolotlError::VecFull.into()); }`, loc },
    { code: `${target.rust}.push(${concrete.rust});`, loc },
  ];
}

function lowerCreateAta(node: ts.CallExpression, ctx: LowerContext, loc: Loc): Stmt[] {
  const obj = objectArg(node, ctx);
  if (!obj) return [];
  const payer = identProp(obj, "payer", ctx);
  const account = identProp(obj, "account", ctx);
  const owner = identProp(obj, "owner", ctx);
  const mint = identProp(obj, "mint", ctx);
  if (!payer || !account || !owner || !mint) {
    ctx.diag.errorAt(ctx.sf, node, "token.createAssociatedAccount({ payer, account, owner, mint }) expected.");
    return [];
  }
  const system = [...ctx.scope.accounts.values()].find((item) => item.accountKind === "system");
  const tokenProgram = [...ctx.scope.accounts.values()].find((item) => item.accountKind === "tokenProgram" || item.accountKind === "token2022");
  const associated = [...ctx.scope.accounts.values()].find((item) => item.accountKind === "associatedToken");
  if (!system || !tokenProgram || !associated) {
    ctx.diag.errorAt(ctx.sf, node, "Creating an associated token account requires SystemProgram, TokenProgram, and AssociatedTokenProgram.");
    return [];
  }
  return [{
    code: `anchor_spl::associated_token::create(CpiContext::new(anchor_spl::associated_token::ID, anchor_spl::associated_token::Create { payer: ctx.accounts.${snake(payer)}.to_account_info(), associated_token: ctx.accounts.${snake(account)}.to_account_info(), authority: ctx.accounts.${snake(owner)}.to_account_info(), mint: ctx.accounts.${snake(mint)}.to_account_info(), system_program: ctx.accounts.${system.rustName}.to_account_info(), token_program: ctx.accounts.${tokenProgram.rustName}.to_account_info() }))?;`,
    loc,
  }];
}

function lowerMintTo(node: ts.CallExpression, ctx: LowerContext, loc: Loc): Stmt[] {
  const obj = objectArg(node, ctx);
  if (!obj) return [];
  const mint = identProp(obj, "mint", ctx);
  const to = identProp(obj, "to", ctx);
  const authority = identProp(obj, "authority", ctx);
  const amountNode = prop(obj, "amount");
  if (!mint || !to || !authority || !amountNode) {
    ctx.diag.errorAt(ctx.sf, node, "token.mintTo({ mint, to, authority, amount }) expected.");
    return [];
  }
  const tokenProgram = [...ctx.scope.accounts.values()].find((item) => item.accountKind === "token2022" || item.accountKind === "tokenProgram");
  if (!tokenProgram) {
    ctx.diag.errorAt(ctx.sf, node, "token.mintTo requires a token program account.");
    return [];
  }
  const toAcc = ctx.scope.accounts.get(to);
  if (toAcc && !tokenConstrained(toAcc, mint, authority, ctx, obj)) return [];
  const amount = lowerExpr(amountNode, ctx, "u64");
  if (!amount) return [];
  const concrete = adapt(amount, "u64", ctx, amountNode);
  if (!concrete) return [];
  const authorityAcc = ctx.scope.accounts.get(authority);
  const seeds = authorityAcc ? pdaSeeds(authorityAcc, ctx) : null;
  const accounts = `anchor_spl::token_2022::MintTo { mint: ctx.accounts.${snake(mint)}.to_account_info(), to: ctx.accounts.${snake(to)}.to_account_info(), authority: ctx.accounts.${snake(authority)}.to_account_info() }`;
  const cpi = seeds
    ? `CpiContext::new_with_signer(ctx.accounts.${tokenProgram.rustName}.key(), ${accounts}, &[${seeds.name}])`
    : `CpiContext::new(ctx.accounts.${tokenProgram.rustName}.key(), ${accounts})`;
  return [...(seeds?.prelude ?? []), { code: `anchor_spl::token_2022::mint_to(${cpi}, ${concrete.rust})?;`, loc }];
}

function adapt(expr: Expr, target: Scalar, ctx: LowerContext, node: ts.Node): Expr | null {
  if (!expr.adaptable) {
    if (expr.ty !== target) {
      ctx.diag.errorAt(ctx.sf, node, `Type mismatch: expected ${target}, got ${expr.ty}.`);
      return null;
    }
    return expr;
  }
  if (expr.adaptable.kind === "int") {
    if (!isInteger(target)) {
      ctx.diag.errorAt(ctx.sf, node, `Expected ${target}, got an integer.`);
      return null;
    }
    if (!fits(expr.adaptable.value, target)) {
      ctx.diag.errorAt(ctx.sf, node, `${expr.adaptable.value} does not fit in ${target}.`);
      return null;
    }
    return { rust: rustLiteral(expr.adaptable.value, target), ty: target };
  }
  return null;
}

function annotatedScalar(ctx: LowerContext, node: ts.TypeNode): Scalar | undefined {
  const text = node.getText(ctx.sf).split(".").pop()!;
  if (text === "bool" || text === "boolean") return "bool";
  if (text === "string") return "string";
  if (text === "Pubkey") return "pubkey";
  if (text === "bytes32") return "bytes32";
  if (["u8", "u16", "u32", "u64", "u128", "i8", "i16", "i32", "i64", "i128"].includes(text)) return text as Scalar;
  ctx.diag.errorAt(ctx.sf, node, `Unsupported type annotation "${text}".`);
  return undefined;
}

function rustTy(ty: Scalar): string {
  if (ty === "pubkey") return "Pubkey";
  if (ty === "string") return "String";
  if (ty === "bytes32") return "[u8; 32]";
  if (ty === "bool") return "bool";
  return ty;
}

function fresh(ctx: LowerContext): string {
  ctx.temps += 1;
  return `__ax_${ctx.temps}`;
}

function indent(stmts: Stmt[], level = 1): string {
  const pad = "    ".repeat(level);
  return stmts.map((stmt) => stmt.code.split("\n").map((line) => (line.length ? pad + line : line)).join("\n")).join("\n");
}
