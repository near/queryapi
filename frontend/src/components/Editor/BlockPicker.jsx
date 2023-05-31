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
          {!isExecuting && (<>          <OverlayTrigger
            placement="bottom"
            overlay={<Tooltip>Add Block To Debug List</Tooltip>}
          >
            <Button variant="outline-secondary" onClick={addHeight}>
              <Plus size={24} style={{ cursor: "pointer" }} />
            </Button>
          </OverlayTrigger>
              <Dropdown as={ButtonGroup}>
                          <OverlayTrigger
              placement="bottom"
              overlay={<Tooltip>
 {
                (() => {
                    if(heights.length > 0) {
                        return "Test Indexer Function With Debug List"
                    } else if (inputValue) {
                        return "Test Indexer Function With Specific Block"
                    } else {
                        return "Follow the Tip of the Nework"
                    }
                })()
            }
        </Tooltip>}
            >

                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    if (heights.length > 0) {
                      executeIndexerFunction("selected")
                    } else if (inputValue) {
                      executeIndexerFunction("specific", inputValue)
                    } else {
                      executeIndexerFunction("latest")
                    }
                  }
                  }
                >
                  <Play size={24} />
                </Button>
                            </OverlayTrigger>

                <Dropdown.Toggle split variant="primary" id="dropdown-split-basic" />
                <Dropdown.Menu>
                  <Dropdown.Item onClick={() => executeIndexerFunction("latest")}>Follow The Network</Dropdown.Item>
                  <Dropdown.Item disabled={heights.length === 0} onClick={() => executeIndexerFunction("selected")}>Execute From Debug List</Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown>
          </>)
          }


      </InputGroup>
    </div>
    </div >
  );
};
