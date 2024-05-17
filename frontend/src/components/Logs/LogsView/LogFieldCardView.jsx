import React from 'react';
import { Card, Accordion } from 'react-bootstrap';
import SeveritySelectorContainer from '../LogsViewContainer/SeveritySelectorContainer';
import LogTypeSelectorContainer from '../LogsViewContainer/LogTypeSelectorContainer';

const LogFieldCardView = ({ severity, handleSeverityChange, logType, handleLogTypeChange }) => {
    return (
        <Card className="text-black">
            <Card.Header className="bg-white p-3">Log Fields</Card.Header>
            <Accordion defaultActiveKey={["0", "1"]} alwaysOpen>
                <Accordion.Item eventKey="0">
                    <Accordion.Header >Severity</Accordion.Header>
                    <Accordion.Body className='p-0'>
                        <SeveritySelectorContainer
                            selectedSeverity={severity}
                            onSeverityChange={handleSeverityChange}
                        />
                    </Accordion.Body>
                </Accordion.Item>
                <Accordion.Item eventKey="1">
                    <Accordion.Header >Log Type</Accordion.Header>
                    <Accordion.Body className='p-0'>
                        <LogTypeSelectorContainer
                            selectedLogType={logType}
                            onLogTypeChange={handleLogTypeChange}
                        />
                    </Accordion.Body>
                </Accordion.Item>
            </Accordion>
        </Card>
    );
};

export default LogFieldCardView;
