import React, { useState, useEffect } from 'react';
import { validateContractId } from "../utils/validators"

export const EditorContext = React.createContext();

export const EditorProvider = ({ children }) => {
  const [accountId, setAccountId] = useState(undefined);
  const [indexerName, setIndexerName] = useState(undefined);
  const [indexerNameField, setIndexerNameField] = useState(indexerName ?? "");
  const [blockHeight, setBlockHeight] = useState("0");
  const [showResetCodeModel, setShowResetCodeModel] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [contractFilter, setContractFilter] = useState("social.near");
  const [selectedOption, setSelectedOption] = useState("latestBlockHeight");
  const [isContractFilterValid, setIsContractFilterValid] = useState(true);

  useEffect(() => {
    setIndexerNameField(indexerName);
  }, [indexerName]);

  function handleSetContractFilter(e) {
    const contractFilter = e.target.value;
    setContractFilter(contractFilter);
    const isValid = validateContractId(contractFilter);

    if (isValid) {
      setIsContractFilterValid(true);
    } else {
      setIsContractFilterValid(false);
    }
  }

  const handleOptionChange = (event) => {
    setSelectedOption(event.target.value);
    // setBlockHeightError(null);
  };

  return (
    <EditorContext.Provider
      value={{
        accountId,
        setAccountId,
        indexerName,
        setIndexerName,
        indexerNameField,
        setIndexerNameField,
        blockHeight,
        setBlockHeight,
        showResetCodeModel,
        setShowResetCodeModel,
        showPublishModal,
        setShowPublishModal,
        debugMode,
        setDebugMode,
        contractFilter,
        setContractFilter,
        handleSetContractFilter,
        selectedOption,
        handleOptionChange,
        isContractFilterValid,
        setIsContractFilterValid,
      }}
    >
      {children}
    </EditorContext.Provider>
  );
};
