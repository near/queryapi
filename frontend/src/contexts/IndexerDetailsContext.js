import React, { useState, useEffect } from 'react';
import { queryIndexerFunctionDetails } from "../utils/queryIndexerFunction";
import {
  defaultCode,
  defaultSchema,
} from "../utils/formatters";

// interface IndexerDetails {
//   accountId: String,
//   indexerName: String,
//   code: String,
//   schema: String,
//   config: IndexerConfig,
// }
//
// type IndexerConfig = {
//   startBlockHeight?: Number,
//   filter: String,
// }

export const IndexerDetailsContext = React.createContext({
  indexerDetails: undefined,
  showResetCodeModel: false,
  setShowResetCodeModel: () => { },
  showPublishModal: false,
  setShowPublishModal: () => { },
  debugMode: false,
  setDebugMode: () => { },
});

export const IndexerDetailsProvider = ({ children }) => {
  const [accountId, setAccountId] = useState(undefined);
  const [indexerName, setIndexerName] = useState(undefined);
  const [indexerDetails, setIndexerDetails] = useState({ code: defaultCode, schema: defaultSchema, config: { filter: "" }, accountId: accountId, indexerName: indexerName })
  const [showResetCodeModel, setShowResetCodeModel] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  // const [contractFilter, setContractFilter] = useState("social.near");
  // const [selectedOption, setSelectedOption] = useState("latestBlockHeight");

  useEffect(() => {
    if (!accountId || !indexerName) return
    (async () => {
      const data = await queryIndexerFunctionDetails(accountId, indexerName);
      if (data) {
        const indexerConfig = {
          startBlockHeight: data.start_block_height,
          filter: data.filter,
        }
        const details = {
          accountId: accountId,
          indexerName: indexerName,
          code: data.code,
          schema: data.schema,
          config: indexerConfig
        }
        setIndexerDetails(details);
      }
    })();
  }, [accountId, indexerName]);

  return (
    <IndexerDetailsContext.Provider
      value={{
        setAccountId,
        setIndexerName,
        indexerDetails,
        showResetCodeModel,
        setShowResetCodeModel,
        showPublishModal,
        setShowPublishModal,
        debugMode,
        setDebugMode,
      }}
    >
      {children}
    </IndexerDetailsContext.Provider>
  );
};
