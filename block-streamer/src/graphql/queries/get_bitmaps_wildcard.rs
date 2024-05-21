#![allow(clippy::all, warnings)]
pub struct GetBitmapsWildcard;
pub mod get_bitmaps_wildcard {
    #![allow(dead_code)]
    use std::result::Result;
    pub const OPERATION_NAME: &str = "GetBitmapsWildcard";
    pub const QUERY : & str = "query GetBitmapsWildcard($block_date: date, $receiver_ids: String, $limit: Int, $offset: Int) {\n  darunrs_near_bitmap_v5_actions_index(limit: $limit, offset: $offset, where: {block_date: {_eq: $block_date}, receiver: {receiver: {_regex: $receiver_ids}}}) {\n    bitmap\n    first_block_height\n  }\n}" ;
    use super::*;
    use serde::{Deserialize, Serialize};
    #[allow(dead_code)]
    type Boolean = bool;
    #[allow(dead_code)]
    type Float = f64;
    #[allow(dead_code)]
    type Int = i64;
    #[allow(dead_code)]
    type ID = String;
    type date = String;
    #[derive(Serialize)]
    pub struct Variables {
        pub block_date: Option<date>,
        pub receiver_ids: Option<String>,
        pub limit: Option<Int>,
        pub offset: Option<Int>,
    }
    impl Variables {}
    #[derive(Deserialize, Debug)]
    pub struct ResponseData {
        pub darunrs_near_bitmap_v5_actions_index:
            Vec<GetBitmapsWildcardDarunrsNearBitmapV5ActionsIndex>,
    }
    #[derive(Deserialize, Debug)]
    pub struct GetBitmapsWildcardDarunrsNearBitmapV5ActionsIndex {
        pub bitmap: String,
        pub first_block_height: Int,
    }
}
impl graphql_client::GraphQLQuery for GetBitmapsWildcard {
    type Variables = get_bitmaps_wildcard::Variables;
    type ResponseData = get_bitmaps_wildcard::ResponseData;
    fn build_query(variables: Self::Variables) -> ::graphql_client::QueryBody<Self::Variables> {
        graphql_client::QueryBody {
            variables,
            query: get_bitmaps_wildcard::QUERY,
            operation_name: get_bitmaps_wildcard::OPERATION_NAME,
        }
    }
}
