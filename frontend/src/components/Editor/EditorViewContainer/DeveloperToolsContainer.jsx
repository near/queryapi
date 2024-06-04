import React, { useContext } from "react";
import DeveloperToolsView from "../EditorView/DeveloperToolsView";
import { IndexerDetailsContext } from '../../../contexts/IndexerDetailsContext';

const DeveloperToolsContainer = (
    {
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
        error
    }
) => {
    const {
        indexerName,
        accountId,
        indexerDetails,
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
    console.log(heights)

    return (
        <DeveloperToolsView {...{
            handleFormating,
            handleCodeGen,
            setShowResetCodeModel,
            debugMode,
            heights,
            setHeights,
            latestHeight,
            isExecuting,
            stopExecution,
            removeHeight,
            executeIndexerFunction,
            setHeights,
        }} />
    );
};

export default DeveloperToolsContainer;
