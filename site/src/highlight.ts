const RUST_KEYWORDS = new Set([
  "pub", "fn", "let", "mut", "if", "else", "return", "struct", "impl", "use",
  "export", "function", "interface", "import", "from", "void", "const",
  "true", "false", "as", "for", "while", "in", "mod", "type", "where", "self",
  "Ok", "Err", "Some", "None",
]);

type Tok = { kind: "plain" | "kw" | "str" | "cmt" | "num"; text: string };

function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function tokenize(code: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < code.length) {
    if (code.startsWith("//", i)) {
      const end = code.indexOf("\n", i);
      const stop = end < 0 ? code.length : end;
      out.push({ kind: "cmt", text: code.slice(i, stop) });
      i = stop;
      continue;
    }
    const quote = code[i];
    if (quote === '"' || quote === "'") {
      let j = i + 1;
      while (j < code.length && code[j] !== quote) {
        if (code[j] === "\\") j += 1;
        j += 1;
      }
      out.push({ kind: "str", text: code.slice(i, Math.min(code.length, j + 1)) });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(code[i] ?? "")) {
      let j = i + 1;
      while (j < code.length && /[0-9a-zA-Z_]/.test(code[j] ?? "")) j += 1;
      out.push({ kind: "num", text: code.slice(i, j) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(code[i] ?? "")) {
      let j = i + 1;
      while (j < code.length && /[A-Za-z0-9_]/.test(code[j] ?? "")) j += 1;
      const word = code.slice(i, j);
      out.push({ kind: RUST_KEYWORDS.has(word) ? "kw" : "plain", text: word });
      i = j;
      continue;
    }
    out.push({ kind: "plain", text: code[i]! });
    i += 1;
  }
  return out;
}

export function highlightRust(code: string): string {
  return tokenize(code).map((tok) => {
    const text = escape(tok.text);
    if (tok.kind === "plain") return text;
    return `<span class="tok-${tok.kind}">${text}</span>`;
  }).join("");
}
