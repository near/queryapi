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

export const getIndexerQueryWithSeverity = (tableName, severity) => `
  query getIndexerLogsWithSeverity($limit: Int, $offset: Int) {
      ${tableName}(limit: $limit, offset: $offset, order_by: {timestamp: desc}, where: {level: {_eq: ${severity}}}) {
        block_height
        level
        message
        timestamp
        type
      }
      ${tableName}_aggregate(where: {level: {_eq: ${severity}}}) {
        aggregate {
          count
        }
      }
    }  
  `;

export const getMessageSearchQueryWithSeverity = (tableName, keyword, severity) => `
  query getMessageSearchQueryWithSeverity($limit: Int, $offset: Int) {
      ${tableName}(limit: $limit, offset: $offset, where: {message: {_ilike: "%${keyword}%"}, _and: {level: {_eq: ${severity}}}}, order_by: {timestamp: desc}) {
        block_height
        level
        message
        timestamp
        type
      }
      ${tableName}_aggregate(where: {message: {_ilike: "%${keyword}%"}, _and: {level: {_eq: ${severity}}}}) {
        aggregate {
          count
        }
      }
    }
  `;

export const getBlockHeightAndMessageSearchQueryWithSeverity = (tableName, keyword, severity) => `
  query getBlockHeightAndMessageSearchQuery($limit: Int, $offset: Int) {
      ${tableName}(limit: $limit, offset: $offset, where: {_or: [{message: {_ilike: "%${keyword}%"}}, {block_height: {_eq: ${keyword}}}], _and: {level: {_eq: ${severity}}}}, order_by: {timestamp: desc}) {
        block_height
        level
        message
        timestamp
        type
      }
      ${tableName}_aggregate(where: {_or: [{message: {_ilike: "%${keyword}%"}}, {block_height: {_eq: ${keyword}}}], _and: {level: {_eq: ${severity}}}}) {
        aggregate {
          count
        }
      }
    }
  `;

export const getIndexerQueryWithLogType = (tableName, logType) => `
  query getIndexerLogsWithLevel($limit: Int, $offset: Int) {
    ${tableName}(limit: $limit, offset: $offset, order_by: {timestamp: desc}, where: {type: {_eq: ${logType}}}) {
      block_height
      level
      message
      timestamp
      type
    }
    ${tableName}_aggregate(where: {type: {_eq: ${logType}}}) {
      aggregate {
        count
      }
    }
  }    
  `;

export const getIndexerQueryWithSeverityAndLogType = (tableName, severity, logType) => `
  query getIndexerQueryWithSeverityAndLogType($limit: Int, $offset: Int) {
    ${tableName}(
      limit: $limit
      offset: $offset
      order_by: {timestamp: desc}
      where: {type: {_eq:  ${logType}}, _and: {level: {_eq: ${severity}}}}
    ) {
      block_height
      level
      message
      timestamp
      type
    }
    ${tableName}_aggregate(
      where: {type: {_eq: ${logType}}, _and: {level: {_eq: ${severity}}}}
    ) {
      aggregate {
        count
      }
    }
  }
  `;

  //search 

