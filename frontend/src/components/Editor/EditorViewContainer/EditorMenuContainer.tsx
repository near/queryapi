import React, { useContext } from 'react';
import EditorMenuView from '../EditorView/EditorMenuView';
import { ForkIndexerModal } from '../../Modals/ForkIndexerModal';
import { IndexerDetailsContext } from '@/contexts/IndexerDetailsContext';
import { sanitizeIndexerName, sanitizeAccountId } from '@/utils/helpers';

interface EditorMenuContainerProps {
  isUserIndexer: boolean;
  handleDeleteIndexer: () => void;
  isCreateNewIndexer: boolean;
  error: string | undefined;
  indexingCode: string;
  setIndexingCode: (code: string) => void;
  currentUserAccountId: string;
}

const EditorMenuContainer: React.FC<EditorMenuContainerProps> = ({
  isUserIndexer,
  handleDeleteIndexer,
  isCreateNewIndexer,
  error,
  indexingCode,
  setIndexingCode,
  currentUserAccountId,
}) => {
  const {
    indexerName,
    accountId,
    indexerDetails,
    setShowPublishModal,
    setShowForkIndexerModal,
    setShowLogsView,
    setAccountId,
  } = useContext(IndexerDetailsContext);

  const forkIndexer = async (indexerName: string): Promise<void> => {
    const sanitizedForkedFromAccountId = sanitizeAccountId(indexerDetails.accountId);
    const sanitizedForkedFromIndexerName = sanitizeIndexerName(indexerDetails.indexerName);

    const sanitizedIndexerNameInput = sanitizeIndexerName(indexerName);
    const sanitizedCurrentAccountId = sanitizeAccountId(currentUserAccountId);

    let sanitizedCode = indexingCode
      .replaceAll(sanitizedForkedFromAccountId, sanitizedCurrentAccountId)
      .replaceAll(sanitizedForkedFromIndexerName, sanitizedIndexerNameInput);

    setAccountId(currentUserAccountId);
    setIndexingCode(sanitizedCode);
  };

  return (
    <>
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
      <ForkIndexerModal forkIndexer={forkIndexer} />
    </>
  );
};

export default EditorMenuContainer;
