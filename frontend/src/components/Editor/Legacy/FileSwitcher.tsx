import React, { useContext } from 'react';
import { IndexerDetailsContext } from '@/contexts/IndexerDetailsContext';

interface FileSwitcherProps {
  fileName: string;
  setFileName: React.Dispatch<React.SetStateAction<string>>;
}

export const FileSwitcher: React.FC<FileSwitcherProps> = ({ fileName, setFileName }) => {
  const { isCreateNewIndexer } = useContext(IndexerDetailsContext);

  return (
    <div className="flex bg-gray-100 rounded-md overflow-hidden shadow-md font-sans">
      <button
        className={`flex-1 px-4 py-2 text-base text-xs font-medium ${fileName === 'indexer.js' ? 'bg-gray-700 text-gray-100' : 'bg-gray-300 text-gray-700 hover:bg-gray-400'
          } border-r border-gray-400 last:border-r-0`}
        onClick={() => setFileName('indexer.js')}
      >
        Indexer.js
      </button>
      <button
        className={`flex-1 px-4 py-2 text-base text-xs font-medium ${fileName === 'schema.sql' ? 'bg-gray-700 text-gray-100' : 'bg-gray-300 text-gray-700 hover:bg-gray-400'
          } border-r border-gray-400 last:border-r-0`}
        onClick={() => setFileName('schema.sql')}
      >
        Schema.sql
      </button>
      {!isCreateNewIndexer && (
        <button
          className={`flex-1 px-4 py-2 text-base text-xs font-medium ${fileName === 'GraphiQL' ? 'bg-gray-700 text-gray-100' : 'bg-gray-300 text-gray-700 hover:bg-gray-400'
            }`}
          onClick={() => setFileName('GraphiQL')}
        >
          GraphiQL
        </button>
      )}
    </div>
  );
};
