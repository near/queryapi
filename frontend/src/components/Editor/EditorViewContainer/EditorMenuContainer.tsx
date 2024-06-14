import React, { useContext } from 'react';
import EditorMenuView from '../EditorView/EditorMenuView';
import { ForkIndexerModal } from '../../Modals/ForkIndexerModal';
import { ResetChangesModal } from '../../Modals/ResetChanges';
import { IndexerDetailsContext } from '@/contexts/IndexerDetailsContext';
import { sanitizeIndexerName, sanitizeAccountId } from '@/utils/helpers';
import { queryIndexerFunctionDetails as PreviousSavedCode } from '@/utils/queryIndexerFunction';

import {
  defaultCode,
  defaultSchema,
  defaultSchemaTypes,
  formatSQL,
  formatIndexingCode,
  wrapCode,
} from '@/utils/formatters';

interface EditorMenuContainerProps {
  isUserIndexer: boolean;
  handleDeleteIndexer: () => void;
  isCreateNewIndexer: boolean;
  error: string | undefined;
  indexingCode: string;
  setIndexingCode: (code: string) => void;
  currentUserAccountId: string;
  //reset code
  setSchema: (schema: string) => void;
  setSchemaTypes: (schemaTypes: string) => void;
  setOriginalIndexingCode: (code: string) => void;
  setOriginalSQLCode: (code: string) => void;
}

const EditorMenuContainer: React.FC<EditorMenuContainerProps> = ({
  isUserIndexer,
  handleDeleteIndexer,
  isCreateNewIndexer,
  error,
  indexingCode,
  setIndexingCode,
  currentUserAccountId,
  //reset code
  setSchema,
  setSchemaTypes,
  setOriginalIndexingCode,
  setOriginalSQLCode,
}) => {
  const {
    indexerName,
    accountId,
    indexerDetails,
    setShowPublishModal,
    setShowForkIndexerModal,
    setShowLogsView,
    setAccountId,
    //reset code
    setShowResetCodeModel,
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

  const handleReload = async () => {
    if (isCreateNewIndexer) {
      setShowResetCodeModel(false);
      setIndexingCode(formatIndexingCode(defaultCode));
      setSchema(formatSQL(defaultSchema));
      setSchemaTypes(defaultSchemaTypes);
      return;
    }
    loadDataFromPreviousSaved();
    setShowResetCodeModel(false);
  };

  const loadDataFromPreviousSaved = async () => {
    try {
      const data = await PreviousSavedCode(indexerDetails.accountId, indexerDetails.indexerName);
      if (data == null) {
        setIndexingCode(defaultCode);
        setSchema(defaultSchema);
        setSchemaTypes(defaultSchemaTypes);
      } else {
        let unformatted_wrapped_indexing_code = wrapCode(data.code);
        let unformatted_schema = data.schema;
        if (unformatted_wrapped_indexing_code !== null) {
          setOriginalIndexingCode(unformatted_wrapped_indexing_code);
          setIndexingCode(unformatted_wrapped_indexing_code);
        }
        if (unformatted_schema !== null) {
          setOriginalSQLCode(unformatted_schema);
          setSchema(unformatted_schema);
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
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
      <ResetChangesModal handleReload={handleReload} />
    </>
  );
};

export default EditorMenuContainer;
