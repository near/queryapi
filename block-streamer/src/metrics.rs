use actix_web::{get, App, HttpServer, Responder};
use lazy_static::lazy_static;
use prometheus::{
    register_int_counter_vec, register_int_gauge_vec, Encoder, IntCounterVec, IntGaugeVec,
};

lazy_static! {
    pub static ref LAST_PROCESSED_BLOCK: IntGaugeVec = register_int_gauge_vec!(
        "queryapi_block_streamer_last_processed_block",
        "Height of last block seen",
        &["indexer"]
    )
    .unwrap();
    pub static ref PUBLISHED_BLOCKS_COUNT: IntCounterVec = register_int_counter_vec!(
        "queryapi_block_streamer_published_blocks_count",
        "Number of blocks published to redis stream",
        &["indexer"]
    )
    .unwrap();
}

#[get("/metrics")]
async fn get_metrics() -> impl Responder {
    let mut buffer = Vec::<u8>::new();
    let encoder = prometheus::TextEncoder::new();
    loop {
        match encoder.encode(&prometheus::gather(), &mut buffer) {
            Ok(_) => break,
            Err(err) => {
                tracing::error!("Error encoding metrics: {}", err);
            }
        }
    }
    String::from_utf8(buffer).unwrap()
}

pub(crate) fn init_server(port: u16) -> anyhow::Result<actix_web::dev::Server> {
    tracing::info!("Starting metrics server on 0.0.0.0:{port}");

    Ok(HttpServer::new(|| App::new().service(get_metrics))
        .bind(("0.0.0.0", port))?
        .disable_signals()
        .workers(1)
        .run())
}
