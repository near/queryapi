import React, { useEffect, useContext } from "react";

import Editor from "../../components/Editor";
import { withRouter } from 'next/router'
import { Alert } from 'react-bootstrap';
// import { EditorContext } from '../../contexts/EditorContext';
import { IndexerDetailsContext } from '../../contexts/IndexerDetailsContext';

const QueryApiEditorPage = ({ router }) => {
  const { accountId, indexerName } = router.query
  // const { setAccountId, setIndexerName } = useContext(EditorContext);
  const { setAccountId, setIndexerName } = useContext(IndexerDetailsContext);
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
    )
  }
  return (
      <Editor  actionButtonText="Publish" onLoadErrorText="An error occured while trying to query indexer function details from registry." />
  );
};

export default withRouter(QueryApiEditorPage);
