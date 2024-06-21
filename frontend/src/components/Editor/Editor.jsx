import React, { useEffect, useState, useRef, useMemo, useContext } from 'react';
import {
  formatSQL,
  formatIndexingCode,
  wrapCode,
  defaultCode,
  defaultSchema,
  defaultSchemaTypes,
} from '../../utils/formatters';
import { Alert } from 'react-bootstrap';
import { queryIndexerFunctionDetails } from '../../utils/queryIndexerFunction';

import primitives from '!!raw-loader!../../../primitives.d.ts';
import { request, useInitialPayload } from 'near-social-bridge';
import IndexerRunner from '../../utils/indexerRunner';
import { block_details } from './block_details';
import ResizableLayoutEditor from './ResizableLayoutEditor';
import { ResetChangesModal } from '../Modals/resetChanges';
import { FileSwitcher } from './FileSwitcher';
import EditorMenuContainer from './EditorViewContainer/EditorMenuContainer';
import DeveloperToolsContainer from './EditorViewContainer/DeveloperToolsContainer';

import { PublishModal } from '../Modals/PublishModal';
import { ForkIndexerModal } from '../Modals/ForkIndexerModal';
import { getLatestBlockHeight } from '../../utils/getLatestBlockHeight';
import { IndexerDetailsContext } from '../../contexts/IndexerDetailsContext';
import { PgSchemaTypeGen } from '../../utils/pgSchemaTypeGen';
import { validateJSCode, validateSQLSchema } from '@/utils/validators';
import { useDebouncedCallback } from 'use-debounce';
import {
  CODE_GENERAL_ERROR_MESSAGE,
  CODE_FORMATTING_ERROR_MESSAGE,
  SCHEMA_TYPE_GENERATION_ERROR_MESSAGE,
  SCHEMA_FORMATTING_ERROR_MESSAGE,
  FORMATTING_ERROR_TYPE,
  TYPE_GENERATION_ERROR_TYPE,
  INDEXER_REGISTER_TYPE_GENERATION_ERROR,
} from '../../constants/Strings';
import { InfoModal } from '@/core/InfoModal';
import { useModal } from '@/contexts/ModalContext';
import { GlyphContainer } from './GlyphContainer';

