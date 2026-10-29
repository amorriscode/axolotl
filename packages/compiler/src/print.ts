/**
 * Prints the IR as Anchor Rust.
 *
 * This pass may know Rust syntax. It may not decide what a program means.
 */

import type { IrExpr, IrStmt } from "./ir.ts";

const CHECK: Record<string, string> = {
  add: "checked_add",
  sub: "checked_sub",
  mul: "checked_mul",
  div: "checked_div",
  rem: "checked_rem",
};

export function renderExpr(expr: IrExpr): string {
  switch (expr.t) {
    case "int":
    case "name":
      return expr.t === "int" ? expr.text : expr.name;
    case "bool":
      return expr.value ? "true" : "false";
    case "field":
      return `${renderExpr(expr.root)}.${expr.name}`;
    case "check":
      return `${renderExpr(expr.left)}.${CHECK[expr.op]}(${renderExpr(expr.right)}).ok_or(AxolotlError::ArithmeticOverflow)?`;
    case "cmp":
      return `(${renderExpr(expr.left)} ${expr.op} ${renderExpr(expr.right)})`;
    case "logic":
      return `(${renderExpr(expr.left)} ${expr.op} ${renderExpr(expr.right)})`;
    case "not":
      return `!(${renderExpr(expr.expr)})`;
    case "neg":
      return `${renderExpr(expr.expr)}.checked_neg().ok_or(AxolotlError::ArithmeticOverflow)?`;
    case "ixIndex":
      return `{ let __ax_info = ctx.accounts.${expr.account}.to_account_info(); let __ax_data = __ax_info.try_borrow_data()?; let __ax_len = __ax_data.len(); if __ax_len < 2 { return Err(AxolotlError::AccountTooSmall.into()); } let __ax_bytes = __ax_data.get(__ax_len - 2..__ax_len).ok_or(AxolotlError::AccountTooSmall)?; u16::from_le_bytes(__ax_bytes.try_into().map_err(|_| AxolotlError::AccountTooSmall)?) }`;
    case "text":
      return expr.rust;
  }
}

export function renderStmt(stmt: IrStmt, level = 0): string {
  const pad = "    ".repeat(level);
  const more = (body: IrStmt[]) => body.map((item) => renderStmt(item, level + 1)).join("\n");
  switch (stmt.t) {
    case "let":
      return `${pad}let${stmt.mutable ? " mut" : ""} ${stmt.name}: ${stmt.ty} = ${renderExpr(stmt.value)};`;
    case "assign":
      return `${pad}let ${stmt.temp} = ${renderExpr(stmt.value)};\n${pad}${renderExpr(stmt.place)} = ${stmt.temp};`;
    case "require":
      return `${pad}require!(${renderExpr(stmt.cond)}, AxolotlError::${stmt.error});`;
    case "if": {
      const elsePart = stmt.else.length === 0
        ? ""
        : stmt.else.length === 1 && stmt.else[0]?.t === "if"
          ? ` else ${renderStmt(stmt.else[0], 0).trimStart()}`
          : ` else {\n${more(stmt.else)}\n${pad}}`;
      return `${pad}if ${renderExpr(stmt.cond)} {\n${more(stmt.then)}\n${pad}}${elsePart}`;
    }
    case "while":
      return `${pad}while ${renderExpr(stmt.cond)} {\n${more(stmt.body)}\n${pad}}`;
    case "for": {
      const step: IrStmt = {
        t: "set",
        place: { t: "name", name: stmt.name },
        value: {
          t: "check",
          op: "add",
          left: { t: "name", name: stmt.name },
          right: { t: "int", text: `1${stmt.ty}` },
        },
      };
      const body = rewriteForContinue(stmt.body, step);
      const inner = [...body, step].map((item) => renderStmt(item, level + 2)).join("\n");
      return `${pad}{\n${pad}    let mut ${stmt.name}: ${stmt.ty} = ${renderExpr(stmt.init)};\n${pad}    while ${stmt.name} < ${renderExpr(stmt.bound)} {\n${inner}\n${pad}    }\n${pad}}`;
    }
    case "match": {
      const arms = stmt.arms.map((arm) => {
        const body = arm.body.map((item) => renderStmt(item, level + 2)).join("\n");
        return `${pad}    ${arm.pattern} => {\n${body}\n${pad}    }`;
      }).join("\n");
      return `${pad}match ${renderExpr(stmt.scrutinee)} {\n${arms}\n${pad}}`;
    }
    case "return":
      return stmt.value ? `${pad}return Ok(${renderExpr(stmt.value)});` : `${pad}return Ok(());`;
    case "set":
      return `${pad}${renderExpr(stmt.place)} = ${renderExpr(stmt.value)};`;
    case "continue":
      return `${pad}continue;`;
    case "break":
      return `${pad}break;`;
    case "block":
      return stmt.body.map((item) => renderStmt(item, level)).join("\n");
    case "text":
      return stmt.text.split("\n").map((line) => (line.length ? pad + line : line)).join("\n");
  }
}

/** `continue` in a for-loop runs the increment. A nested while or for keeps its own. */
function rewriteForContinue(stmts: IrStmt[], step: IrStmt): IrStmt[] {
  const out: IrStmt[] = [];
  for (const stmt of stmts) {
    if (stmt.t === "continue") {
      out.push(step, stmt);
      continue;
    }
    if (stmt.t === "if") {
      out.push({ ...stmt, then: rewriteForContinue(stmt.then, step), else: rewriteForContinue(stmt.else, step) });
      continue;
    }
    if (stmt.t === "block") {
      out.push({ ...stmt, body: rewriteForContinue(stmt.body, step) });
      continue;
    }
    if (stmt.t === "match") {
      out.push({ ...stmt, arms: stmt.arms.map((arm) => ({ ...arm, body: rewriteForContinue(arm.body, step) })) });
      continue;
    }
    out.push(stmt);
  }
  return out;
}
