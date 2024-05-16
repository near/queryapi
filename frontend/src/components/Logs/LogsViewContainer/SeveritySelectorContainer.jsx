import React from 'react';
import SeverityRadioButtonGroupView from '../LogsView/SeverityRadioButtonGroupView';

const SeveritySelectorContainer = ({ selectedSeverity, onSeverityChange }) => {
    //refactor to fetch fields from graphql
    const severityOptions = ['INFO', 'DEBUG', 'WARNING', 'ERROR'];

    return (
        <SeverityRadioButtonGroupView
            options={severityOptions}
            selectedOption={selectedSeverity}
            onOptionChange={onSeverityChange}
        />
    );
};

export default SeveritySelectorContainer;