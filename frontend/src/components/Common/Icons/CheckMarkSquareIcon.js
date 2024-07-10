import React from 'react';

const CheckMarkSquareIcon = () => {
  return (
    <div className={`ml-2 w-4 h-4 inline-flex justify-center items-center bg-green-500 text-white rounded`}>
      <svg xmlns="http://www.w3.org/2000/svg" className="h-2 w-2" viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M19.707 3.293a1 1 0 0 1 0 1.414l-12 12a1 1 0 0 1-1.414 0l-7-7a1 1 0 0 1 1.414-1.414L8 14.586l11.293-11.293a1 1 0 0 1 1.414 0z"
          clipRule="evenodd"
        />
      </svg>
    </div>
  );
};

export default CheckMarkSquareIcon;
