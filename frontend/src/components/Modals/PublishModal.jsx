import React, { useContext } from "react";
import { Button, Modal, Alert } from "react-bootstrap";
import BlockHeightOptions from "../Form/BlockHeightOptionsInputGroup";
import { EditorContext } from '../../contexts/EditorContext';

export const PublishModal = ({
  submit,
  actionButtonText,
  blockHeightError,
}) => {
    const { 
      showPublishModal,
      setShowPublishModal,
      selectedOption,
      handleOptionChange,
      blockHeight,
      setBlockHeight,
      contractFilter,
      handleSetContractFilter,
      isContractFilterValid,
  } = useContext(EditorContext);

  return (
    <Modal
      centered={true}
      show={showPublishModal}
      onHide={() => setShowPublishModal(false)}
    >
      <Modal.Header closeButton>
        <Modal.Title> Enter Indexer Details</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <BlockHeightOptions
          selectedOption={selectedOption}
          handleOptionChange={handleOptionChange}
          blockHeight={blockHeight}
          setBlockHeight={setBlockHeight}
          handleSetContractFilter={handleSetContractFilter}
          contractFilter={contractFilter}
          isContractFilterValid={isContractFilterValid}
        />
      </Modal.Body>
      <Modal.Footer>
        {blockHeightError && (
          <Alert className="px-3 pt-3" variant="danger">
            {blockHeightError}
          </Alert>
        )}

        <Button variant="secondary" onClick={() => setShowPublishModal(false)}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => submit()}>
          {actionButtonText}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
