import { DiffEditorComponent } from "./DiffEditorComponent";
import { MonacoEditorComponent } from "./MonacoEditorComponent";
import { defaultCode, defaultSchema } from "../../utils/formatters";
import { useDragResize } from "../../utils/resize";
import GraphqlPlayground from "./../Playground";

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
  onMount,
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
          onMount={onMount}
        />
      ) : (
        <MonacoEditorComponent
          key="code-editor"
          value={indexingCode}
          height="100vh"
          defaultValue={defaultCode}
          defaultLanguage="typescript"
          readOnly={false}
          onChange={onChangeCode}
          onMount={onMount}
          options={{
            wordWrap: "on",
            minimap: { enabled: false },
            folding: false,
            lineNumberMinChars: 3,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            formatOnPaste: true,
            definitionLinkOpensInPeek: true,
            // glyphMargin: true,
            font: 'serif'
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
          onMount={onMount}
        />
      ) : (
        <MonacoEditorComponent
          key="schema-editor"
          value={schema}
          defaultValue={defaultSchema}
          defaultLanguage="sql"
          readOnly={isCreateNewIndexer === true ? false : false}
          onChange={onChangeSchema}
          onMount={onMount}
          options={{
            wordWrap: "on",
            minimap: { enabled: false },
            folding: false,
            lineNumberMinChars: 3,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            formatOnPaste: true,
            definitionLinkOpensInPeek: true,
            glyphMargin: true,
            font: 'serif'
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
  onMount,
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
          onMount={onMount}
        />
      </div>
    </div>
  );
}
