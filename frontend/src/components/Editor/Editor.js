import React, { useEffect, useState, useCallback, useMemo, useContext } from "react";
import {
  formatSQL,
  formatIndexingCode,
  defaultCode,
  defaultSchema,
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
import { getLatestBlockHeight } from "../../utils/getLatestBlockHeight";
import { EditorContext } from '../../contexts/EditorContext';

const BLOCKHEIGHT_LIMIT = 3600;

const Editor = ({
  options,
  onLoadErrorText,
  actionButtonText,
}) => {
  const {
    accountId,
    indexerName,
    indexerNameField,
    blockHeight,
    setBlockHeight,
    setShowResetCodeModel,
    setShowPublishModal,
    debugMode,
    setSelectedOption,
    setContractFilter,
    contractFilter,
    selectedOption,
    handleOptionChange,
  } = useContext(EditorContext);

  const DEBUG_LIST_STORAGE_KEY = `QueryAPI:debugList:${accountId}#${indexerName}`

  const [error, setError] = useState(undefined);
  const [blockHeightError, setBlockHeightError] = useState(undefined);

  const [fileName, setFileName] = useState("indexingLogic.js");

  const [originalSQLCode, setOriginalSQLCode] = useState(defaultSchema);
  const [originalIndexingCode, setOriginalIndexingCode] = useState(defaultCode);
  const [indexingCode, setIndexingCode] = useState(defaultCode);
  const [schema, setSchema] = useState(defaultSchema);

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


  const requestLatestBlockHeight = async () => {
    const blockHeight = getLatestBlockHeight()
    return blockHeight
  }

  useEffect(() => {
    if (selectedTab === "playground") {
      setFileName("GraphiQL");
    }
  }, [selectedTab]);

  useEffect(() => {
    localStorage.setItem(DEBUG_LIST_STORAGE_KEY, heights);
  }, [heights]);

  useEffect(() => {
    if (selectedOption == "latestBlockHeight") {
      setBlockHeightError(null);
      return;
    }

    if (height - blockHeight > BLOCKHEIGHT_LIMIT) {
      setBlockHeightError(
        `Warning: Please enter a valid start block height. At the moment we only support historical indexing of the last ${BLOCKHEIGHT_LIMIT} blocks or ${BLOCKHEIGHT_LIMIT / 3600
        } hrs. Choose a start block height between ${height - BLOCKHEIGHT_LIMIT
        } - ${height}.`
      );
    } else if (blockHeight > height) {
      setBlockHeightError(
        `Warning: Start Block Hieght can not be in the future. Please choose a value between ${height - BLOCKHEIGHT_LIMIT
        } - ${height}.`
      );
    } else {
      setBlockHeightError(null);
    }
  }, [blockHeight, height, selectedOption]);

  const checkSQLSchemaFormatting = () => {
    try {
      let formatted_code = formatSQL(schema);
      let formatted_schema = formatted_code;
      return formatted_schema;
    } catch (error) {
      console.log("error", error);
      setError(
        () =>
          "Please check your SQL schema formatting and specify an Indexer Name"
      );
      return undefined;
    }
  };

  const registerFunction = async () => {
    let formatted_schema = checkSQLSchemaFormatting();
    let isForking = accountId !== currentUserAccountId;

    let innerCode = indexingCode.match(/getBlock\s*\([^)]*\)\s*{([\s\S]*)}/)[1];
    if (indexerNameField == undefined || formatted_schema == undefined) {
      setError(
        () =>
          "Please check your SQL schema formatting and specify an Indexer Name"
      );
      return;
    }

    if (isForking) {
      let prevAccountName = accountId.replace(".", "_");
      let newAccountName = currentUserAccountId.replace(".", "_");

      innerCode = innerCode.replaceAll(prevAccountName, newAccountName);
    }

    setError(() => undefined);
    let start_block_height = blockHeight;
    if (selectedOption == "latestBlockHeight") {
      start_block_height = null;
    }

    request("register-function", {
      indexerName: indexerNameField.replaceAll(" ", "_"),
      code: innerCode,
      schema: formatted_schema,
      blockHeight: start_block_height,
      contractFilter: contractFilter,

    });
    setShowPublishModal(false);
  };

  const handleDeleteIndexer = () => {
    request("delete-indexer", {
      accountId: accountId,
      indexerName: indexerName,
    });
  };

  const handleReload = async () => {
    if (options?.create_new_indexer === true) {
      setShowResetCodeModel(false);
      return;
    }

    const data = await queryIndexerFunctionDetails(accountId, indexerNameField);
    if (data == null) {
      setIndexingCode(defaultCode);
      setSchema(defaultSchema);
      setError(() => onLoadErrorText);
    } else {
      try {
        let unformatted_indexing_code = format_querried_code(data.code);
        let unformatted_schema = data.schema;
        if (unformatted_indexing_code !== null) {
          setOriginalIndexingCode(unformatted_indexing_code);
          setIndexingCode(unformatted_indexing_code);
        }
        if (unformatted_schema !== null) {
          setOriginalSQLCode(unformatted_schema);
          setSchema(unformatted_schema);
        }
        if (data.start_block_height) {
          setSelectedOption("specificBlockHeight");
          setBlockHeight(data.start_block_height);
        }
        if (data.filter) {
          setContractFilter(data.filter.matching_rule.affected_account_id)
        }
      } catch (error) {
        console.log(error);
        setError(() => "An Error occured while trying to format the code.");
      }
    }

    setShowResetCodeModel(false);
  }

  const format_querried_code = (code) => {
    try {
      let formatted_code = formatIndexingCode(code, true);
      setError(() => undefined);
      return formatted_code;
    } catch (error) {
      setError(
        () =>
          "Oh snap! We could not format the queried code. The code in the registry contract may be invalid Javascript code. "
      );
      console.log(error);
      return unformatted_code;
    }
  };

  const getActionButtonText = () => {
    const isUserIndexer = accountId === currentUserAccountId;

    return isUserIndexer ? actionButtonText : "Fork Indexer";
  };

  useEffect(() => {
    const load = async () => {
      await handleReload();
    };
    load();
  }, [accountId, handleReload, indexerName]);

  const handleFormattingError = (fileName) => {
    const errorMessage =
      fileName === "indexingLogic.js"
        ? "Oh snap! We could not format your code. Make sure it is proper Javascript code."
        : "Oh snap! We could not format your SQL schema. Make sure it is proper SQL DDL";

    setError(() => errorMessage);
  };

  const reformat = () => {
    return new Promise((resolve, reject) => {
      try {
        let formattedCode;
        if (fileName === "indexingLogic.js") {
          formattedCode = formatIndexingCode(indexingCode, false);
          setIndexingCode(formattedCode);
        } else if (fileName === "schema.sql") {
          formattedCode = formatSQL(schema);
          setSchema(formattedCode);
        }
        setError(() => undefined);
        resolve(formattedCode);
      } catch (error) {
        handleFormattingError(fileName);
        reject(error);
      }
    });
  };

  async function handleFormating() {
    await reformat();
  }

  function handleEditorMount(editor) {
    const modifiedEditor = editor.getModifiedEditor();
    modifiedEditor.onDidChangeModelContent((_) => {
      if (fileName == "indexingLogic.js") {
        setIndexingCode(modifiedEditor.getValue());
      }
      if (fileName == "schema.sql") {
        setSchema(modifiedEditor.getValue());
      }
    });
  }

  function handleEditorWillMount(monaco) {
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      `${primitives}}`,
      "file:///node_modules/@near-lake/primitives/index.d.ts"
    );
  }


  async function executeIndexerFunction(option = "latest", startingBlockHeight = null) {
    setIsExecutingIndexerFunction(() => true)

    switch (option) {
      case "debugList":
        await indexerRunner.executeIndexerFunctionOnHeights(heights, indexingCode, option)
        break
      case "specific":
        if (startingBlockHeight === null && Number(startingBlockHeight) === 0) {
          console.log("Invalid Starting Block Height: starting block height is null or 0")
          break
        }

        await indexerRunner.start(startingBlockHeight, indexingCode, option)
        break
      case "latest":
        const latestHeight = await requestLatestBlockHeight()
        if (latestHeight) await indexerRunner.start(latestHeight - 10, indexingCode, option)
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
      <EditorButtons
        options={options}
        handleFormating={handleFormating}
        executeIndexerFunction={executeIndexerFunction}
        currentUserAccountId={currentUserAccountId}
        getActionButtonText={getActionButtonText}
        heights={heights}
        setHeights={setHeights}
        isExecuting={isExecutingIndexerFunction}
        stopExecution={() => indexerRunner.stop()}
        latestHeight={height}
        isUserIndexer={accountId === currentUserAccountId}
        handleDeleteIndexer={handleDeleteIndexer}
      />
      <ResetChangesModal
        handleReload={handleReload}
      />
      <PublishModal
        registerFunction={registerFunction}
        handleOptionChange={handleOptionChange}
        actionButtonText={getActionButtonText()}
        blockHeightError={blockHeightError}
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
          <Alert className="px-3 pt-3" variant="danger">
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
          options={options}
          handleEditorWillMount={handleEditorWillMount}
          handleEditorMount={handleEditorMount}
        />
      </div>
    </div>
  );
};

export default Editor;
