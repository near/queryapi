import React from 'react';
import { Row, Col, Form, Button } from 'react-bootstrap';
import { CheckmarkIcon } from './CheckMarkIcon';
import { ClearIcon } from './ClearIcon';

function RadioButtonGroup({ options, selectedOption, onOptionChange }) {
    console.log(options, selectedOption, onOptionChange)
    const handleOptionChange = (value) => {
        onOptionChange(value);
    };

    const handleClearSelection = () => {
        onOptionChange("");
    };

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
                            <span className="text-left font-inherit px-3">{option}</span>
                            {selectedOption === option && (
                                <div className="flex items-center space-x-2">
                                    <CheckmarkIcon />
                                    <ClearIcon onClick={handleClearSelection} />
                                </div>
                            )}
                        </Button>
                    </Col>
                ))}
            </Form.Group>
        </Form>

    );
}

export default RadioButtonGroup;