import React, { useContext, useState, useEffect } from "react";
import { InputGroup, Alert, Warn } from "react-bootstrap";
import Form from "react-bootstrap/Form";

import { IndexerDetailsContext } from '../../contexts/IndexerDetailsContext';
import { validateContractIds } from "../../utils/validators";

const  GENESIS_BLOCK_HEIGHT = 9820210;

const START_BLOCK = {
  CONTINUE: "startBlockContinue",
  LATEST: "startBlockLatest",
  HEIGHT: "startBlockHeight",
}

const IndexerConfigOptions = ({ updateConfig }) => {
  const { indexerDetails, showPublishModal, isCreateNewIndexer, latestHeight } = useContext(IndexerDetailsContext); 
  const [blockHeight, setBlockHeight] = useState("0");
  const [contractFilter, setContractFilter] = useState("social.near");
  const [startBlock, setStartBlock] = useState(START_BLOCK.LATEST);
  const [isContractFilterValid, setIsContractFilterValid] = useState(true);
  const [indexerNameField, setIndexerNameField] = useState(indexerDetails.indexerName || "");
  const [blockHeightError, setBlockHeightError] = useState(null)

  useEffect(() => {
    if (indexerDetails.rule?.affected_account_id) {
      setContractFilter(indexerDetails.rule.affected_account_id)
    }

    if (indexerDetails.startBlock?.HEIGHT) {
      setStartBlock(START_BLOCK.HEIGHT)
      setBlockHeight(indexerDetails.startBlock.HEIGHT)
      return;
    }

    if (indexerDetails.startBlock == "LATEST") {
      setStartBlock(START_BLOCK.LATEST)
      return;
    }

    if (indexerDetails.startBlock == "CONTINUE") {
      setStartBlock(START_BLOCK.CONTINUE)
      return;
    }
  }, [indexerDetails])

  const onChangeStartBlock = (e) => {
    setStartBlock(e.target.value)

    if (e.target.value === START_BLOCK.CONTINUE) {
      handleSetContractFilter(indexerDetails.rule.affected_account_id)
    }
  }

  function handleSetContractFilter(contractFilter) {
    setContractFilter(contractFilter);
    const isContractFilterValid = validateContractIds(contractFilter);
    setIsContractFilterValid(isContractFilterValid);
  }

  useEffect(() => {
    if (startBlock == START_BLOCK.HEIGHT && blockHeight <= GENESIS_BLOCK_HEIGHT) {
      setBlockHeightError(() => `Choose a block height greater than the Genesis BlockHeight ${GENESIS_BLOCK_HEIGHT}. Latest Block Height is ${latestHeight}`)
      return
    }
    setBlockHeightError(() => null)
    updateConfig(indexerNameField, contractFilter, blockHeight, startBlock)
    },
    [indexerNameField, contractFilter, startBlock, blockHeight]
  )

  return (
    <>
      <InputGroup size="sm" >
        <InputGroup.Text> Indexer Name  </InputGroup.Text>
        <Form.Control
          type="text"
          placeholder="indexer_name"
          aria-label="IndexerName"
          value={indexerNameField}
          disabled={!isCreateNewIndexer && showPublishModal}
          onChange={(e) => setIndexerNameField(e.target.value.toLowerCase().trim())}
        />
      </InputGroup>
      <InputGroup size="sm" className="pt-3">
        <InputGroup.Checkbox
          value={START_BLOCK.LATEST}
          checked={startBlock === START_BLOCK.LATEST}
          onChange={onChangeStartBlock}
          aria-label="Checkbox for following text input"
        />
        <InputGroup.Text>Start from latest block</InputGroup.Text>
      </InputGroup>
      <InputGroup size="sm" className="pt-3">
        <InputGroup.Checkbox
          value={START_BLOCK.CONTINUE}
          checked={startBlock === START_BLOCK.CONTINUE}
          onChange={onChangeStartBlock}
          aria-label="Checkbox for following text input"
        />
        <InputGroup.Text>Continue from last processed block</InputGroup.Text>
      </InputGroup>
      <InputGroup size="sm" className="pt-3">
        <InputGroup.Checkbox
          value={START_BLOCK.HEIGHT}
          checked={startBlock === START_BLOCK.HEIGHT}
          onChange={onChangeStartBlock}
          aria-label="Checkbox for following text input"
        />
        <InputGroup.Text>Start from block height</InputGroup.Text>
        <Form.Control
          value={blockHeight}
          onChange={(e) => setBlockHeight(parseInt(e.target.value))}
          type="number"
        />
        {blockHeightError && (
          <Alert className="px-3 mt-3" variant="danger">
            {blockHeightError}
          </Alert>
        )}
      </InputGroup>
      <InputGroup size="sm" hasValidation={true} className="pt-3">
        <InputGroup.Text>Contract Filter</InputGroup.Text>
        <Form.Control
          value={startBlock === START_BLOCK.CONTINUE ? indexerDetails.rule.affected_account_id : contractFilter}
          onChange={(e) => handleSetContractFilter(e.target.value)}
          isValid={isContractFilterValid}
          type="text"
          placeholder="social.near"
          required={true}
          disabled={startBlock === START_BLOCK.CONTINUE}
        />
        <Form.Control.Feedback type="invalid">
          Please provide a valid contract name.
        </Form.Control.Feedback>
        {startBlock === START_BLOCK.CONTINUE && (
          <Alert className="px-3 mt-3" variant="warning">
            Contract filter cannot be changed for &quot;Continue&quot; option.
          </Alert>
        )}
      </InputGroup>
    </>
  );
};

export default IndexerConfigOptions;
