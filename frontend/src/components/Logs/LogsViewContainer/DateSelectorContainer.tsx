import React from 'react';
import DateSelectorView from '../LogsView/DateSelectorView';
import { TIME_INTERVALS_MAP } from '@/constants/DurationMap';

interface DateSelectorProps {
    selectedDate: string;
    onDateChange: (selectedDate: Date) => void;
}

const DateSelectorContainer: React.FC<DateSelectorProps> = ({ selectedDate, onDateChange }) => {
    const dateOptions: string[] = Array.from(TIME_INTERVALS_MAP.values());

    return (
        <DateSelectorView
            options={dateOptions}
            selectedOption={selectedDate}
            onOptionChange={onDateChange}
        />
    );
};

export default DateSelectorContainer;
