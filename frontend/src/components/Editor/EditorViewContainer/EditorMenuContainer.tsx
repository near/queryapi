import React, { useContext } from 'react';
import EditorMenuView from '../EditorView/EditorMenuView';
import { IndexerDetailsContext } from '@/contexts/IndexerDetailsContext';

interface EditorMenuContainerProps {
  isUserIndexer: boolean;
  handleDeleteIndexer: () => void;
  isCreateNewIndexer: boolean;
  error: string | undefined;
}

const EditorMenuContainer: React.FC<EditorMenuContainerProps> = ({
  isUserIndexer,
  handleDeleteIndexer,
  isCreateNewIndexer,
  error,
}) => {
  const {
    indexerName,
    accountId,
    indexerDetails,
    setShowPublishModal,
    setShowForkIndexerModal,
    setShowLogsView,
  } = useContext(IndexerDetailsContext);

  return (
    <EditorMenuView
      {...{
        // Props
        isUserIndexer,
        handleDeleteIndexer,
        isCreateNewIndexer,
        error,
        // Context
        indexerName,
        accountId,
        indexerDetails,
        setShowPublishModal,
        setShowForkIndexerModal,
        setShowLogsView,
      }}
    />
  );
};

export default EditorMenuContainer;
