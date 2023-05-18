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
import { BlockPicker } from "./BlockPicker";
const EditorButtons = ({
  accountId,
  indexerNameField,
  setIndexerNameField,
  options,
  setShowResetCodeModel,
  handleFormating,
  executeIndexerFunction,
  currentUserAccountId,
  getActionButtonText,
  submit,
  debugMode,
  heights,
  setHeights,
  setShowPublishModal,
  latestHeight,
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
      </ButtonToolbar>
      <ButtonToolbar className="px-3 pt-1" aria-label="Debug Mode Options">
        {debugMode && (
          <BlockPicker
            heights={heights}
            setHeights={setHeights}
            executeIndexerFunction={executeIndexerFunction}
            latestHeight={latestHeight}
          />
        )}
      </ButtonToolbar>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <ButtonToolbar
          className="px-3 py-1 flex justify-center"
          aria-label="Actions for Editor"
        >
          <ButtonGroup
            className="inline-block"
            aria-label="Action Button Group"
          >
            <OverlayTrigger
              placement="bottom"
              overlay={<Tooltip>Reset Changes To Code</Tooltip>}
            >
              <Button
                size="sm"
                style={{ paddingRight: "2px" }}
                className="flex align-center"
                variant="secondary"
                onClick={() => setShowResetCodeModel(true)}
              >
                <ArrowCounterclockwise size={22} />
                Reset Changes
              </Button>
            </OverlayTrigger>

            <OverlayTrigger
              placement="bottom"
              overlay={<Tooltip>Format Code</Tooltip>}
            >
              <Button
                size="sm"
                variant="secondary"
                className="flex align-center"
                onClick={() => handleFormating()}
              >
                <Justify style={{ paddingRight: "2px" }} size={24} />
                Format Code
              </Button>
            </OverlayTrigger>
            {currentUserAccountId && (
              <OverlayTrigger
                placement="bottom"
                overlay={<Tooltip>{getActionButtonText()}</Tooltip>}
              >
                <Button
                  variant="primary"
                  className="px-3"
                  onClick={() => setShowPublishModal(true)}
                >
                  {getActionButtonText()}
                </Button>
              </OverlayTrigger>
            )}
          </ButtonGroup>
        </ButtonToolbar>
      </div>
    </>
  );
};

export default EditorButtons;
