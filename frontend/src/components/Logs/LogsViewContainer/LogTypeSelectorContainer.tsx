import React from 'react';

import LogTypeSelectorView from '../LogsView/LogTypeSelectorView';

interface LogTypeSelectorContainerProps {
  selectedLogType: string;
  onLogTypeChange: (logType: string) => void;
}

const LogTypeSelectorContainer: React.FC<LogTypeSelectorContainerProps> = ({ selectedLogType, onLogTypeChange }) => {
  const logTypeOptions: string[] = ['system', 'user'];

  return (
    <LogTypeSelectorView options={logTypeOptions} selectedOption={selectedLogType} onOptionChange={onLogTypeChange} />
  );
};

export default LogTypeSelectorContainer;
