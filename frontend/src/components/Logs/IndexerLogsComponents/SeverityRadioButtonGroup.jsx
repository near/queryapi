import React from 'react';
import RadioButtonGroup from './RadioButtonGroup';

function SeverityRadioButtonGroup({ selectedSeverity, onSeverityChange }) {
    const severityOptions = ['INFO', 'DEBUG', 'WARNING', 'ERROR'];

    return (
        <RadioButtonGroup
            options={severityOptions}
            selectedOption={selectedSeverity}
            onOptionChange={onSeverityChange}
        />
    );
}

export default SeverityRadioButtonGroup;