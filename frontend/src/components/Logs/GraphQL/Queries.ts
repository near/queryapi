export const getIndexerQuery = (tableName: string) => `
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

export const getPaginationQuery = (tableName: string) => `
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

export const getBlockHeightAndMessageSearchQuery = (tableName: string, keyword: string) => `
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

export const getMessageSearchQuery = (tableName: string, keyword: string) => `
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

export const getIndexerQueryWithSeverity = (tableName: string, severity: string) => `
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

export const getMessageSearchQueryWithSeverity = (tableName: string, keyword: string, severity: string) => `
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

export const getBlockHeightAndMessageSearchQueryWithSeverity = (tableName: string, keyword: string, severity: string) => `
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

export const getIndexerQueryWithLogType = (tableName: string, logType: string) => `
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

export const getIndexerQueryWithSeverityAndLogType = (tableName: string, severity: string, logType: string) => `
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

export const getBlockHeightAndMessageSearchQueryWithLogType = (tableName: string, keyword: string, logType: string) => `
  query getBlockHeightAndMessageSearchQueryWithLogType($limit: Int, $offset: Int) {
      ${tableName}(limit: $limit, offset: $offset, where: {_or: [{message: {_ilike: "%${keyword}%"}}, {block_height: {_eq: ${keyword}}}], _and: {type: {_eq: ${logType}}}}, order_by: {timestamp: desc}) {
        block_height
        level
        message
        timestamp
        type
      }
      ${tableName}_aggregate(where: {_or: [{message: {_ilike: "%${keyword}%"}}, {block_height: {_eq: ${keyword}}}], _and: {type: {_eq: ${logType}}}}) {
        aggregate {
          count
        }
      }
    }
  `;

export const getMessageSearchQueryWithLogType = (tableName: string, keyword: string, logType: string) => `
  query getMessageSearchQueryWithLogType($limit: Int, $offset: Int) {
      ${tableName}(limit: $limit, offset: $offset, where: {message: {_ilike: "%${keyword}%"}, _and: {type: {_eq: ${logType}}}}, order_by: {timestamp: desc}) {
        block_height
        level
        message
        timestamp
        type
      }
      ${tableName}_aggregate(where: {message: {_ilike: "%${keyword}%"}, _and: {type: {_eq: ${logType}}}}) {
        aggregate {
          count
        }
      }
    }
  `;

export const getBlockHeightAndMessageSearchQueryWithSeverityAndLogType = (tableName: string, keyword: string, severity: string, logType: string) => `
  query getBlockHeightAndMessageSearchQueryWithSeverityAndLogType($limit: Int, $offset: Int) {
    ${tableName}(
      limit: $limit
      offset: $offset
      where: {
        _or: [
          { message: { _ilike: "%${keyword}%" } },
          { block_height: { _eq: 123 } }
        ]
        _and: {
          level: { _eq: ${severity} },
          type: { _eq: ${logType} }
        }
      }
      order_by: { timestamp: desc }
    ) {
      block_height
      level
      message
      timestamp
      type
    }
    ${tableName}_aggregate(
      where: {
        _or: [
          { message: { _ilike: "%${keyword}%" } }
          { block_height: { _eq: 123 } }
        ]
        _and: {
          level: { _eq: ${severity} },
          type: { _eq: ${logType} }
        }
      }
    ) {
      aggregate {
        count
      }
    }
  }`
  ;

export const getMessageSearchQueryWithSeverityAndLogType = (tableName: string, keyword: string, severity: string, logType: string) => `
    query getMessageSearchQueryWithSeverityAndLogType($limit: Int, $offset: Int) {
      ${tableName}(
        limit: $limit
        offset: $offset
        where: {message: {_ilike: "%${keyword}%"}, 
        _and: {
          level: { _eq: ${severity} },
          type: { _eq: ${logType} }
        }}
        order_by: {timestamp: desc}
      ) {
        block_height
        level
        message
        timestamp
        type
      }
      ${tableName}_aggregate(
        where: {message: {_ilike: "%${keyword}%"},  
        _and: {
          level: { _eq: ${severity} },
          type: { _eq: ${logType} }
        }}
      ) {
        aggregate {
          count
        }
      }
    }
  `;

export const getIndexerQueryWithSeverityAndLogTypeAndTimeRange = (tableName: string, severity: string, logType: string, ISOstring: string) => `
  query getIndexerQueryWithSeverityAndLogTypeAndTimeRange($limit: Int, $offset: Int) {
    ${tableName}(
      limit: $limit
      offset: $offset
      order_by: {timestamp: desc}
      where: {
        type: { _eq: ${logType} },
        timestamp: { _gte: "${ISOstring}" },
        level: { _eq: ${severity} }
      }
    ) {
      block_height
      level
      message
      timestamp
      type
    }
    ${tableName}_aggregate(
      where: {
        type: { _eq: ${logType} },
        timestamp: { _gte: "${ISOstring}" },
        level: { _eq: ${severity} }
      }
    ) {
      aggregate {
        count
      }
    }
  }
  `;

export const getIndexerQueryWithSeverityAndTimeRange = (tableName: string, severity: string, ISOstring: string) => `
  query getIndexerQueryWithSeverityAndTimeRange($limit: Int, $offset: Int) {
    ${tableName}(
      limit: $limit
      offset: $offset
      order_by: {timestamp: desc}
      where: {
        timestamp: { _gte: "${ISOstring}" },
        level: { _eq: ${severity} }
      }
    ) {
      block_height
      level
      message
      timestamp
      type
    }
    ${tableName}_aggregate(
      where: {
        timestamp: { _gte: "${ISOstring}" },
        level: { _eq: ${severity} }
      }
    ) {
      aggregate {
        count
      }
    }
  }
  `;

export const getIndexerQueryWithLogTypeAndTimeRange = (tableName: string, logType: string, ISOstring: string) => `
query getIndexerQueryWithLogTypeAndTimeRange($limit: Int, $offset: Int) {
  ${tableName}(
    limit: $limit
    offset: $offset
    order_by: {timestamp: desc}
    where: {
      type: { _eq: ${logType} },
      timestamp: { _gte: "${ISOstring}" }
    }
  ) {
    block_height
    level
    message
    timestamp
    type
  }
  ${tableName}_aggregate(
    where: {
      type: { _eq: ${logType} },
      timestamp: { _gte: "${ISOstring}" }
    }
  ) {
    aggregate {
      count
    }
  }
}
`;

export const getIndexerQueryWithTimeRange = (tableName: string, ISOstring: string) => `
  query getIndexerQueryWithTimeRange($limit: Int, $offset: Int) {
    ${tableName}(
      limit: $limit
      offset: $offset
      order_by: {timestamp: desc}
      where: {
        timestamp: { _gte: "${ISOstring}" }
      }
    ) {
      block_height
      level
      message
      timestamp
      type
    }
    ${tableName}_aggregate(
      where: {
        timestamp: { _gte: "${ISOstring}" }
      }
    ) {
      aggregate {
        count
      }
    }
  }
  `;

export const getMessageSearchQueryWithTimeRange = (tableName: string, keyword: string, ISOstring: string) => `
  query getMessageSearchQueryWithTimeRange($limit: Int, $offset: Int) {
    ${tableName}(limit: $limit, offset: $offset, 
      where: {
        message: {_ilike: "%${keyword}%"},
        timestamp: { _gte: "${ISOstring}" }
      }, 
      order_by: { timestamp: desc }) {
      block_height
      level
      message
      timestamp
      type
    }
    
    ${tableName}_aggregate(
      where: {
        message: {_ilike: "%${keyword}%"},
        timestamp: { _gte: "${ISOstring}" }
      }, 
    ) {
      aggregate {
        count
      }
    }
  }`;

export const getMessageSearchQueryWithSeverityAndTimeRange = (tableName: string, keyword: string, severity: string, ISOstring: string) => `
  query getMessageSearchQueryWithSeverityAndTimeRange($limit: Int, $offset: Int) {
    ${tableName}(limit: $limit, offset: $offset, 
      where: {
        message: {_ilike: "%${keyword}%"},
        level: { _eq: ${severity} },
        timestamp: { _gte: "${ISOstring}" }
      }, 
      order_by: { timestamp: desc }) {
      block_height
      level
      message
      timestamp
      type
    }
    
    ${tableName}_aggregate(
      where: {
        message: {_ilike: "%${keyword}%"},
        level: { _eq: ${severity} },
        timestamp: { _gte: "${ISOstring}" }
      }, 
    ) {
      aggregate {
        count
      }
    }
  }`;

export const getMessageSearchQueryWithLogTypeAndTimeRange = (tableName: string, keyword: string, logType: string, ISOstring: string) => `
  query getMessageSearchQueryWithLogTypeAndTimeRange($limit: Int, $offset: Int) {
    ${tableName}(limit: $limit, offset: $offset, 
      where: {
        message: {_ilike: "%${keyword}%"},
        type: { _eq: ${logType} },
        timestamp: { _gte: "${ISOstring}" }
      }, 
      order_by: { timestamp: desc }) {
      block_height
      level
      message
      timestamp
      type
    }
    
    ${tableName}_aggregate(
      where: {
        message: {_ilike: "%${keyword}%"},
        type: { _eq: ${logType} },
        timestamp: { _gte: "${ISOstring}" }
      }, 
    ) {
      aggregate {
        count
      }
    }
  }`;

export const getMessageSearchQueryWithSeverityAndLogTypeAndTimeRange = (tableName: string, keyword: string, severity: string, logType: string, ISOstring: string) => `
  query getMessageSearchQueryWithSeverityAndLogTypeAndTimeRange($limit: Int, $offset: Int) {
    ${tableName}(limit: $limit, offset: $offset, 
      where: {
        message: {_ilike: "%${keyword}%"},
        type: { _eq: ${logType} },
        level: { _eq: ${severity} },
        timestamp: { _gte: "${ISOstring}" }
      }, 
      order_by: { timestamp: desc }) {
      block_height
      level
      message
      timestamp
      type
    }
    
    ${tableName}_aggregate(
      where: {
        message: {_ilike: "%${keyword}%"},
        type: { _eq: ${logType} },
        level: { _eq: ${severity} },
        timestamp: { _gte: "${ISOstring}" }
      }, 
    ) {
      aggregate {
        count
      }
    }
  }`;

export const getBlockHeightAndMessageSearchQueryWithTimeRange = (tableName: string, keyword: string, ISOstring: string) => `
  query getBlockHeightAndMessageSearchQueryWithTimeRange($limit: Int, $offset: Int) {
    ${tableName}(
      limit: $limit
      offset: $offset
      where: {
        _or: [
          { message: { _ilike: "%${keyword}%" } },
          { block_height: { _eq: 123 } }
        ]
        _and: {
         timestamp: { _gte: "${ISOstring}" }
        }
      }
      order_by: { timestamp: desc }
    ) {
      block_height
      level
      message
      timestamp
      type
    }
    ${tableName}_aggregate(
      where: {
        _or: [
          { message: { _ilike: "%${keyword}%" } }
          { block_height: { _eq: 123 } }
        ]
        _and: {
         timestamp: { _gte: "${ISOstring}" }
        }
      }
    ) {
      aggregate {
        count
      }
    }
  }`;

export const getBlockHeightAndMessageSearchQueryWithSeverityAndTimeRange = (tableName: string, keyword: string, severity: string, ISOstring: string) => `
  query getBlockHeightAndMessageSearchQueryWithSeverityAndTimeRange($limit: Int, $offset: Int) {
    ${tableName}(
      limit: $limit
      offset: $offset
      where: {
        _or: [
          { message: { _ilike: "%${keyword}%" } },
          { block_height: { _eq: 123 } }
        ]
        _and: {
          level: { _eq: ${severity} },
          timestamp: { _gte: "${ISOstring}" }
        }
      }
      order_by: { timestamp: desc }
    ) {
      block_height
      level
      message
      timestamp
      type
    }
    ${tableName}_aggregate(
      where: {
        _or: [
          { message: { _ilike: "%${keyword}%" } }
          { block_height: { _eq: 123 } }
        ]
        _and: {
          level: { _eq: ${severity} },
          timestamp: { _gte: "${ISOstring}" }
        }
      }
    ) {
      aggregate {
        count
      }
    }
  }`;

export const getBlockHeightAndMessageSearchQueryWithLogTypeAndTimeRange = (tableName: string, keyword: string, logType: string, ISOstring: string) => `
  query getBlockHeightAndMessageSearchQueryWithLogTypeAndTimeRange($limit: Int, $offset: Int) {
    ${tableName}(
      limit: $limit
      offset: $offset
      where: {
        _or: [
          { message: { _ilike: "%${keyword}%" } },
          { block_height: { _eq: 123 } }
        ]
        _and: {
          type: { _eq: ${logType} },
          timestamp: { _gte: "${ISOstring}" }
        }
      }
      order_by: { timestamp: desc }
    ) {
      block_height
      level
      message
      timestamp
      type
    }
    ${tableName}_aggregate(
      where: {
        _or: [
          { message: { _ilike: "%${keyword}%" } }
          { block_height: { _eq: 123 } }
        ]
        _and: {
          type: { _eq: ${logType} },
          timestamp: { _gte: "${ISOstring}" }
        }
      }
    ) {
      aggregate {
        count
      }
    }
  }`;

export const getBlockHeightAndMessageSearchQueryWithSeverityAndLogTypeAndTimeRange = (tableName: string, keyword: string, severity: string, logType: string, ISOstring: string) => `
  query getBlockHeightAndMessageSearchQueryWithSeverityAndLogTypeAndTimeRange($limit: Int, $offset: Int) {
    ${tableName}(
      limit: $limit
      offset: $offset
      where: {
        _or: [
          { message: { _ilike: "%${keyword}%" } },
          { block_height: { _eq: 123 } }
        ]
        _and: {
          type: { _eq: ${logType} },
          level: { _eq: ${severity} },
          timestamp: { _gte: "${ISOstring}" }
        }
      }
      order_by: { timestamp: desc }
    ) {
      block_height
      level
      message
      timestamp
      type
    }
    ${tableName}_aggregate(
      where: {
        _or: [
          { message: { _ilike: "%${keyword}%" } }
          { block_height: { _eq: 123 } }
        ]
        _and: {
          type: { _eq: ${logType} },
          level: { _eq: ${severity} },
          timestamp: { _gte: "${ISOstring}" }
        }
      }
    ) {
      aggregate {
        count
      }
    }
  }`;
