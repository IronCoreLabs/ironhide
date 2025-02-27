use ironoxide::user::Jwt;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use yansi::Paint;

const AUTH0_CLIENT_ID: &str = "hGELxuBKD64ltS4VNaIy2mzVwtqgJa5f";
const AUTH0_DOMAIN: &str = "https://ironcorelabs.auth0.com";
const AUTH0_DEVICE_CODE_URL: &str = "https://ironcorelabs.auth0.com/oauth/device/code";
const AUTH0_TOKEN_URL: &str = "https://ironcorelabs.auth0.com/oauth/token";

#[derive(Serialize, Deserialize)]
struct Auth0DeviceCodeRequest {
    client_id: String,
    scope: String,
    audience: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct Auth0DeviceCodeResponse {
    verification_uri_complete: String,
    device_code: String,
    user_code: String,
    interval: u64,
    expires_in: u64,
}

#[derive(Serialize, Deserialize, Debug)]
struct Auth0TokenRequest {
    grant_type: String,
    device_code: String,
    client_id: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct Auth0TokenResponse {
    access_token: String,
    id_token: String,
    token_type: String,
    expires_in: u64,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "snake_case")]
enum Auth0PollingError {
    AccessDenied,
    ExpiredToken,
    SlowDown,
    AuthorizationPending,
}

#[derive(Serialize, Deserialize, Debug)]
struct Auth0PollingResponse {
    error: Auth0PollingError,
}

pub fn authorize() -> Jwt {
    // request a device activation code
    let device_code_request = Auth0DeviceCodeRequest {
        client_id: AUTH0_CLIENT_ID.to_string(),
        scope: "openid".to_string(),
        audience: format!("{}/api/v2/", AUTH0_DOMAIN),
    };
    let device_code_resp = attohttpc::post(AUTH0_DEVICE_CODE_URL)
        .form(&device_code_request)
        .unwrap()
        .send()
        .unwrap()
        .json::<Auth0DeviceCodeResponse>()
        .unwrap();

    // ask the user to go to the activation page and confirm
    println!(
        "{} {} {} {}",
        Paint::green("Go to this URL in your browser or another device\n"),
        Paint::cyan(device_code_resp.verification_uri_complete),
        Paint::green("\nand choose Confirm if it is displaying"),
        Paint::cyan(device_code_resp.user_code)
    );

    // poll for token available after user confirms
    let token_request = Auth0TokenRequest {
        grant_type: "urn:ietf:params:oauth:grant-type:device_code".to_string(),
        client_id: AUTH0_CLIENT_ID.to_string(),
        device_code: device_code_resp.device_code,
    };
    let jwt_str = poll_for_token(&token_request, Duration::new(device_code_resp.interval, 0));
    match Jwt::new(&jwt_str) {
        Ok(jwt) => jwt,
        Err(err) => {
            println!(
                "Unable to parse response from Auth0 as a valid JWT - string {}, error {} .",
                jwt_str, err
            );
            std::process::exit(1);
        }
    }
}

fn poll_for_token(token_request: &Auth0TokenRequest, interval: Duration) -> String {
    let token_resp = attohttpc::post(AUTH0_TOKEN_URL)
        .form(&token_request)
        .unwrap()
        .send()
        .unwrap();
    if token_resp.is_success() {
        token_resp.json::<Auth0TokenResponse>().unwrap().id_token
    } else {
        let Auth0PollingResponse { error } = token_resp.json::<Auth0PollingResponse>().unwrap();
        use Auth0PollingError::*;
        match error {
            AccessDenied => {
                println!(
                    "Access was denied with your credentials. Attempting login again may work."
                );
                std::process::exit(1);
            }
            ExpiredToken => {
                println!(
                    "The token we were holding was expired, the login process took too long. Please try \"ironhide login\" again."
                );
                std::process::exit(1);
            }
            SlowDown | AuthorizationPending => {
                println!("Waiting for authorization from Auth0...");
                std::thread::sleep(interval);
                poll_for_token(token_request, interval)
            }
        }
    }
}
