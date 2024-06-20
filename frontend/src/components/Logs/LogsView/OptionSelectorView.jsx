import React from 'react';
import { Row, Col, Form, Button } from 'react-bootstrap';
import { CheckmarkIcon } from '@/components/Common/Icons/CheckMarkIcon';
import ClearButtonContainer from '../LogsViewContainer/ClearButtonContainer';

const OptionSelectorView = ({ options, selectedOption, onOptionChange, handleOptionChange, handleClearSelection }) => {
  return (
    <Form>
      <Form.Group as={Row} controlId="radioButtons">
        {options.map((option, index) => (
          <Col key={index} xs={12} md={12}>
            <div
              variant='light'
              className={`w-100 p-2 d-flex justify-content-between align-items-center ${selectedOption === option ? 'bg-gray-100' : 'bg-white'}`}
              onClick={() => handleOptionChange(option)}
            >
              <span className="text-left font-inherit px-3 py-0 flex gap-x-2">
                {selectedOption === option && <CheckmarkIcon />}
                <div>{option}</div>
              </span>
              {selectedOption === option && (
                <ClearButtonContainer onClick={handleClearSelection} />
              )}
            </div>
          </Col>
        ))}
      </Form.Group>
    </Form>
  );
};

export default OptionSelectorView;