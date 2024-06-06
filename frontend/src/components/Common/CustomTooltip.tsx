import React from 'react';
import { Tooltip, OverlayTriggerProps, OverlayTrigger } from 'react-bootstrap';

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
    const renderTooltip = (props: OverlayTriggerProps) => (
        <Tooltip id="custom-tooltip" {...props}
            className="text-xs rounded shadow-sm">
            {message}
        </Tooltip>
    );

    const overlay = React.useMemo(() => renderTooltip({} as OverlayTriggerProps), [message]);

    return (
        <OverlayTrigger
            placement={direction}
            delay={{ show: 250, hide: 350 }}
            overlay={overlay}
        >
            {children}
        </OverlayTrigger>
    );
};

export default CustomTooltip;
