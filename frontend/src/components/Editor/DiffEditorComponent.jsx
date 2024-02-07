import { DiffEditor } from "@monaco-editor/react";

export const DiffEditorComponent = ({
  original,
  modified,
  language,
  readOnly,
  options,
  onMount,
}) => (
  <DiffEditor
    original={original}
    modified={modified}
    width="100%"
    height="100%"
    language={language}
    theme="vs-dark"
    onMount={onMount}
    options={{ ...options, readOnly }}
  />
);
