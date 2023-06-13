import dynamic from 'next/dynamic';

const DynamicGraphiQLWithExporter = dynamic(
  () => import('./graphiql.jsx'), 
  { ssr: false } // This will load the component only on client side
);

function GraphqlPlayground({  }) {
  return (
    <div style={{display: "block", width:"100%"}}>
      <DynamicGraphiQLWithExporter />
    </div>
  );
}

export default GraphqlPlayground;
