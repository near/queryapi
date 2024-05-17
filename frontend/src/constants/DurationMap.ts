import {
    LAST_15_SECONDS,
    LAST_30_SECONDS,
    LAST_1_MINUTE,
    LAST_5_MINUTES,
    LAST_10_MINUTES,
    LAST_15_MINUTES,
    LAST_30_MINUTES,
    LAST_45_MINUTES,
    LAST_1_HOUR,
    LAST_3_HOURS,
    LAST_6_HOURS,
    LAST_12_HOURS,
    LAST_1_DAY,
    LAST_2_DAYS,
    LAST_7_DAYS,
    LAST_14_DAYS,
    LAST_30_DAYS
} from './TimeIntervals'

export const DURATION_MAP: { [key: string]: number } = {
    [LAST_15_SECONDS]: 15 * 1000,
    [LAST_30_SECONDS]: 30 * 1000,
    [LAST_1_MINUTE]: 60 * 1000,
    [LAST_5_MINUTES]: 5 * 60 * 1000,
    [LAST_10_MINUTES]: 10 * 60 * 1000,
    [LAST_15_MINUTES]: 15 * 60 * 1000,
    [LAST_30_MINUTES]: 30 * 60 * 1000,
    [LAST_45_MINUTES]: 45 * 60 * 1000,
    [LAST_1_HOUR]: 60 * 60 * 1000,
    [LAST_3_HOURS]: 3 * 60 * 60 * 1000,
    [LAST_6_HOURS]: 6 * 60 * 60 * 1000,
    [LAST_12_HOURS]: 12 * 60 * 60 * 1000,
    [LAST_1_DAY]: 24 * 60 * 60 * 1000,
    [LAST_2_DAYS]: 2 * 24 * 60 * 60 * 1000,
    [LAST_7_DAYS]: 7 * 24 * 60 * 60 * 1000,
    [LAST_14_DAYS]: 14 * 24 * 60 * 60 * 1000,
    [LAST_30_DAYS]: 30 * 24 * 60 * 60 * 1000
};
