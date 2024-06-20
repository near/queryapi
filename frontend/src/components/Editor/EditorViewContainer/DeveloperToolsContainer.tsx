import React, { useContext } from 'react';

import { IndexerDetailsContext } from '../../../contexts/IndexerDetailsContext';
import DeveloperToolsView from '../EditorView/DeveloperToolsView';

interface DeveloperToolsContainerProps {
  handleFormating: () => void;
  handleCodeGen: () => void;
  isExecuting: boolean;
  executeIndexerFunction: () => void;
  heights: number[];
  setHeights: React.Dispatch<React.SetStateAction<number[]>>;
  stopExecution: () => void;
  latestHeight: number | undefined;
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
