import React, { useState } from "react";
import {
  OverlayTrigger,
  Tooltip,
  Button,
  Badge,
  InputGroup,
  FormControl,
  Dropdown,
  ButtonGroup,
} from "react-bootstrap";

import { Play, Plus, Stop } from "react-bootstrap-icons";

export const BlockPicker = ({
  heights = [],
  setHeights,
  executeIndexerFunction,
  latestHeight,
  isExecuting,
  stopExecution,
}) => {
  const [inputValue, setInputValue] = useState(String(latestHeight));

  const addHeight = () => {
    if (heights.length < 10 && inputValue !== "") {
      setHeights([...heights, inputValue]);
      setInputValue("");
    }
  };

  return (
    <div>
      <div className="w-100 flex">
        <InputGroup className="fit-content">
          <FormControl
            placeholder="Block height"
            aria-label="Block height"
            aria-describedby="basic-addon2"
            type="number"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
          <OverlayTrigger
            placement="bottom"
            overlay={<Tooltip>Add Block To Debug List</Tooltip>}
          >
            <Button variant="outline-secondary" onClick={addHeight}>
              <Plus size={24} style={{ cursor: "pointer" }} />
            </Button>
          </OverlayTrigger>
          {isExecuting === true &&
            <OverlayTrigger
              placement="bottom"
              overlay={<Tooltip>Stop Indexer Execution</Tooltip>}
            >

              <Button variant="outline-secondary" onClick={() => stopExecution()}>
                <Stop size={24} style={{ cursor: "pointer" }} />
              </Button>
            </OverlayTrigger>
          }
          {!isExecuting && <OverlayTrigger
            placement="bottom"
            overlay={<Tooltip>Test Indexer Function In Browser</Tooltip>}
          >
            <Dropdown as={ButtonGroup}>
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  console.log("testing")
                  if (heights.length > 0) {
                    console.log("tesing selected")
                    executeIndexerFunction("selected")
                  } else if (inputValue) {
                    console.log("testing specific")
                    executeIndexerFunction("specific", inputValue)
                  } else {
                    console.log("testing latest")
                    executeIndexerFunction("latest")
                  }
                }
                }
              >
                <Play size={24} />
              </Button>
              <Dropdown.Toggle split variant="primary" id="dropdown-split-basic" />
              <Dropdown.Menu>
                <Dropdown.Item onClick={() => executeIndexerFunction("latest")} href="#/action-1">Execute From Latest Block Height</Dropdown.Item>
                <Dropdown.Item onClick={() => executeIndexerFunction("specific", inputValue)} href="#/action-3">Execute From Starting Block Height</Dropdown.Item>
                <Dropdown.Item onClick={() => executeIndexerFunction("selected")} href="#/action-2">Execute Selected Block Heights</Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          </OverlayTrigger>
          }


        </InputGroup>
      </div>
    </div>
  );
};
