import React, { useState } from "react";
import BlockPickerView from "../EditorView/BlockPickerView";

const BlockPickerContainer = ({
    heights = [],
    setHeights,
    executeIndexerFunction,
    latestHeight,
    isExecuting,
    stopExecution,
}) => {
    const [inputValue, setInputValue] = useState(String(latestHeight));

    const addHeight = () => {
        if (heights.length < 10 && inputValue !== "") {
            setHeights([...heights, inputValue]);
            setInputValue("");
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
