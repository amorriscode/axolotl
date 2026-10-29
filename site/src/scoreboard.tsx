import { useState } from "react";
import { DevnetPanel } from "./devnet";
import { formatGenerated, useScore, type ScoreRow } from "./score";

const FILTERS = ["all", "pass", "fail", "unsupported"] as const;

export function Scoreboard() {
  const { data, error } = useScore();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  if (error) return <p className="diag bad" role="alert">Could not load the scoreboard. {error}</p>;
  if (!data) return <p className="essay loading">Loading the scoreboard…</p>;
  const rows = data.rows.filter((row) => filter === "all" || row.status === filter);
  const counts = {
    all: data.total,
    pass: data.passed,
    fail: data.failed,
    unsupported: data.unsupported,
  };
  return (
    <section className="score">
      <header className="page-head">
        <p className="eyebrow"><span>Scoreboard</span> Generated {formatGenerated(data.generated)}</p>
        <h1 className="bigfrac">
          <span>{data.passed}</span>
          <em>/{data.total}</em>
        </h1>
        <p className="lede">
          {data.failed} failing, {data.unsupported} unsupported, {data.passRate}% passing.
          Anchor {data.anchor}, Agave {data.solana}, {data.runtime}.
        </p>
      </header>
      <ol className="ruler" aria-hidden="true">
        {data.rows.map((row) => <li key={row.id} className={row.status} title={`${row.feature}: ${row.status}`} />)}
      </ol>
      <div className="filters" role="group" aria-label="Filter rows">
        {FILTERS.map((item) => (
          <button key={item} type="button" aria-pressed={filter === item} onClick={() => setFilter(item)}>
            {item} <em>{counts[item]}</em>
          </button>
        ))}
      </div>
      <div className="table-wrap">
        <table>
          <caption className="sr">Conformance rows</caption>
          <thead>
            <tr><th>Group</th><th>Feature</th><th>Status</th><th>Detail</th></tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <ScoreRowView key={row.id} row={row} fresh={index === 0 || row.group !== rows[index - 1]?.group} />
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="empty">No {filter} rows.</p>}
      <DevnetPanel />
    </section>
  );
}

function ScoreRowView({ row, fresh }: { row: ScoreRow; fresh: boolean }) {
  return (
    <tr className={fresh ? "group-start" : undefined}>
      <td data-label="Group">{row.group}</td>
      <td data-label="Feature">{row.feature}</td>
      <td data-label="Status"><span className={`mark ${row.status}`}>{row.status}</span></td>
      <td data-label="Detail">{row.detail}</td>
    </tr>
  );
}
