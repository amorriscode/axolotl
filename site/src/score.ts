import { useEffect, useState } from "react";

export interface ScoreRow {
  id: string;
  group: string;
  feature: string;
  status: "pass" | "fail" | "unsupported";
  detail: string;
}

export interface Scoreboard {
  generated: string;
  passed: number;
  failed: number;
  unsupported: number;
  total: number;
  passRate: number;
  anchor: string;
  solana: string;
  runtime: string;
  rows: ScoreRow[];
}

export function useScore() {
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

export function formatGenerated(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
