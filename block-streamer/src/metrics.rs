use actix_web::{get, App, HttpServer, Responder};
use lazy_static::lazy_static;
use prometheus::{
    register_histogram, register_int_counter, register_int_counter_vec, register_int_gauge,
    register_int_gauge_vec, Encoder, Histogram, IntCounter, IntCounterVec, IntGauge, IntGaugeVec,
};
use tracing_subscriber::layer::Context;
use tracing_subscriber::Layer;

lazy_static! {
    pub static ref LAKE_CACHE_LOCK_WAIT_SECONDS: Histogram = register_histogram!(
        "queryapi_block_streamer_lake_cache_lock_wait_seconds",
        "Time spent waiting for lock acquisition in LakeS3Client cache",
    )
    .unwrap();
    pub static ref LAKE_CACHE_HITS: IntGauge = register_int_gauge!(
        "queryapi_block_streamer_lake_cache_hits",
        "Number of cache hits in lake cache",
    )
    .unwrap();
    pub static ref LAKE_CACHE_MISSES: IntGauge = register_int_gauge!(
        "queryapi_block_streamer_lake_cache_misses",
        "Number of cache misses in lake cache",
    )
    .unwrap();
    pub static ref LAKE_CACHE_SIZE: IntGauge = register_int_gauge!(
        "queryapi_block_streamer_lake_cache_size",
        "Number of elements in lake cache",
    )
    .unwrap();
    pub static ref LAKE_S3_GET_REQUEST_COUNT: IntCounter = register_int_counter!(
        "queryapi_block_streamer_lake_s3_get_request_count",
        "Number of requests made to S3 from near lake framework",
    )
    .unwrap();
    pub static ref LAST_PROCESSED_BLOCK: IntGaugeVec = register_int_gauge_vec!(
        "queryapi_block_streamer_last_processed_block",
        "Height of last block seen",
        &["indexer"]
    )
    .unwrap();
    pub static ref PROCESSED_BLOCKS_COUNT: IntCounterVec = register_int_counter_vec!(
        "queryapi_block_streamer_processed_blocks_count",
        "Number of blocks processed by block stream",
        &["indexer"]
    )
    .unwrap();
    pub static ref PUBLISHED_BLOCKS_COUNT: IntCounterVec = register_int_counter_vec!(
        "queryapi_block_streamer_published_blocks_count",
        "Number of blocks published to redis stream",
        &["indexer"]
    )
    .unwrap();
    pub static ref LOGS_COUNT: IntCounterVec = register_int_counter_vec!(
        "queryapi_block_streamer_logs_count",
        "Number of messages logged",
        &["level"]
    )
    .unwrap();
    pub static ref BLOCK_STREAM_UP: IntCounterVec = register_int_counter_vec!(
        "queryapi_block_streamer_block_stream_up",
        "A continuously increasing counter to indicate the block stream is up",
        &["indexer"]
    )
    .unwrap();
    pub static ref RECEIVER_BLOCKS_FAILURE: IntGaugeVec = register_int_gauge_vec!(
        "queryapi_block_streamer_receiver_blocks_failure",
        "Gauge which only has a nonzero value if an error occurs during receiver block backfill",
        &["indexer"]
    )
    .unwrap();
}

pub struct LogCounter;

impl<S> Layer<S> for LogCounter
where
    S: tracing::Subscriber,
{
    fn on_event(&self, event: &tracing::Event, _ctx: Context<S>) {
        LOGS_COUNT
            .with_label_values(&[event.metadata().level().as_str()])
            .inc();
    }
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
