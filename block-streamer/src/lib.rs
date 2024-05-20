mod blockstreamer {
    tonic::include_proto!("blockstreamer");
}

pub use blockstreamer::*;
pub mod graphql;
