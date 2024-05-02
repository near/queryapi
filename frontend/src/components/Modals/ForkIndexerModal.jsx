import React, { useContext, useState } from "react";
import { Button, Modal, Alert, InputGroup, Form  } from "react-bootstrap";
import IndexerConfigOptions from "../Form/IndexerConfigOptionsInputGroup";
import { IndexerDetailsContext } from "../../contexts/IndexerDetailsContext";

export const ForkIndexerModal = ({ registerFunction, forkIndexer }) => {
  const {
    indexerDetails,
    showForkIndexerModal,
    setShowForkIndexerModal,
    setIsCreateNewIndexer,
    setIndexerName,
    setForkedAccountId,
    setForkedIndexerName,
    setIndexerConfig,
    isCreateNewIndexer,
  } = useContext(IndexerDetailsContext);
  const [indexerName, setIndexerNameField] = useState("");
  const [error, setError] = useState(null);

  const fork = async () => {
    if (!indexerName) {
      setError("Please provide an Indexer Name");
      return;
    }

    if (indexerName === indexerDetails.indexerName) {
      setError(
        "Please provide a different Indexer Name than the orginal Indexer"
      );
      return;
    }

    setError(null);
    setIndexerName(indexerName);
    setForkedAccountId(indexerDetails.accountId);
    setForkedIndexerName(indexerDetails.indexerName);
    setIsCreateNewIndexer(true);
    forkIndexer(indexerName);
    setShowForkIndexerModal(false);
  };

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
        <InputGroup size="sm">
          <InputGroup.Text> Indexer Name </InputGroup.Text>
          <Form.Control
            type="text"
            placeholder="indexer_name"
            aria-label="IndexerName"
            value={indexerName}
            onChange={(e) => setIndexerNameField(e.target.value.trim().toLowerCase())}
          />
        </InputGroup>
        {error && (
          <Alert className="px-3 mt-3" variant="danger">
            {error}
          </Alert>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button
          variant="secondary"
          onClick={() => setShowForkIndexerModal(false)}
        >
          Cancel
        </Button>
        <Button variant="primary" onClick={() => fork()}>
          Fork Indexer
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
