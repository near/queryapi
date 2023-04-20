
import React from "react";

import CreateNewIndexer from "../../components/CreateNewIndexer";
import { withRouter } from 'next/router'
import { Alert } from 'react-bootstrap';


const CreateNewIndexerPage = ({ router }) => {
    const { accountId } = router.query

    if (accountId == undefined) {
        return (
            <>
                <Alert className="px-3 pt-3" variant="info">
                    AccountId needs to be specified in the URL
                </Alert>
            </>
        )
    }
    return (
        <>
            <CreateNewIndexer accountId={accountId} />
        </>
    );
};

export default withRouter(CreateNewIndexerPage);
