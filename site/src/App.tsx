import { javascript } from "@codemirror/lang-javascript";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap } from "@codemirror/commands";
import { compile, formatDiagnostics, type CompileResult } from "@axolotl-sol/compiler";
import { useEffect, useMemo, useRef, useState } from "react";

type Page = "home" | "learn" | "compiler" | "play" | "score";

const SAMPLE = `import {
  require,
  type Account,
  type Pubkey,
  type Signer,
  type SystemProgram,
  type u64,
} from "@axolotl-sol/core";

export interface Counter {
  authority: Pubkey;
  count: u64;
}

export function initialize(
  counter: Account<Counter, { init: true; payer: "authority" }>,
  authority: Signer<{ mut: true }>,
  systemProgram: SystemProgram,
): void {
  counter.authority = authority.key;
  counter.count = 0n;
}

export function increment(
  counter: Account<Counter, { mut: true; hasOne: ["authority"] }>,
  authority: Signer,
): void {
  require(authority.key === counter.authority, "Unauthorized");
  counter.count = counter.count + 1n;
}
`;

const PROGRAM_ID = "8qUgK4vi5mPRKpGfTVto7FpWyBjNgfB6U6opToXWM585";

interface Scoreboard {
  generated: string;
  passed: number;
  failed: number;
  unsupported: number;
  total: number;
  passRate: number;
  anchor: string;
  solana: string;
  runtime: string;
  rows: { id: string; group: string; feature: string; status: "pass" | "fail" | "unsupported"; detail: string }[];
}

export function App() {
  const [page, setPage] = useState<Page>(() => pageFromHash());
  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const go = (next: Page) => {
    window.location.hash = next === "home" ? "" : next;
    setPage(next);
  };

  return (
    <div className="shell">
      <header className="nav">
        <button className="brand" onClick={() => go("home")}>
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} width={36} height={36} alt="" />
          <div>
            <strong>Axolotl</strong>
            <div><span>TypeScript to Anchor</span></div>
          </div>
        </button>
        <nav className="nav-links">
          <button className={page === "learn" ? "active" : ""} onClick={() => go("learn")}>Learn</button>
          <button className={page === "compiler" ? "active" : ""} onClick={() => go("compiler")}>Compiler</button>
          <button className={page === "play" ? "active" : ""} onClick={() => go("play")}>Playground</button>
          <button className={page === "score" ? "active" : ""} onClick={() => go("score")}>Scoreboard</button>
        </nav>
      </header>
      {page === "home" && <Home go={go} />}
      {page === "learn" && <Learn />}
      {page === "compiler" && <CompilerPage />}
      {page === "play" && <Playground />}
      {page === "score" && <Scoreboard />}
    </div>
  );
}

