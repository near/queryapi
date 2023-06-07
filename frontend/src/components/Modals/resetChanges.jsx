import React, { useContext } from "react";
import { Button, Modal } from "react-bootstrap";
import { EditorContext } from '../../contexts/EditorContext';
export const ResetChangesModal = ({
  handleReload,
}) => {
  const { 
    showResetCodeModel,
    setShowResetCodeModel,
  } = useContext(EditorContext);
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
