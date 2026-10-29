import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { CompilerPage } from "./compiler";
import { Home } from "./home";
import { Learn } from "./learn";
import { Playground } from "./playground";
import { Scoreboard } from "./scoreboard";

type Page = "home" | "learn" | "compiler" | "play" | "score";

const NAV: { id: Page; href: string; label: string; n: string }[] = [
  { id: "learn", href: "#learn", label: "Learn", n: "01" },
  { id: "compiler", href: "#compiler", label: "Compiler", n: "02" },
  { id: "play", href: "#play", label: "Play", n: "03" },
  { id: "score", href: "#score", label: "Score", n: "04" },
];

const TITLES: Record<Page, string> = {
  home: "Axolotl — The program is TypeScript",
  learn: "Learn — Axolotl",
  compiler: "Compiler — Axolotl",
  play: "Playground — Axolotl",
  score: "Scoreboard — Axolotl",
};

export function App() {
  const [page, setPage] = useState<Page>(() => pageFromHash());
  const [seen, setSeen] = useState(false);
  const reduce = useReducedMotion();
  const skipScroll = useRef(true);

  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener("hashchange", onHash);
    setSeen(true);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    document.title = TITLES[page];
    if (skipScroll.current) {
      skipScroll.current = false;
      return;
    }
    window.scrollTo(0, 0);
    document.getElementById("content")?.focus();
  }, [page]);

  return (
    <>
      <a className="skip" href="#content">Skip to content</a>
      <header className="mast">
        <a className="word" href="#home">
          <GillMark />
          Axolotl
        </a>
        <nav aria-label="Pages">
          {NAV.map((item) => (
            <a key={item.id} href={item.href} aria-current={page === item.id ? "page" : undefined}>
              <span>{item.n}</span>
              {item.label}
            </a>
          ))}
        </nav>
      </header>
      <main id="content" tabIndex={-1}>
        <AnimatePresence mode="wait">
          <motion.div
            key={page}
            initial={seen && !reduce ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            exit={reduce ? undefined : { opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            {page === "home" && <Home />}
            {page === "learn" && <Learn />}
            {page === "compiler" && <CompilerPage />}
            {page === "play" && <Playground />}
            {page === "score" && <Scoreboard />}
          </motion.div>
        </AnimatePresence>
      </main>
      {page !== "play" && (
        <footer className="colophon">
          <p>Anchor programs, written from a TypeScript subset.</p>
          <a href="https://github.com/amorriscode/axolotl">Source</a>
        </footer>
      )}
    </>
  );
}

function GillMark() {
  return (
    <svg className="gill-mark" viewBox="0 0 32 32" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M8 24c1.4-6 3.4-9.5 6.4-12.5" />
        <path d="M13 25c2.4-6.2 5.4-10.4 9.4-13.6" />
        <path d="M18 26c2.8-4.6 5.8-7.6 9.4-10" />
      </g>
    </svg>
  );
}

function pageFromHash(): Page {
  const raw = window.location.hash.replace(/^#\/?/, "");
  if (raw.startsWith("play")) return "play";
  if (raw === "learn" || raw === "compiler" || raw === "score") return raw;
  return "home";
}