function pageFromHash(): Page {
  const hash = window.location.hash.replace("#", "").replace(/^\//, "");
  if (hash === "learn" || hash === "compiler" || hash === "play" || hash === "score") return hash;
  return "home";
}

function Home({ go }: { go: (page: Page) => void }) {
  return (
    <>
      <section className="hero">
        <div>
          <h1>Solana programs, written in <span className="accent">TypeScript</span>.</h1>
          <p className="lede">
            Axolotl compiles a strict TypeScript subset into Anchor Rust, then the Agave toolchain
            produces a deployable sBPF program and an Anchor IDL. Existing clients keep working.
          </p>
          <div className="actions">
            <button className="primary" onClick={() => go("play")}>Open the playground</button>
            <button className="secondary" onClick={() => go("score")}>Conformance scoreboard</button>
          </div>
        </div>
        <aside className="stat-card">
          <b>TS → Rust</b>
          <p>Anchor 1.2.2 · Agave 4.1.2 · sBPF v3. The binary is a normal Anchor program.</p>
        </aside>
      </section>
      <div className="pipeline" aria-label="Compilation pipeline">
        <span>TypeScript subset</span><i>→</i>
        <span>instruction model</span><i>→</i>
        <span>Anchor Rust + IDL</span><i>→</i>
        <span>sBPF program</span>
      </div>
      <section className="grid">
        <article className="card">
          <h3>Accounts, not objects</h3>
          <p>Instructions declare signers, PDAs, token accounts, and sysvars as typed parameters. Constraints live in the type argument.</p>
        </article>
        <article className="card">
          <h3>Checked by construction</h3>
          <p>Arithmetic cannot wrap. <code>require</code> becomes an Anchor error with a source location. The IDL discriminators match <code>anchor build</code>.</p>
        </article>
        <article className="card">
          <h3>Tested in-process</h3>
          <p>Examples and the conformance suite run on LiteSVM: counter, SPL vault, PDAs, CPI, clock, rent, events, and compute budget.</p>
        </article>
      </section>
    </>
  );
}

function Learn() {
  return (
    <article className="prose">
      <h1>Solana, then Axolotl</h1>
      <p className="lede">Five ideas are enough to read every example in this repo.</p>
      <h2>Accounts</h2>
      <p>Solana has no contract storage. A program owns accounts, and each account is an address, a lamport balance, an owner, and a byte array. Anchor puts an 8-byte discriminator in front of Borsh fields. Creating an account must leave it rent-exempt, or the runtime will refuse it.</p>
      <h2>Programs</h2>
      <p>A transaction names a program and a list of accounts. The program sees those accounts in order and can only write to the ones marked writable. Axolotl turns each exported function into one instruction, and the parameter order is the account order.</p>
      <pre>{`export function increment(
  counter: Account<Counter, { mut: true; hasOne: ["authority"] }>,
  authority: Signer,
): void {
  counter.count = counter.count + 1n;
}`}</pre>
      <h2>PDAs</h2>
      <p>Program-derived addresses are public keys that lie off the ed25519 curve. Nobody holds a private key. The program signs with the seeds and the bump. Axolotl writes those seeds into the Anchor constraint and, when the account has a <code>bump: u8</code> field, stores the canonical bump on init.</p>
      <h2>CPI</h2>
      <p>A program calls another program with <code>invoke</code>. The caller can only pass accounts it was given, and a PDA signature has to be rebuilt from the seeds. <code>system.transfer</code>, <code>token.transferChecked</code>, and <code>cpi()</code> are the three forms Axolotl lowers.</p>
      <h2>Tokens</h2>
      <p>An SPL mint defines decimals and supply. Balances live in token accounts, not in the mint. The vault example stores a PDA that is the authority of a token account, deposits with the user's signature, and withdraws with the PDA's seeds.</p>
    </article>
  );
}

function CompilerPage() {
  return (
    <article className="prose">
      <h1>How the compiler works</h1>
      <p className="lede">Direct sBPF emission would freeze Axolotl to one syscall surface. Generating Anchor Rust lets Agave and Anchor own the binary format.</p>
      <h2>Parse</h2>
      <p>The TypeScript compiler API builds a source file. Axolotl walks interfaces and exported functions. Anything else — classes, <code>async</code>, arbitrary calls — is an error that names the file and line.</p>
      <h2>Model</h2>
      <p>Parameters become accounts or arguments. Account options are read from the type literal, including seeds. The body is lowered to a small statement list: assignments, <code>if</code>, <code>while</code>, a restricted <code>for</code> loop, <code>require</code>, <code>emit</code>, <code>emitCpi</code>, <code>log</code>, and CPI.</p>
      <h2>Emit</h2>
      <p>Rust uses <code>#[program]</code>, <code>#[account]</code>, and <code>#[event]</code>. Integer math is <code>checked_add</code> and its siblings. The IDL uses Anchor's sighash: <code>sha256("global:name")[..8]</code> for instructions, <code>account:</code> and <code>event:</code> for the others. A source map records which TypeScript line produced each Rust line, so a rustc error can be printed next to the original source.</p>
      <h2>Build</h2>
      <p><code>axolotl build</code> writes an Anchor crate and runs <code>anchor build</code>. The <code>.so</code> in <code>target/deploy</code> is what LiteSVM loads and what <code>axolotl deploy</code> sends to a cluster.</p>
    </article>
  );
}

function Playground() {
  const [source, setSource] = useState(SAMPLE);
  const [tab, setTab] = useState<"rust" | "idl" | "errors">("rust");
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!host.current || view.current) return;
    const theme = EditorView.theme({
      "&": { height: "100%", background: "#0c100b", color: "#f4f1e6" },
      ".cm-content": { fontFamily: "ui-monospace, monospace", fontSize: "13.5px", padding: "12px 0" },
      ".cm-gutters": { background: "#10150e", color: "#809078", border: "none" },
      ".cm-activeLine": { background: "rgba(215,226,122,0.05)" },
    }, { dark: true });
    view.current = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: source,
        extensions: [
          keymap.of(defaultKeymap),
          javascript({ typescript: true }),
          theme,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) setSource(update.state.doc.toString());
          }),
        ],
      }),
    });
    return () => {
      view.current?.destroy();
      view.current = null;
    };
    // The editor owns the document after mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const result = useMemo<CompileResult>(() => compile({
    programName: "playground",
    programId: PROGRAM_ID,
    description: "Compiled in the browser",
    sources: [{ filename: "playground.ts", source }],
  }), [source]);

  const body = tab === "rust"
    ? result.rust
    : tab === "idl"
      ? JSON.stringify(result.idl, null, 2)
      : result.diagnostics.length ? formatDiagnostics(result.diagnostics) : "No diagnostics.";

  return (
    <section>
      <h1>Playground</h1>
      <p className="lede">Edit a program. The Rust and IDL update in the browser, with no toolchain.</p>
      <div className="split" style={{ marginTop: 18 }}>
        <div className="editor-wrap">
          <div className="tabs"><button className="active">playground.ts</button></div>
          <div className="cm-host" ref={host} />
        </div>
        <div className="output panel">
          <div className="tabs">
            <button className={tab === "rust" ? "active" : ""} onClick={() => setTab("rust")}>Rust</button>
            <button className={tab === "idl" ? "active" : ""} onClick={() => setTab("idl")}>IDL</button>
            <button className={tab === "errors" ? "active" : ""} onClick={() => setTab("errors")}>
              {result.ok ? "Diagnostics" : `Diagnostics (${result.diagnostics.length})`}
            </button>
          </div>
          <p className={result.ok ? "ok" : "diag"}>{result.ok ? "Compiled." : "The program has errors."}</p>
          <pre className="code">{body}</pre>
        </div>
      </div>
    </section>
  );
}

