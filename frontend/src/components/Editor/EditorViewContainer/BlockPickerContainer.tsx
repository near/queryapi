import React, { useState } from 'react';

import BlockPickerView from '../EditorView/BlockPickerView';

interface BlockPickerContainerProps {
    heights: string[];
    setHeights: React.Dispatch<React.SetStateAction<string[]>>;
    executeIndexerFunction: () => void;
    latestHeight: number;
    isExecuting: boolean;
    stopExecution: () => void;
}

const BlockPickerContainer: React.FC<BlockPickerContainerProps> = ({
    heights = [],
    setHeights,
    executeIndexerFunction,
    latestHeight,
    isExecuting,
    stopExecution,
}) => {
    const [inputValue, setInputValue] = useState(String(latestHeight));

    const addHeight = (): void => {
        if (heights.length < 10 && inputValue !== '') {
            setHeights([...heights, inputValue]);
            setInputValue('');
        }
    };

    return (
        <BlockPickerView
            heights={heights}
            inputValue={inputValue}
            setInputValue={setInputValue}
            isExecuting={isExecuting}
            addHeight={addHeight}
            stopExecution={stopExecution}
            executeIndexerFunction={executeIndexerFunction}
        />
    );
};

export default BlockPickerContainer;
