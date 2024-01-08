import { Button, Modal } from "react-bootstrap";
import PropTypes from 'prop-types';

export const InfoModal = ({
    open,
    title,
    message,
    okButtonText = "OK",
    cancelButtonText = "CANCEL",
    onOkButtonPressed,
    onCancelButtonPressed,
    onClose,
}) => {

    const handleClose = () => {
        if (onClose) {
            onClose()
        }
    }

    const handleOnOkButtonPressed = () => {
        onOkButtonPressed()
        onClose()
    }

    return (
        <Modal
            show={open}
            onHide={handleClose}
        >
            <Modal.Header closeButton>
                <Modal.Title>{title}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <p>{message}</p>
            </Modal.Body>
            <Modal.Footer>
                {onCancelButtonPressed && (
                    <Button
                        variant="secondary"
                        onClick={onCancelButtonPressed}>
                        {cancelButtonText}
                    </Button>
                )}
                {onOkButtonPressed && (
                    <Button
                        variant="primary"
                        onClick={handleOnOkButtonPressed}>
                        {okButtonText}
                    </Button>
                )}
            </Modal.Footer>
        </Modal>
    );
};

InfoModal.propTypes = {
    open: PropTypes.bool.isRequired,
    title: PropTypes.string.isRequired,
    message: PropTypes.string.isRequired,
    okButtonText: PropTypes.string,
    onOkButtonPressed: PropTypes.func,
    cancelButtonText: PropTypes.string,
    onCancelButtonPressed: PropTypes.func,
    onClose: PropTypes.func,
};
