mod runner {
    tonic::include_proto!("runner");
}

pub use runner::*;

pub mod data_layer {
    tonic::include_proto!("data_layer");
}
