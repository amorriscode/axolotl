import { compile } from "@axolotl-sol/compiler";
import { useEffect, useMemo, useState } from "react";
import { AccountsFigure, CpiFigure, PdaFigure } from "./figures.tsx";
import { highlightRust } from "./highlight.ts";
import { Playground } from "./playground.tsx";
import { PROGRAM_ID, SAMPLE, sliceFunction } from "./sample.ts";
import { Specimen } from "./specimen.tsx";

type Page = "home" | "learn" | "compiler" | "play" | "score";

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

const NAV: { id: Page; href: string; label: string }[] = [
  { id: "learn", href: "#learn", label: "Learn" },
  { id: "compiler", href: "#compiler", label: "Compiler" },
  { id: "play", href: "#play", label: "Playground" },
  { id: "score", href: "#score", label: "Scoreboard" },
];

export function App() {
  const [page, setPage] = useState<Page>(() => pageFromHash());
  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <>
      <a className="skip" href="#content">Skip to content</a>
      <header className="mast">
        <a className="word" href="#home">Axolotl</a>
        <nav aria-label="Pages">
          {NAV.map((item) => (
            <a key={item.id} href={item.href} aria-current={page === item.id ? "page" : undefined}>{item.label}</a>
          ))}
        </nav>
      </header>
      <main id="content" tabIndex={-1}>
        {page === "home" && <Home />}
        {page === "learn" && <Learn />}
        {page === "compiler" && <CompilerPage />}
        {page === "play" && <Playground />}
        {page === "score" && <Scoreboard />}
      </main>
      <footer className="colophon">
        <p>Anchor programs, written from a TypeScript subset. <a href="https://github.com/amorriscode/axolotl">Source</a>.</p>
      </footer>
    </>
  );
}

function pageFromHash(): Page {
  const raw = window.location.hash.replace(/^#\/?/, "");
  if (raw.startsWith("play")) return "play";
  if (raw === "learn" || raw === "compiler" || raw === "score") return raw;
  return "home";
}

function useScore() {
  const [data, setData] = useState<Scoreboard | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}conformance.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<Scoreboard>;
      })
      .then(setData)
      .catch((reason: unknown) => setError(String(reason)));
  }, []);
  return { data, error };
}

function Home() {
  const { data } = useScore();
  const lowered = useMemo(() => {
    const result = compile({
      programName: "playground",
      programId: PROGRAM_ID,
      sources: [{ filename: "playground.ts", source: SAMPLE }],
    });
    return { ok: result.ok, rust: sliceFunction(result.rust, "increment") };
  }, []);
  const ts = SAMPLE.slice(SAMPLE.indexOf("export function increment"));
  return (
    <>
      <section className="opening">
        <p className="kicker">TypeScript subset · Anchor Rust · Agave sBPF</p>
        <h1>The program is TypeScript. The binary is Anchor.</h1>
        <p className="deck">
          Axolotl lowers a strict subset to Anchor Rust. Agave then builds an ordinary sBPF program and an IDL. Existing clients keep working.
        </p>
        <p className="actions">
          <a className="go" href="#play">Open the playground</a>
          <a className="quiet" href="#score">{data ? `${data.passed} of ${data.total} conformance rows pass` : "Conformance scoreboard"}</a>
        </p>
      </section>
      <div className="split-plates">
        <Specimen />
        <a className="plate fraction-plate" href="#score">
          <p className="kicker">Conformance</p>
          <p className="fraction">
            {data ? <><span>{data.passed}</span><span className="of">/{data.total}</span></> : <span>—</span>}
          </p>
          <p>{data ? `${data.passRate}% on Anchor ${data.anchor} and Agave ${data.solana}. Generated ${data.generated}.` : "Loading the scoreboard."}</p>
        </a>
      </div>
      <section className="lowering">
        <h2>What one instruction becomes</h2>
        <div className="pair">
          <figure className="plate">
            <figcaption>TypeScript</figcaption>
            <pre className="code" dangerouslySetInnerHTML={{ __html: highlightRust(ts) }} />
          </figure>
          <figure className="plate">
            <figcaption>Anchor Rust, emitted in this page</figcaption>
            <pre className="code" dangerouslySetInnerHTML={{ __html: highlightRust(lowered.ok ? lowered.rust : "// compile failed") }} />
          </figure>
        </div>
      </section>
    </>
  );
}

