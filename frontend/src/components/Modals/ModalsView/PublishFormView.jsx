import React from 'react';

const PublishFormView = ({
  indexerNameField,
  isCreateNewIndexer,
  showPublishModal,
  startBlock,
  blockHeight,
  contractFilter,
  latestHeight,
  blockHeightError,
  isContractFilterValid,
  onChangeStartBlock,
  setIndexerNameField,
  setBlockHeight,
  handleSetContractFilter,
  updateConfig,
  indexerDetails,
}) => (
  <div className="space-y-6">
    <div className="flex flex-col">
      <label htmlFor="indexerName" className="text-gray-800 mb-1 font-semibold">
        Indexer Name
      </label>
      <input
        id="indexerName"
        type="text"
        placeholder="indexer_name"
        aria-label="Indexer Name"
        value={indexerNameField}
        disabled={!isCreateNewIndexer && showPublishModal}
        onChange={(e) => setIndexerNameField(e.target.value.toLowerCase().trim())}
        className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
      />
    </div>

    <div className="flex items-center space-x-3">
      <input
        type="radio"
        id="startLatest"
        value="startBlockLatest"
        checked={startBlock === 'startBlockLatest'}
        onChange={onChangeStartBlock}
        aria-label="Start from latest block"
        className="form-radio h-4 w-4 text-gray-600 border-gray-300 focus:ring-gray-500"
      />
      <label htmlFor="startLatest" className="text-gray-700">
        Start from latest block
      </label>
    </div>

    {!isCreateNewIndexer && (
      <div className="flex items-center space-x-3">
        <input
          type="radio"
          id="startContinue"
          value="startBlockContinue"
          checked={startBlock === 'startBlockContinue'}
          onChange={onChangeStartBlock}
          aria-label="Continue from last processed block"
          className="form-radio h-4 w-4 text-gray-600 border-gray-300 focus:ring-gray-500"
        />
        <label htmlFor="startContinue" className="text-gray-700">
          Continue from last processed block
        </label>
      </div>
    )}

    <div className="flex items-center space-x-3">
      <input
        type="radio"
        id="startHeight"
        value="startBlockHeight"
        checked={startBlock === 'startBlockHeight'}
        onChange={onChangeStartBlock}
        aria-label="Start from block height"
        className="form-radio h-4 w-4 text-gray-600 border-gray-300 focus:ring-gray-500"
      />
      <label htmlFor="startHeight" className="text-gray-700">
        Start from block height
      </label>
      <input
        type="number"
        value={blockHeight}
        onChange={(e) => setBlockHeight(parseInt(e.target.value))}
        className="ml-3 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
      />
    </div>
    {blockHeightError && <div className="mt-2 text-sm text-red-600">{blockHeightError}</div>}

    <div className="flex flex-col">
      <label htmlFor="contractFilter" className="text-gray-800 mb-1 font-semibold">
        Contract Filter
      </label>
      <input
        id="contractFilter"
        type="text"
        placeholder="social.near"
        value={startBlock === 'startBlockContinue' ? contractFilter : indexerDetails.rule.affected_account_id}
        onChange={(e) => handleSetContractFilter(e.target.value)}
        required
        disabled={startBlock === 'startBlockContinue'}
        className={`px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 ${
          isContractFilterValid ? 'border-gray-300' : 'border-red-500'
        }`}
      />
      {!isContractFilterValid && <div className="mt-2 text-sm text-red-600">Please provide a valid contract name.</div>}
      {startBlock === 'startBlockContinue' && (
        <div className="mt-2 text-sm text-yellow-600">
          Contract filter cannot be changed for &quot;Continue&quot; option.
        </div>
      )}
    </div>
  </div>
);

export default PublishFormView;
