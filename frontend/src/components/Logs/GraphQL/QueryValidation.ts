import { calculateTimestamp } from '../../../utils/calculateTimestamp';

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

type LevelFormat = { level: QueryFilter };
type TypeFormat = { type: QueryFilter };
type TimestampFormat = { timestamp: QueryFilter };

export const QueryValidation = ({ limit, offset, order_by_timestamp, level, type, timestamp, keyword }: Variables) => {

    const levelFormat: LevelFormat | undefined = level ? { level: { _eq: level } } as const : undefined;
    const typeFormat: TypeFormat | undefined = type ? { type: { _eq: type } } as const : undefined;
    const timestampFormat: TimestampFormat | undefined = timestamp
        ? { timestamp: { _gte: calculateTimestamp(timestamp) } } as const
        : undefined;

    const messageFormat = keyword ? { message: { _ilike: `%${keyword}%` } } as const : undefined;
    const blockHeightFormat = keyword && !isNaN(Number(keyword))
        ? { block_height: { _eq: Number(keyword) } } as const
        : undefined;

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
