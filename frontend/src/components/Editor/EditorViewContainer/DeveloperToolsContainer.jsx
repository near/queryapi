import React, { useContext } from "react";
import DeveloperToolsView from "../EditorView/DeveloperToolsView";
import { IndexerDetailsContext } from '../../../contexts/IndexerDetailsContext';

const DeveloperToolsContainer = (props) => {
    const {
        handleFormating,
        handleCodeGen,
        executeIndexerFunction,
        isExecuting,
        stopExecution,
        heights,
        setHeights,
        latestHeight,
        isUserIndexer,
        handleDeleteIndexer,
        error,
        setShowPublishModal,
        setShowResetCodeModel,
        setShowForkIndexerModal,
        debugMode,
        isCreateNewIndexer,
        setShowLogsView,
    } = useContext(IndexerDetailsContext);

    const removeHeight = (index) => {
        setHeights(heights.filter((_, i) => i !== index));
    };

    return (
        <DeveloperToolsView {...props} {...{
            handleFormating,
            handleCodeGen,
            setShowResetCodeModel,
            debugMode,
            heights,
            setHeights,
            latestHeight,
            isExecuting,
            stopExecution,
            removeHeight
        }} />
    );
};

export default DeveloperToolsContainer;
