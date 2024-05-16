import React from 'react';
import { Row, Col, Form, Button } from 'react-bootstrap';
import { CheckmarkIcon } from './Icons/CheckMarkIcon';

const OptionSelectorView = ({ options, selectedOption, onOptionChange, handleOptionChange }) => {
    return (
        <Form>
            <Form.Group as={Row} controlId="radioButtons">
                {options.map((option, index) => (
                    <Col key={index} xs={12} md={12}>
                        <Button
                            variant='light'
                            className={`w-100 p-2 d-flex justify-content-between align-items-center ${selectedOption === option ? 'bg-gray-100' : 'bg-white'}`}
                            onClick={() => handleOptionChange(option)}
                        >
                            <span className="text-left font-inherit px-3 py-0">{option}</span>
                            {selectedOption === option && (
                                <CheckmarkIcon />
                            )}
                        </Button>
                    </Col>
                ))}
            </Form.Group>
        </Form>
    );
};

export default OptionSelectorView;
