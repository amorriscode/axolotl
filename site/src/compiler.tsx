import { compile } from "@axolotl-sol/compiler";
import { useMemo } from "react";
import { highlightRust } from "./highlight";
import { PROGRAM_ID, SAMPLE, sliceFunction } from "./sample";

const STAGES = [
  {
    n: "01",
    title: "Parse",
    body: "parseFunction reads the exported function. The body stays a TypeScript block.",
    code: false,
  },
  {
    n: "02",
    title: "Model",
    body: "lowerBinary turns counter.count + 1n into a check node. validateAccounts refuses hasOne unless the named account is a Signer.",
    code: false,
  },
  {
    n: "03",
    title: "Emit",
    body: "renderExpr is the first place that writes checked_add. emitInstruction prints that into the Anchor function.",
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
                {stage.n === "01" && <><code>parseFunction</code> reads the exported function. <code>counter</code> and <code>authority</code> become accounts. The body stays a TypeScript block. Parse does not know that <code>+</code> will be checked.</>}
                {stage.n === "02" && <><code>lowerBinary</code> turns <code>counter.count + 1n</code> into a check node, operation add. <code>validateAccounts</code> refuses <code>hasOne</code> unless the named account is a <code>Signer</code>. The body is data, not Rust yet.</>}
                {stage.n === "03" && <><code>renderExpr</code> is the first place that writes <code>checked_add</code>. <code>emitInstruction</code> prints that into the Anchor function. The longer trace is <code>docs/trace.md</code>.</>}
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
