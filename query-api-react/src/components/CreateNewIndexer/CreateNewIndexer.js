import InputGroup from 'react-bootstrap/InputGroup';

import Editor from '../../components/Editor';




const CreateNewIndexer = (props) => {

    // Info about how to write inside SQL editor
    const info = "Use the following editor to specify tables and their columns you would like to create. Once you register your function, you wil NOT be able to change this. "

    return (
        <>
            {/* <div className="container"> */}
            <Editor
                accountId={props.accountId}
                options={{ create_new_indexer: true }}
                actionButtonText="Create New Indexer"
                theme="vs-dark"
            />
            {/* </div> */}

        </>

    )
};

export default CreateNewIndexer;
