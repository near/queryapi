import React from 'react';
import RadioButtonGroup from './RadioButtonGroup';

function LogTypeRadioButtonGroup({ selectedLogType, onLogTypeChange }) {
    const logTypeOptions = ['system', 'user'];
    return (
        <RadioButtonGroup
            options={logTypeOptions}
            selectedOption={selectedLogType}
            onOptionChange={onLogTypeChange}
        />
    );
}

export default LogTypeRadioButtonGroup;
