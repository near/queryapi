import React from "react";
import { ArrowCounterclockwise, Justify, Code } from "react-bootstrap-icons";

const DeveloperToolsView = ({
    handleFormating,
    handleCodeGen,
    setShowResetCodeModel,
    debugMode,
    heights,
    setHeights,
    latestHeight,
    isExecuting,
    stopExecution,
    removeHeight,
}) => {
    return (
        <div className="bg-gray-100 rounded-lg p-2 mb-4 mx-2">
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
                    <button className="px-1 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs rounded" onClick={() => console.log("Debug")}>Debug</button>
                    <button className="px-1 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs rounded" onClick={() => console.log("Add Debug Block")}>Add Debug Block</button>
                </div>
                <div className="flex space-x-1">
                    {/* <button className="px-1 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs rounded" onClick={() => console.log("Option 1")}>Option 1</button>
                    <button className="px-1 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs rounded" onClick={() => console.log("Option 2")}>Option 2</button> */}
                </div>
            </div>
        </div>
    );
};

export default DeveloperToolsView;
