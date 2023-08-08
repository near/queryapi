use actix_web::{get, App, HttpServer, Responder};
use lazy_static::lazy_static;
use prometheus::{Encoder, IntCounter, IntGauge, IntGaugeVec, Opts};
use tracing::info;

lazy_static! {
    pub(crate) static ref LATEST_BLOCK_HEIGHT: IntGauge = try_create_int_gauge(
        "queryapi_coordinator_latest_block_height",
        "Height of last processed block"
    )
    .unwrap();
    pub(crate) static ref BLOCK_COUNT: IntCounter = try_create_int_counter(
        "queryapi_coordinator_block_count",
        "Number of indexed blocks"
    )
    .unwrap();
    pub(crate) static ref UNPROCESSED_STREAM_MESSAGES: IntGaugeVec = try_create_int_gauge_vec(
        "queryapi_coordinator_unprocessed_stream_messages",
        "Number of Redis Stream messages not processed by Runner",
        &["stream"]
    )
    .unwrap();
}

fn try_create_int_gauge_vec(
    name: &str,
    help: &str,
    labels: &[&str],
) -> prometheus::Result<IntGaugeVec> {
    let opts = Opts::new(name, help);
    let gauge = IntGaugeVec::new(opts, labels)?;
    prometheus::register(Box::new(gauge.clone()))?;
    Ok(gauge)
}

fn try_create_int_gauge(name: &str, help: &str) -> prometheus::Result<IntGauge> {
    let opts = Opts::new(name, help);
    let gauge = IntGauge::with_opts(opts)?;
    prometheus::register(Box::new(gauge.clone()))?;
    Ok(gauge)
}

fn try_create_int_counter(name: &str, help: &str) -> prometheus::Result<IntCounter> {
    let opts = Opts::new(name, help);
    let counter = IntCounter::with_opts(opts)?;
    prometheus::register(Box::new(counter.clone()))?;
    Ok(counter)
}

#[get("/metrics")]
async fn get_metrics() -> impl Responder {
    let mut buffer = Vec::<u8>::new();
    let encoder = prometheus::TextEncoder::new();
    loop {
        match encoder.encode(&prometheus::gather(), &mut buffer) {
            Ok(_) => break,
            Err(err) => {
                eprintln!("{:?}", err);
            }
        }
    }
    String::from_utf8(buffer.clone()).unwrap()
}

pub(crate) fn init_server(port: u16) -> anyhow::Result<actix_web::dev::Server> {
    info!(
        target: crate::INDEXER,
        "Starting metrics server on http://0.0.0.0:{port}"
    );

    Ok(HttpServer::new(|| App::new().service(get_metrics))
        .bind(("0.0.0.0", port))?
        .disable_signals()
        .run())
}
