import { DiffEditorComponent } from "./DiffEditorComponent";
import { MonacoEditorComponent } from "./MonacoEditorComponent";
import { defaultCode, defaultSchema } from "../../utils/formatters";
import { useDragResize } from "../../utils/resize";
import GraphqlPlayground from "./../Playground";
import { validateSQLSchema } from "@/utils/validators";

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
  onChangeCode,
  onChangeSchema,
  block_details,
  originalSQLCode,
  originalIndexingCode,
  schema,
  indexingCode,
  handleEditorWillMount,
  isCreateNewIndexer,
}) => {
  const { firstRef, secondRef, dragBarRef } = useDragResize({
    direction: "horizontal",
    initiallyHidden: null,
    defaultSizeRelation: 3,
    sizeThresholdFirst: 60,
    sizeThresholdSecond: 60,
  });

  // Render logic based on fileName
  const editorComponents = {
    GraphiQL: () => <GraphqlPlayground />,
    "indexingLogic.js": () =>
      diffView ? (
        <DiffEditorComponent
          key="code-diff"
          original={originalIndexingCode}
          modified={indexingCode}
          language="typescript"
          readOnly={false}
          handleEditorMount={undefined}
        />
      ) : (
        <MonacoEditorComponent
          key="code-editor"
          value={indexingCode}
          defaultValue={defaultCode}
          defaultLanguage="typescript"
          readOnly={false}
          onChange={onChangeCode}
          handleEditorWillMount={handleEditorWillMount}
          options={{
            wordWrap: "on",
            minimap: { enabled: false },
            folding: false,
            lineNumberMinChars: 3,
            scrollBeyondLastLine: false,
          }}
        />
      ),
    "schema.sql": () =>
      diffView ? (
        <DiffEditorComponent
          key="schema-diff"
          original={originalSQLCode}
          modified={schema}
          language="sql"
          readOnly={isCreateNewIndexer === true ? false : true}
          handleEditorMount={undefined}
        />
      ) : (
        <MonacoEditorComponent
          key="schema-editor"
          value={schema}
          defaultValue={defaultSchema}
          defaultLanguage="sql"
          readOnly={isCreateNewIndexer === true ? false : false}
          onChange={onChangeSchema}
          handleEditorWillMount={undefined}
          options={{
            wordWrap: "on",
            minimap: { enabled: false },
            folding: false,
            lineNumberMinChars: 3,
            scrollBeyondLastLine: false,
          }}
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
  onChangeCode,
  onChangeSchema,
  block_details,
  originalSQLCode,
  originalIndexingCode,
  schema,
  indexingCode,
  handleEditorWillMount,
  handleEditorMount,
  isCreateNewIndexer,
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
          onChangeCode={onChangeCode}
          onChangeSchema={onChangeSchema}
          block_details={block_details}
          originalSQLCode={originalSQLCode}
          originalIndexingCode={originalIndexingCode}
          schema={schema}
          handleEditorWillMount={handleEditorWillMount}
          handleEditorMount={handleEditorMount}
        />
      </div>

      {/* <div */}
      {/*   ref={dragBarRefConsole} */}
      {/*   style={{ */}
      {/*     height: "5px", */}
      {/*     backgroundColor: "gray", */}
      {/*     cursor: "ns-resize", */}
      {/*   }} */}
      {/* /> */}
      {/**/}
      {/* <div */}
      {/*   ref={secondRefConsole} */}
      {/*   style={{ */}
      {/*     backgroundColor: "gray", */}
      {/*     overflow: "auto", */}
      {/*     color: "white", */}
      {/*     padding: "10px", */}
      {/*   }} */}
      {/* > */}
      {/*   <div> */}
      {/*     <div className="pb-3">Console</div> */}
      {/**/}
      {/*     {logs.map((log, i) => ( */}
      {/*       <div key={i}> */}
      {/*         <p> {log}</p> */}
      {/*         <hr style={{ borderTop: "1px solid white" }} /> */}
      {/*       </div> */}
      {/*     ))} */}
      {/*   </div> */}
      {/* </div> */}
    </div>
  );
}