function Scoreboard() {
  const [data, setData] = useState<Scoreboard | null>(null);
  const [filter, setFilter] = useState<"all" | "pass" | "fail" | "unsupported">("all");
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}conformance.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(setData)
      .catch((reason: unknown) => setError(String(reason)));
  }, []);
  if (error) return <p className="diag">Could not load the scoreboard: {error}</p>;
  if (!data) return <p>Loading scoreboard…</p>;
  const rows = data.rows.filter((row) => filter === "all" || row.status === filter);
  return (
    <section>
      <h1>Conformance</h1>
      <p className="lede">
        {data.passed} passing, {data.failed} failing, {data.unsupported} unsupported.
        Pass rate <strong>{data.passRate}%</strong> on Anchor {data.anchor}, Agave {data.solana}, {data.runtime}. Generated {data.generated}.
      </p>
      <div className="filters">
        {(["all", "pass", "fail", "unsupported"] as const).map((item) => (
          <button key={item} className={filter === item ? "on" : ""} onClick={() => setFilter(item)}>{item}</button>
        ))}
      </div>
      <table>
        <thead>
          <tr><th>Group</th><th>Feature</th><th>Status</th><th>Detail</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.group}</td>
              <td>{row.feature}</td>
              <td><span className={`pill ${row.status}`}>{row.status}</span></td>
              <td>{row.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
