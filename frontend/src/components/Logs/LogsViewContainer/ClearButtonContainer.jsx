import React from 'react';
import ClearButtonView from '../LogsView/ClearButtonView';

const ClearButtonContainer = ({ onClick }) => {
    const handleClick = (event) => {
        event.stopPropagation();
        onClick();
    };

    return <ClearButtonView onClick={handleClick} />;
};

export default ClearButtonContainer;
