import React from 'react';
import { Button } from 'react-bootstrap';
import { ClearIcon } from '../LogsView/Icons/ClearIcon';

const ClearButtonView = ({ onClick }) => {
    return (
        <Button
            variant="light"
            className="text-gray-900 border-gray-900 hover:text-red-500 hover:border-red-500 px-2 py-1 flex items-center justify-center"
            onClick={onClick}
        >
            <span>clear</span>
            <ClearIcon />
        </Button>
    );
};

export default ClearButtonView;
