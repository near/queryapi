import React from 'react';
import { Card, Accordion } from 'react-bootstrap';
import SeveritySelectorContainer from '../LogsViewContainer/SeveritySelectorContainer';
import LogTypeSelectorContainer from '../LogsViewContainer/LogTypeSelectorContainer';
import DateSelectorContainer from '../LogsViewContainer/DateSelectorContainer'
import styled from 'styled-components';

const CustomAccordianWrapper = styled.div`
    .accordion-button {
        background-color: #f8f8f8 !important;
    }
    .accordion-item:first-of-type {
        border-top-left-radius: 0 !important;
        border-top-right-radius: 0 !important;
        border-collapse: collapse !important;;
    }
    .accordion-item:first-of-type>.accordion-header .accordion-button {
        border-top-left-radius: 0 !important;
        border-top-right-radius: 0 !important;
    }
    .accordian{
        .--bs-accordion-border-width : 0 !important;
    }
`;

const LogFieldCardView = ({ severity, handleSeverityChange, logType, handleLogTypeChange, dateFilter, handleDateFilter }) => {
    return (
        <Card className="text-black">
            <Card.Header className="bg-white p-3">Filters</Card.Header>
            <CustomAccordianWrapper>
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
            </CustomAccordianWrapper>
        </Card>
    );
};

export default LogFieldCardView;
