import { request } from 'near-social-bridge';
import React, { useContext } from 'react';

import {
  CODE_FORMATTING_ERROR_MESSAGE,
  FORMATTING_ERROR_TYPE,
  INDEXER_REGISTER_TYPE_GENERATION_ERROR,
  SCHEMA_FORMATTING_ERROR_MESSAGE,
  TYPE_GENERATION_ERROR_TYPE,
} from '@/constants/Strings';
import { IndexerDetailsContext } from '@/contexts/IndexerDetailsContext';
import {
  defaultCode,
  defaultSchema,
  defaultSchemaTypes,
  formatIndexingCode,
  formatSQL,
  wrapCode,
} from '@/utils/formatters';
import { sanitizeAccountId, sanitizeIndexerName } from '@/utils/helpers';
import { queryIndexerFunctionDetails as PreviousSavedCode } from '@/utils/queryIndexerFunction';
import { validateJSCode, validateSQLSchema } from '@/utils/validators';

import { ForkIndexerModal } from '@/components/Modals/ForkIndexerModal';
import { PublishModal } from '@/components/Modals/PublishModal';
import { ResetChangesModal } from '@/components/Modals/ResetChangesModal';
import EditorMenuView from '../EditorView/EditorMenuView';

interface EditorMenuContainerProps {
  isUserIndexer: boolean;
  handleDeleteIndexer: () => void;
  isCreateNewIndexer: boolean;
  error: string | undefined;
  indexingCode: string;
  setIndexingCode: (code: string) => void;
  currentUserAccountId: string | undefined;
  // reset code
  setSchema: (schema: string) => void;
  setSchemaTypes: (schemaTypes: string) => void;
  setOriginalIndexingCode: (code: string) => void;
  setOriginalSQLCode: (code: string) => void;
  // publish
  actionButtonText: string;
  schema: string;
  setError: (error: string) => void;
  showModal: (modalName: string, modalProps: any) => void;
}

const EditorMenuContainer: React.FC<EditorMenuContainerProps> = ({
  isUserIndexer,
  handleDeleteIndexer,
  isCreateNewIndexer,
  error,
  indexingCode,
  setIndexingCode,
  currentUserAccountId,
  // reset code
  setSchema,
  setSchemaTypes,
  setOriginalIndexingCode,
  setOriginalSQLCode,
  // publish
  actionButtonText,
  schema,
  setError,
  showModal,
}) => {
  const {
    indexerName,
    accountId,
    indexerDetails,
    setShowForkIndexerModal,
    setShowLogsView,
    setAccountId,
    // reset code
    setShowResetCodeModel,
    // publish
    setShowPublishModal,
  } = useContext(IndexerDetailsContext);

  const forkIndexer = async (indexerName: string): Promise<void> => {
    if (!indexerDetails.accountId || !indexerDetails.indexerName || !indexerName || !currentUserAccountId) return;
    const sanitizedForkedFromAccountId = sanitizeAccountId(indexerDetails.accountId);
    const sanitizedForkedFromIndexerName = sanitizeIndexerName(indexerDetails.indexerName);
    const sanitizedIndexerNameInput = sanitizeIndexerName(indexerName);
    const sanitizedCurrentAccountId = sanitizeAccountId(currentUserAccountId);

    const sanitizedCode = indexingCode
      .replaceAll(sanitizedForkedFromAccountId, sanitizedCurrentAccountId)
      .replaceAll(sanitizedForkedFromIndexerName, sanitizedIndexerNameInput);

    setAccountId(currentUserAccountId);
    setIndexingCode(sanitizedCode);
  };

  const handleResetCodeChanges = async (): Promise<void> => {
    if (isCreateNewIndexer) {
      setShowResetCodeModel(false);
      setIndexingCode(formatIndexingCode(defaultCode));
      setSchema(formatSQL(defaultSchema));
      setSchemaTypes(defaultSchemaTypes);
      return;
    }
    loadDataFromPreviousSaved().catch((err) => {
      console.log(err);
    });
    setShowResetCodeModel(false);
  };

  const loadDataFromPreviousSaved = async (): Promise<void> => {
    try {
      const data = await PreviousSavedCode(indexerDetails.accountId, indexerDetails.indexerName);
      if (data == null) {
        setIndexingCode(defaultCode);
        setSchema(defaultSchema);
        setSchemaTypes(defaultSchemaTypes);
      } else {
        const unformattedIndexerCode = wrapCode(data.code);
        const unformattedSchemaCode = data.schema;
        if (unformattedIndexerCode !== null) {
          setOriginalIndexingCode(unformattedIndexerCode);
          setIndexingCode(unformattedIndexerCode);
        }
        if (unformattedSchemaCode !== null) {
          setOriginalSQLCode(unformattedSchemaCode);
          setSchema(unformattedSchemaCode);
        }
        // todo add reformatting (reformatAll)
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const registerFunction = async (indexerName: string, indexerConfig: any): Promise<void> => {
    const { data: validatedSchema, error: schemaValidationError } = validateSQLSchema(schema);
    const { data: validatedCode, error: codeValidationError } = validateJSCode(indexingCode);

    if (codeValidationError) {
      setError(CODE_FORMATTING_ERROR_MESSAGE);
      return;
    }

    const innerCode = validatedCode?.match(/getBlock\s*\([^)]*\)\s*{([\s\S]*)}/)?.[1] || '';
    indexerName = indexerName.replaceAll(' ', '_');
    const forkedFrom =
      indexerDetails.forkedAccountId && indexerDetails.forkedIndexerName
        ? {
            account_id: indexerDetails.forkedAccountId,
            function_name: indexerDetails.forkedIndexerName,
          }
        : null;

    const startBlock =
      indexerConfig.startBlock === 'startBlockHeight'
        ? { HEIGHT: indexerConfig.height }
        : indexerConfig.startBlock === 'startBlockLatest'
        ? 'LATEST'
        : 'CONTINUE';

    if (schemaValidationError?.type === FORMATTING_ERROR_TYPE) {
      setError(SCHEMA_FORMATTING_ERROR_MESSAGE);
      return;
    } else if (schemaValidationError?.type === TYPE_GENERATION_ERROR_TYPE) {
      showModal(INDEXER_REGISTER_TYPE_GENERATION_ERROR, {
        indexerName,
        code: innerCode,
        schema: validatedSchema,
        startBlock,
        contractFilter: indexerConfig.filter,
        forkedFrom,
      });
      return;
    }

    request('register-function', {
      indexerName,
      code: innerCode,
      schema: validatedSchema,
      startBlock,
      contractFilter: indexerConfig.filter,
      ...(forkedFrom && { forkedFrom }),
    });

    setShowPublishModal(false);
  };

  const getActionButtonText = () => {
    const isUserIndexer = indexerDetails.accountId === currentUserAccountId;
    if (isCreateNewIndexer) return 'Create New Indexer';
    return isUserIndexer ? actionButtonText : 'Fork Indexer';
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
      <ResetChangesModal handleResetCodeChanges={handleResetCodeChanges} />
      <PublishModal registerFunction={registerFunction} actionButtonText={getActionButtonText()} />
    </>
  );
};

export default EditorMenuContainer;
