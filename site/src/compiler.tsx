import { compile } from "@axolotl-sol/compiler";
import { useMemo } from "react";
import { highlightRust } from "./highlight";
import { PROGRAM_ID, SAMPLE, sliceFunction } from "./sample";

const STAGES = [
  {
    n: "01",
    title: "Parse",
    body: "The TypeScript compiler API builds a source file. Axolotl walks interfaces and exported functions. Classes, async, and arbitrary calls are errors that name the file and the line.",
    code: false,
  },
  {
    n: "02",
    title: "Model",
    body: "Parameters become accounts or arguments. Account options are read from the type literal, including seeds. The body lowers to assignments, if, while, a restricted for, require, emit, and CPI.",
    code: false,
  },
  {
    n: "03",
    title: "Emit",
    body: "Integer math is checked_add and its siblings. Instruction discriminators are sha256(\"global:\" + name), the first eight bytes, which is what Anchor uses. A source map points a rustc error back at the TypeScript line.",
    code: true,
  },
  {
    n: "04",
    title: "Build",
    body: "axolotl build writes the crate and runs anchor build. The .so in target/deploy is what LiteSVM loads and what axolotl deploy sends to a cluster.",
    code: false,
  },
] as const;

export function CompilerPage() {
  const lowered = useMemo(() => compile({
    programName: "playground",
    programId: PROGRAM_ID,
    sources: [{ filename: "playground.ts", source: SAMPLE }],
  }), []);
  return (
    <article className="essay">
      <header className="page-head">
        <p className="eyebrow"><span>Compiler</span> Four passes</p>
        <h1>Anchor owns the binary.</h1>
        <p className="lede">
          Emitting sBPF directly would freeze Axolotl to one syscall surface. Generating Anchor Rust lets Agave and Anchor move, and the IDL stays the one clients already speak.
        </p>
      </header>
      <ol className="stages">
        {STAGES.map((stage) => (
          <li key={stage.n}>
            <span className="num">{stage.n}</span>
            <div>
              <h2>{stage.title}</h2>
              <p>
                {stage.n === "01" && <>The TypeScript compiler API builds a source file. Axolotl walks interfaces and exported functions. Classes, <code>async</code>, and arbitrary calls are errors that name the file and the line.</>}
                {stage.n === "02" && <>Parameters become accounts or arguments. Account options are read from the type literal, including seeds. The body lowers to assignments, <code>if</code>, <code>while</code>, a restricted <code>for</code>, <code>require</code>, <code>emit</code>, and CPI.</>}
                {stage.n === "03" && <>Integer math is <code>checked_add</code> and its siblings. Instruction discriminators are <code>sha256("global:" + name)</code>, the first eight bytes, which is what Anchor uses. A source map points a rustc error back at the TypeScript line.</>}
                {stage.n === "04" && <><code>axolotl build</code> writes the crate and runs <code>anchor build</code>. The <code>.so</code> in <code>target/deploy</code> is what LiteSVM loads and what <code>axolotl deploy</code> sends to a cluster.</>}
              </p>
              {stage.code && (
                <figure className="emit">
                  <figcaption><code>increment</code>, as this page compiled it</figcaption>
                  <pre className="code" dangerouslySetInnerHTML={{ __html: highlightRust(sliceFunction(lowered.rust, "increment")) }} />
                </figure>
              )}
            </div>
          </li>
        ))}
      </ol>
    </article>
  );
}
