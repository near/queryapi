import React, { useEffect, useState, useCallback } from 'react';
import MonacoEditor, { DiffEditor } from '@monaco-editor/react';
import { formatSQL, formatIndexingCode } from '../../utils/formatters';
import { queryIndexerFunctionDetails } from '../../utils/queryIndexerFunction';
import {
  Button,
  Alert,
  Modal,
  ButtonGroup,
  ButtonToolbar,
  Form,
  InputGroup,
  ToggleButtonGroup,
  ToggleButton,
} from 'react-bootstrap';
import Switch from "react-switch";
import primitives from '!!raw-loader!../../../primitives.d.ts';
import IndexerDetailsGroup from "../Form/IndexerDetailsGroup.js"
import BlockHeightOptions from "../Form/BlockHeightOptionsInputGroup.js"
const defaultCode = formatIndexingCode(`
  // Add your code here   
  const h = block.header().height
  await context.set('height', h);
`, true);

import { request, useInitialPayload } from 'near-social-bridge'
const defaultSchema = `
CREATE TABLE "indexer_storage" ("function_name" TEXT NOT NULL, "key_name" TEXT NOT NULL, "value" TEXT NOT NULL, PRIMARY KEY ("function_name", "key_name"))
`
const BLOCKHEIGHT_LIMIT = 3600

