import React from 'react';
import OptionSelectorContainer from '../LogsViewContainer/OptionSelectorContainer';

const DateSelectorView = ({ options, selectedOption, onOptionChange }) => {
    return (
        <OptionSelectorContainer
            options={options}
            selectedOption={selectedOption}
            onOptionChange={onOptionChange}
        />
    );
};

export default DateSelectorView;
