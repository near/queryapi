import Editor from '../../components/Editor';

const CreateNewIndexer = () => {
  return (
    <Editor
      options={{ create_new_indexer: true }}
      actionButtonText="Create New Indexer"
      theme="vs-dark"
    />);
};

export default CreateNewIndexer;
