import { calculateTimestamp } from '../../../utils/calculateTimestamp'
import {
    getIndexerQuery,
    getIndexerQueryWithSeverity,
    getIndexerQueryWithLogType,
    getIndexerQueryWithSeverityAndLogType,
    getIndexerQueryWithSeverityAndLogTypeAndTimeRange,
    getIndexerQueryWithSeverityAndTimeRange,
    getIndexerQueryWithLogTypeAndTimeRange,
    getIndexerQueryWithTimeRange,
} from "./Queries";

export const getIndexerLogsQueryDefinition = (tableName: string, severity: string, logType: string, startTime: string): void => {
    const ISOString: string = startTime ? calculateTimestamp(startTime) : startTime;
    const conditions: { [key: string]: () => void } = { //2^3
        '111': () => getIndexerQueryWithSeverityAndLogTypeAndTimeRange(tableName, severity, logType, ISOString),
        '110': () => getIndexerQueryWithSeverityAndLogType(tableName, severity, logType),
        '101': () => getIndexerQueryWithSeverityAndTimeRange(tableName, severity, ISOString),
        '100': () => getIndexerQueryWithSeverity(tableName, severity),
        '011': () => getIndexerQueryWithLogTypeAndTimeRange(tableName, logType, ISOString),
        '010': () => getIndexerQueryWithLogType(tableName, logType),
        '001': () => getIndexerQueryWithTimeRange(tableName, ISOString),
        '000': () => getIndexerQuery(tableName)
    };

    const key: string = `${severity ? '1' : '0'}${logType ? '1' : '0'}${startTime ? '1' : '0'}`;
    return conditions[key]();
};
