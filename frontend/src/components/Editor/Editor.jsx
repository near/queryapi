import React, { useEffect, useState, useRef, useMemo, useContext } from "react";
import {
  formatSQL,
  formatIndexingCode,
  wrapCode,
  defaultCode,
  defaultSchema,
  defaultSchemaTypes,
} from "../../utils/formatters";
import { queryIndexerFunctionDetails } from "../../utils/queryIndexerFunction";
import { Alert } from "react-bootstrap";
import primitives from "!!raw-loader!../../../primitives.d.ts";
import { request, useInitialPayload } from "near-social-bridge";
import IndexerRunner from "../../utils/indexerRunner";
import { block_details } from "./block_details";
import ResizableLayoutEditor from "./ResizableLayoutEditor";
import { ResetChangesModal } from "../Modals/resetChanges";
import { FileSwitcher } from "./FileSwitcher";
import EditorButtons from "./EditorButtons";
import { PublishModal } from "../Modals/PublishModal";
import { ForkIndexerModal } from "../Modals/ForkIndexerModal";
import { getLatestBlockHeight } from "../../utils/getLatestBlockHeight";
import { IndexerDetailsContext } from '../../contexts/IndexerDetailsContext';
import { PgSchemaTypeGen } from "../../utils/pgSchemaTypeGen";
import { validateJSCode, validateSQLSchema } from "@/utils/validators";

const BLOCKHEIGHT_LIMIT = 3600;

