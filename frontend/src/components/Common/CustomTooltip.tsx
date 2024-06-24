import React, { useState } from 'react';

export enum TooltipDirection {
  Top = 'top',
  Bottom = 'bottom',
  Left = 'left',
  Right = 'right',
}

interface CustomTooltipProps {
  message: string;
  direction?: TooltipDirection;
  children: React.ReactElement<any>;
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({ message, direction = TooltipDirection.Top, children }) => {
  const [visible, setVisible] = useState(false);

  const showTooltip = (): void => {
    setVisible(true);
  };
  const hideTooltip = (): void => {
    setVisible(false);
  };

  const getTooltipPositionClass = (direction: TooltipDirection | undefined): string => {
    switch (direction) {
      case TooltipDirection.Top:
        return 'bottom-full left-1/2 transform -translate-x-1/2';
      case TooltipDirection.Bottom:
        return 'top-full left-1/2 transform -translate-x-1/2';
      case TooltipDirection.Left:
        return 'top-1/2 right-full transform translate-y-1/2';
      case TooltipDirection.Right:
        return 'top-1/2 left-full transform translate-y-1/2';
      default:
        return '';
    }
  };

  const tooltipClasses = [
    getTooltipPositionClass(direction),
    'tooltip-bubble',
    'text-xxs',
    'rounded',
    'shadow-sm',
    'bg-black',
    'text-white',
    'px-2',
    'absolute',
    'text-center',
    'w-max',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="relative inline-block" onMouseEnter={showTooltip} onMouseLeave={hideTooltip}>
      {children}
      {visible && (
        <div className={tooltipClasses}>
          <div className="tooltip-message">{message}</div>
        </div>
      )}
    </div>
  );
};

export default CustomTooltip;
