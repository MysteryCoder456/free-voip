use iroh::{Endpoint, NodeId, SecretKey};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_store::StoreExt;
use tokio::sync::RwLock;

#[derive(Debug, Serialize, Deserialize)]
struct Ticket {
    nickname: String,
    node_id: NodeId,
}

#[derive(Debug, Serialize, Deserialize)]
struct EndpointCredentials {
    self_ticket: Ticket,
    secret_key: SecretKey,
}

struct AppStateInner {
    endpoint_credentials: Option<EndpointCredentials>,
    endpoint: Option<Endpoint>,
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

#[tauri::command]
async fn restore_login(app_state: State<'_, AppState>) -> Result<bool, String> {
    let mut app_state = app_state.write().await;

    if app_state.endpoint.is_some() {
        // Endpoint already exists, no need to restore
        return Ok(true);
    }

    // Create new endpoint if credentials are available
    if let Some(ref mut credentials) = app_state.endpoint_credentials {
        app_state.endpoint = Some(
            build_endpoint(Some(credentials.secret_key.clone()))
                .await
                .map_err(|e| e.to_string())?,
        );
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

    // Create new endpoint
    let endpoint = build_endpoint(None).await.map_err(|e| e.to_string())?;
    app_state.endpoint_credentials = Some(EndpointCredentials {
        self_ticket: Ticket {
            nickname,
            node_id: endpoint.node_id(),
        },
        secret_key: endpoint.secret_key().clone(),
    });

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
    if let Some(ref existing_endpoint) = app_state.endpoint {
        existing_endpoint.close().await;
    }
    app_state.endpoint = Some(endpoint);

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            // Initialize empty app state
            let mut app_state = AppStateInner {
                endpoint_credentials: None,
                endpoint: None,
            };

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
        .invoke_handler(tauri::generate_handler![restore_login, login])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
