// EditorButtons.jsx

import React from "react";
import {
  ButtonToolbar,
  ButtonGroup,
  OverlayTrigger,
  Tooltip,
  Button,
} from "react-bootstrap";
import { ArrowCounterclockwise, Justify } from "react-bootstrap-icons";
import IndexerDetailsGroup from "../Form/IndexerDetailsGroup";
import BlockHeightOptions from "../Form/BlockHeightOptionsInputGroup";
import { BlockPicker } from "./BlockPicker";
const EditorButtons = ({
  accountId,
  indexerNameField,
  setIndexerNameField,
  options,
  selectedOption,
  handleOptionChange,
  blockHeight,
  setBlockHeight,
  setShowResetCodeModel,
  handleFormating,
  executeIndexerFunction,
  currentUserAccountId,
  getActionButtonText,
  submit,
  debugMode,
  heights,
  setHeights,
  contractFilter,
  handleSetContractFilter,
  isContractFilterValid,
}) => {
  return (
    <>
      <ButtonToolbar
        className="px-3 pt-3 pb-1 flex-col"
        aria-label="Actions for Editor"
      >
        {options.create_new_indexer && (
          <IndexerDetailsGroup
            accountId={accountId}
            indexerNameField={indexerNameField}
            setIndexerNameField={setIndexerNameField}
          />
        )}
        <BlockHeightOptions
          selectedOption={selectedOption}
          handleOptionChange={handleOptionChange}
          blockHeight={blockHeight}
          setBlockHeight={setBlockHeight}
          handleSetContractFilter={handleSetContractFilter}
          contractFilter={contractFilter}
          isContractFilterValid={isContractFilterValid}
        />
      </ButtonToolbar>
      <ButtonToolbar
        className="px-3 py-1 flex-col"
        aria-label="Actions for Editor"
      >
        <ButtonGroup className="inline-block" aria-label="Action Button Group">
          <OverlayTrigger overlay={<Tooltip>Reset Changes To Code</Tooltip>}>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setShowResetCodeModel(true)}
            >
              <ArrowCounterclockwise size={24} />
            </Button>
          </OverlayTrigger>

          <OverlayTrigger overlay={<Tooltip>Format Code</Tooltip>}>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => handleFormating()}
            >
              <Justify size={24} />
            </Button>
          </OverlayTrigger>
          {currentUserAccountId && (
            <OverlayTrigger
              overlay={<Tooltip>{getActionButtonText()}</Tooltip>}
            >
              <Button
                variant="primary"
                className="px-3"
                onClick={() => submit()}
              >
                {getActionButtonText()}
              </Button>
            </OverlayTrigger>
          )}
        </ButtonGroup>
      </ButtonToolbar>
      <ButtonToolbar className="px-3 pt-1" aria-label="Debug Mode Options">
        {debugMode && (
          <BlockPicker
            heights={heights}
            setHeights={setHeights}
            executeIndexerFunction={executeIndexerFunction}
          />
        )}
      </ButtonToolbar>
    </>
  );
};

export default EditorButtons;
