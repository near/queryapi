import React from 'react';
import { Button } from 'react-bootstrap';

export const ClearIcon = ({ onClick }) => {
    const handleClick = (event) => {
        event.stopPropagation();
        onClick();
    };

    return (
        <Button
            variant="light"
            className="text-gray-900 border-gray-900 hover:text-red-500 hover:border-red-500 px-2 py-1 flex items-center justify-center"
            onClick={handleClick}
        >
            <span>clear</span>

            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                width="24"
                height="24"
                className="h-6"
            >
                <path
                    fill="currentColor"
                    d="M5.29 6.71l4.59 4.59-4.59 4.59 1.41 1.41 4.59-4.59 4.59 4.59 1.41-1.41-4.59-4.59 4.59-4.59-1.41-1.41-4.59 4.59-4.59-4.59-1.41 1.41z"
                />
            </svg>

        </Button>

    );
};
