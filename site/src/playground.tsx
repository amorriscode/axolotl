import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { compile, formatDiagnostics, type CompileResult } from "@axolotl-sol/compiler";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { highlightRust } from "./highlight.ts";
import { PROGRAM_ID, SAMPLE } from "./sample.ts";
import { decodeSource, encodeSource, tokenFromHash } from "./share.ts";

const theme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "#f3efe6", color: "#1b1914" },
  ".cm-scroller": { fontFamily: '"IBM Plex Mono", ui-monospace, monospace' },
  ".cm-content": { fontSize: "13.5px", padding: "10px 0", minHeight: "100%" },
  ".cm-gutters": { backgroundColor: "#ebe6da", color: "#5e584e", border: "none" },
  ".cm-activeLine": { backgroundColor: "rgba(157, 28, 44, 0.06)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent" },
  "&.cm-focused": { outline: "2px solid #9d1c2c", outlineOffset: "-2px" },
}, { dark: false });

export function Playground() {
  const [source, setSource] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [link, setLink] = useState("");
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  useEffect(() => {
    const token = tokenFromHash();
    if (!token) {
      setSource(SAMPLE);
      return;
    }
    decodeSource(token).then((text) => {
      setSource(text);
      setNote("Opened a shared program.");
    }).catch(() => {
      setSource(SAMPLE);
      setNote("That link could not be read. Showing the counter instead.");
    });
  }, []);

  useEffect(() => {
    if (source === null || !host.current || view.current) return;
    const doc = source;
    view.current = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc,
        extensions: [
          lineNumbers(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          javascript({ typescript: true }),
          syntaxHighlighting(defaultHighlightStyle),
          theme,
          EditorView.contentAttributes.of({ "aria-label": "TypeScript program" }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) setSource(update.state.doc.toString());
          }),
        ],
      }),
    });
  }, [source]);

  useEffect(() => () => {
    view.current?.destroy();
    view.current = null;
  }, []);

  useEffect(() => {
    if (source === null) return;
    const handle = window.setTimeout(() => {
      encodeSource(source).then((token) => {
        const url = new URL(window.location.href);
        url.hash = `play/${token}`;
        window.history.replaceState(null, "", url);
        setLink(url.toString());
      }).catch(() => setNote("Could not update the share link."));
    }, 350);
    return () => window.clearTimeout(handle);
  }, [source]);

  const result = useMemo<CompileResult | null>(() => {
    if (source === null) return null;
    return compile({
      programName: "playground",
      programId: PROGRAM_ID,
      description: "Compiled in the browser",
      sources: [{ filename: "playground.ts", source }],
    });
  }, [source]);

  async function copyLink() {
    if (source === null) return;
    const token = await encodeSource(source);
    const url = new URL(window.location.href);
    url.hash = `play/${token}`;
    window.history.replaceState(null, "", url);
    setLink(url.toString());
    try {
      await navigator.clipboard.writeText(url.toString());
      setNote("Link copied.");
    } catch {
      setNote("Copy the link from the field.");
    }
  }

  const diagnostics = result ? formatDiagnostics(result.diagnostics) : "";

  return (
    <section className="play">
      <header className="page-head">
        <p className="kicker">Playground</p>
        <h1>TypeScript, Rust, and the IDL.</h1>
        <p className="deck">The editor is CodeMirror. Rust and the IDL are what this page’s compiler emits. The address bar is the program.</p>
      </header>
      <div className="share-row">
        <button type="button" onClick={() => void copyLink()}>Copy link</button>
        <label>
          <span className="sr">Shareable link</span>
          <input readOnly value={link || "The link updates as you type."} onFocus={(event) => event.currentTarget.select()} />
        </label>
        <p role="status">{note}</p>
      </div>
      {!result ? <p>Loading the editor…</p> : (
        <>
          <div className="bench">
            <Pane title="playground.ts">
              <div className="cm-host" ref={host} />
            </Pane>
            <Pane title="Rust">
              <pre className="code" dangerouslySetInnerHTML={{ __html: highlightRust(result.rust || "// nothing emitted") }} />
            </Pane>
            <Pane title="IDL">
              <pre className="code">{JSON.stringify(result.idl, null, 2)}</pre>
            </Pane>
          </div>
          <p className={result.ok ? "status-line ok" : "status-line bad"} role="status">
            {result.ok ? "Compiled." : `The program has errors. ${diagnostics}`}
          </p>
        </>
      )}
    </section>
  );
}

function Pane({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pane" aria-label={title}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
