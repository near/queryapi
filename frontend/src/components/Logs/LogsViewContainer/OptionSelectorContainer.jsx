import React from 'react';
import OptionSelectorView from '../LogsView/OptionSelectorView';
// import { ClearButtonContainer } from '../LogsViewContainer/ClearButtonContainer';

const OptionSelectorContainer = ({ options, selectedOption, onOptionChange }) => {
    const handleOptionChange = (value) => {
        onOptionChange(value);
    };

    // const handleClearSelection = () => {
    //     onOptionChange("");
    // };

    return (
        <OptionSelectorView
            options={options}
            selectedOption={selectedOption}
            onOptionChange={onOptionChange}
            handleOptionChange={handleOptionChange}
        />
    );
};

export default OptionSelectorContainer;