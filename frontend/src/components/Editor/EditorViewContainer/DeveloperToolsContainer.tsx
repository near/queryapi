import React, { useContext } from 'react';
import DeveloperToolsView from '../EditorView/DeveloperToolsView';
import { IndexerDetailsContext } from '../../../contexts/IndexerDetailsContext';

interface DeveloperToolsContainerProps {
  handleFormating: () => void;
  handleCodeGen: () => void;
  isExecuting: boolean;
  executeIndexerFunction: () => void;
  heights: string[];
  setHeights: React.Dispatch<React.SetStateAction<string[]>>;
  stopExecution: () => void;
  latestHeight: number;
  diffView: boolean;
  setDiffView: React.Dispatch<React.SetStateAction<boolean>>;
}

const DeveloperToolsContainer: React.FC<DeveloperToolsContainerProps> = ({
  handleFormating,
  handleCodeGen,
  executeIndexerFunction,
  isExecuting,
  stopExecution,
  heights,
  setHeights,
  latestHeight,
  diffView,
  setDiffView,
}) => {
  const { setShowResetCodeModel, debugMode, setDebugMode } = useContext(IndexerDetailsContext);

  const removeHeight = (index: number): void => {
    setHeights(heights.filter((_, i) => i !== index));
  };

  return (
    <DeveloperToolsView
      {...{
        // Props
        handleFormating,
        handleCodeGen,
        executeIndexerFunction,
        isExecuting,
        stopExecution,
        heights,
        setHeights,
        latestHeight,
        diffView,
        setDiffView,
        // Context
        setShowResetCodeModel,
        debugMode,
        setDebugMode,
        // Functions
        removeHeight,
      }}
    />
  );
};

export default DeveloperToolsContainer;
