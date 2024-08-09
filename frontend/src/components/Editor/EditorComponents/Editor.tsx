import { request, useInitialPayload } from 'near-social-bridge';
import type { ReactElement } from 'react';
import type { Method, Event } from '@/pages/api/generateCode';

import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-bootstrap';
import { useDebouncedCallback } from 'use-debounce';

import primitives from '!!raw-loader!./primitives.d.ts';
import {
  FORMATTING_ERROR_TYPE,
  SCHEMA_FORMATTING_ERROR_MESSAGE,
  SCHEMA_TYPE_GENERATION_ERROR_MESSAGE,
  TYPE_GENERATION_ERROR_TYPE,
} from '@/constants/Strings';
import { IndexerDetailsContext } from '@/contexts/IndexerDetailsContext';
import { useModal } from '@/contexts/ModalContext';
import {
  defaultCode,
  defaultSchema,
  defaultSchemaTypes,
  formatIndexingCode,
  formatSQL,
  wrapCode,
} from '@/utils/formatters';
import { getLatestBlockHeight } from '@/utils/getLatestBlockHeight';
import IndexerRunner from '@/utils/indexerRunner';
import { PgSchemaTypeGen } from '@/utils/pgSchemaTypeGen';
import { validateJSCode, validateSQLSchema } from '@/utils/validators';

import DeveloperToolsContainer from '../EditorViewContainer/DeveloperToolsContainer';
import EditorMenuContainer from '../EditorViewContainer/EditorMenuContainer';
import QueryAPIStorageManager from '../QueryApiStorageManager';
import { block_details } from './block_details';
import { FileSwitcher } from './FileSwitcher';
import { GlyphContainer } from './GlyphContainer';
import ResizableLayoutEditor from './ResizableLayoutEditor';

declare const monaco: any;
const INDEXER_TAB_NAME = 'indexer.js';
const SCHEMA_TAB_NAME = 'schema.sql';
const originalSQLCode = formatSQL(defaultSchema);
const originalIndexingCode = formatIndexingCode(defaultCode);
const pgSchemaTypeGen = new PgSchemaTypeGen();

interface WizardResponse {
  wizardContractFilter: string;
  wizardMethods: Method[];
  wizardEvents?: Event[];
}

const fetchWizardData = (req: string): Promise<WizardResponse> => {
  return request<WizardResponse>('launchpad-create-indexer', req);
};

