use std::io;

use actix_cors::Cors;
use actix_web::{middleware, App, HttpServer};
use dotenv::dotenv;

mod services;

use crate::services::auth;

#[actix_web::main]
async fn main() -> io::Result<()> {
    dotenv().ok();
    env_logger::init_from_env(env_logger::Env::new().default_filter_or("info"));

    let port = std::env::var("PORT")
        .expect("PORT must be set")
        .parse::<u16>()
        .expect("PORT must be numeric");

    log::info!("starting HTTP server on port {}", port);

    HttpServer::new(move || {
        App::new()
            .service(auth)
            .wrap(Cors::permissive())
            .wrap(middleware::Logger::default())
    })
    .workers(2)
    .bind(("0.0.0.0", port))?
    .run()
    .await
}
