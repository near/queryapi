import React from "react";
import {
  Card,
  Badge,
  ListGroup,
  OverlayTrigger,
  Tooltip,
} from "react-bootstrap";
import { useQuery, gql } from "@apollo/client";

// const Status = ({ accountId, functionName, latestHeight }) => {
//   const hasuraRole = accountId.replace(/[^a-zA-Z0-9]/g, '_').replace(/^([0-9])/, '_$1');
//   const queryName = `${functionName.replace(/[^a-zA-Z0-9]/g, '_')}_sys_metadata`;
//   const GET_METADATA = gql`
//     query getMetadata {
//       ${queryName} {
//         attribute
//         value
//       }
//     }
//   `;
//   const { loading, error, data } = useQuery(GET_METADATA, {
//     context: {
//       headers: {
//         "x-hasura-role": hasuraRole,
//       },
//     }
//   });

//   if (loading) return <p>Loading...</p>;
//   if (error) return <p>Error : {error.message}</p>;
//   if (data) {
//     const attributeMap = data[queryName].reduce((acc, item) => {
//       acc.set(item.attribute, item.value);
//       return acc;
//     }, new Map());
//     return (
//       <div>
//         {attributeMap && (
//             <Card
//               className="text-center"
//               style={{
//                 margin: "20px",
//                 padding: "20px",
//                 marginTop: "20px",
//               }}
//             >
//               <Card.Header as="h5">
//                 Indexer Status: {attributeMap.get("STATUS")}
//               </Card.Header>
//               <ListGroup
//                 variant="flush"
//                 style={{
//                   textAlign: "left",
//                 }}
//               >
//                 <OverlayTrigger
//                   placement="bottom"
//                   overlay={<Tooltip> {
//                     attributeMap.get("LAST_PROCESSED_BLOCK_HEIGHT")
//                     ? `Current Block Height of Near is ${latestHeight}. Your indexer has a gap of ${latestHeight - attributeMap.get("LAST_PROCESSED_BLOCK_HEIGHT")} Blocks`
//                     : 'Indexer needs to run successfully to update block height' } </Tooltip>}
//                 >
//                 <ListGroup.Item>
//                   Current Block Height:{" "}
//                   <strong>{attributeMap.get("LAST_PROCESSED_BLOCK_HEIGHT") ?? "N/A"}</strong>
//                 </ListGroup.Item>
//                 </OverlayTrigger>
//                 <ListGroup.Item>
//                   <OverlayTrigger
//                     placement="bottom"
//                     overlay={<Tooltip>{attributeMap.get("STATUS") === "RUNNING" ? "Indexer is operating normally" : "Indexer stopped due to errors. Check Logs for more details."}</Tooltip>}
//                   >
//                     <>
//                       Status:{" "}
//                       <Badge
//                         pill
//                         bg={attributeMap.get("STATUS") === "RUNNING" ? "success" : "danger"}
//                       >
//                         {attributeMap.get("STATUS")}
//                       </Badge>
//                     </>
//                   </OverlayTrigger>
//                 </ListGroup.Item>
//               </ListGroup>
//             </Card>
//           )}
//       </div>
//     );
//   }
// };
const Status = ({ functionName, latestHeight }) => {
  const GET_STATUS = gql`
    query GetState($_functionName: String!) {
      indexer_state(where: { function_name: { _eq: $_functionName } }) {
        status
        function_name
        current_block_height
        current_historical_block_height
      }
    }
  `;
  const { loading, error, data } = useQuery(GET_STATUS, {
    variables: {
      _functionName: functionName,
    },
  });

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error : {error.message}</p>;
  return (
    <div>
      {data &&
        data.indexer_state.map((item, index) => (
          <Card
            key={index}
            className="text-center"
            style={{
              margin: "20px",
              padding: "20px",
              marginTop: "20px",
            }}
          >
            <Card.Header as="h5">
              Indexer Status: {item.function_name}
            </Card.Header>
            <ListGroup
              variant="flush"
              style={{
                textAlign: "left",
              }}
            >
              <OverlayTrigger
                placement="bottom"
                overlay={<Tooltip> Current Block Height of Near is {latestHeight}. Your indexer has a gap of {latestHeight - item.current_block_height} Blocks</Tooltip>}
              >
              <ListGroup.Item>
                Current Block Height:{" "}
                <strong>{item.current_block_height}</strong>
              </ListGroup.Item>
              </OverlayTrigger>
              <ListGroup.Item>
                Historical Block Height:{" "}
                <strong>{item.current_historical_block_height}</strong>
              </ListGroup.Item>
              <ListGroup.Item>
                <OverlayTrigger
                  placement="bottom"
                  overlay={<Tooltip>{item.status === "RUNNING" ? "Indexer is operating normally" : "Indexer stopped due to errors. Check Logs for more details."}</Tooltip>}
                >
                  <>
                    Status:{" "}
                    <Badge
                      pill
                      bg={item.status === "RUNNING" ? "success" : "danger"}
                    >
                      {item.status}
                    </Badge>
                  </>
                </OverlayTrigger>
              </ListGroup.Item>
            </ListGroup>
          </Card>
        ))}
    </div>
  );
};

export default Status;
