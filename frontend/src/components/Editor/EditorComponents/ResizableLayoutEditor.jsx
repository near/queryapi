import React from 'react';
import MonacoEditor, { DiffEditor } from '@monaco-editor/react';
import GraphqlPlayground from '../../Playground';

const editorOptions = {
  wordWrap: 'on',
  minimap: { enabled: false },
  folding: false,
  lineNumberMinChars: 3,
  scrollBeyondLastLine: true,
  automaticLayout: true,
  formatOnPaste: true,
  definitionLinkOpensInPeek: true,
  font: 'serif',
};

const getEditorOptions = (options, readOnly) => ({
  ...options,
  readOnly,
});

const getDiffEditorOptions = (options, readOnly) => ({
  ...options,
  readOnly,
});

const getDefaultValues = (launchPadDefault, context, original) => launchPadDefault || context || original;

const ResizableLayoutEditor = ({
  fileName,
  diffView,
  launchPadDefaultSchema,
  contextSchema,
  originalSQLCode,
  launchPadDefaultCode,
  contextCode,
  originalIndexingCode,
  schema,
  indexingCode,
  isCreateNewIndexer,
  onMount,
  onChangeSchema,
  onChangeCode,
}) => {
  const determineEditorProps = () => {
    const isSchemaEditor = fileName === 'schema.sql';
    const isCodeEditor = fileName === 'indexer.js';

    if (!isSchemaEditor && !isCodeEditor) return null;

    const defaultValue = isSchemaEditor
      ? getDefaultValues(launchPadDefaultSchema, contextSchema, originalSQLCode)
      : getDefaultValues(launchPadDefaultCode, contextCode, originalIndexingCode);

    const value = isSchemaEditor ? schema : indexingCode;
    const readOnly = isSchemaEditor && !isCreateNewIndexer;

    return {
      editorProps: {
        onMount,
        options: getEditorOptions(editorOptions, readOnly),
        defaultValue,
        value,
        readOnly,
        onChange: isSchemaEditor ? onChangeSchema : onChangeCode,
        language: isSchemaEditor ? 'sql' : 'typescript',
      },
      diffProps: {
        original: defaultValue,
        modified: value,
        language: isSchemaEditor ? 'sql' : 'typescript',
        readOnly,
        options: getDiffEditorOptions(editorOptions, readOnly),
      },
    };
  };

  const renderEditor = () => {
    if (fileName === 'GraphiQL') return <GraphqlPlayground />;

    const { editorProps, diffProps } = determineEditorProps();

    if (diffView) {
      return (
        <DiffEditor
          key={`${fileName}-diff`}
          original={diffProps.original}
          modified={diffProps.modified}
          language={diffProps.language}
          onMount={editorProps.onMount}
          options={diffProps.options}
          theme="vs-dark"
        />
      );
    }

    return (
      <MonacoEditor
        key={`${fileName}-editor`}
        value={editorProps.value}
        defaultValue={editorProps.defaultValue}
        defaultLanguage={editorProps.language}
        onMount={editorProps.onMount}
        onChange={editorProps.onChange}
        options={editorProps.options}
        theme="vs-dark"
      />
    );
  };

  return <div className="h-[85vh]">{renderEditor()}</div>;
};

export default React.memo(ResizableLayoutEditor);
