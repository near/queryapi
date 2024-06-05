import { Plus, Play, PersonWalking, Check2, Stop } from "react-bootstrap-icons";

const BlockPickerView = ({
  heights,
  inputValue,
  setInputValue,
  isExecuting,
  addHeight,
  stopExecution,
  executeIndexerFunction,
}) => (
  <div className="w-full flex justify-center items-center">
    <div className="flex space-x-1">
      <input
        className="border border-gray-300 rounded px-2 py-1 mr-2 text-xs"
        placeholder="Block height"
        type="number"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
      />
      {isExecuting ? (
        <button
          className="bg-red-500 flex items-center justify-center px-2 py-1 hover:bg-red-600 text-white text-xs rounded"
          onClick={stopExecution}
        >
          <Stop className="" size={20} />
          Stop
        </button>
      ) : (
        <>
          <button
            className="flex items-center justify-center px-2 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs rounded"
            onClick={addHeight}
          >
            <Plus className="mr-1" size={20} />
            Add
          </button>
          <div className="flex space-x-1 relative">
            <button
              className="flex items-center justify-center px-2 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs rounded"
              onClick={() => {
                if (heights.length > 0) {
                  executeIndexerFunction("debugList");
                } else if (inputValue) {
                  executeIndexerFunction("specific", inputValue);
                } else {
                  executeIndexerFunction("latest");
                }
              }}
            >
              <Play className="mr-1" size={20} />
              Test
            </button>
            <div className="flex space-x-1">
              <button
                className="flex items-center justify-center px-2 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs rounded"
                onClick={() => {
                  if (!heights.length) return;
                  executeIndexerFunction("latest");
                }}
                disabled={!heights.length}
              >
                <PersonWalking className="mr-1" size={20} />
                Follow Network
              </button>
              <button
                className="flex items-center justify-center px-2 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs rounded"
                onClick={() => executeIndexerFunction("debugList")}
                disabled={!heights.length}
              >
                <Check2 className="mr-1" size={20} />
                Execute List
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  </div>



);

export default BlockPickerView;
