use actix_web::{route, HttpRequest, HttpResponse, Responder};

#[derive(serde::Serialize)]
struct AuthResponse {
    #[serde(rename(serialize = "X-Hasura-Role"))]
    role_header: String,
}

#[route("/auth", method = "GET", method = "POST")]
pub(crate) async fn auth(req: HttpRequest) -> impl Responder {
    let role_header = match req.headers().get("X-Hasura-Role") {
        Some(role_header) => role_header.to_str().unwrap().to_string(),
        None => std::env::var("DEFAULT_HASURA_ROLE").unwrap(),
    };

    HttpResponse::Ok().json(AuthResponse { role_header })
}
