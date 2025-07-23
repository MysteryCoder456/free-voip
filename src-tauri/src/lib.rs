mod contacts;

use std::ops::DerefMut;

use crate::contacts::ContactsProtocol;
use contacts::ContactTicket;
use iroh::{protocol::Router, Endpoint, SecretKey};
use iroh_base::ticket::Ticket;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_store::StoreExt;
use tokio::sync::{
    broadcast::{channel, Receiver, Sender},
    RwLock,
};

#[derive(Debug, Serialize, Deserialize)]
struct EndpointCredentials {
    self_ticket: ContactTicket,
    secret_key: SecretKey,
}

#[derive(Default)]
struct AppStateInner {
    endpoint_credentials: Option<EndpointCredentials>,
    router: Option<Router>,
    request_rx: Option<Receiver<ContactTicket>>,
    response_tx: Option<Sender<bool>>,
}
type AppState = RwLock<AppStateInner>;

async fn build_endpoint(
    secret_key: Option<SecretKey>,
) -> Result<Endpoint, iroh::endpoint::BindError> {
    let builder = Endpoint::builder().discovery_n0();

    let builder = if let Some(key) = secret_key {
        builder.secret_key(key)
    } else {
        builder
    };

    let endpoint = builder.bind().await?;
    println!("Endpoint created with NodeId {:?}", endpoint.node_id());

    Ok(endpoint)
}

fn build_router(app_state: &mut AppStateInner, endpoint: Endpoint) -> Router {
    let contacts = {
        // Create and set protocol communication channels
        let (request_tx, request_rx) = channel::<ContactTicket>(8);
        let (response_tx, response_rx) = channel::<bool>(8);
        app_state.request_rx = Some(request_rx);
        app_state.response_tx = Some(response_tx);

        ContactsProtocol::new(endpoint.clone(), request_tx, response_rx)
    };

    Router::builder(endpoint)
        .accept(contacts::ALPN, contacts)
        .spawn()
}

#[tauri::command]
async fn restore_login(app_state: State<'_, AppState>) -> Result<bool, String> {
    let mut app_state = app_state.write().await;

    if app_state.router.is_some() {
        // Endpoint and Router already active, no need to restore
        return Ok(true);
    }

    // Create new endpoint if credentials are available
    if let Some(ref mut credentials) = app_state.endpoint_credentials {
        let endpoint = build_endpoint(Some(credentials.secret_key.clone()))
            .await
            .map_err(|e| e.to_string())?;
        app_state.router = Some(build_router(app_state.deref_mut(), endpoint));

        return Ok(true);
    }

    Ok(false)
}

#[tauri::command]
async fn login(
    app_handle: AppHandle,
    nickname: String,
    app_state: State<'_, AppState>,
) -> Result<(), String> {
    println!("Received login request: {}", nickname);
    let mut app_state = app_state.write().await;

    // Create new endpoint and router
    let endpoint = build_endpoint(None).await.map_err(|e| e.to_string())?;
    app_state.endpoint_credentials = Some(EndpointCredentials {
        self_ticket: ContactTicket {
            nickname,
            node_id: endpoint.node_id(),
        },
        secret_key: endpoint.secret_key().clone(),
    });
    let router = build_router(app_state.deref_mut(), endpoint);

    // Store credentials
    let credentials_store = app_handle
        .store("credentials.json")
        .map_err(|e| e.to_string())?;
    credentials_store.set(
        "endpoint",
        serde_json::to_value(&app_state.endpoint_credentials).map_err(|e| e.to_string())?,
    );
    credentials_store.save().map_err(|e| e.to_string())?;
    credentials_store.close_resource();

    // Close existing endpoint if it exists
    if let Some(ref existing_router) = app_state.router {
        existing_router
            .shutdown()
            .await
            .map_err(|e| e.to_string())?;
    }
    app_state.router = Some(router);

    Ok(())
}

#[tauri::command]
async fn get_serialized_self_ticket(
    app_state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let self_ticket = {
        let app_state = app_state.read().await;
        let credentials = app_state
            .endpoint_credentials
            .as_ref()
            .ok_or("Credentials not found".to_owned())?;
        credentials.self_ticket.clone()
    };

    let response = serde_json::json!({
        "nickname": self_ticket.nickname,
        "serializedTicket": Ticket::serialize(&self_ticket),
    });
    Ok(response)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            // Initialize empty app state
            let mut app_state = AppStateInner::default();

            // Populate with stored credentials
            let credential_store = app.store("credentials.json")?;
            if let Some(credentials_value) = credential_store.get("endpoint") {
                let credentials = serde_json::from_value::<EndpointCredentials>(credentials_value)?;
                app_state.endpoint_credentials = Some(credentials);
            }
            credential_store.close_resource();

            app.manage(AppState::new(app_state));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            restore_login,
            login,
            get_serialized_self_ticket,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
