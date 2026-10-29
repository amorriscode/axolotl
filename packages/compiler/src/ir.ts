/**
 * The program after lowering, before any Rust is printed.
 *
 * A pass that builds these values may not know Rust syntax.
 * `print.ts` is the only place that turns them into source text.
 */

export type CheckOp = "add" | "sub" | "mul" | "div" | "rem";
export type CmpOp = "==" | "!=" | "<" | "<=" | ">" | ">=";

export type IrExpr =
  | { t: "int"; text: string }
  | { t: "bool"; value: boolean }
  | { t: "name"; name: string }
  | { t: "field"; root: IrExpr; name: string }
  | { t: "check"; op: CheckOp; left: IrExpr; right: IrExpr }
  | { t: "cmp"; op: CmpOp; left: IrExpr; right: IrExpr }
  | { t: "logic"; op: "&&" | "||"; left: IrExpr; right: IrExpr }
  | { t: "not"; expr: IrExpr }
  | { t: "neg"; expr: IrExpr }
  | { t: "text"; rust: string };

export type IrStmt =
  | { t: "let"; mutable: boolean; name: string; ty: string; value: IrExpr }
  | { t: "assign"; temp: string; place: IrExpr; value: IrExpr }
  | { t: "require"; cond: IrExpr; error: string }
  | { t: "if"; cond: IrExpr; then: IrStmt[]; else: IrStmt[] }
  | { t: "while"; cond: IrExpr; body: IrStmt[] }
  | { t: "block"; body: IrStmt[] }
  | { t: "text"; text: string };

export function textExpr(rust: string): IrExpr {
  return { t: "text", rust };
}

export function textStmt(text: string): IrStmt {
  return { t: "text", text };
}
