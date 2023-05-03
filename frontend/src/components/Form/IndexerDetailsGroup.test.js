import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import IndexerDetailsGroup from './IndexerDetailsGroup';

describe('IndexerDetailsGroup Component', () => {
    const defaultProps = {
        accountId: '12345',
        indexerNameField: 'TestIndexer',
        setIndexerNameField: jest.fn(),
        isCreateNewIndexerPage: false,
    };

    test('renders AccountID input field with correct value', () => {
        render(<IndexerDetailsGroup {...defaultProps} />);
        const accountIdInput = screen.getByTestId('account-id-input');
        expect(accountIdInput).toHaveValue('12345');
    });

    test('renders Indexer Name input field with correct value', () => {
        render(<IndexerDetailsGroup {...defaultProps} />);
        const indexerNameInput = screen.getByTestId('indexer-name-input');
        expect(indexerNameInput).toHaveValue('TestIndexer');
    });

    test('Indexer Name input field is disabled when isCreateNewIndexerPage is false', () => {
        render(<IndexerDetailsGroup {...defaultProps} />);
        const indexerNameInput = screen.getByTestId("indexer-name-input");
        expect(indexerNameInput).toBeDisabled();
    });

    test('Indexer Name input field is enabled when isCreateNewIndexerPage is true', () => {
        render(<IndexerDetailsGroup {...defaultProps} isCreateNewIndexerPage={true} />);
        const indexerNameInput = screen.getByTestId('indexer-name-input')
        expect(indexerNameInput).not.toBeDisabled();
    });

    test('onChange event updates indexerNameField', () => {
        render(<IndexerDetailsGroup {...defaultProps} isCreateNewIndexerPage={true} />);
        const indexerNameInput = screen.getByTestId('indexer-name-input')

        fireEvent.change(indexerNameInput, { target: { value: 'NewIndexer' } });
        expect(defaultProps.setIndexerNameField).toHaveBeenCalledWith('NewIndexer');
    });
});
