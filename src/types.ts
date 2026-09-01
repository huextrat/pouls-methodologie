export type TrendDirection = "up" | "down" | "stable";

export interface WindowMeta {
  days: number;
  nPolls: number;
  institutes: string[];
  from: string;
  to: string;
}

export interface AggregateEntry {
  candidateId: string;
  candidate: string;
  party: string;
  score: number;
  margin: number;
  trend: TrendDirection;
  delta: number;
  nPolls: number;
}

export interface AggregateResult {
  window: WindowMeta;
  candidates: AggregateEntry[];
}

export interface TrendPoint {
  date: string;
  value: number;
  nPolls: number;
  margin: number;
}

export interface TrendSeries {
  candidateId: string;
  candidate: string;
  points: TrendPoint[];
}

export interface DuelSide {
  candidateId: string;
  candidate: string;
  score: number;
  margin: number;
}

export interface DuelEntry {
  id: string;
  a: DuelSide;
  b: DuelSide;
  nPolls: number;
  lastFieldworkEnd: string;
  institutes: string[];
}
