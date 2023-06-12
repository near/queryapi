import React, { useContext, useState } from "react";
import { Button, Modal, Alert } from "react-bootstrap";
import IndexerConfigOptions from "../Form/IndexerConfigOptionsInputGroup";
import { IndexerDetailsContext } from '../../contexts/IndexerDetailsContext';
import { validateContractId } from "../../utils/validators";

export const ForkIndexerModal = ({
  registerFunction,
}) => {
  const {
    indexerDetails,
    showForkIndexerModal,
    setShowForkIndexerModal,
  } = useContext(IndexerDetailsContext);
  const [indexerConfig, setIndexerConfig] = useState({ filter: "social.near", startBlockHeight: null })
  const [indexerName, setIndexerName] = useState("")
  const [error, setError] = useState(null)

  const updateConfig = (indexerName, filter, startBlockHeight, option) => {
    if (option === "latestBlockHeight") {
      startBlockHeight = null
    }
    setIndexerConfig({ filter, startBlockHeight })
    setIndexerName(indexerName)
  }
  const register = async () => {
    if (indexerName === undefined || indexerName === "") {
      setError( () => "Please provide an Indexer Name")
      return
    }

    if (indexerName === indexerDetails.indexerName) {
      setError( () => "Please provide a different Indexer Name than the orginal Indexer")
      return
    }


    if (!validateContractId(indexerConfig.filter)) {
      setError( () => "Please provide a valid contract name")
      return
    }
    setError(null)
    registerFunction(indexerName, indexerConfig)
    setShowForkIndexerModal(false)
  }

  return (
    <Modal
      centered={true}
      show={showForkIndexerModal}
      onHide={() => setShowForkIndexerModal(false)}
    >
      <Modal.Header closeButton>
        <Modal.Title> Enter Indexer Details</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <IndexerConfigOptions updateConfig={updateConfig} />
        {error && (
          <Alert className="px-3 mt-3" variant="danger">
            {error}
          </Alert>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={() => setShowPublishModal(false)}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => register()}>
          Fork Your Own Indexer
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
