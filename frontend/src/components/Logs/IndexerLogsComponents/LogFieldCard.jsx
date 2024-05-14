import React from 'react';
import { Card, Accordion } from 'react-bootstrap';
import SeverityRadioButtonGroup from './SeverityRadioButtonGroup';
import LogTypeRadionButtonGroup from './LogTypeRadioButtonGroup';


const LogFieldsCard = ({ severity, handleSeverityChange, logType, handleLogTypeChange }) => {
    return (
        <Card className="text-black">
            <Card.Header className="bg-white p-3">Log Fields</Card.Header>
            <Accordion defaultActiveKey={[]} alwaysOpen>
                <Accordion.Item eventKey="0">
                    <Accordion.Header >Severity</Accordion.Header>
                    <Accordion.Body className='p-0'>
                        <SeverityRadioButtonGroup
                            selectedSeverity={severity}
                            onSeverityChange={handleSeverityChange}
                        />
                    </Accordion.Body>
                </Accordion.Item>
                <Accordion.Item eventKey="1">
                    <Accordion.Header >Log Type</Accordion.Header>
                    <Accordion.Body className='p-0'>
                        <LogTypeRadionButtonGroup
                            selectedLogType={logType}
                            onLogTypeChange={handleLogTypeChange}
                        />
                    </Accordion.Body>
                </Accordion.Item>
            </Accordion>
        </Card>
    );
};

export default LogFieldsCard;
