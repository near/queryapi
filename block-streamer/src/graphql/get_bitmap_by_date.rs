#![allow(clippy::all, warnings)]
pub struct GetBitmapByDate;
pub mod get_bitmap_by_date {
    #![allow(dead_code)]
    use std::result::Result;
    pub const OPERATION_NAME: &str = "GetBitmapByDate";
    pub const QUERY : & str = "query GetBitmapByDate($block_date: date) {\n  darunrs_near_bitmap_v5_actions_index(where: {block_date: {_eq: $block_date}}) {\n    bitmap\n    first_block_height\n  }\n}\n" ;
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
    type date = super::date;
    #[derive(Serialize)]
    pub struct Variables {
        pub block_date: Option<date>,
    }
    impl Variables {}
    #[derive(Deserialize)]
    pub struct ResponseData {
        pub darunrs_near_bitmap_v5_actions_index:
            Vec<GetBitmapByDateDarunrsNearBitmapV5ActionsIndex>,
    }
    #[derive(Deserialize)]
    pub struct GetBitmapByDateDarunrsNearBitmapV5ActionsIndex {
        pub bitmap: String,
        pub first_block_height: Int,
    }
}
impl graphql_client::GraphQLQuery for GetBitmapByDate {
    type Variables = get_bitmap_by_date::Variables;
    type ResponseData = get_bitmap_by_date::ResponseData;
    fn build_query(variables: Self::Variables) -> ::graphql_client::QueryBody<Self::Variables> {
        graphql_client::QueryBody {
            variables,
            query: get_bitmap_by_date::QUERY,
            operation_name: get_bitmap_by_date::OPERATION_NAME,
        }
    }
}
