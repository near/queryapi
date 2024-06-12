import dynamic from 'next/dynamic';

const DynamicGraphiQLPlayground = dynamic(
  () => import('./graphiql.jsx').then(mod => mod.GraphqlPlayground),
  { ssr: false } // This will load the component only on client side
);

function GraphqlPlayground() {
  return (
    <div style={{ display: "block", width: "100%" }}>
      <DynamicGraphiQLPlayground />
    </div>
  );
}

export default GraphqlPlayground;
