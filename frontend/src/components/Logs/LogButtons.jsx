import React, { useContext } from "react";
import {
  Breadcrumb,
  Button,
  Form,
  InputGroup,
  Navbar,
  Container,
  Col,
  Row,
  ButtonGroup,
  OverlayTrigger,
  Tooltip,
  Badge,
} from "react-bootstrap";
import {
  ArrowCounterclockwise,
  Justify,
  TrashFill,
  XCircle,
  NodePlus,
  Code,
} from "react-bootstrap-icons";
import { IndexerDetailsContext } from "../../contexts/IndexerDetailsContext";

const LogButtons = ({
  currentUserAccountId,
  heights,
  setHeights,
  latestHeight,
  isUserIndexer,
  reloadData
}) => {
  const {
    indexerName,
    accountId,
    indexerDetails,
    debugMode,
    setShowLogsView,
    showLogsView,
  } = useContext(IndexerDetailsContext);

  const removeHeight = (index) => {
    setHeights(heights.filter((_, i) => i !== index));
  };

  return (
    <>
      <Navbar bg="light" variant="light">
        <Container
          style={{
            display: "flex",
            flexDirection: "column",
            margin: "0px",
            marginBottom: "5px",
            maxWidth: "100%",
          }}
        >
          <Row className="w-100">
            <Col
              style={{
                display: "flex",
                justifyContent: "start",
                flexDirection: "column",
              }}
            >
              <Breadcrumb className="flex">
                <Breadcrumb.Item className="flex align-center " href="#">
                  {accountId}
                </Breadcrumb.Item>
                {indexerName && (
                  <Breadcrumb.Item href="#" active style={{ display: "flex" }}>
                    {indexerName}
                  </Breadcrumb.Item>
                )}
              </Breadcrumb>
              {
                <InputGroup size="sm" style={{ width: "fit-content" }}>
                  <InputGroup.Text> Contract Filter</InputGroup.Text>
                  <Form.Control
                    value={indexerDetails.rule.affected_account_id}
                    disabled={true}
                    type="text"
                    placeholder="social.near"
                  />
                </InputGroup>
              }
            </Col>
            <Col
              style={{ display: "flex", justifyContent: "end", height: "40px" }}
            >
              <ButtonGroup
                className="inline-block"
                aria-label="Action Button Group"
              >
                <>
                  <OverlayTrigger
                    placement="bottom"
                    overlay={<Tooltip>Reload Data</Tooltip>}
                  >
                    <Button
                      size="sm"
                      variant="secondary"
                      className="flex align-center"
                      onClick={() => reloadData()}
                    >
                      <ArrowCounterclockwise style={{ paddingRight: "2px" }} size={24} />
                      Reload
                    </Button>
                  </OverlayTrigger>
                  <OverlayTrigger
                    placement="bottom"
                    overlay={<Tooltip>Open Editor</Tooltip>}
                  >
                    <Button
                      size="sm"
                      variant="secondary"
                      className="flex align-center"
                      onClick={() => setShowLogsView(false)}
                    >
                      <Code style={{ paddingRight: "2px" }} size={24} />
                      Go To Editor
                    </Button>
                  </OverlayTrigger>
                </>
              </ButtonGroup>
            </Col>
          </Row>
          {debugMode && heights.length > 0 && (
            <Row className="w-100 pt-2">
              <div>
                {heights.map((height, index) => (
                  <Badge pill bg="secondary" className="mx-1 mr-2" key={index}>
                    {height}
                    <XCircle
                      size={18}
                      style={{ paddingLeft: "4px", cursor: "pointer" }}
                      onClick={() => removeHeight(index)}
                    />
                  </Badge>
                ))}
              </div>
            </Row>
          )}
        </Container>
      </Navbar>
    </>
  );
};

export default LogButtons;