const Editor = ({
  options,
  accountId,
  indexerName,
  onLoadErrorText,
  actionButtonText,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(undefined);
  const [blockHeightError, setBlockHeightError] = useState(undefined);
  const [showResetCodeModel, setShowResetCodeModel] = useState(false);
  const [fileName, setFileName] = useState("indexingLogic.js");
  const [originalSQLCode, setOriginalSQLCode] = useState(defaultSchema);
  const [originalIndexingCode, setOriginalIndexingCode] = useState(defaultCode);

  const [indexingCode, setIndexingCode] = useState(defaultCode);
  const [schema, setSchema] = useState(defaultSchema);
  const [diffView, setDiffView] = useState(false);
  const [indexerNameField, setIndexerNameField] = useState(indexerName ?? "");
  const [selectedOption, setSelectedOption] = useState('latestBlockHeight');
  const [blockHeight, setBlockHeight] = useState(null);

  const { height } = useInitialPayload()

  const handleOptionChange = (event) => {
    setSelectedOption(event.target.value);
    setBlockHeightError(null)
  }


  useEffect(() => {
    if (selectedOption == "latestBlockHeight") {
      setBlockHeightError(null)
      return
    }

    if (height - blockHeight > BLOCKHEIGHT_LIMIT) {
      setBlockHeightError(`Warning: Please enter a valid start block height. At the moment we only support historical indexing of the last ${BLOCKHEIGHT_LIMIT} blocks or ${BLOCKHEIGHT_LIMIT / 3600} hrs.

                Choose a start block height between ${height - BLOCKHEIGHT_LIMIT} - ${height}.`)
    }
    else if (blockHeight > height) {
      setBlockHeightError(`Warning: Start Block Hieght can not be in the future. Please choose a value between ${height - BLOCKHEIGHT_LIMIT} - ${height}.`)
    } else {
      setBlockHeightError(null)
    }
  }
    , [blockHeight, selectedOption])

  const checkSQLSchemaFormatting = () => {
    try {
      let formatted_code = formatSQL(schema);
      let formatted_schema = formatted_code;
      return formatted_schema;
    }
    catch (error) {
      console.log("error", error)
      setError(() => "Please check your SQL schema formatting and specify an Indexer Name");
      return undefined;
    }
  }


  const registerFunction = async () => {
    let formatted_schema = checkSQLSchemaFormatting();

    const innerCode = indexingCode.match(/getBlock\s*\([^)]*\)\s*{([\s\S]*)}/)[1]
    if (indexerNameField == undefined || formatted_schema == undefined) {
      setError(() => "Please check your SQL schema formatting and specify an Indexer Name");
      return
    }
    setError(() => undefined);
    let start_block_height = blockHeight
    if (selectedOption == "latestBlockHeight") {
      start_block_height = null
    }
    // Send a message to other sources
    request('register-function', { indexerName: indexerNameField.replaceAll(" ", "_"), code: innerCode, schema: formatted_schema, blockHeight: start_block_height });
  };

  const handleReload = useCallback(async () => {
    if (options?.create_new_indexer === true) {
      // setIndexingCode(defaultCode);
      // setSchema(defaultSchema);
      setShowResetCodeModel(false)
      return
    }

    const data = await queryIndexerFunctionDetails(accountId, indexerNameField)
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
          setSelectedOption("specificBlockHeight")
          setBlockHeight(data.start_block_height)
        }
      }
      catch (error) {
        console.log(error);
        setError(() => "An Error occured while trying to format the code.");
      }
    }

    setShowResetCodeModel(false)
  }, [accountId, indexerNameField, onLoadErrorText, options?.create_new_indexer])

  const format_querried_code = (code) => {
    try {
      let formatted_code = formatIndexingCode(code, true)
      setError(() => undefined);
      return formatted_code;
    } catch (error) {
      setError(() => "Oh snap! We could not format the queried code. The code in the registry contract may be invalid Javascript code. ");
      console.log(error);
      return unformatted_code
    }
  }


  useEffect(() => {
    const load = async () => {
      setLoading(true)
      await handleReload()
      setLoading(false)
    }
    load()
  }, [accountId, handleReload, indexerName])

  const handleFormattingError = (fileName) => {
    const errorMessage = fileName === "indexingLogic.js"
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
    await reformat()
  }

  async function submit() {
    // Handle Register button click
    await reformat()
    await registerFunction()
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
      'file:///node_modules/@near-lake/primitives/index.d.ts'
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
      {
        <>
          <ButtonToolbar className="pt-3 pb-1 flex-col" aria-label="Actions for Editor">
            <IndexerDetailsGroup accountId={accountId} indexerNameField={indexerNameField} setIndexerNameField={setIndexerNameField} isCreateNewIndexerPage={options.create_new_indexer} />
            <BlockHeightOptions selectedOption={selectedOption} handleOptionChange={handleOptionChange} blockHeight={blockHeight} setBlockHeight={setBlockHeight} />
            <ButtonGroup className="px-3 pt-3" style={{ width: '100%' }} aria-label="Action Button Group">
              <Button variant="secondary" className="px-3" onClick={() => setShowResetCodeModel(true)}> Reset</Button>{' '}
              <Button variant="secondary" className="px-3" onClick={() => handleFormating()}> Format Code</Button>{' '}
              <Button variant="primary" className="px-3" onClick={() => submit()}>
                {actionButtonText}
              </Button>

            </ButtonGroup>
          </ButtonToolbar></>}
      <Modal show={showResetCodeModel} onHide={() => setShowResetCodeModel(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Are you sure?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          The changes you have made in the editor will be deleted.
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowResetCodeModel(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => handleReload()}>
            Reload
          </Button>
        </Modal.Footer>
      </Modal>


      <div className="px-3" style={{ "flex": "display", justifyContent: "space-around", "width": "100%" }}>
        {error && <Alert className="px-3 pt-3" variant="danger">
          {error}
        </Alert>}
        {blockHeightError && <Alert className="px-3 pt-3" variant="danger">
          {blockHeightError}
        </Alert>}

        <ToggleButtonGroup type="radio" style={{ backgroundColor: 'white' }} name="options" defaultValue={"indexingLogic.js"}
        >
          <ToggleButton id="tbg-radio-1" style={{ backgroundColor: fileName === "indexingLogic.js" ? 'blue' : "grey", "borderRadius": "0px" }} value={"indexingLogic.js"} onClick={() => setFileName("indexingLogic.js")}>
            indexingLogic.js
          </ToggleButton>
          <ToggleButton id="tbg-radio-2" style={{ backgroundColor: fileName === "indexingLogic.js" ? 'grey' : "blue", "borderRadius": "0px" }} value={"schema.sql"} onClick={() => setFileName("schema.sql")}>
            schema.sql
          </ToggleButton>
          <InputGroup  >
            <InputGroup.Text className='px-3'> Diff View
              <Switch
                className='px-1'
                checked={diffView}
                onChange={(checked) => {
                  setDiffView(checked)
                }}
              /></InputGroup.Text>
          </InputGroup>
        </ToggleButtonGroup>
        {fileName === "indexingLogic.js" && (
          diffView ? (
            <DiffEditor
              original={originalIndexingCode}
              modified={indexingCode}
              height="50vh"
              width="100%"
              language="javascript"
              theme="vs-dark"
              onMount={handleEditorMount}
              options={{ ...options, readOnly: false }}
            />
          ) : (
            <MonacoEditor
              value={indexingCode}
              height="50vh"
              width="100%"
              defaultValue={defaultCode}
              defaultLanguage="typescript"
              theme="vs-dark"
              onChange={(text) => setIndexingCode(text)}
              beforeMount={handleEditorWillMount}
              options={{ ...options, readOnly: false }}
            />
          )
        )}
        {fileName === "schema.sql" &&
          (diffView ? (
            <DiffEditor
              original={originalSQLCode}
              modified={schema}
              height="50vh"
              width="100%"
              language="sql"
              onMount={handleEditorMount}
              theme="vs-dark"
              options={{
                ...options,
                readOnly: options?.create_new_indexer === true ? false : true,
              }}
            />
          ) : (
            <MonacoEditor
              value={schema}
              height="50vh"
              width="100%"
              defaultValue={defaultSchema}
              defaultLanguage="sql"
              theme="vs-dark"
              onChange={(text) => setSchema(text)}
              options={{
                ...options,
                readOnly: options?.create_new_indexer === true ? false : false,
              }}
            />
          ))}
      </div>
    </div>)
}
export default Editor;
