import React, { type FC,type MouseEvent } from 'react';

import ClearButtonView from '../LogsView/ClearButtonView';

interface ClearButtonProps {
  onClick: () => void;
}

const ClearButton: FC<ClearButtonProps> = ({ onClick }) => {
  const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation();
    onClick();
  };

  return <ClearButtonView onClick={handleClick} />;
};

export default ClearButton;
