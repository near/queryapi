import React, { useEffect, useState, useCallback } from "react";
import {
  formatSQL,
  formatIndexingCode,
  defaultCode,
  defaultSchema,
} from "../../utils/formatters";
import { queryIndexerFunctionDetails } from "../../utils/queryIndexerFunction";
import { Alert } from "react-bootstrap";
import primitives from "!!raw-loader!../../../primitives.d.ts";
import { request, useInitialPayload, sessionStorage } from "near-social-bridge";
import Indexer from "../../utils/indexerRunner";
import { block_details } from "./block_details";
import { useDragResize } from "../../utils/resize";
import ResizableLayoutEditor from "./ResizableLayoutEditor";
import { ResetChangesModal } from "../Modals/resetChanges";
import { FileSwitcher } from "./FileSwitcher";
import EditorButtons from "./EditorButtons";

const BLOCKHEIGHT_LIMIT = 3600;
const BLOCK_FETCHER_API =
  "https://70jshyr5cb.execute-api.eu-central-1.amazonaws.com/block/";

const Editor = ({
  options,
  accountId,
  indexerName,
  onLoadErrorText,
  actionButtonText,
}) => {
  const [error, setError] = useState(undefined);
  const [blockHeightError, setBlockHeightError] = useState(undefined);
  const [showResetCodeModel, setShowResetCodeModel] = useState(false);
  const [fileName, setFileName] = useState("indexingLogic.js");
  const [originalSQLCode, setOriginalSQLCode] = useState(defaultSchema);
  const [originalIndexingCode, setOriginalIndexingCode] = useState(defaultCode);
  const [debugMode, setDebugMode] = useState(false);
  const [logs, setLogs] = useState([]);
  const [heights, setHeights] = useState([]);

  const handleLog = (log) => {
    setLogs((prevLogs) => [...prevLogs, log]);
  };

  const indexerRunner = new Indexer(handleLog);

  const { firstRef, secondRef, dragBarRef } = useDragResize({
    direction: "horizontal",
    initiallyHidden: null,
    defaultSizeRelation: 3,
    sizeThresholdFirst: 60,
    sizeThresholdSecond: 60,
  });
  const [indexingCode, setIndexingCode] = useState(defaultCode);
  const [schema, setSchema] = useState(defaultSchema);
  const [diffView, setDiffView] = useState(false);
  const [blockView, setBlockView] = useState(false);
  const [indexerNameField, setIndexerNameField] = useState(indexerName ?? "");
  const [selectedOption, setSelectedOption] = useState("latestBlockHeight");
  const [blockHeight, setBlockHeight] = useState(undefined);

  const [isContractFilterValid, setIsContractFilterValid] = useState(true);
  const [contractFilter, setContractFilter] = useState("near.social");
  const { height, selectedTab, currentUserAccountId } = useInitialPayload();
  const handleOptionChange = (event) => {
    setSelectedOption(event.target.value);
    setBlockHeightError(null);
  };

  useEffect(() => {
    if (selectedTab === "playground") {
      setFileName("GraphiQL");
    }
  }, [selectedTab]);

  useEffect(() => {
    if (selectedOption == "latestBlockHeight") {
      setBlockHeightError(null);
      return;
    }

    if (height - blockHeight > BLOCKHEIGHT_LIMIT) {
      setBlockHeightError(
        `Warning: Please enter a valid start block height. At the moment we only support historical indexing of the last ${BLOCKHEIGHT_LIMIT} blocks or ${
          BLOCKHEIGHT_LIMIT / 3600
        } hrs. Choose a start block height between ${
          height - BLOCKHEIGHT_LIMIT
        } - ${height}.`
      );
    } else if (blockHeight > height) {
      setBlockHeightError(
        `Warning: Start Block Hieght can not be in the future. Please choose a value between ${
          height - BLOCKHEIGHT_LIMIT
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
    // Send a message to other sources
    request("register-function", {
      indexerName: indexerNameField.replaceAll(" ", "_"),
      code: innerCode,
      schema: formatted_schema,
      blockHeight: start_block_height,
    });
  };

  const handleReload = useCallback(async () => {
    if (options?.create_new_indexer === true) {
      // setIndexingCode(defaultCode);
      // setSchema(defaultSchema);
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
      } catch (error) {
        console.log(error);
        setError(() => "An Error occured while trying to format the code.");
      }
    }

    setShowResetCodeModel(false);
  }, [
    accountId,
    indexerNameField,
    onLoadErrorText,
    options?.create_new_indexer,
  ]);

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

  async function submit() {
    // Handle Register button click
    await reformat();
    await registerFunction();
  }

  function handleEditorMount(editor) {
    const modifiedEditor = editor.getModifiedEditor();
    modifiedEditor.onDidChangeModelContent((_) => {
      if (fileName == "indexingLogic.js") {
        console.log("mountin");
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

  function handleSetContractFilter(e) {
    // check if contract filter is greater than 2 and less than or equal to 64 chars
    const contractFilter = e.target.value;
    setContractFilter(contractFilter);
    if (
      contractFilter.length > 64 ||
      contractFilter.length < 2 ||
      !contractRegex.test(contractFilter)
    ) {
      setIsContractFilterValid(false);
    } else {
      setIsContractFilterValid(true);
    }
  }

  async function fetchBlockDetails(blockHeight) {
    const response = await fetch(`${BLOCK_FETCHER_API}${String(blockHeight)}`);
    const block_details = await response.json();
    return block_details;
  }

  async function executeIndexerFunction() {
    setLogs(() => []);
    console.log(heights, "running on these heights");
    let innerCode = indexingCode.match(/getBlock\s*\([^)]*\)\s*{([\s\S]*)}/)[1];
    // for loop with await
    for await (const height of heights) {
      const block_details = await fetchBlockDetails(height);
      await indexerRunner.runFunction(block_details, innerCode);
    }
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
        accountId={accountId}
        indexerNameField={indexerNameField}
        setIndexerNameField={setIndexerNameField}
        options={options}
        selectedOption={selectedOption}
        handleOptionChange={handleOptionChange}
        blockHeight={blockHeight}
        setBlockHeight={setBlockHeight}
        setShowResetCodeModel={setShowResetCodeModel}
        handleFormating={handleFormating}
        executeIndexerFunction={executeIndexerFunction}
        currentUserAccountId={currentUserAccountId}
        getActionButtonText={getActionButtonText}
        submit={submit}
        debugMode={debugMode}
        heights={heights}
        setHeights={setHeights}
        contractFilter={contractFilter}
        handleSetContractFilter={handleSetContractFilter}
        isContractFilterValid={isContractFilterValid}
      />
      <ResetChangesModal
        showResetCodeModel={showResetCodeModel}
        setShowResetCodeModel={setShowResetCodeModel}
        handleReload={handleReload}
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
        {blockHeightError && (
          <Alert className="px-3 pt-3" variant="danger">
            {blockHeightError}
          </Alert>
        )}

        <FileSwitcher
          fileName={fileName}
          setFileName={setFileName}
          diffView={diffView}
          setDiffView={setDiffView}
          blockView={blockView}
          setBlockView={setBlockView}
          debugMode={debugMode}
          setDebugMode={setDebugMode}
        />
        <ResizableLayoutEditor
          accountId={accountId}
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
          firstRef={firstRef}
          secondRef={secondRef}
          dragBarRef={dragBarRef}
          handleEditorWillMount={handleEditorWillMount}
          handleEditorMount={handleEditorMount}
          logs={logs}
        />
      </div>
    </div>
  );
};

export default Editor;
