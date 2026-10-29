import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { compile, formatDiagnostics, type CompileResult } from "@axolotl-sol/compiler";
import { tags } from "@lezer/highlight";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { highlightRust } from "./highlight";
import { PROGRAM_ID, SAMPLE } from "./sample";
import { decodeSource, encodeSource, tokenFromHash } from "./share";

const axoHighlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.modifier, tags.controlKeyword, tags.operatorKeyword], color: "#f0a3b4" },
  { tag: [tags.string, tags.special(tags.string)], color: "#e7d3a1" },
  { tag: [tags.number], color: "#9adfd4" },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: "#8e879c", fontStyle: "italic" },
  { tag: [tags.typeName, tags.className], color: "#d8c6f4" },
  { tag: [tags.bool, tags.null, tags.atom], color: "#dff56a" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: "#f7f1ea" },
  { tag: [tags.operator, tags.punctuation], color: "#c9c2d4" },
]);

const theme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "#0c0a12", color: "#f4efe8" },
  ".cm-scroller": { fontFamily: '"IBM Plex Mono", ui-monospace, monospace', lineHeight: "1.55" },
  ".cm-content": { fontSize: "14px", padding: "14px 0", caretColor: "#dff56a" },
  ".cm-gutters": { backgroundColor: "#0c0a12", color: "#6e6680", border: "none", paddingRight: "8px" },
  ".cm-activeLine": { backgroundColor: "rgba(255, 93, 122, 0.06)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "#f4efe8" },
  "&.cm-focused": { outline: "none" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#dff56a" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": { backgroundColor: "rgba(223, 245, 106, 0.16)" },
}, { dark: true });

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
          syntaxHighlighting(axoHighlight),
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

  function loadCounter() {
    const editor = view.current;
    if (!editor) return;
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: SAMPLE },
    });
    setNote("Counter loaded.");
  }

  const diagnostics = result ? formatDiagnostics(result.diagnostics) : "";

  return (
    <section className="play">
      <header className="play-bar">
        <h1>Playground</h1>
        <span className={!result ? "lamp" : result.ok ? "lamp ok" : "lamp bad"} aria-hidden="true" />
        <div className="play-tools">
          <button type="button" onClick={loadCounter}>Load counter</button>
          <button type="button" onClick={() => void copyLink()}>Copy link</button>
          <label>
            <span className="sr">Shareable link</span>
            <input readOnly value={link || "The link updates as you type."} onFocus={(event) => event.currentTarget.select()} />
          </label>
          <p role="status" className="note">{note}</p>
        </div>
      </header>
      {!result ? <p className="loading">Loading the editor…</p> : (
        <div className={result.ok ? "bench is-ok" : "bench is-bad"}>
          <Pane title="playground.ts" className="pane-ts">
            <div className="cm-host" ref={host} />
            <p className={result.ok ? "diag ok" : "diag bad"} role="status">
              {result.ok ? "Compiled." : diagnostics || "The program has errors."}
            </p>
          </Pane>
          <Pane title="Rust" className="pane-out">
            <pre className="code" dangerouslySetInnerHTML={{ __html: highlightRust(result.rust || "// nothing emitted") }} />
          </Pane>
          <Pane title="IDL" className="pane-out">
            <pre className="code">{JSON.stringify(result.idl, null, 2)}</pre>
          </Pane>
        </div>
      )}
    </section>
  );
}

function Pane({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <section className={className ? `pane ${className}` : "pane"} aria-label={title}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
