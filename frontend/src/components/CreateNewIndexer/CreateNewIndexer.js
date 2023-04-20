import Editor from '../../components/Editor';

const CreateNewIndexer = (props) => {
  return (
    <Editor
      accountId={props.accountId}
      options={{ create_new_indexer: true }}
      actionButtonText="Create New Indexer"
      theme="vs-dark"
    />);
};

export default CreateNewIndexer;
