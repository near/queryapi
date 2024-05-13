

export const getIndexerQuery = (tableName) => `
query GetIndexerQuery($limit: Int, $offset: Int) {
  ${tableName}(limit: $limit, offset: $offset, order_by: {timestamp: desc}) {
    block_height
    level
    message
    timestamp
    type
  }
  ${tableName}_aggregate {
    aggregate {
      count
    }
  }
}`;

export const getPaginationQuery = (tableName) => `
query GetPaginationQuery($limit: Int, $offset: Int) {
  ${tableName}(limit: $limit, offset: $offset, order_by: {timestamp: desc}) {
    block_height
    level
    message
    timestamp
    type
  }
  ${tableName}_aggregate {
    aggregate {
      count
    }
  }
}`;

export const getBlockHeightAndMessageSearchQuery = (tableName, keyword) => `
query getBlockHeightAndMessageSearchQuery($limit: Int, $offset: Int) {
  ${tableName}(limit: $limit, offset: $offset, where: { _or: [
    { message: { _ilike: "%${keyword}%" } },
    { block_height: { _eq: ${keyword} } }
  ]
}, order_by: { timestamp: desc }) {
    block_height
    level
    message
    timestamp
    type
  }
  
  ${tableName}_aggregate(where: { _or: [
    { message: { _ilike: "%${keyword}%" } },
    { block_height: { _eq: ${keyword} } }
  ]
}) {
    aggregate {
      count
    }
  }
}`;

export const getMessageSearchQuery = (tableName, keyword) => `
query getMessageSearchQuery($limit: Int, $offset: Int) {
  ${tableName}(limit: $limit, offset: $offset, where: {message: {_ilike: "%${keyword}%"}}, order_by: { timestamp: desc }) {
    block_height
    level
    message
    timestamp
    type
  }
  
  ${tableName}_aggregate(where: { message: { _ilike: "%${keyword}%" } }) {
    aggregate {
      count
    }
  }
}`;