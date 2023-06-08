import { IndexerDetailsContext } from "../../contexts/IndexerDetailsContext";
import React, { useContext } from "react";
import { Button, Modal } from "react-bootstrap";
export const ResetChangesModal = ({
  handleReload,
}) => {
  const { 
    showResetCodeModel,
    setShowResetCodeModel,
  } = useContext(IndexerDetailsContext);
  return (
    <Modal
      centered={true}
      show={showResetCodeModel}
      onHide={() => setShowResetCodeModel(false)}
    >
      <Modal.Header closeButton>
        <Modal.Title>Are you sure?</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        The changes you have made in the editor will be deleted.
      </Modal.Body>
      <Modal.Footer>
        <Button
          variant="secondary"
          onClick={() => setShowResetCodeModel(false)}
        >
          Cancel
        </Button>
        <Button variant="primary" onClick={() => handleReload()}>
          Reload
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
