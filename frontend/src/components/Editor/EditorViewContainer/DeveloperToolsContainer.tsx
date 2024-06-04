import React, { useContext } from "react";
import DeveloperToolsView from "../EditorView/DeveloperToolsView";
import { IndexerDetailsContext } from '../../../contexts/IndexerDetailsContext';

interface DeveloperToolsContainerProps {
    handleFormating: () => void;
    handleCodeGen: () => void;
    executeIndexerFunction: () => void;
    isExecuting: boolean;
    stopExecution: () => void;
    heights: string[];
    setHeights: React.Dispatch<React.SetStateAction<string[]>>;
    latestHeight: number;
    isUserIndexer: boolean;
    handleDeleteIndexer: () => void;
    error: string;
    diffView: boolean;
    setDiffView: React.Dispatch<React.SetStateAction<boolean>>;
}

const DeveloperToolsContainer: React.FC<DeveloperToolsContainerProps> = ({
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
    diffView,
    setDiffView,
}) => {
    const {
        indexerName,
        accountId,
        indexerDetails,
        setShowPublishModal,
        setShowResetCodeModel,
        setShowForkIndexerModal,
        debugMode,
        setDebugMode,
        isCreateNewIndexer,
        setShowLogsView,
    } = useContext(IndexerDetailsContext);

    const removeHeight = (index: number) => {
        setHeights(heights.filter((_, i) => i !== index));
    };

    return (
        <DeveloperToolsView {...{
            handleFormating,
            handleCodeGen,
            setShowResetCodeModel,
            debugMode,
            setDebugMode,
            heights,
            setHeights,
            latestHeight,
            isExecuting,
            stopExecution,
            removeHeight,
            executeIndexerFunction,
            diffView,
            setDiffView,
        }} />
    );
};

export default DeveloperToolsContainer;
