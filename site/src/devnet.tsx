import { useEffect, useState } from "react";

interface DevnetProgram {
  name: string;
  id: string;
  deployed: boolean;
  explorer: string | null;
}

interface DevnetTx {
  name: string;
  program: string;
  signature: string | null;
  explorer: string | null;
  ok: boolean;
  detail: string;
}

interface DevnetReport {
  cluster: string;
  generated: string;
  status: string;
  live: boolean;
  headline: string;
  deployer: string | null;
  balanceLamports: string | null;
  programs: DevnetProgram[];
  transactions: DevnetTx[];
  notes: string[];
}

export function DevnetPanel() {
  const [data, setData] = useState<DevnetReport | null>(null);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}devnet.json`)
      .then((response) => (response.ok ? response.json() as Promise<DevnetReport> : null))
      .then((report) => setData(report))
      .catch(() => setData(null));
  }, []);
  if (!data) return null;
  const when = data.generated.slice(0, 10);
  return (
    <section className="devnet-proof">
      <p className="eyebrow"><span>Devnet</span> {when}</p>
      <h2>{data.headline}</h2>
      <p className="lede">
        <span className={`mark ${data.live ? "pass" : "fail"}`}>{data.live ? "live" : data.status}</span>
        {data.deployer ? ` Deployer ${data.deployer}.` : ""}
        {data.balanceLamports != null ? ` Balance ${data.balanceLamports} lamports.` : ""}
      </p>
      <table>
        <thead>
          <tr><th>Program</th><th>Id</th><th>Status</th></tr>
        </thead>
        <tbody>
          {data.programs.map((program) => (
            <tr key={program.id}>
              <td data-label="Program">{program.name}</td>
              <td data-label="Id">{program.explorer ? <a href={program.explorer}>{program.id}</a> : program.id}</td>
              <td data-label="Status"><span className={`mark ${program.deployed ? "pass" : "fail"}`}>{program.deployed ? "deployed" : "not deployed"}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.transactions.length > 0 && (
        <table>
          <thead>
            <tr><th>Transaction</th><th>Result</th><th>Detail</th></tr>
          </thead>
          <tbody>
            {data.transactions.map((tx) => (
              <tr key={`${tx.name}-${tx.signature}`}>
                <td data-label="Transaction">{tx.explorer ? <a href={tx.explorer}>{tx.name}</a> : tx.name}</td>
                <td data-label="Result"><span className={`mark ${tx.ok ? "pass" : "fail"}`}>{tx.ok ? "ok" : "failed"}</span></td>
                <td data-label="Detail">{tx.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data.notes.length > 0 && (
        <ul>
          {data.notes.map((note) => <li key={note}>{note}</li>)}
        </ul>
      )}
    </section>
  );
}
