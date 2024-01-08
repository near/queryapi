import { Button, Modal } from "react-bootstrap";
import PropTypes from 'prop-types';

export const ErrorModal = ({
    open,
    title,
    message,
    okButtonText = "OK",
    onOkButtonPressed,
    onClose,
}) => {

    const handleClose = () => {
        if (onClose) {
            onClose()
        }
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
                {onOkButtonPressed && (
                    <Button
                        variant="primary"
                        onClick={onOkButtonPressed}>
                        {okButtonText}
                    </Button>
                )}
            </Modal.Footer>
        </Modal>
    );
};


BlockDetailsModal.propTypes = {
    open: PropTypes.bool.isRequired,
    title: PropTypes.string.isRequired,
    message: PropTypes.string.isRequired,
    okButtonText: PropTypes.string,
    onOkButtonPressed: PropTypes.func.isRequired,
    onClose: PropTypes.func,
};
