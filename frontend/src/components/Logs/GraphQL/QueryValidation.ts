import { calculateTimestamp } from '@/utils/calculateTimestamp';

interface Variables {
  limit: number;
  offset: number;
  order_by_timestamp: 'asc' | 'desc';
  level?: string;
  type?: string;
  timestamp?: string;
  keyword?: string;
}

interface QueryFilter {
  _eq?: string | number;
  _ilike?: string;
  _gte?: string;
}
interface QueryValidationResult {
  limit: number;
  offset: number;
  order_by_timestamp: 'asc' | 'desc';
  level?: QueryFilter;
  type?: QueryFilter;
  timestamp?: QueryFilter;
  keyword?: string;
  message?: { _ilike: string };
  block_height?: { _eq: number };
}

export const QueryValidation = ({
  limit,
  offset,
  order_by_timestamp,
  level,
  type,
  timestamp,
  keyword,
}: Variables): QueryValidationResult => {
  const levelFormat: { level?: QueryFilter } = level ? { level: { _eq: level } } : {};
  const typeFormat: { type?: QueryFilter } = type ? { type: { _eq: type } } : {};
  const timestampFormat: { timestamp?: QueryFilter } = timestamp
    ? { timestamp: { _gte: calculateTimestamp(timestamp) } }
    : {};
  const messageFormat = keyword ? { message: { _ilike: `%${keyword}%` } } : {};
  const blockHeightFormat = keyword && !isNaN(Number(keyword)) ? { block_height: { _eq: Number(keyword) } } : {};

  return {
    limit,
    offset,
    order_by_timestamp,
    ...levelFormat,
    ...typeFormat,
    ...timestampFormat,
    ...messageFormat,
    ...blockHeightFormat,
  };
};