const Editor: React.FC = (): ReactElement => {
  const { indexerDetails, isCreateNewIndexer } = useContext(IndexerDetailsContext);

  const contextCode = indexerDetails.code && formatIndexingCode(indexerDetails.code);
  const contextSchema = indexerDetails.schema && formatSQL(indexerDetails.schema);

  const storageManager = useMemo(() => {
    if (indexerDetails.accountId && indexerDetails.indexerName) {
      return new QueryAPIStorageManager(indexerDetails.accountId, indexerDetails.indexerName);
    } else return null;
  }, [indexerDetails.accountId, indexerDetails.indexerName]);

  const [indexerError, setIndexerError] = useState<string | undefined>();
  const [schemaError, setSchemaError] = useState<string | undefined>();
  const [fileName, setFileName] = useState<string>(INDEXER_TAB_NAME);
  const [indexingCode, setIndexingCode] = useState<string>(originalIndexingCode);
  const [schema, setSchema] = useState<string>(originalSQLCode);
  const [cursorPosition, setCursorPosition] = useState<{ lineNumber: number; column: number }>({
    lineNumber: 1,
    column: 1,
  });

  const [schemaTypes, setSchemaTypes] = useState<string>(defaultSchemaTypes);
  const [monacoMount, setMonacoMount] = useState<boolean>(false);

  const initialHeights = storageManager ? storageManager.getDebugList() || [] : [];
  const [heights, setHeights] = useState<number[]>(initialHeights);

  const [diffView, setDiffView] = useState<boolean>(false);
  const [blockView, setBlockView] = useState<boolean>(false);

  const [launchPadDefaultCode, setLaunchPadDefaultCode] = useState<string>('');
  const [launchPadDefaultSchema, setLaunchPadDefaultSchema] = useState<string>('');

  const { showModal } = useModal();

  const [isExecutingIndexerFunction, setIsExecutingIndexerFunction] = useState<boolean>(false);
  const { height, currentUserAccountId }: { height?: number; currentUserAccountId?: string } =
    useInitialPayload() || {};

  const [decorations, setDecorations] = useState<any[]>([]);

  const handleLog = (_: any, log: string, callback: () => void) => {
    if (log) console.log(log);
    if (callback) {
      callback();
    }
  };

  const indexerRunner = useMemo(() => new IndexerRunner(handleLog), []);
  const disposableRef = useRef<any>(null);
  const monacoEditorRef = useRef<any>(null);

  const debouncedValidateSQLSchema = useDebouncedCallback((_schema: string) => {
    const { error, location } = validateSQLSchema(_schema);
    error ? parseGlyphError(error as any, location as any) : parseGlyphError();
    schemaErrorHandler(error);
  }, 500);

  const debouncedValidateCode = useDebouncedCallback((_code: string) => {
    const { error } = validateJSCode(_code);
    console.log(error);
    indexerErrorHandler(error);
  }, 500);

  const schemaErrorHandler = (schemaError: any): void => {
    if (schemaError?.type === FORMATTING_ERROR_TYPE) setSchemaError(SCHEMA_FORMATTING_ERROR_MESSAGE);
    if (schemaError?.type === TYPE_GENERATION_ERROR_TYPE) setSchemaError(SCHEMA_TYPE_GENERATION_ERROR_MESSAGE);
    if (!schemaError) setSchemaError(undefined);
    return;
  };

  const indexerErrorHandler = (indexerError: any): void => {
    if (indexerError) setIndexerError(indexerError);
    if (!indexerError) setIndexerError(undefined);
    return;
  };

  const generateCode = async (contractFilter: string, selectedMethods: Method[], selectedEvents?: Event[]) => {
    try {
      const response = await fetch('/api/generateCode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ contractFilter, selectedMethods, selectedEvents }),
      });
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      const data = await response.json();

      if (!data.hasOwnProperty('jsCode') || !data.hasOwnProperty('sqlCode')) {
        throw new Error('No code was returned from the server with properties jsCode and sqlCode');
      }

      return data;
    } catch (error) {
      throw error;
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const { wizardContractFilter, wizardMethods, wizardEvents } = await fetchWizardData('');

        if (wizardContractFilter === 'noFilter') return;

        const { jsCode, sqlCode } = await generateCode(wizardContractFilter, wizardMethods, wizardEvents);
        const wrappedIndexingCode = wrapCode(jsCode) ? wrapCode(jsCode) : jsCode;
        const { validatedCode, validatedSchema } = reformatAll(wrappedIndexingCode, sqlCode);

        validatedCode && (setIndexingCode(validatedCode), setLaunchPadDefaultCode(validatedCode));
        validatedSchema && (setSchema(validatedSchema), setLaunchPadDefaultSchema(validatedSchema));
      } catch (error: unknown) {
        //todo: figure out best course of action for user if api fails
        console.error(error);
      }
    })();
  }, []);

  useEffect(() => {
    console.log(indexerDetails.code);
    //* Load saved code from local storage if it exists else load code from context
    const savedCode = storageManager?.getIndexerCode();
    if (savedCode) setIndexingCode(savedCode);
    else if (indexerDetails.code) {
      const { data: formattedCode, error: codeError } = validateJSCode(indexerDetails.code);
      indexerErrorHandler(codeError);
      formattedCode && setIndexingCode(formattedCode);
    }
    //* Load saved cursor position from local storage if it exists else set cursor to start
    const savedCursorPosition = storageManager?.getCursorPosition();
    if (savedCursorPosition) setCursorPosition(savedCursorPosition);
    if (monacoEditorRef.current && fileName === INDEXER_TAB_NAME) {
      monacoEditorRef.current.setPosition(savedCursorPosition || { lineNumber: 1, column: 1 });
      monacoEditorRef.current.focus();
    }
  }, [indexerDetails.code]);

  useEffect(() => {
    console.log(indexerDetails.schema);
    //* Load saved schema from local storage if it exists else load code from context
    const savedSchema = storageManager?.getSchemaCode();
    if (savedSchema) setSchema(savedSchema);
    else if (indexerDetails.schema) {
      const { data: formattedSchema, error: schemaError } = validateSQLSchema(indexerDetails.schema);
      schemaErrorHandler(schemaError);
      formattedSchema && setSchema(formattedSchema);
    }
  }, [indexerDetails.schema]);

  useEffect(() => {
    const { error: schemaError } = validateSQLSchema(schema);
    const { error: codeError } = validateJSCode(indexingCode);

    if (schemaError || codeError) {
      if (schemaError) schemaErrorHandler(schemaError);
      if (codeError) indexerErrorHandler(codeError);
      return;
    }

    handleCodeGen();
  }, [fileName]);

  useEffect(() => {
    cacheToLocal();
  }, [indexingCode, schema]);

  useEffect(() => {
    if (!monacoEditorRef.current) return;

    const editorInstance = monacoEditorRef.current;
    editorInstance.onDidChangeCursorPosition(handleCursorChange);

    return () => {
      editorInstance.dispose();
    };
  }, [monacoEditorRef.current]);

  useEffect(() => {
    storageManager?.setSchemaTypes(schemaTypes);
    handleCodeGen();
  }, [schemaTypes, monacoMount]);

  useEffect(() => {
    storageManager?.setDebugList(heights);
  }, [heights]);

  const cacheToLocal = () => {
    if (!storageManager || !monacoEditorRef.current) return;

    storageManager.setSchemaCode(schema);
    storageManager.setIndexerCode(indexingCode);

    const newCursorPosition = monacoEditorRef.current.getPosition();
    if (fileName === INDEXER_TAB_NAME) storageManager.setCursorPosition(newCursorPosition);
  };

  const handleCursorChange = () => {
    if (monacoEditorRef.current && fileName === INDEXER_TAB_NAME) {
      const position = monacoEditorRef.current.getPosition();
      setCursorPosition(position);
    }
  };

  const attachTypesToMonaco = () => {
    // If types have been added already, dispose of them first
    if (disposableRef.current) {
      disposableRef.current.dispose();
      disposableRef.current = null;
    }

    if ((window as any).monaco) {
      // Add generated types to monaco and store disposable to clear them later
      const newDisposable = (window as any).monaco.languages.typescript.typescriptDefaults.addExtraLib(schemaTypes);
      if (newDisposable != null) {
        console.log('Types successfully imported to Editor');
      }

      disposableRef.current = newDisposable;
    }
  };

  const handleDeleteIndexer = () => {
    request('delete-indexer', {
      accountId: indexerDetails.accountId,
      indexerName: indexerDetails.indexerName,
    });
  };

  const reformatAll = (indexingCode: string, schema: string) => {
    const { data: validatedCode, error: codeError } = validateJSCode(indexingCode);
    const { data: validatedSchema, error: schemaError } = validateSQLSchema(schema);
    indexerErrorHandler(codeError);
    schemaErrorHandler(schemaError);
    return { validatedCode, validatedSchema };
  };

  const handleCodeGen = () => {
    try {
      setSchemaTypes(pgSchemaTypeGen.generateTypes(schema));
      attachTypesToMonaco(); // Just in case schema types have been updated but weren't added to monaco
    } catch (_error) {
      console.error('Error generating types for saved schema.\n', _error);
      setSchemaError(SCHEMA_TYPE_GENERATION_ERROR_MESSAGE);
    }
  };

  const handleFormating = () => {
    const { validatedCode, validatedSchema } = reformatAll(indexingCode, schema);
    validatedCode && setIndexingCode(validatedCode);
    validatedSchema && setSchema(validatedSchema);
  };

  const parseGlyphError = (
    error?: { message: string },
    line?: { start: { line: number; column: number }; end: { line: number; column: number } },
  ) => {
    const { line: startLine, column: startColumn } = line?.start || { line: 1, column: 1 };
    const { line: endLine, column: endColumn } = line?.end || { line: 1, column: 1 };
    const displayedError = error?.message || '';

    monacoEditorRef.current.deltaDecorations(
      [decorations],
      [
        {
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

  const handleEditorWillMount = (editor: any, monaco: any) => {
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
    editor.setPosition(fileName === INDEXER_TAB_NAME ? cursorPosition : { lineNumber: 1, column: 1 });
    editor.focus();

    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      `${primitives}}`,
      'file:///node_modules/@near-lake/primitives/index.d.ts',
    );

    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2020,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    });

    setMonacoMount(true);
  };

  const executeIndexerFunction = async (option = 'latest', startingBlockHeight: number | null = null) => {
    setIsExecutingIndexerFunction(() => true);
    const accountId = indexerDetails?.accountId ?? '';
    const indexerName = indexerDetails?.indexerName ?? '';
    const schemaName = accountId.concat('_', indexerName).replace(/[^a-zA-Z0-9]/g, '_');

    let latestHeight;
    switch (option) {
      case 'debugList':
        await indexerRunner.executeIndexerFunctionOnHeights(heights, indexingCode, schema, schemaName);
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
  };

  const handleOnChangeSchema = (_schema: string) => {
    setSchema(_schema);
    storageManager?.setSchemaCode(schema);
    debouncedValidateSQLSchema(_schema);
  };

  const handleOnChangeCode = (_code: string) => {
    setIndexingCode(_code);
    storageManager?.setIndexerCode(indexingCode);
    debouncedValidateCode(_code);
  };

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
              isUserIndexer={indexerDetails.accountId === currentUserAccountId}
              handleDeleteIndexer={handleDeleteIndexer}
              isCreateNewIndexer={isCreateNewIndexer}
              schemaError={schemaError}
              //Fork Indexer Modal
              indexingCode={indexingCode}
              setIndexingCode={setIndexingCode}
              currentUserAccountId={currentUserAccountId}
              //Reset Indexer Modal
              setSchema={setSchema}
              setSchemaTypes={setSchemaTypes}
              //Publish Modal
              actionButtonText={'publish'}
              schema={schema}
              setSchemaError={setSchemaError}
              showModal={showModal}
            />
            <DeveloperToolsContainer
              handleFormating={handleFormating}
              handleCodeGen={handleCodeGen}
              isExecuting={isExecutingIndexerFunction}
              executeIndexerFunction={executeIndexerFunction}
              heights={heights}
              setHeights={setHeights}
              stopExecution={() => indexerRunner.stop()}
              latestHeight={height}
              diffView={diffView}
              setDiffView={setDiffView}
            />
            <div
              className="mt-2"
              style={{
                flex: 'display',
                justifyContent: 'space-around',
                width: '100%',
                height: '100%',
              }}
            >
              <FileSwitcher
                fileName={fileName}
                setFileName={setFileName}
                schemaError={schemaError}
                indexerError={indexerError}
              />
              <GlyphContainer style={{ height: '100%', width: '100%' }}>
                {/* @ts-ignore remove after refactoring Resizable Editor to ts*/}
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
                  launchPadDefaultCode={launchPadDefaultCode}
                  launchPadDefaultSchema={launchPadDefaultSchema}
                  contextCode={contextCode}
                  contextSchema={contextSchema}
                />
              </GlyphContainer>
            </div>
          </>
        )}
      </div>
    </>
  );
};

export default React.memo(Editor);
