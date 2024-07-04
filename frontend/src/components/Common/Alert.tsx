import React, { useState } from 'react';

type AlertProps = {
  type: 'success' | 'error' | 'info';
  message: string;
  onClose?: () => void;
};

const Alert: React.FC<AlertProps> = ({ type, message, onClose }) => {
  const [closed, setClosed] = useState(false);

  const handleClose = () => {
    setClosed(true);
    if (onClose) {
      onClose();
    }
  };

  if (closed) {
    return null;
  }

  return (
    <div
      className={`${
        type === 'success'
          ? 'bg-green-100 border-green-400 text-green-700'
          : type === 'error'
          ? 'bg-red-100 border-red-400 text-red-700'
          : 'bg-blue-100 border-blue-400 text-blue-700'
      } border px-4 py-3 rounded relative`}
      role="alert"
    >
      <strong className="font-bold">Alert:</strong>
      <span className="block sm:inline ml-2">{message}</span>
      <span className="absolute top-0 bottom-0 right-0 px-4 py-3">
        <svg
          className="fill-current h-6 w-6 text-black cursor-pointer"
          role="button"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          onClick={handleClose}
        >
          <title>Close</title>
          <path
            fillRule="evenodd"
            d="M14.35 5.64a1 1 0 0 1 0 1.41L11.41 10l2.94 2.93a1 1 0 0 1-1.41 1.41L10 11.41l-2.93 2.94a1 1 0 1 1-1.41-1.41L8.59 10 5.64 7.06a1 1 0 0 1 1.41-1.41L10 8.59l2.93-2.94a1 1 0 0 1 1.42 0z"
          />
        </svg>
      </span>
    </div>
  );
};

export default Alert;
