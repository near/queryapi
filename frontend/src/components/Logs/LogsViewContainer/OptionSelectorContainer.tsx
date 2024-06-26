import React from 'react';

import OptionSelectorView from '../LogsView/OptionSelectorView';
interface OptionSelectorContainerProps {
  options: string[];
  selectedOption: string;
  onOptionChange: (option: string) => void;
}

const OptionSelectorContainer: React.FC<OptionSelectorContainerProps> = ({
  options,
  selectedOption,
  onOptionChange,
}) => {
  const handleOptionChange = (value: string): void => {
    onOptionChange(value);
  };

  const handleClearSelection = (): void => {
    onOptionChange('');
  };

  return (
    <OptionSelectorView
      options={options}
      selectedOption={selectedOption}
      onOptionChange={onOptionChange}
      handleOptionChange={handleOptionChange}
      handleClearSelection={handleClearSelection}
    />
  );
};

export default OptionSelectorContainer;
