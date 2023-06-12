import React, { useState, useEffect } from 'react';
import { queryIndexerFunctionDetails } from "../utils/queryIndexerFunction";
import {
  defaultCode,
  defaultSchema,
  wrapCode,
} from "../utils/formatters";

import { getLatestBlockHeight } from "../utils/getLatestBlockHeight";
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
  indexerDetails: { code: undefined, schema: undefined, config: { filter: "social.near", startBlockHeight: 0 }, accountId: "", indexerName: "" },
  showResetCodeModel: false,
  setShowResetCodeModel: () => { },
  showPublishModal: false,
  setShowPublishModal: () => { },
  debugMode: false,
  setDebugMode: () => { },
  latestHeight: 0,
  setLatestHeight: () => { },
  isCreateNewIndexer: false,
  setIsCreateNewIndexer: () => { },
  accountId: undefined,
  setAccountId: () => { },
  indexerName: undefined,
  setIndexerName: () => { },
  setIndexerDetails: () => { },
  indexerNameField: "",
  setIndexerNameField: () => { },
});

export const IndexerDetailsProvider = ({ children }) => {
  const [accountId, setAccountId] = useState(undefined);
  const [indexerName, setIndexerName] = useState(undefined);
  const [indexerNameField, setIndexerNameField] = useState("");
  const [indexerDetails, setIndexerDetails] = useState({ code: undefined, schema: undefined, config: { filter: "social.near", startBlockHeight: 0 }, accountId: accountId, indexerName: indexerName })
  const [showResetCodeModel, setShowResetCodeModel] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [latestHeight, setLatestHeight] = useState(0);
  const [isCreateNewIndexer, setIsCreateNewIndexer] = useState(false);

  const requestIndexerDetails = async () => {
    const data = await queryIndexerFunctionDetails(accountId, indexerName);
    if (data) {
      const indexerConfig = {
        startBlockHeight: data.start_block_height,
        filter: data.filter.matching_rule.affected_account_id,
      }
      const details = {
        accountId: accountId,
        indexerName: indexerName,
        code: wrapCode(data.code),
        schema: data.schema,
        config: indexerConfig
      }
      return details
    }
  }
  useEffect(() => {
    (async () => {
      const latestHeight = await getLatestBlockHeight()
      setLatestHeight(latestHeight)
    })()
  }, [])

  useEffect(() => {
    if (isCreateNewIndexer || !accountId || !indexerName) {
      setIndexerDetails(prevDetails => ({
        ...prevDetails,
        accountId: accountId,
        indexerName: indexerName,
      }));
      return
    }
    (async () => {
      const indexer = await requestIndexerDetails()
      const details = {
        accountId: indexer.accountId,
        indexerName: indexer.indexerName,
        code: indexer.code,
        schema: indexer.schema,
        config: indexer.indexerConfig
      }
      setIndexerDetails(details);
    })();

  }, [accountId, indexerName, isCreateNewIndexer]);

  return (
    <IndexerDetailsContext.Provider
      value={{
        accountId,
        setAccountId,
        setIndexerName,
        indexerNameField,
        setIndexerNameField,
        indexerDetails,
        showResetCodeModel,
        setShowResetCodeModel,
        showPublishModal,
        setShowPublishModal,
        debugMode,
        setDebugMode,
        latestHeight,
        isCreateNewIndexer,
        setIsCreateNewIndexer
      }}
    >
      {children}
    </IndexerDetailsContext.Provider>
  );
};
