
import React, { useContext, useEffect} from "react";

import CreateNewIndexer from "../../components/CreateNewIndexer";
import { withRouter } from 'next/router'
import { Alert } from 'react-bootstrap';
import { IndexerDetailsContext } from '../../contexts/IndexerDetailsContext';
const CreateNewIndexerPage = ({ router }) => {
  const { accountId } = router.query

  const { setAccountId } = useContext(IndexerDetailsContext);

  useEffect(() => {
    setAccountId(accountId);
  }, [accountId, setAccountId]);

  if (accountId == undefined) {
    return (
      <>
        <Alert className="px-3 pt-3" variant="info">
          AccountId needs to be specified in the URL
        </Alert>
      </>
    )
  }

  return (<CreateNewIndexer />);
};

export default withRouter(CreateNewIndexerPage);
