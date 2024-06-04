import { useState } from "react";
import { ArrowCounterclockwise, Justify, Code } from "react-bootstrap-icons";
import BlockPickerContainer from "../EditorViewContainer/BlockPickerContainer";

const DeveloperToolsView = ({
    handleFormating,
    handleCodeGen,
    setShowResetCodeModel,
    debugMode,
    setDebugMode,
    heights,
    setHeights,
    latestHeight,
    isExecuting,
    stopExecution,
    removeHeight,
    executeIndexerFunction,
    diffView,
    setDiffView,
}) => {
    const [hoveredIndex, setHoveredIndex] = useState(null);

    return (
        <div className="bg-gray-100 rounded-lg p-2 mb-0 mx-2" >
            <div className="text-center mb-1">
                <span className="text-xs font-medium">Developer Tools</span>
            </div>
            <div className="flex justify-between">
                <div className="flex space-x-1">
                    <button className="flex items-center justify-center px-2 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs rounded" onClick={() => setShowResetCodeModel(true)}>
                        <ArrowCounterclockwise className="mr-1" size={20} />
                        Reset Code
                    </button>
                    <button className="flex items-center justify-center px-2 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs rounded" onClick={handleFormating}>
                        <Justify className="mr-1" size={20} />
                        Format Code
                    </button>
                    <button className="flex items-center justify-center px-2 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs rounded" onClick={handleCodeGen}>
                        <Code className="mr-1" size={20} />
                        Type Generation
                    </button>

                    <div className={`relative flex items-center justify-center px-2 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs rounded ${diffView ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-200 hover:bg-gray-300'}`} onClick={handleCodeGen}>
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
                    <div className={`relative flex items-center justify-center px-2 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs rounded ${debugMode ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-200 hover:bg-gray-300'}`} onClick={handleCodeGen}>
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
                                            color: index === hoveredIndex ? "#EF4444" : "",
                                        }}
                                    >
                                        {height}
                                        {index !== heights.length - 1 && ", "}
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