const Editor = ({
  onLoadErrorText,
  actionButtonText,
}) => {
  const {
    indexerDetails,
    setShowResetCodeModel,
    setShowPublishModal,
    debugMode,
    isCreateNewIndexer,
    indexerNameField,
    setAccountId,
  } = useContext(IndexerDetailsContext);

  const DEBUG_LIST_STORAGE_KEY = `QueryAPI:debugList:${indexerDetails.accountId
    }#${indexerDetails.indexerName || "new"}`;
  const SCHEMA_STORAGE_KEY = `QueryAPI:Schema:${indexerDetails.accountId}#${indexerDetails.indexerName || "new"
    }`;
  const SCHEMA_TYPES_STORAGE_KEY = `QueryAPI:Schema:Types:${indexerDetails.accountId}#${indexerDetails.indexerName || "new"
    }`;
  const CODE_STORAGE_KEY = `QueryAPI:Code:${indexerDetails.accountId}#${indexerDetails.indexerName || "new"
    }`;

  const [blockHeightError, setBlockHeightError] = useState(undefined);
  const [error, setError] = useState();

  const [fileName, setFileName] = useState("indexingLogic.js");

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

  const [isExecutingIndexerFunction, setIsExecutingIndexerFunction] = useState(false);

  const { height, selectedTab, currentUserAccountId } = useInitialPayload();

  const handleLog = (_, log, callback) => {
    if (log) console.log(log);
    if (callback) {
      callback();
    }
  };

  const indexerRunner = useMemo(() => new IndexerRunner(handleLog), []);
  const pgSchemaTypeGen = new PgSchemaTypeGen();
  const disposableRef = useRef(null);

  useEffect(() => {
    if (!indexerDetails.code) {
      const { data: formattedCode, error } = validateJSCode(indexerDetails.code)

      if (error) {
        setError("There was an error while formatting your code. Please check the console for more details")
      }
      setOriginalIndexingCode(formattedCode)
      setIndexingCode(formattedCode)
    }
  }, [indexerDetails.code]);

  useEffect(() => {
    if (indexerDetails.schema) {
      const { data: formattedSchema, error } = validateSQLSchema(indexerDetails.schema);

      if (error) {
        setError("There was an error in your schema. Please check the console for more details")
      }

      setSchema(formattedSchema)
    }
  }, [indexerDetails.schema])

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
    attachTypesToMonaco();
  }, [schemaTypes, monacoMount]);

  const requestLatestBlockHeight = async () => {
    const blockHeight = getLatestBlockHeight()
    return blockHeight
  }

  useEffect(() => {
    localStorage.setItem(DEBUG_LIST_STORAGE_KEY, heights);
  }, [heights]);

  const attachTypesToMonaco = () => {
    // If types has been added already, dispose of them first
    if (disposableRef.current) {
      disposableRef.current.dispose();
      disposableRef.current = null;
    }

    if (window.monaco) { // Check if monaco is loaded
      // Add generated types to monaco and store disposable to clear them later
      const newDisposable = monaco.languages.typescript.typescriptDefaults.addExtraLib(schemaTypes);
      if (newDisposable != null) {
        console.log("Types successfully imported to Editor");
      }
      disposableRef.current = newDisposable;
    }
  }


  const forkIndexer = async (indexerName) => {
    let code = indexingCode;
    setAccountId(currentUserAccountId)
    let prevAccountId = indexerDetails.accountId.replaceAll(".", "_");
    let newAccountId = currentUserAccountId.replaceAll(".", "_");
    let prevIndexerName = indexerDetails.indexerName.replaceAll("-", "_").trim().toLowerCase();
    let newIndexerName = indexerName.replaceAll("-", "_").trim().toLowerCase();
    code = code.replaceAll(prevAccountId, newAccountId);
    code = code.replaceAll(prevIndexerName, newIndexerName);
    setIndexingCode(formatIndexingCode(code))
  }

  const registerFunction = async (indexerName, indexerConfig) => {
    const { data: formattedSchema, error } = await validateSQLSchema(schema);

    if (error) {
      setError("There was an error in your schema, please check the console for more details");
      return;
    }

    let innerCode = indexingCode.match(/getBlock\s*\([^)]*\)\s*{([\s\S]*)}/)[1];
    indexerName = indexerName.replaceAll(" ", "_");

    request("register-function", {
      indexerName: indexerName,
      code: innerCode,
      schema: formattedSchema,
      blockHeight: indexerConfig.startBlockHeight,
      contractFilter: indexerConfig.filter,
    });
    setShowPublishModal(false);
  };

  const handleDeleteIndexer = () => {
    request("delete-indexer", {
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
        let unformatted_wrapped_indexing_code = wrapCode(data.code)
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
  }

  const getActionButtonText = () => {
    const isUserIndexer = indexerDetails.accountId === currentUserAccountId;
    if (isCreateNewIndexer) return "Create New Indexer"
    return isUserIndexer ? actionButtonText : "Fork Indexer";
  };

  const reformatAll = (indexingCode, schema) => {
    let { formattedCode, codeError } = validateJSCode(indexingCode);

    if (codeError) {
      formattedCode = indexingCode
      setError("Oh snap! We could not format your code. Make sure it is proper Javascript code.");
    }

    let { data: formattedSchema, error: schemaError } = validateSQLSchema(schema);

    if (schemaError) {
      formattedSchema = schema;
      setError("There was an error in your SQL schema. Make sure it is proper SQL DDL");
    }

    return { formattedCode, formattedSchema }
  };

  function handleCodeGen() {
    try {
      setSchemaTypes(pgSchemaTypeGen.generateTypes(schema));
      attachTypesToMonaco(); // Just in case schema types have been updated but weren't added to monaco
      setError(undefined);
    } catch (error) {
      console.error("Error generating types for saved schema.\n", error);
      setError("Oh snap! We could not generate types for your SQL schema. Make sure it is proper SQL DDL.");
    }
  }

  async function handleFormating() {
    const { formattedCode, formattedSchema } = await reformatAll(indexingCode, schema);
    setIndexingCode(formattedCode);
    setSchema(formattedSchema);
  }

  function handleEditorWillMount(monaco) {
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      `${primitives}}`,
      "file:///node_modules/@near-lake/primitives/index.d.ts"
    );
    setMonacoMount(true);
  }


  async function executeIndexerFunction(option = "latest", startingBlockHeight = null) {
    setIsExecutingIndexerFunction(() => true)
    const schemaName = indexerDetails.accountId.concat("_", indexerDetails.indexerName).replace(/[^a-zA-Z0-9]/g, '_');

    switch (option) {
      case "debugList":
        await indexerRunner.executeIndexerFunctionOnHeights(heights, indexingCode, schema, schemaName, option)
        break
      case "specific":
        if (startingBlockHeight === null && Number(startingBlockHeight) === 0) {
          console.log("Invalid Starting Block Height: starting block height is null or 0")
          break
        }

        await indexerRunner.start(startingBlockHeight, indexingCode, schema, schemaName, option)
        break
      case "latest":
        const latestHeight = await requestLatestBlockHeight()
        if (latestHeight) await indexerRunner.start(latestHeight - 10, indexingCode, schema, schemaName, option)
    }
    setIsExecutingIndexerFunction(() => false)
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "85vh",
      }}
    >
      {!indexerDetails.code && !isCreateNewIndexer && (
        <Alert className="px-3 pt-3" variant="danger">
          Indexer Function could not be found. Are you sure this indexer exists?
        </Alert>
      )}
      {(indexerDetails.code || isCreateNewIndexer) && <>
        <EditorButtons
          handleFormating={handleFormating}
          handleCodeGen={handleCodeGen}
          executeIndexerFunction={executeIndexerFunction}
          currentUserAccountId={currentUserAccountId}
          getActionButtonText={getActionButtonText}
          heights={heights}
          setHeights={setHeights}
          isCreateNewIndexer={isCreateNewIndexer}
          isExecuting={isExecutingIndexerFunction}
          stopExecution={() => indexerRunner.stop()}
          latestHeight={height}
          isUserIndexer={indexerDetails.accountId === currentUserAccountId}
          handleDeleteIndexer={handleDeleteIndexer}
        />
        <ResetChangesModal
          handleReload={handleReload}
        />
        <PublishModal
          registerFunction={registerFunction}
          actionButtonText={getActionButtonText()}
          blockHeightError={blockHeightError}
        />
        <ForkIndexerModal
          forkIndexer={forkIndexer}
        />

        <div
          className="px-3 pt-3"
          style={{
            flex: "display",
            justifyContent: "space-around",
            width: "100%",
            height: "100%",
          }}
        >
          {error && (
            <Alert dismissible="true" onClose={() => setError(undefined)} className="px-3 pt-3" variant="danger">
              {error}
            </Alert>
          )}
          {debugMode && !debugModeInfoDisabled && (
            <Alert
              className="px-3 pt-3"
              dismissible="true"
              onClose={() => setDebugModeInfoDisabled(true)}
              variant="info"
            >
              To debug, you will need to open your browser console window in
              order to see the logs.
            </Alert>
          )}
          <FileSwitcher
            fileName={fileName}
            setFileName={setFileName}
            diffView={diffView}
            setDiffView={setDiffView}
          />
          <ResizableLayoutEditor
            fileName={fileName}
            indexingCode={indexingCode}
            blockView={blockView}
            diffView={diffView}
            setIndexingCode={setIndexingCode}
            setSchema={setSchema}
            block_details={block_details}
            originalSQLCode={originalSQLCode}
            originalIndexingCode={originalIndexingCode}
            schema={schema}
            isCreateNewIndexer={isCreateNewIndexer}
            handleEditorWillMount={handleEditorWillMount}
          />
        </div>
      </>}
    </div>
  );
};

export default Editor;
