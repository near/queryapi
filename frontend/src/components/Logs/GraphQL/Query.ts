export const Query = (tableName: string) => `
  query getLogsQuery(
      $limit: Int,
      $offset: Int,
      $order_by_timestamp: order_by,
      $level: String_comparison_exp = {},
      $type: String_comparison_exp= {},
      $timestamp: timestamp_comparison_exp = {},
      $message: String_comparison_exp = {},
      $block_height: numeric_comparison_exp = {}
    ) {
      ${tableName}(
        limit: $limit,
        offset: $offset,
        order_by: {timestamp: $order_by_timestamp},
        where: {
          message: $message,
          _or: [
            { message: $message },
            { block_height: $block_height },
          ],
          _and: [
            {level: $level},
            {type: $type},
            {timestamp: $timestamp}
          ]
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
          message: $message,
          _or: [
            { message: $message },
            { block_height: $block_height },
          ],
          _and: [
            {level: $level},
            {type: $type},
            {timestamp: $timestamp}
          ]
        }
      ) {
        aggregate {
          count
        }
      }
    }
`;

