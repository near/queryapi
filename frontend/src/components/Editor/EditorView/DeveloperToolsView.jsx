import { useState } from 'react';
import { ArrowCounterclockwise, Justify, Code } from 'react-bootstrap-icons';
import BlockPickerContainer from '../EditorViewContainer/BlockPickerContainer';
import CustomTooltip, { TooltipDirection } from '@/components/Common/CustomTooltip';

const DeveloperToolsView = ({
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
}) => {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  return (
    <div className="bg-gray-100 rounded-lg p-2 mb-0 mx-2">
      <div className="flex justify-between">
        <div className="flex space-x-1">
          <button
            className="flex items-center justify-center px-2 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs rounded"
            onClick={() => setShowResetCodeModel(true)}
          >
            <ArrowCounterclockwise className="mr-1" size={20} />
            Reset Code
          </button>
          <button
            className="flex items-center justify-center px-2 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs rounded"
            onClick={handleFormating}
          >
            <Justify className="mr-1" size={20} />
            Format Code
          </button>

          <CustomTooltip message="Regenerate Context.db Types" direction={TooltipDirection.Top}>
            <button
              className="flex items-center justify-center px-2 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs rounded"
              onClick={handleCodeGen}
            >
              <Code className="mr-1" size={20} />
              Type Generation
            </button>
          </CustomTooltip>

          <div className="h-full border-r border-gray-300 mx-4"></div>

          <div
            className={`relative flex items-center justify-center px-2 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs rounded ${
              diffView ? 'bg-gray-600 hover:bg-gray-700 text-white' : 'bg-gray-200 hover:bg-gray-300'
            }`}
            onClick={handleCodeGen}
          >
            <span className="px-3">Diff View</span>
            <input
              type="checkbox"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              checked={diffView}
              onChange={(e) => {
                setDiffView(e.target.checked);
              }}
            />
          </div>

          <CustomTooltip message="Please Open Browser Console" direction={TooltipDirection.Top}>
            <div
              className={`relative flex items-center justify-center px-2 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs rounded ${
                debugMode ? 'bg-gray-600 hover:bg-gray-700 text-white' : 'bg-gray-200 hover:bg-gray-300'
              }`}
              onClick={handleCodeGen}
            >
              <span className="px-3">Debug Mode</span>
              <input
                type="checkbox"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                checked={debugMode}
                onChange={(e) => {
                  setDebugMode(e.target.checked);
                }}
              />
            </div>
          </CustomTooltip>
        </div>

        <div className="flex flex-col items-center space-y-4">
          {debugMode && (
            <>
              {typeof debugMode === 'boolean' && debugMode && (
                <div style={{ width: 'auto' }}>
                  <BlockPickerContainer
                    heights={heights}
                    setHeights={setHeights}
                    executeIndexerFunction={executeIndexerFunction}
                    latestHeight={latestHeight}
                    isExecuting={isExecuting}
                    stopExecution={stopExecution}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {debugMode && heights.length > 0 && (
        <div className="w-full">
          <div className="text-xs text-gray-500 pt-2">
            <p className="">
              Selected Block Heights: [
              <span>
                {heights.map((height, index) => (
                  <span
                    key={index}
                    className="array-element"
                    onClick={() => removeHeight(index)}
                    onMouseEnter={() => setHoveredIndex(index)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    style={{
                      color: index === hoveredIndex ? '#EF4444' : '',
                    }}
                  >
                    {height}
                    {index !== heights.length - 1 && ', '}
                  </span>
                ))}
              </span>
              ]
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeveloperToolsView;
