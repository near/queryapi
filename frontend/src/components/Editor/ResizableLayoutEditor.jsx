import { JsonViewer } from "@textea/json-viewer";
import { DiffEditorComponent } from "./DiffEditorComponent";
import { MonacoEditorComponent } from "./MonacoEditorComponent";
import { defaultCode, defaultSchema } from "../../utils/formatters";
import { useDragResize } from "../../utils/resize";
import GraphqlPlayground from "./../Playground";

// Define styles as separate objects
const containerStyle = {
  display: "flex",
  flexDirection: "row",
  width: "100%",
  height: "100%",
};

const editorContainerStyle = {
  width: "100%",
  display: "flex",
  justifyContent: "center",
  minWidth: "100px",
};

const dragBarStyle = {
  width: "10px",
  backgroundColor: "gray",
  cursor: "col-resize",
};

const jsonViewerContainerStyle = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  minWidth: "100px",
};

const ResizableEditor = ({
  accountId,
  fileName,
  blockView,
  diffView,
  consoleView,
  setIndexingCode,
  setSchema,
  block_details,
  originalSQLCode,
  originalIndexingCode,
  schema,
  indexingCode,
  options,
  firstRef,
  secondRef,
  dragBarRef,
  handleEditorWillMount,
  handleEditorMount,
}) => {
  // Render logic based on fileName
  const editorComponents = {
    GraphiQL: () => <GraphqlPlayground accountId={accountId} />,
    "indexingLogic.js": () =>
      diffView ? (
        <DiffEditorComponent
          key="code-diff"
          original={originalIndexingCode}
          modified={indexingCode}
          language="typescript"
          readOnly={false}
          options={options}
          handleEditorMount={undefined}
        />
      ) : (
        <MonacoEditorComponent
          key="code-editor"
          value={indexingCode}
          defaultValue={defaultCode}
          defaultLanguage="typescript"
          readOnly={false}
          onChange={(text) => setIndexingCode(text)}
          handleEditorWillMount={handleEditorWillMount}
          options={options}
        />
      ),
    "schema.sql": () =>
      diffView ? (
        <DiffEditorComponent
          key="schema-diff"
          original={originalSQLCode}
          modified={schema}
          language="sql"
          readOnly={options?.create_new_indexer === true ? false : true}
          options={options}
          handleEditorMount={undefined}
        />
      ) : (
        <MonacoEditorComponent
          key="schema-editor"
          value={schema}
          defaultValue={defaultSchema}
          defaultLanguage="sql"
          readOnly={options?.create_new_indexer === true ? false : false}
          onChange={(text) => setSchema(text)}
          handleEditorWillMount={undefined}
          options={options}
        />
      ),
  };

  return (
    <div style={containerStyle}>
      <div ref={firstRef} style={editorContainerStyle}>
        {editorComponents[fileName] && editorComponents[fileName]()}
      </div>
      <div ref={dragBarRef} style={dragBarStyle} />
      {/* <div ref={secondRef} style={jsonViewerContainerStyle}> */}
      {/*   <div> */}
      {/*     <JsonViewer theme={"dark"} value={block_details} collapsed /> */}
      {/*   </div> */}
      {/* </div> */}
    </div>
  );
};

export default function ResizableLayoutEditor({
  accountId,
  fileName,
  blockView,
  diffView,
  consoleView,
  setIndexingCode,
  setSchema,
  block_details,
  originalSQLCode,
  originalIndexingCode,
  schema,
  indexingCode,
  options,
  firstRef,
  secondRef,
  dragBarRef,
  handleEditorWillMount,
  handleEditorMount,
  logs,
}) {
  const {
    dragBarRef: dragBarRefConsole,
    firstRef: firstRefEditor,
    secondRef: secondRefConsole,
  } = useDragResize({
    direction: "vertical",
    initiallyHidden: "second",
    defaultSizeRelation: 3,
    sizeThresholdFirst: 60,
    sizeThresholdSecond: 20,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Code Editor */}
      <div ref={firstRefEditor} style={{ overflow: "auto" }}>
        <ResizableEditor
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
        />
      </div>

      <div
        ref={dragBarRefConsole}
        style={{
          height: "5px",
          backgroundColor: "gray",
          cursor: "ns-resize",
        }}
      />

      <div
        ref={secondRefConsole}
        style={{
          backgroundColor: "gray",
          overflow: "auto",
          color: "white",
          padding: "10px",
        }}
      >
        <div>
          <div className="pb-3">Console</div>

          {logs.map((log, i) => (
            <div key={i}>
              <p> {log}</p>
              <hr style={{ borderTop: "1px solid white" }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
