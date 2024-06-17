import React from 'react';
import SeverityRadioButtonGroupView from '../LogsView/SeveritySelectorView';

interface SeveritySelectorProps {
  selectedSeverity: string
  onSeverityChange: (severity: string) => void
}

const SeveritySelectorContainer: React.FC<SeveritySelectorProps> = ({ selectedSeverity, onSeverityChange }) => {
  // Refactor to fetch fields from graphql
  const severityOptions: string[] = ['INFO', 'DEBUG', 'WARNING', 'ERROR'];

  return (
    <SeverityRadioButtonGroupView
      options={severityOptions}
      selectedOption={selectedSeverity}
      onOptionChange={onSeverityChange}
    />
  );
};

export default SeveritySelectorContainer;
