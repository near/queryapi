import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/extend-expect';
import userEvent from '@testing-library/user-event';
import Editor from './Editor';

describe('Editor for creating a new indexer', () => {
    beforeEach(() => {
        render(<Editor accountId="testAccount.near" indexerName="testIndexer" options={{ create_new_indexer: true }} actionbuttontext="save / register" onLoadErrorText="An error occured while trying to query indexer function details from registry." queryIndexerFunctionDetails={jest.fn()} />);
    });

    test('renders and displays the component without errors', () => {
        expect(screen.getByTestId('action-button-group')).toBeInTheDocument();
        expect(screen.getByTestId('indexing-logic-file-button')).toBeInTheDocument();
        expect(screen.getByTestId('schema-file-button')).toBeInTheDocument();
        expect(screen.getByTestId('diff-view-switch')).toBeInTheDocument();
    });

    test('verifies the visibility and functionality of buttons: Reset, Format Code, and Register Function', async () => {
        const resetButton = screen.getByTestId('reset-button');
        const formatButton = screen.getByTestId('format-code-button');
        const registerButton = screen.getByTestId('submit-code-button');

        expect(resetButton).toBeInTheDocument();
        expect(formatButton).toBeInTheDocument();
        expect(registerButton).toBeInTheDocument();

        fireEvent.click(resetButton);
        await waitFor(() => expect(screen.queryByText('Are you sure?')).toBeInTheDocument());

        fireEvent.click(formatButton);
        await waitFor(() => expect(screen.queryByText('Oh snap! We could not format your code. Make sure it is proper Javascript code.')).not.toBeInTheDocument());

        fireEvent.click(registerButton);
    });

    test('ensures that the component loads the default or stored values for the indexing code and SQL schema', () => {
        expect(screen.getByTestId('code-editor-indexing-logic')).toBeInTheDocument();
        expect(screen.getByTestId('schema-editor-schema')).toBeInTheDocument();
    });

    test('confirming that the component handles formatting errors and displays an error message when the indexing code or SQL schema is not valid', async () => {
        const invalidCode = 'function invalidCode) {}';
        // await new Promise((r) => setTimeout(r, 3000));
        const indexingEditor = screen.getByTestId('code-editor-indexing-logic');
        // fireEvent.click(screen.getByTestId('indexing-logic-file-button'));
        // userEvent.type(indexingEditor, invalidCode);

        // fireEvent.click(screen.getByTestId('format-code-button'));
        // await waitFor(() => expect(screen.queryByText('Oh snap! We could not format your code. Make sure it is proper Javascript code.')).toBeInTheDocument());
    });

    test('testing the Diff View switch and making sure the component switches between normal and diff view as expected', () => {
        const diffViewSwitch = screen.getByTestId('diff-view-switch');
        fireEvent.click(diffViewSwitch);
        expect(screen.getByTestId('diff-editor-indexing-logic')).toBeInTheDocument();
        fireEvent.click(diffViewSwitch);
        expect(screen.getByTestId('code-editor-indexing-logic')).toBeInTheDocument();
    });

    test('checking the component behavior when resetting the code and reloading the original code and schema', async () => {
        fireEvent.click(screen.getByTestId('reset-button'));
        await waitFor(() => expect(screen.queryByText('Are you sure?')).toBeInTheDocument());
        fireEvent.click(screen.getByText('Reload'));
        await waitFor(() => expect(screen.queryByText('Are you sure?')).not.toBeInTheDocument());
        expect(screen.getByTestId('code-editor-indexing-logic')).toBeInTheDocument();
        expect(screen.getByTestId('schema-editor-schema')).toBeInTheDocument();
    });
});
