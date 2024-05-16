import React from 'react';
import LogTypeSelectorView from '../LogsView/LogTypeSelectorView'

const LogTypeSelectorContainer = ({ selectedLogType, onLogTypeChange }) => {
    //refactor to fetch fields from graphql
    const logTypeOptions = ['system', 'user'];

    return (
        <LogTypeSelectorView
            options={logTypeOptions}
            selectedOption={selectedLogType}
            onOptionChange={onLogTypeChange}
        />
    );
}

export default LogTypeSelectorContainer;
