import React, { useContext } from 'react';
import { IndexerDetailsContext } from '@/contexts/IndexerDetailsContext';
import AlertSquareIcon from '@/components/Common/Icons/AlertSquareIcon';
import CheckMarkSquareIcon from '@/components/Common/Icons/CheckMarkSquareIcon';

import CustomTooltip, { TooltipDirection } from '@/components/Common/CustomTooltip';

export function FileSwitcher({ fileName, setFileName, schemaError, indexerError }) {
  const { isCreateNewIndexer } = useContext(IndexerDetailsContext);
  return (
    <div className="flex bg-gray-100 rounded-md overflow-visible shadow-md font-sans">
      <button
        className={`flex-1 px-4 py-2 text-base text-xs font-medium ${
          fileName === 'indexer.js' ? 'bg-gray-700 text-gray-100' : 'bg-gray-300 text-gray-700 hover:bg-gray-400'
        } border-r border-gray-400 last:border-r-0`}
        onClick={() => setFileName('indexer.js')}
      >
        <span>Indexer.js</span>
        <div className="inline-flex items-center">
          {indexerError ? (
            <CustomTooltip message={indexerError} direction={TooltipDirection.Top}>
              <AlertSquareIcon />
            </CustomTooltip>
          ) : (
            <CheckMarkSquareIcon />
          )}
        </div>
      </button>
      <button
        className={`flex-1 px-4 py-2 text-base text-xs font-medium ${
          fileName === 'schema.sql' ? 'bg-gray-700 text-gray-100' : 'bg-gray-300 text-gray-700 hover:bg-gray-400'
        } border-r border-gray-400 last:border-r-0 flex items-center justify-center space-x-2`}
        onClick={() => setFileName('schema.sql')}
      >
        <span>Schema.sql</span>
        <div className="inline-flex items-center">
          {schemaError ? (
            <CustomTooltip message={schemaError} direction={TooltipDirection.Top}>
              <AlertSquareIcon />
            </CustomTooltip>
          ) : (
            <CheckMarkSquareIcon />
          )}
        </div>
      </button>
      {!isCreateNewIndexer && (
        <button
          className={`flex-1 px-4 py-2 text-base text-xs font-medium ${
            fileName === 'GraphiQL' ? 'bg-gray-700 text-gray-100' : 'bg-gray-300 text-gray-700 hover:bg-gray-400'
          }`}
          onClick={() => setFileName('GraphiQL')}
        >
          GraphiQL
        </button>
      )}
    </div>
  );
}
