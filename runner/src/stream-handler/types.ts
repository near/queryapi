import { type METRICS } from '../metrics';

interface Metric {
  type: keyof typeof METRICS
  labels: Record<string, string>
  value: number
};

export type Message = Metric;
