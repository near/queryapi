import React, { useEffect, useContext } from "react";
import { withRouter } from 'next/router';
import { Alert } from 'react-bootstrap';
import Editor from "@/components/Editor";
import IndexerLogsContainer from '@/components/Logs/LogsViewContainer/IndexerLogsContainer';
import { IndexerDetailsContext } from '@/contexts/IndexerDetailsContext';

const QueryApiEditorPage = ({ router }) => {
  const { accountId, indexerName } = router.query;
  const { setAccountId, setIndexerName, showLogsView } = useContext(IndexerDetailsContext);

  useEffect(() => {
    if (accountId == undefined || indexerName == undefined) {
      return;
    }
    setAccountId(accountId);
    setIndexerName(indexerName);
  }, [accountId, indexerName, setAccountId, setIndexerName]);

  if (accountId == undefined || indexerName == undefined) {
    return (
      <>
        <Alert className="px-3 pt-3" variant="info">
          Both accountId and IndexerName need to be specified in the URL.
        </Alert>
      </>
    );
  }
  return (
    <>
      {showLogsView ? (
        <IndexerLogsContainer />
      ) : (
        <Editor actionButtonText="Publish" onLoadErrorText="An error occurred while trying to query indexer function details from registry." />
      )}
    </>
  );
};

export default withRouter(QueryApiEditorPage);
