use iroh::{Endpoint, NodeId, SecretKey};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_store::StoreExt;
use tokio::sync::RwLock;

#[derive(Serialize, Deserialize)]
struct Ticket {
    nickname: String,
    node_id: NodeId,
}

#[derive(Serialize, Deserialize)]
struct EndpointCredentials {
    self_ticket: Ticket,
    secret_key: SecretKey,
}

struct AppState {
    endpoint_credentials: Option<EndpointCredentials>,
    endpoint: Option<Endpoint>,
}

#[tauri::command]
async fn login(
    app_handle: AppHandle,
    nickname: String,
    app_state: State<'_, RwLock<AppState>>,
) -> Result<(), String> {
    println!("Received login request: {}", nickname);
    let mut app_state = app_state.write().await;

    let endpoint = if let Some(ref mut credentials) = app_state.endpoint_credentials {
        credentials.self_ticket.nickname = nickname;
        Endpoint::builder()
            .secret_key(credentials.secret_key.clone())
            .discovery_n0()
            .bind()
            .await
            .map_err(|e| e.to_string())?
    } else {
        let endpoint = Endpoint::builder()
            .discovery_n0()
            .bind()
            .await
            .map_err(|e| e.to_string())?;

        app_state.endpoint_credentials = Some(EndpointCredentials {
            self_ticket: Ticket {
                nickname,
                node_id: endpoint.node_id(),
            },
            secret_key: endpoint.secret_key().clone(),
        });
        endpoint
    };

    // Store credentials
    let credentials_store = app_handle
        .store("credentials.json")
        .map_err(|e| e.to_string())?;
    credentials_store.set(
        "endpoint_credentials",
        serde_json::to_value(&app_state.endpoint_credentials).map_err(|e| e.to_string())?,
    );
    credentials_store.close_resource();

    println!(
        "Endpoint created with NodeId {:?} and secret key {:?}",
        endpoint.node_id(),
        endpoint.secret_key()
    );
    endpoint.close().await;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            // Initialize empty app state
            let mut app_state = AppState {
                endpoint_credentials: None,
                endpoint: None,
            };

            // Populate with stored credentials
            let credential_store = app.store("credentials.json")?;
            if let Some(credentials_value) = credential_store.get("endpoint_credentials") {
                let credentials = serde_json::from_value::<EndpointCredentials>(credentials_value)?;
                app_state.endpoint_credentials = Some(credentials);
            }
            credential_store.close_resource();

            app.manage(RwLock::new(app_state));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![login])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
