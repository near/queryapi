import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import BlockHeightOptions from './BlockHeightOptionsInputGroup';

describe('BlockHeightOptions component', () => {
    test('renders correctly', () => {
        const handleOptionChange = jest.fn();
        const setBlockHeight = jest.fn();
        render(<BlockHeightOptions
            selectedOption="latestBlockHeight"
            handleOptionChange={handleOptionChange}
            blockHeight={1000}
            setBlockHeight={setBlockHeight}
        />);

        expect(screen.getByTestId("specific-blockheight-checkbox")).toBeInTheDocument();
        expect(screen.getByText("From Latest Block Height")).toBeInTheDocument();
        expect(screen.getByText("Specific Block Height")).toBeInTheDocument();
        expect(screen.getByTestId("latest-blockheight-checkbox")).toBeInTheDocument();
    });

    test('handles option change correctly', () => {
        const handleOptionChange = jest.fn();
        const setBlockHeight = jest.fn();

        render(<BlockHeightOptions
            selectedOption="latestBlockHeight"
            handleOptionChange={handleOptionChange}
            blockHeight={1000}
            setBlockHeight={setBlockHeight}
        />);

        fireEvent.click(screen.getByTestId("latest-blockheight-checkbox"));
        expect(handleOptionChange).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getAllByRole("checkbox")[1]);
        expect(handleOptionChange).toHaveBeenCalledTimes(2);
    });

    test('handles block height input change correctly', () => {
        const handleOptionChange = jest.fn();
        const setBlockHeight = jest.fn();

        render(<BlockHeightOptions
            selectedOption="specificBlockHeight"
            handleOptionChange={handleOptionChange}
            blockHeight={1000}
            setBlockHeight={setBlockHeight}
        />);

        fireEvent.change(screen.getByTestId("blockheight-input"), { target: { value: '2000' } });
        expect(setBlockHeight).toHaveBeenCalledTimes(1);
        expect(setBlockHeight).toHaveBeenCalledWith('2000');
    });
});
