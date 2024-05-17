import { calculateTimestamp } from '../../../utils/calculateTimestamp'
import {
    getBlockHeightAndMessageSearchQuery,
    getMessageSearchQuery,
    getMessageSearchQueryWithSeverity,
    getBlockHeightAndMessageSearchQueryWithSeverity,
    getBlockHeightAndMessageSearchQueryWithLogType,
    getMessageSearchQueryWithLogType,
    getBlockHeightAndMessageSearchQueryWithSeverityAndLogType,
    getMessageSearchQueryWithSeverityAndLogType,
    getMessageSearchQueryWithTimeRange,
    getBlockHeightAndMessageSearchQueryWithTimeRange,
    getMessageSearchQueryWithSeverityAndTimeRange,
    getBlockHeightAndMessageSearchQueryWithSeverityAndTimeRange,
    getMessageSearchQueryWithLogTypeAndTimeRange,
    getBlockHeightAndMessageSearchQueryWithLogTypeAndTimeRange,
    getBlockHeightAndMessageSearchQueryWithSeverityAndLogTypeAndTimeRange,
    getMessageSearchQueryWithSeverityAndLogTypeAndTimeRange,
} from "./Queries";

export const getSearchLogsQueryDefinition = (tableName: string, keyword: string, severity: string, logType: string, startTime: string): void => {
    const isKeywordNumber = !isNaN(Number(keyword));
    const ISOString: string = startTime ? calculateTimestamp(startTime) : startTime;

    const conditions: { [key: string]: () => void } = {
        '0000': () => getMessageSearchQuery(tableName, keyword),
        '0100': () => getBlockHeightAndMessageSearchQuery(tableName, keyword),
        '1000': () => getMessageSearchQueryWithSeverity(tableName, keyword, severity),
        '1100': () => getBlockHeightAndMessageSearchQueryWithSeverity(tableName, keyword, severity),
        '0110': () => getBlockHeightAndMessageSearchQueryWithLogType(tableName, keyword, logType),
        '0010': () => getMessageSearchQueryWithLogType(tableName, keyword, logType),
        '1110': () => getBlockHeightAndMessageSearchQueryWithSeverityAndLogType(tableName, keyword, severity, logType),
        '1010': () => getMessageSearchQueryWithSeverityAndLogType(tableName, keyword, severity, logType),
        '0001': () => getMessageSearchQueryWithTimeRange(tableName, keyword, ISOString),
        '0101': () => getBlockHeightAndMessageSearchQueryWithTimeRange(tableName, keyword, ISOString),
        '1001': () => getMessageSearchQueryWithSeverityAndTimeRange(tableName, keyword, severity, ISOString),
        '1101': () => getBlockHeightAndMessageSearchQueryWithSeverityAndTimeRange(tableName, keyword, severity, ISOString),
        '0111': () => getBlockHeightAndMessageSearchQueryWithLogTypeAndTimeRange(tableName, keyword, logType, ISOString),
        '0011': () => getMessageSearchQueryWithLogTypeAndTimeRange(tableName, keyword, logType, ISOString),
        '1111': () => getBlockHeightAndMessageSearchQueryWithSeverityAndLogTypeAndTimeRange(tableName, keyword, severity, logType, ISOString),
        '1011': () => getMessageSearchQueryWithSeverityAndLogTypeAndTimeRange(tableName, keyword, severity, logType, ISOString),
    };

    const key = `${severity ? '1' : '0'}${isKeywordNumber ? '1' : '0'}${logType ? '1' : '0'}${startTime ? '1' : '0'}`;
    return conditions[key]();
}
