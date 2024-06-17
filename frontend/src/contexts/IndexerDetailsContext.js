import { useInitialPayload } from 'near-social-bridge';
import React, { useEffect,useState } from 'react';

import { getLatestBlockHeight } from '@/utils/getLatestBlockHeight';
import { queryIndexerFunctionDetails } from '@/utils/queryIndexerFunction';

import { defaultCode, defaultSchema, wrapCode } from '../utils/formatters';
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
  indexerDetails: {
    code: undefined,
    schema: undefined,
    rule: { affected_account_id: 'social.near' },
    startBlock: 'LATEST',
    accountId: '',
    indexerName: '',
    forkedAccountId: null,
    forkedIndexerName: null,
  },
  showResetCodeModel: false,
  setShowResetCodeModel: (bool) => {},
  showPublishModal: false,
  setShowPublishModal: (bool) => {},
  showForkIndexerModal: false,
  setShowForkIndexerModal: (bool) => {},
  debugMode: false,
  setDebugMode: () => {},
  latestHeight: 0,
  setLatestHeight: () => {},
  isCreateNewIndexer: false,
  setIsCreateNewIndexer: (bool) => {},
  accountId: undefined,
  setAccountId: (accountId) => {},
  indexerName: '',
  setIndexerName: (indexerName) => {},
  forkedAccountId: undefined,
  setForkedAccountId: (accountId) => {},
  forkedIndexerName: undefined,
  setForkedIndexerName: (indexerName) => {},
  setIndexerDetails: () => {},
  showLogsView: false,
  setShowLogsView: () => {},
});

export const IndexerDetailsProvider = ({ children }) => {
  const [accountId, setAccountId] = useState(undefined);
  const [indexerName, setIndexerName] = useState(undefined);
  const [forkedAccountId, setForkedAccountId] = useState(undefined);
  const [forkedIndexerName, setForkedIndexerName] = useState(undefined);
  const [indexerDetails, setIndexerDetails] = useState({
    code: undefined,
    schema: undefined,
    rule: { affected_account_id: 'social.near' },
    startBlock: 'LATEST',
    accountId: accountId,
    indexerName: indexerName,
    forkedAccountId: forkedAccountId,
    forkedIndexerName: forkedIndexerName,
  });
  const [showResetCodeModel, setShowResetCodeModel] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showForkIndexerModal, setShowForkIndexerModal] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [showLogsView, setShowLogsView] = useState(false);
  const [latestHeight, setLatestHeight] = useState(0);
  const [isCreateNewIndexer, setIsCreateNewIndexer] = useState(false);

  const { activeView } = useInitialPayload();

  useEffect(() => {
    if (activeView == 'status') setShowLogsView(true);
  }, []);

  const requestIndexerDetails = async () => {
    const data = await queryIndexerFunctionDetails(accountId, indexerName);
    if (data) {
      const details = {
        accountId: accountId,
        indexerName: indexerName,
        forkedAccountId: data.forked_from?.account_id,
        forkedIndexerName: data.forked_from?.function_name,
        code: wrapCode(data.code),
        schema: data.schema,
        startBlock: data.start_block,
        rule: data.rule,
      };
      return details;
    }
  };
  useEffect(() => {
    (async () => {
      const latestHeight = await getLatestBlockHeight();
      setLatestHeight(latestHeight);
    })();
  }, []);

  useEffect(() => {
    if (isCreateNewIndexer || !accountId || !indexerName) {
      setIndexerDetails((prevDetails) => ({
        ...prevDetails,
        accountId: accountId,
        indexerName: indexerName,
        forkedAccountId: forkedAccountId,
        forkedIndexerName: forkedIndexerName,
      }));
      return;
    }
    (async () => {
      const indexer = await requestIndexerDetails();
      const details = {
        accountId: indexer.accountId,
        indexerName: indexer.indexerName,
        forkedAccountId: indexer.forkedAccountId,
        forkedIndexerName: indexer.forkedIndexerName,
        code: indexer.code,
        schema: indexer.schema,
        startBlock: indexer.startBlock,
        rule: indexer.rule,
      };
      setIndexerDetails(details);
    })();
  }, [accountId, indexerName, forkedAccountId, forkedIndexerName, isCreateNewIndexer]);

  return (
    <IndexerDetailsContext.Provider
      value={{
        accountId,
        indexerName,
        setAccountId,
        setIndexerName,
        setForkedAccountId,
        setForkedIndexerName,
        indexerDetails,
        showResetCodeModel,
        setShowResetCodeModel,
        showPublishModal,
        setShowPublishModal,
        showForkIndexerModal,
        setShowForkIndexerModal,
        debugMode,
        setDebugMode,
        latestHeight,
        isCreateNewIndexer,
        setIsCreateNewIndexer,
        showLogsView,
        setShowLogsView,
      }}
    >
      {children}
    </IndexerDetailsContext.Provider>
  );
};
