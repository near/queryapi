import React, { useContext } from "react";
import EditorMenuView from "../EditorView/EditorMenuView";
import { IndexerDetailsContext } from '../../../contexts/IndexerDetailsContext';

const EditorMenuContainer = (props) => {
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

    return (
        <EditorMenuView {...props} {...{
            indexerName,
            accountId,
            indexerDetails,
            setShowPublishModal,
            setShowResetCodeModel,
            setShowForkIndexerModal,
            debugMode,
            isCreateNewIndexer,
            setShowLogsView
        }} />
    );
};

export default EditorMenuContainer;
