import { DiffEditorComponent } from './DiffEditorComponent';
import { MonacoEditorComponent } from './MonacoEditorComponent';
import { defaultCode, defaultSchema } from '@/utils/formatters';
import GraphqlPlayground from '../../Playground';

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
  // Render logic based on fileName
  const editorComponents = {
    GraphiQL: () => <GraphqlPlayground />,
    'indexer.js': () =>
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
            wordWrap: 'on',
            minimap: { enabled: false },
            folding: false,
            lineNumberMinChars: 3,
            scrollBeyondLastLine: true,
            automaticLayout: true,
            formatOnPaste: true,
            definitionLinkOpensInPeek: true,
            font: 'serif',
          }}
        />
      ),
    'schema.sql': () =>
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
            wordWrap: 'on',
            minimap: { enabled: false },
            folding: false,
            lineNumberMinChars: 3,
            scrollBeyondLastLine: true,
            automaticLayout: true,
            formatOnPaste: true,
            definitionLinkOpensInPeek: true,
            glyphMargin: true,
            font: 'serif',
          }}
        />
      ),
  };

  return <div className="h-screen">{editorComponents[fileName] && editorComponents[fileName]()}</div>;
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
  launchPadDefaultCode,
  launchPadDefaultSchema,
  contextCode,
  contextSchema,
}) {
  const defaultCode = launchPadDefaultCode ? launchPadDefaultCode : contextCode ? contextCode : originalIndexingCode;
  const defaultSchema = launchPadDefaultSchema
    ? launchPadDefaultSchema
    : contextSchema
    ? contextSchema
    : originalSQLCode;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Code Editor */}
      <div style={{ overflow: 'auto' }}>
        <ResizableEditor
          accountId={accountId}
          fileName={fileName}
          blockView={blockView}
          diffView={diffView}
          onChangeCode={onChangeCode}
          onChangeSchema={onChangeSchema}
          block_details={block_details}
          indexingCode={indexingCode}
          originalIndexingCode={defaultCode}
          schema={schema}
          originalSQLCode={defaultSchema}
          onMount={onMount}
        />
      </div>
    </div>
  );
}
