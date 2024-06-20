import React, { createContext, useContext, useState } from 'react';

const ModalContext = createContext({
  openModal: false,
  message: '',
  data: {},
  showModal: (err, obj) => {},
  hideModal: () => {},
});

export const useModal = () => useContext(ModalContext);

export const ModalProvider = ({ children }) => {
  const [openModal, setOpenModal] = useState(false);
  const [message, setMessage] = useState('');
  const [data, setData] = useState();

  const showModal = (errorMessage, data = null) => {
    setOpenModal(true);
    setMessage(errorMessage);
    setData(data);
  };

  const hideModal = () => {
    setOpenModal(false);
    setMessage('');
    setData();
  };

  return (
    <ModalContext.Provider value={{ openModal, message, data, showModal, hideModal }}>{children}</ModalContext.Provider>
  );
};