function Learn() {
  return (
    <article className="essay">
      <header className="page-head">
        <p className="kicker">Fig. 2 – 4</p>
        <h1>Accounts, addresses, and calls.</h1>
        <p className="deck">Solana has no contract storage. A program is an executable account. Everything it remembers lives in other accounts it is allowed to touch.</p>
      </header>

      <section>
        <h2>Accounts are the storage</h2>
        <p>
          An account is an address, a lamport balance, an owner, and a byte array. Anchor writes an 8-byte discriminator in front of the fields. Creating one must leave it rent-exempt, or the runtime refuses the transaction.
        </p>
        <p>
          Axolotl turns each exported function into one instruction. The parameter order is the account order. <code>mut</code>, <code>init</code>, <code>signer</code>, and <code>has_one</code> are constraints in the type, not comments.
        </p>
        <AccountsFigure />
      </section>

      <section>
        <h2>A PDA has no private key</h2>
        <p>
          Program-derived addresses are public keys that lie off the ed25519 curve. The program finds one by hashing seeds with a bump byte until the result is off the curve. It signs later by repeating those seeds. Nobody holds a secret key for that address.
        </p>
        <p>
          When the account has a <code>bump: u8</code> field, Axolotl stores the canonical bump on init and reads it back instead of searching again.
        </p>
        <PdaFigure />
      </section>

      <section>
        <h2>A call can only forward what it was given</h2>
        <p>
          Cross-program invocation is <code>invoke</code>. The callee sees a new instruction made of accounts the caller already holds. A PDA signature is rebuilt from the seeds. Return data comes back as bytes, separate from accounts.
        </p>
        <p>
          <code>system.transfer</code>, <code>token.transferChecked</code>, and <code>cpi()</code> are the three forms Axolotl lowers. A token balance is still an account, owned by the token program. The vault example keeps a PDA as that account’s authority.
        </p>
        <CpiFigure />
      </section>
    </article>
  );
}

function CompilerPage() {
  const lowered = useMemo(() => compile({
    programName: "playground",
    programId: PROGRAM_ID,
    sources: [{ filename: "playground.ts", source: SAMPLE }],
  }), []);
  return (
    <article className="essay">
      <header className="page-head">
        <p className="kicker">Compiler</p>
        <h1>Anchor owns the binary format.</h1>
        <p className="deck">Emitting sBPF directly would freeze Axolotl to one syscall surface. Generating Anchor Rust lets Agave and Anchor move, and the IDL stays the one clients already speak.</p>
      </header>
      <ol className="stages">
        <li>
          <h2><span>01</span> Parse</h2>
          <p>The TypeScript compiler API builds a source file. Axolotl walks interfaces and exported functions. Classes, <code>async</code>, and arbitrary calls are errors that name the file and the line.</p>
        </li>
        <li>
          <h2><span>02</span> Model</h2>
          <p>Parameters become accounts or arguments. Account options are read from the type literal, including seeds. The body lowers to assignments, <code>if</code>, <code>while</code>, a restricted <code>for</code>, <code>require</code>, <code>emit</code>, and CPI.</p>
        </li>
        <li>
          <h2><span>03</span> Emit</h2>
          <p>Integer math is <code>checked_add</code> and its siblings. Instruction discriminators are <code>sha256("global:" + name)</code>, the first eight bytes, which is what Anchor uses. A source map points a rustc error back at the TypeScript line.</p>
          <figure className="plate">
            <figcaption><code>increment</code>, as this page compiled it</figcaption>
            <pre className="code" dangerouslySetInnerHTML={{ __html: highlightRust(sliceFunction(lowered.rust, "increment")) }} />
          </figure>
        </li>
        <li>
          <h2><span>04</span> Build</h2>
          <p><code>axolotl build</code> writes the crate and runs <code>anchor build</code>. The <code>.so</code> in <code>target/deploy</code> is what LiteSVM loads and what <code>axolotl deploy</code> sends to a cluster.</p>
        </li>
      </ol>
    </article>
  );
}

function Scoreboard() {
  const { data, error } = useScore();
  const [filter, setFilter] = useState<"all" | "pass" | "fail" | "unsupported">("all");
  if (error) return <p className="status-line bad" role="alert">Could not load the scoreboard. {error}</p>;
  if (!data) return <p>Loading the scoreboard…</p>;
  const rows = data.rows.filter((row) => filter === "all" || row.status === filter);
  return (
    <section className="score">
      <header className="page-head">
        <p className="kicker">Generated {data.generated}</p>
        <h1>
          <span className="fraction inline"><span>{data.passed}</span><span className="of">/{data.total}</span></span>
        </h1>
        <p className="deck">
          {data.failed} failing, {data.unsupported} unsupported, {data.passRate}% passing.
          Anchor {data.anchor}, Agave {data.solana}, {data.runtime}.
        </p>
      </header>
      <ol className="ruler" aria-hidden="true">
        {data.rows.map((row) => <li key={row.id} className={row.status} title={`${row.feature}: ${row.status}`} />)}
      </ol>
      <div className="filters" role="group" aria-label="Filter rows">
        {(["all", "pass", "fail", "unsupported"] as const).map((item) => (
          <button key={item} type="button" aria-pressed={filter === item} onClick={() => setFilter(item)}>{item}</button>
        ))}
      </div>
      <table>
        <thead>
          <tr><th>Group</th><th>Feature</th><th>Status</th><th>Detail</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td data-label="Group">{row.group}</td>
              <td data-label="Feature">{row.feature}</td>
              <td data-label="Status"><span className={`mark ${row.status}`}>{row.status}</span></td>
              <td data-label="Detail">{row.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