const Editor = ({ actionButtonText }) => {
  const { indexerDetails, setShowResetCodeModel, setShowPublishModal, debugMode, isCreateNewIndexer, setAccountId } =
    useContext(IndexerDetailsContext);

  const DEBUG_LIST_STORAGE_KEY = `QueryAPI:debugList:${indexerDetails.accountId}#${
    indexerDetails.indexerName || 'new'
  }`;
  const SCHEMA_STORAGE_KEY = `QueryAPI:Schema:${indexerDetails.accountId}#${indexerDetails.indexerName || 'new'}`;
  const SCHEMA_TYPES_STORAGE_KEY = `QueryAPI:Schema:Types:${indexerDetails.accountId}#${
    indexerDetails.indexerName || 'new'
  }`;
  const CODE_STORAGE_KEY = `QueryAPI:Code:${indexerDetails.accountId}#${indexerDetails.indexerName || 'new'}`;
  const SCHEMA_TAB_NAME = 'schema.sql';
  const [blockHeightError, setBlockHeightError] = useState(undefined);
  const [error, setError] = useState();

  const [fileName, setFileName] = useState('indexingLogic.js');

  const [originalSQLCode, setOriginalSQLCode] = useState(formatSQL(defaultSchema));
  const [originalIndexingCode, setOriginalIndexingCode] = useState(formatIndexingCode(defaultCode));
  const [indexingCode, setIndexingCode] = useState(originalIndexingCode);
  const [schema, setSchema] = useState(originalSQLCode);
  const [schemaTypes, setSchemaTypes] = useState(defaultSchemaTypes);
  const [monacoMount, setMonacoMount] = useState(false);

  const [heights, setHeights] = useState(localStorage.getItem(DEBUG_LIST_STORAGE_KEY) || []);

  const [debugModeInfoDisabled, setDebugModeInfoDisabled] = useState(false);
  const [diffView, setDiffView] = useState(false);
  const [blockView, setBlockView] = useState(false);
  const { openModal, showModal, data, message, hideModal } = useModal();

  const [isExecutingIndexerFunction, setIsExecutingIndexerFunction] = useState(false);
  const { height, currentUserAccountId } = useInitialPayload();

  const [decorations, setDecorations] = useState([]);
  const handleLog = (_, log, callback) => {
    if (log) console.log(log);
    if (callback) {
      callback();
    }
  };

  const indexerRunner = useMemo(() => new IndexerRunner(handleLog), []);
  const pgSchemaTypeGen = new PgSchemaTypeGen();
  const disposableRef = useRef(null);
  const monacoEditorRef = useRef(null);

  const parseGlyphError = (error, line) => {
    const { line: startLine, column: startColumn } = line?.start || { line: 1, column: 1 };
    const { line: endLine, column: endColumn } = line?.end || { line: 1, column: 1 };
    const displayedError = error?.message || 'No Errors';

    monacoEditorRef.current.deltaDecorations(
      [decorations],
      [
        {
          // eslint-disable-next-line no-undef
          range: new monaco.Range(startLine, startColumn, endLine, endColumn),
          options: {
            isWholeLine: true,
            glyphMarginClassName: error ? 'glyphError' : 'glyphSuccess',
            glyphMarginHoverMessage: { value: displayedError },
          },
        },
      ],
    );
  };

  const debouncedValidateSQLSchema = useDebouncedCallback((_schema) => {
    const { error, location } = validateSQLSchema(_schema);
    error ? parseGlyphError(error, location) : parseGlyphError();
    return;
  }, 500);

  const debouncedValidateCode = useDebouncedCallback((_code) => {
    const { error: codeError } = validateJSCode(_code);
    codeError ? setError(CODE_FORMATTING_ERROR_MESSAGE) : setError();
  }, 500);

  useEffect(() => {
    if (indexerDetails.code != null) {
      const { data: formattedCode, error: codeError } = validateJSCode(indexerDetails.code);

      if (codeError) {
        setError(CODE_FORMATTING_ERROR_MESSAGE);
      }

      setOriginalIndexingCode(formattedCode);
      setIndexingCode(formattedCode);
    }
  }, [indexerDetails.code]);

  useEffect(() => {
    if (indexerDetails.schema != null) {
      const { data: formattedSchema, error: schemaError } = validateSQLSchema(indexerDetails.schema);

      if (schemaError?.type === FORMATTING_ERROR_TYPE) {
        setError(SCHEMA_FORMATTING_ERROR_MESSAGE);
      } else if (schemaError?.type === TYPE_GENERATION_ERROR_TYPE) {
        setError(SCHEMA_TYPE_GENERATION_ERROR_MESSAGE);
      }

      setSchema(formattedSchema);
    }
  }, [indexerDetails.schema]);

  useEffect(() => {
    const { error: schemaError, location } = validateSQLSchema(schema);
    const { error: codeError } = validateJSCode(indexingCode);

    if (schemaError?.type === FORMATTING_ERROR_TYPE) {
      setError(SCHEMA_FORMATTING_ERROR_MESSAGE);
    } else if (schemaError?.type === TYPE_GENERATION_ERROR_TYPE) {
      setError(SCHEMA_TYPE_GENERATION_ERROR_MESSAGE);
    } else if (codeError) setError(CODE_GENERAL_ERROR_MESSAGE);
    else {
      setError();
      handleCodeGen();
    }
    if (fileName === SCHEMA_TAB_NAME) debouncedValidateSQLSchema(schema);
  }, [fileName]);

  useEffect(() => {
    const savedSchema = localStorage.getItem(SCHEMA_STORAGE_KEY);
    const savedCode = localStorage.getItem(CODE_STORAGE_KEY);

    if (savedSchema) {
      setSchema(savedSchema);
    }
    if (savedCode) setIndexingCode(savedCode);
  }, [indexerDetails.accountId, indexerDetails.indexerName]);

  useEffect(() => {
    localStorage.setItem(SCHEMA_STORAGE_KEY, schema);
    localStorage.setItem(CODE_STORAGE_KEY, indexingCode);
  }, [schema, indexingCode]);

  useEffect(() => {
    localStorage.setItem(SCHEMA_TYPES_STORAGE_KEY, schemaTypes);
    handleCodeGen();
  }, [schemaTypes, monacoMount]);

  useEffect(() => {
    localStorage.setItem(DEBUG_LIST_STORAGE_KEY, heights);
  }, [heights]);

  const attachTypesToMonaco = () => {
    // If types has been added already, dispose of them first
    if (disposableRef.current) {
      disposableRef.current.dispose();
      disposableRef.current = null;
    }

    if (window.monaco) {
      // Add generated types to monaco and store disposable to clear them later
      // eslint-disable-next-line no-undef
      const newDisposable = monaco.languages.typescript.typescriptDefaults.addExtraLib(schemaTypes);
      if (newDisposable != null) {
        console.log('Types successfully imported to Editor');
      }

      disposableRef.current = newDisposable;
    }
  };

  const forkIndexer = async (indexerName) => {
    let code = indexingCode;
    setAccountId(currentUserAccountId);
    let prevAccountId = indexerDetails.accountId.replaceAll('.', '_');
    let newAccountId = currentUserAccountId.replaceAll('.', '_');
    let prevIndexerName = indexerDetails.indexerName.replaceAll('-', '_').trim().toLowerCase();
    let newIndexerName = indexerName.replaceAll('-', '_').trim().toLowerCase();
    code = code.replaceAll(prevAccountId, newAccountId);
    code = code.replaceAll(prevIndexerName, newIndexerName);
    setIndexingCode(formatIndexingCode(code));
  };

  const registerFunction = async (indexerName, indexerConfig) => {
    const { data: validatedSchema, error: schemaValidationError } = validateSQLSchema(schema);
    const { data: validatedCode, error: codeValidationError } = validateJSCode(indexingCode);

    if (codeValidationError) {
      setError(CODE_FORMATTING_ERROR_MESSAGE);
      return;
    }

    let innerCode = validatedCode.match(/getBlock\s*\([^)]*\)\s*{([\s\S]*)}/)[1];
    indexerName = indexerName.replaceAll(' ', '_');
    let forkedFrom =
      indexerDetails.forkedAccountId && indexerDetails.forkedIndexerName
        ? { account_id: indexerDetails.forkedAccountId, function_name: indexerDetails.forkedIndexerName }
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
      indexerName: indexerName,
      code: innerCode,
      schema: validatedSchema,
      startBlock,
      contractFilter: indexerConfig.filter,
      ...(forkedFrom && { forkedFrom }),
    });

    setShowPublishModal(false);
  };

  const handleDeleteIndexer = () => {
    request('delete-indexer', {
      accountId: indexerDetails.accountId,
      indexerName: indexerDetails.indexerName,
    });
  };

  const handleReload = async () => {
    if (isCreateNewIndexer) {
      setShowResetCodeModel(false);
      setIndexingCode(originalIndexingCode);
      setSchema(originalSQLCode);
      setSchemaTypes(defaultSchemaTypes);
      return;
    }

    const data = await queryIndexerFunctionDetails(indexerDetails.accountId, indexerDetails.indexerName);
    if (data == null) {
      setIndexingCode(defaultCode);
      setSchema(defaultSchema);
      setSchemaTypes(defaultSchemaTypes);
    } else {
      try {
        let unformatted_wrapped_indexing_code = wrapCode(data.code);
        let unformatted_schema = data.schema;
        if (unformatted_wrapped_indexing_code !== null) {
          setOriginalIndexingCode(() => unformatted_wrapped_indexing_code);
          setIndexingCode(() => unformatted_wrapped_indexing_code);
        }
        if (unformatted_schema !== null) {
          setOriginalSQLCode(unformatted_schema);
          setSchema(unformatted_schema);
        }

        const { formattedCode, formattedSchema } = reformatAll(unformatted_wrapped_indexing_code, unformatted_schema);
        setIndexingCode(formattedCode);
        setSchema(formattedSchema);
      } catch (formattingError) {
        console.log(formattingError);
      }
    }
    setShowResetCodeModel(false);
  };

  const getActionButtonText = () => {
    const isUserIndexer = indexerDetails.accountId === currentUserAccountId;
    if (isCreateNewIndexer) return 'Create New Indexer';
    return isUserIndexer ? actionButtonText : 'Fork Indexer';
  };

  const reformatAll = (indexingCode, schema) => {
    let { data: formattedCode, error: codeError } = validateJSCode(indexingCode);
    let { data: formattedSchema, error: schemaError } = validateSQLSchema(schema);

    if (codeError) {
      formattedCode = indexingCode;
      setError(CODE_FORMATTING_ERROR_MESSAGE);
    } else if (schemaError?.type === FORMATTING_ERROR_TYPE) {
      formattedSchema = schema;
      setError(SCHEMA_FORMATTING_ERROR_MESSAGE);
    } else if (schemaError?.type === TYPE_GENERATION_ERROR_TYPE) {
      formattedSchema = schema;
      setError(SCHEMA_TYPE_GENERATION_ERROR_MESSAGE);
    } else {
      setError();
    }

    return { formattedCode, formattedSchema };
  };

  function handleCodeGen() {
    try {
      setSchemaTypes(pgSchemaTypeGen.generateTypes(schema));
      attachTypesToMonaco(); // Just in case schema types have been updated but weren't added to monaco
    } catch (_error) {
      console.error('Error generating types for saved schema.\n', _error);
      setError(SCHEMA_TYPE_GENERATION_ERROR_MESSAGE);
    }
  }

  function handleFormating() {
    const { formattedCode, formattedSchema } = reformatAll(indexingCode, schema);
    setIndexingCode(formattedCode);
    setSchema(formattedSchema);
  }

  function handleEditorWillMount(editor, monaco) {
    if (!diffView) {
      const decorations = editor.deltaDecorations(
        [],
        [
          {
            range: new monaco.Range(1, 1, 1, 1),
            options: {},
          },
        ],
      );
      monacoEditorRef.current = editor;
      setDecorations(decorations);
    }
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      `${primitives}}`,
      'file:///node_modules/@near-lake/primitives/index.d.ts',
    );
    setMonacoMount(true);
  }

  async function executeIndexerFunction(option = 'latest', startingBlockHeight = null) {
    setIsExecutingIndexerFunction(() => true);
    const schemaName = indexerDetails.accountId.concat('_', indexerDetails.indexerName).replace(/[^a-zA-Z0-9]/g, '_');
    let latestHeight;
    switch (option) {
      case 'debugList':
        await indexerRunner.executeIndexerFunctionOnHeights(heights, indexingCode, schema, schemaName, option);
        break;
      case 'specific':
        if (startingBlockHeight === null && Number(startingBlockHeight) === 0) {
          console.log('Invalid Starting Block Height: starting block height is null or 0');
          break;
        }

        await indexerRunner.start(startingBlockHeight, indexingCode, schema, schemaName, option);
        break;
      case 'latest':
        latestHeight = await getLatestBlockHeight();
        if (latestHeight) await indexerRunner.start(latestHeight - 10, indexingCode, schema, schemaName, option);
    }
    setIsExecutingIndexerFunction(() => false);
  }

  function handleOnChangeSchema(_schema) {
    setSchema(_schema);
    debouncedValidateSQLSchema(_schema);
  }

  function handleOnChangeCode(_code) {
    setIndexingCode(_code);
    debouncedValidateCode(_code);
  }

  function handleRegisterIndexerWithErrors(args) {
    request('register-function', args);
  }

  return (
    <>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '85vh',
        }}
      >
        {!indexerDetails.code && !isCreateNewIndexer && (
          <Alert
            className="px-4 py-3 mb-4 font-semibold text-red-700 text-sm text-center border border-red-300 bg-red-50 rounded-lg shadow-md"
            variant="danger"
          >
            Indexer Function could not be found. Are you sure this indexer exists?
          </Alert>
        )}
        {(indexerDetails.code || isCreateNewIndexer) && (
          <>
            <EditorMenuContainer
              handleFormating={handleFormating}
              handleCodeGen={handleCodeGen}
              error={error}
              executeIndexerFunction={executeIndexerFunction}
              heights={heights}
              setHeights={setHeights}
              isCreateNewIndexer={isCreateNewIndexer}
              isExecuting={isExecutingIndexerFunction}
              stopExecution={() => indexerRunner.stop()}
              latestHeight={height}
              isUserIndexer={indexerDetails.accountId === currentUserAccountId}
              handleDeleteIndexer={handleDeleteIndexer}
            />
            <DeveloperToolsContainer
              handleFormating={handleFormating}
              handleCodeGen={handleCodeGen}
              error={error}
              executeIndexerFunction={executeIndexerFunction}
              heights={heights}
              setHeights={setHeights}
              isCreateNewIndexer={isCreateNewIndexer}
              isExecuting={isExecutingIndexerFunction}
              stopExecution={() => indexerRunner.stop()}
              latestHeight={height}
              isUserIndexer={indexerDetails.accountId === currentUserAccountId}
              handleDeleteIndexer={handleDeleteIndexer}
              fileName={fileName}
              setFileName={setFileName}
              diffView={diffView}
              setDiffView={setDiffView}
            />

            <ResetChangesModal handleReload={handleReload} />
            <PublishModal
              registerFunction={registerFunction}
              actionButtonText={getActionButtonText()}
              blockHeightError={blockHeightError}
            />
            <ForkIndexerModal forkIndexer={forkIndexer} />

            <div
              className="mt-2"
              style={{
                flex: 'display',
                justifyContent: 'space-around',
                width: '100%',
                height: '100%',
              }}
            >
              {error && (
                <Alert
                  dismissible="true"
                  onClose={() => setError()}
                  className="px-4 py-3 mb-4 font-semibold text-red-700 text-sm text-center border border-red-300 bg-red-50 rounded-lg shadow-md"
                  variant="danger"
                >
                  {error}
                </Alert>
              )}
              {debugMode && !debugModeInfoDisabled && (
                <Alert
                  className="px-4 py-3 mb-4 font-semibold text-gray-700 text-sm text-center border border-blue-300 bg-blue-50 rounded-lg shadow-md"
                  dismissible="true"
                  onClose={() => setDebugModeInfoDisabled(true)}
                  variant="info"
                >
                  To debug, you will need to open your browser console window in order to see the logs.
                </Alert>
              )}
              <FileSwitcher
                fileName={fileName}
                setFileName={setFileName}
                diffView={diffView}
                setDiffView={setDiffView}
              />
              <GlyphContainer style={{ height: '100%', width: '100%' }}>
                <ResizableLayoutEditor
                  fileName={fileName}
                  indexingCode={indexingCode}
                  blockView={blockView}
                  diffView={diffView}
                  onChangeCode={handleOnChangeCode}
                  onChangeSchema={handleOnChangeSchema}
                  block_details={block_details}
                  originalSQLCode={originalSQLCode}
                  originalIndexingCode={originalIndexingCode}
                  schema={schema}
                  isCreateNewIndexer={isCreateNewIndexer}
                  onMount={handleEditorWillMount}
                />
              </GlyphContainer>
            </div>
          </>
        )}
      </div>
      <InfoModal
        open={openModal}
        title="Validation Error"
        message={message}
        okButtonText="Proceed"
        onOkButtonPressed={() => handleRegisterIndexerWithErrors(data)}
        onCancelButtonPressed={hideModal}
        onClose={hideModal}
      />
    </>
  );
};

export default Editor;
