export const TIME_INTERVALS_MAP = new Map([
  ['15s', 'Last 15 seconds (15s)'],
  ['30s', 'Last 30 seconds (30s)'],
  ['1m', 'Last 1 minute (1m)'],
  ['5m', 'Last 5 minutes (5m)'],
  ['10m', 'Last 10 minutes (10m)'],
  ['15m', 'Last 15 minutes (15m)'],
  ['30m', 'Last 30 minutes (30m)'],
  ['45m', 'Last 45 minutes (45m)'],
  ['1h', 'Last 1 hour (1h)'],
  ['3h', 'Last 3 hours (3h)'],
  ['6h', 'Last 6 hours (6h)'],
  ['12h', 'Last 12 hours (12h)'],
  ['1d', 'Last 1 day (1d)'],
  ['2d', 'Last 2 days (2d)'],
  ['7d', 'Last 7 days (7d)'],
  ['14d', 'Last 14 days (14d)'],
  ['30d', 'Last 30 days (30d)']
]);

export const DURATION_MAP: Record<string, number> = {};

TIME_INTERVALS_MAP.forEach((description: string, key: string) => {
  let duration: number;
  const unit: string = key.slice(-1);
  const value: number = parseInt(key.slice(0, -1), 10);

  switch (unit) {
    case 's':
      duration = value * 1000;
      break;
    case 'm':
      duration = value * 60 * 1000;
      break;
    case 'h':
      duration = value * 60 * 60 * 1000;
      break;
    case 'd':
      duration = value * 24 * 60 * 60 * 1000;
      break;
    default:
      throw new Error(`Unknown unit: ${unit}`);
  }

  DURATION_MAP[description] = duration;
});
