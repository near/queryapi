import React from 'react';
import DateSelectorView from '../LogsView/DateSelectorView';
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
} from '../../../constants/TimeIntervals';

interface DateSelectorProps {
    selectedDate: string;
    onDateChange: (selectedDate: Date) => void;
}

const DateSelectorContainer: React.FC<DateSelectorProps> = ({ selectedDate, onDateChange }) => {
    const dateOptions: string[] = [
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
    ];

    return (
        <DateSelectorView
            options={dateOptions}
            selectedOption={selectedDate}
            onOptionChange={onDateChange}
        />
    );
};

export default DateSelectorContainer;
