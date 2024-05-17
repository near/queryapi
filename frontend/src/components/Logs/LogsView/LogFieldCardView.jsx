import React from 'react';
import { Card, Accordion } from 'react-bootstrap';
import SeveritySelectorContainer from '../LogsViewContainer/SeveritySelectorContainer';
import LogTypeSelectorContainer from '../LogsViewContainer/LogTypeSelectorContainer';
import DateSelectorContainer from '../LogsViewContainer/DateSelectorContainer'

const LogFieldCardView = ({ severity, handleSeverityChange, logType, handleLogTypeChange, dateFilter, handleDateFilter }) => {
    return (
        <Card className="text-black">
            <Card.Header className="bg-white p-3">Log Fields</Card.Header>
            <Accordion defaultActiveKey={["0", "1", "2"]} alwaysOpen>
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
                <Accordion.Item eventKey="2">
                    <Accordion.Header >Date</Accordion.Header>
                    <Accordion.Body className='p-0'>
                        <DateSelectorContainer
                            selectedDate={dateFilter}
                            onDateChange={handleDateFilter}
                        />
                    </Accordion.Body>
                </Accordion.Item>
            </Accordion>
        </Card>
    );
};

export default LogFieldCardView;
