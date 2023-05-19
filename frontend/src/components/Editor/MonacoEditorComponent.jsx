import MonacoEditor from "@monaco-editor/react";
export const MonacoEditorComponent = ({
  value,
  defaultValue,
  defaultLanguage,
  readOnly,
  onChange,
  handleEditorWillMount,
  options,
}) => (
  <MonacoEditor
    value={value}
    width="100%"
    height="100%"
    defaultValue={defaultValue}
    defaultLanguage={defaultLanguage}
    theme="vs-dark"
    onChange={onChange}
    beforeMount={handleEditorWillMount}
    options={{ ...options, readOnly }}
  />
);
