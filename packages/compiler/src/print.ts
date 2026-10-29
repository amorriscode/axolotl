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
    case "block":
      return stmt.body.map((item) => renderStmt(item, level)).join("\n");
    case "text":
      return stmt.text.split("\n").map((line) => (line.length ? pad + line : line)).join("\n");
  }
}
