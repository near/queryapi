import React, { useContext, useEffect } from "react";
import { withRouter } from 'next/router';
import { Alert } from 'react-bootstrap';
import { IndexerDetailsContext } from '@/contexts/IndexerDetailsContext';
import CreateNewIndexer from "@/components/CreateNewIndexer";

const CreateNewIndexerPage = ({ router }) => {
  const { accountId } = router.query;
  const { setAccountId, setIsCreateNewIndexer } = useContext(IndexerDetailsContext);

  useEffect(() => {
    setIsCreateNewIndexer(true);
    setAccountId(accountId);
  }, [accountId, setAccountId, setIsCreateNewIndexer]);

  if (accountId == undefined) {
    return (
      <>
        <Alert className="px-3 pt-3" variant="info">
          AccountId needs to be specified in the URL
        </Alert>
      </>
    );
  }

  return (<CreateNewIndexer />);
};

export default withRouter(CreateNewIndexerPage);
