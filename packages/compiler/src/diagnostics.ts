import ts from "typescript";

export interface Diagnostic {
  severity: "error" | "warning";
  file: string;
  line: number;
  column: number;
  message: string;
}

export interface Loc {
  file: string;
  line: number;
  column: number;
}

export function locOf(sf: ts.SourceFile, node: ts.Node): Loc {
  const lc = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  return { file: sf.fileName, line: lc.line + 1, column: lc.character + 1 };
}

export class Diagnostics {
  readonly items: Diagnostic[] = [];

  error(file: string, line: number, column: number, message: string): void {
    this.items.push({ severity: "error", file, line, column, message });
  }

  errorAt(sf: ts.SourceFile, node: ts.Node, message: string): void {
    const loc = locOf(sf, node);
    this.error(loc.file, loc.line, loc.column, message);
  }

  warn(file: string, line: number, column: number, message: string): void {
    this.items.push({ severity: "warning", file, line, column, message });
  }

  warnAt(sf: ts.SourceFile, node: ts.Node, message: string): void {
    const loc = locOf(sf, node);
    this.items.push({ severity: "warning", file: loc.file, line: loc.line, column: loc.column, message });
  }

  get ok(): boolean {
    return !this.items.some((item) => item.severity === "error");
  }

  format(): string {
    return this.items
      .map((item) => `${item.file}:${item.line}:${item.column}: ${item.severity}: ${item.message}`)
      .join("\n");
  }
}
