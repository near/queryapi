import React, { useContext } from "react";
import { BlockPicker } from "./BlockPicker";
import { IndexerDetailsContext } from "../../contexts/IndexerDetailsContext";
import {
  SCHEMA_TYPE_GENERATION_ERROR_MESSAGE,
  TYPE_GENERATION_ERROR_TYPE,
} from "@/constants/Strings";

const EditorButtons = ({
  handleFormating,
  handleCodeGen,
  executeIndexerFunction,
  isExecuting,
  stopExecution,
  heights,
  setHeights,
  latestHeight,
  isUserIndexer,
  handleDeleteIndexer,
  error,
}) => {
  const {
    indexerName,
    accountId,
    indexerDetails,
    setShowPublishModal,
    setShowResetCodeModel,
    setShowForkIndexerModal,
    debugMode,
    isCreateNewIndexer,
    setShowLogsView,
  } = useContext(IndexerDetailsContext);

  const removeHeight = (index) => {
    setHeights(heights.filter((_, i) => i !== index));
  };

  return (
    <>
      <nav class="bg-primary border-gray-200 dark:bg-nightmode-primary rounded shadow">
        <div class="max-w-screen-xl flex flex-wrap items-center justify-between mx-auto p-4">
          {!isCreateNewIndexer && (
            <div>
              <div class="flex rounded-lg shadow-sm">
                <span class="px-4 inline-flex items-center min-w-fit rounded-s-md border border-e-0 border-gray-200 bg-gray-50 text-sm text-gray-500 dark:bg-gray-700 dark:border-gray-700 dark:text-gray-400">
                  Contract Filter
                </span>
                <input
                  disabled={!isCreateNewIndexer}
                  value={indexerDetails.config.filter}
                  required={true}
                  placeholder="social.near"
                  type="text"
                  class="py-2 px-3 pe-11 block w-full border-gray-200 shadow-sm rounded-e-lg text-sm focus:z-10 focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 dark:bg-slate-900 dark:border-gray-700 dark:text-gray-400 dark:focus:ring-gray-600"
                />
              </div>
            </div>
          )}
          <button
            data-collapse-toggle="navbar-default"
            type="button"
            class="inline-flex items-center p-2 w-10 h-10 justify-center text-sm text-gray-500 rounded-lg md:hidden hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:text-gray-400 dark:hover:bg-gray-700 dark:focus:ring-gray-600"
            aria-controls="navbar-default"
            aria-expanded="false"
          >
            <span class="sr-only">Open editor menu</span>
            <svg
              class="w-5 h-5"
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 17 14"
            >
              <path
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M1 1h15M1 7h15M1 13h15"
              />
            </svg>
          </button>
          <div class="hidden w-full md:block md:w-auto" id="navbar-default">
            <ul class="font-medium flex flex-col p-4 md:p-0 mt-4 border border-gray-100 rounded-lg bg-gray-50 md:flex-row md:space-x-8 rtl:space-x-reverse md:mt-0 md:border-0 md:bg-white dark:bg-nightmode-primary dark:border-gray-700">
              {debugMode && (
                <li>
                  <BlockPicker
                    heights={heights}
                    setHeights={setHeights}
                    executeIndexerFunction={executeIndexerFunction}
                    latestHeight={latestHeight}
                    isExecuting={isExecuting}
                    stopExecution={stopExecution}
                  />
                </li>
              )}

              {!isCreateNewIndexer && (
                <li>
                  <span class="group relative">
                    <div class="absolute bottom-[calc(100%+0.5rem)] left-[50%] -translate-x-[50%] hidden group-hover:block w-auto">
                      <div class="bottom-full right-0 rounded bg-black px-4 py-1 text-xs text-white whitespace-nowrap">
                        Open Logs
                      </div>
                    </div>
                    <button
                      class="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-nightmode-secondary dark:hover:bg-nightmode-secondaryhover dark:focus:ring-dark-800"
                      onClick={() => setShowLogsView(true)}
                    >
                      Show Logs
                    </button>
                  </span>
                </li>
              )}

              {isUserIndexer &&
                !isCreateNewIndexer && (
                  <li>
                    <div>
                      <span class="group relative">
                        <div class="absolute bottom-[calc(100%+0.5rem)] left-[50%] -translate-x-[50%] hidden group-hover:block w-auto">
                          <div class="bottom-full right-0 rounded bg-black px-4 py-1 text-xs text-white whitespace-nowrap">
                            Delete Indexer
                          </div>
                        </div>
                        <button
                          class="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
                          onClick={() => handleDeleteIndexer()}
                        >
                          Trash Icon
                        </button>
                      </span>
                    </div>
                  </li>
                ) && (
                  <li>
                    <span class="group relative">
                      <div class="absolute bottom-[calc(100%+0.5rem)] left-[50%] -translate-x-[50%] hidden group-hover:block w-auto">
                        <div class="bottom-full right-0 rounded bg-black px-4 py-1 text-xs text-white whitespace-nowrap">
                          Fork Indexer
                        </div>
                      </div>
                      <button
                        class="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
                        onClick={() => setShowForkIndexerModal(true)}
                      >
                        Fork Icon
                      </button>
                    </span>
                  </li>
                )}

              {!isUserIndexer && !isCreateNewIndexer ? (
                <li>
                  <span class="group relative">
                    <div class="absolute bottom-[calc(100%+0.5rem)] left-[50%] -translate-x-[50%] hidden group-hover:block w-auto">
                      <div class="bottom-full right-0 rounded bg-black px-4 py-1 text-xs text-white whitespace-nowrap">
                        Fork Indexer
                      </div>
                    </div>
                    <button
                      class="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
                      onClick={() => setShowForkIndexerModal(true)}
                    >
                      Fork Icon
                    </button>
                  </span>
                </li>
              ) : (
                <li>
                  <span class="group relative">
                    <div class="absolute bottom-[calc(100%+0.5rem)] left-[50%] -translate-x-[50%] hidden group-hover:block w-auto">
                      <div class="bottom-full right-0 rounded bg-black px-4 py-1 text-xs text-white whitespace-nowrap">
                        Publish Indexer
                      </div>
                    </div>
                    <button
                      class="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
                      disabled={
                        !!error &&
                        error !== SCHEMA_TYPE_GENERATION_ERROR_MESSAGE
                      }
                      onClick={() => setShowPublishModal(true)}
                    >
                      Publish Icon
                    </button>
                  </span>
                </li>
              )}

              <li>
                <span class="group relative">
                  <div class="absolute bottom-[calc(100%+0.5rem)] left-[50%] -translate-x-[50%] hidden group-hover:block w-auto">
                    <div class="bottom-full right-0 rounded bg-black px-4 py-1 text-xs text-white whitespace-nowrap">
                      Reset Changes To Code
                    </div>
                  </div>
                  <button
                    class="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
                    onClick={() => setShowResetCodeModel(true)}
                  >
                    Reset Icon
                  </button>
                </span>
              </li>

              <li>
                <span class="group relative">
                  <div class="absolute bottom-[calc(100%+0.5rem)] left-[50%] -translate-x-[50%] hidden group-hover:block w-auto">
                    <div class="bottom-full right-0 rounded bg-black px-4 py-1 text-xs text-white whitespace-nowrap">
                      Format Code
                    </div>
                  </div>
                  <button
                    class="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
                    onClick={() => handleFormating()}
                  >
                    Format Icon
                  </button>
                </span>
              </li>

              <li>
                <span class="group relative">
                  <div class="absolute bottom-[calc(100%+0.5rem)] left-[50%] -translate-x-[50%] hidden group-hover:block w-auto">
                    <div class="bottom-full right-0 rounded bg-black px-4 py-1 text-xs text-white whitespace-nowrap">
                      Generate Types
                    </div>
                  </div>
                  <button
                    class="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
                    onClick={() => handleCodeGen()}
                  >
                    Generate Types Icon
                  </button>
                </span>
              </li>
            </ul>

            {debugMode && heights.length > 0 && (
              <div>
                {heights.map((height, index) => (
                  <button onClick={() => removeHeight(index)} key={index}>
                    (X): {height}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </nav>
    </>
  );
};

export default EditorButtons;
