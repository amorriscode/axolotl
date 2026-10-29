import { compile } from "@axolotl-sol/compiler";
import { useEffect, useMemo, useRef } from "react";
import { HeroCanvas, type HeroHandle } from "./hero/HeroCanvas";
import { highlightRust } from "./highlight";
import { PROGRAM_ID, SAMPLE, sliceFunction } from "./sample";
import { formatGenerated, useScore } from "./score";

export function Home() {
  const stageRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HeroHandle>(null);
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

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    let frame = 0;
    const apply = () => {
      frame = 0;
      const desktop = window.innerWidth >= 900;
      if (desktop) {
        const fade = Math.max(0, 1 - window.scrollY / (window.innerHeight * 0.85));
        el.style.opacity = String(fade);
        heroRef.current?.setOffscreen(fade < 0.05);
        return;
      }
      el.style.opacity = "1";
      const rect = el.getBoundingClientRect();
      heroRef.current?.setOffscreen(rect.bottom < 40 || rect.top > window.innerHeight);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-stage" ref={stageRef}>
          <HeroCanvas ref={heroRef} />
        </div>
        <p className="sr">
          A pale axolotl swims in dark water. Its external gills are the light. The animal is the mark of the compiler: TypeScript in, an Anchor program out.
        </p>
        <div className="hero-copy">
          <p className="eyebrow"><span>01</span> TypeScript subset → Anchor</p>
          <h1 id="hero-title">
            <span className="it">The program</span><br />
            <span className="rom">is TypeScript.</span><br />
            <span className="it">The binary</span><br />
            <span className="rom">is Anchor.</span>
          </h1>
          <p className="lede">
            Axolotl lowers a strict subset to Anchor Rust. Agave builds an ordinary sBPF program and an IDL. Existing clients keep working.
          </p>
          <a className="enter" href="#play">
            Open the playground
            <Arrow />
          </a>
        </div>
        <p className="scroll-hint" aria-hidden="true">Scroll</p>
      </section>

      <section className="band lowering">
        <div className="band-head">
          <p className="eyebrow"><span>02</span> One instruction</p>
          <h2>What <em>increment</em> becomes.</h2>
        </div>
        <div className="pair">
          <figure>
            <figcaption>TypeScript</figcaption>
            <pre className="code" dangerouslySetInnerHTML={{ __html: highlightRust(ts) }} />
          </figure>
          <figure>
            <figcaption>Anchor Rust, emitted in this page</figcaption>
            <pre className="code" dangerouslySetInnerHTML={{ __html: highlightRust(lowered.ok ? lowered.rust : "// compile failed") }} />
          </figure>
        </div>
      </section>

      <section className="band score-band">
        <p className="eyebrow"><span>03</span> Conformance</p>
        <a className="fraction-link" href="#score">
          <p className="bigfrac">
            {data ? (
              <>
                <span>{data.passed}</span>
                <em>/{data.total}</em>
              </>
            ) : (
              <span>—</span>
            )}
          </p>
        </a>
        <p className="lede">
          {data
            ? `${data.failed} failing, ${data.unsupported} unsupported. Anchor ${data.anchor}, Agave ${data.solana}. Generated ${formatGenerated(data.generated)}.`
            : "Loading the scoreboard."}
        </p>
        {data && (
          <ol className="ruler" aria-hidden="true">
            {data.rows.map((row) => (
              <li key={row.id} className={row.status} title={`${row.feature}: ${row.status}`} />
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

function Arrow() {
  return (
    <svg viewBox="0 0 24 12" width="24" height="12" aria-hidden="true">
      <path d="M0 6h22M16 1l6 5-6 5" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
