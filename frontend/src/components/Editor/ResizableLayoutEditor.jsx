import { DiffEditorComponent } from "./DiffEditorComponent";
import { MonacoEditorComponent } from "./MonacoEditorComponent";
import { defaultCode, defaultSchema } from "../../utils/formatters";
import { useDragResize } from "../../utils/resize";
import GraphqlPlayground from "./../Playground";
import { GlyphContainer } from "./GlyphContainer";

console.log('decorations here! ')
function handleEditorMount(editor, monaco) {
  const decorations = editor.deltaDecorations(
    [],
    [
      {
        range: new monaco.Range(3, 1, 3, 1),
        options: {
          isWholeLine: true,
          className: "myGlyphMarginClass",
          glyphMarginClassName: "myContentClass",
          glyphMarginHoverMessage: { value: "Error message here" },
        },
      },
    ]
  );
}

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
        <GlyphContainer
          style={{ display: "flex", height: "100%", width: "100%" }}
        >
          <MonacoEditorComponent
            key="code-editor"
            value={indexingCode}
            height="100vh"
            defaultValue={defaultCode}
            defaultLanguage="typescript"
            readOnly={false}
            onChange={onChangeCode}
            onMount={handleEditorMount}
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
              // font: 'serif'
            }}
          />
        </GlyphContainer>
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
        <GlyphContainer
          style={{ display: "flex", height: "100%", width: "100%" }}
        >
          <MonacoEditorComponent
            key="schema-editor"
            value={schema}
            defaultValue={defaultSchema}
            defaultLanguage="sql"
            readOnly={isCreateNewIndexer === true ? false : false}
            onChange={onChangeSchema}
            onMount={handleEditorMount}
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
              // font: 'serif'
            }}
          />
        </GlyphContainer>
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
    </div>
  );
}
