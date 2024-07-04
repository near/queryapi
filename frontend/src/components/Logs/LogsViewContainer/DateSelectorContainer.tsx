import React from 'react';

import { TIME_INTERVALS_MAP } from '@/constants/DurationMap';

import DateSelectorView from '../LogsView/DateSelectorView';

interface DateSelectorProps {
  selectedDate: string;
  onDateChange: (selectedDate: Date) => void;
}

const DateSelectorContainer: React.FC<DateSelectorProps> = ({ selectedDate, onDateChange }) => {
  const dateOptions: string[] = Array.from(TIME_INTERVALS_MAP.values());

  return <DateSelectorView options={dateOptions} selectedOption={selectedDate} onOptionChange={onDateChange} />;
};

export default DateSelectorContainer;
