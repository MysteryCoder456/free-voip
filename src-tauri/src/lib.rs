mod contacts;

use std::ops::DerefMut;

use contacts::ContactTicket;
use iroh::{protocol::Router, Endpoint, SecretKey};
use iroh_base::ticket::Ticket;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_store::StoreExt;
use tokio::sync::{
    broadcast::{channel, Receiver, Sender},
    RwLock,
};

use crate::contacts::ContactsProtocol;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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
    println!("Endpoint created with {:?}", endpoint.node_id());

    Ok(endpoint)
}

fn build_router(
    app_handle: AppHandle,
    app_state: &mut AppStateInner,
    endpoint: Endpoint,
) -> Router {
    let contacts = {
        // Create and set protocol communication channels
        let (request_tx, request_rx) = channel::<ContactTicket>(8);
        let (response_tx, response_rx) = channel::<bool>(8);
        app_state.request_rx = Some(request_rx.resubscribe());
        app_state.response_tx = Some(response_tx);

        // Listen to requests
        let mut request_rx = request_rx;
        tokio::spawn(async move {
            while let Ok(ticket) = request_rx.recv().await {
                if let Err(e) = app_handle.emit("contact-request", ticket) {
                    eprintln!("Failed to emit contact request event: {}", e);
                }
            }
        });

        contacts::ContactsProtocol::new(request_tx, response_rx)
    };

    Router::builder(endpoint)
        .accept(contacts::ALPN, contacts)
        .spawn()
}

#[tauri::command]
async fn restore_login(
    app_handle: AppHandle,
    app_state: State<'_, AppState>,
) -> Result<bool, String> {
    let mut app_state = app_state.write().await;

    if app_state.router.is_some() {
        // Endpoint and Router are already active, nothing to restore.
        return Ok(true);
    }

    // Create new endpoint if credentials are available
    if let Some(ref mut credentials) = app_state.endpoint_credentials {
        let endpoint = build_endpoint(Some(credentials.secret_key.clone()))
            .await
            .map_err(|e| e.to_string())?;
        app_state.router = Some(build_router(app_handle, app_state.deref_mut(), endpoint));

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
    let router = build_router(app_handle.clone(), app_state.deref_mut(), endpoint);

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

#[tauri::command]
fn get_contacts(app_handle: AppHandle) -> Result<Vec<ContactTicket>, String> {
    let contacts_store = app_handle
        .store("contacts.json")
        .map_err(|e| e.to_string())?;

    contacts_store
        .get("contacts")
        .map(|v| serde_json::from_value::<Vec<ContactTicket>>(v).map_err(|e| e.to_string()))
        .unwrap_or(Ok(vec![]))
}

#[tauri::command]
fn add_contact(app_handle: AppHandle, contact_ticket: ContactTicket) -> Result<(), String> {
    let mut contacts = get_contacts(app_handle.clone())?;

    // Check for duplicates
    let duplicate_contact = contacts
        .iter()
        .find(|c| c.node_id == contact_ticket.node_id);
    if let Some(duplicate_contact) = duplicate_contact {
        return Err(format!(
            "This contact is already in your list as {}.",
            duplicate_contact.nickname
        ));
    }

    // Update contacts store
    contacts.push(contact_ticket);
    let contacts_store = app_handle
        .store("contacts.json")
        .map_err(|e| e.to_string())?;
    contacts_store.set(
        "contacts",
        serde_json::to_value(&contacts).map_err(|e| e.to_string())?,
    );
    _ = app_handle.emit("contacts-updated", &contacts);

    Ok(())
}

#[tauri::command]
async fn send_contact_request(
    serialized_ticket: String,
    app_state: State<'_, AppState>,
) -> Result<(ContactTicket, bool), String> {
    let contact_ticket =
        <ContactTicket as Ticket>::deserialize(&serialized_ticket).map_err(|e| e.to_string())?;
    println!("Sending contact request to {:?}", contact_ticket);

    let app_state = app_state.read().await;
    let router = app_state.router.as_ref().ok_or("Router not initialized")?;
    let self_ticket = app_state
        .endpoint_credentials
        .as_ref()
        .map(|c| c.self_ticket.clone())
        .ok_or("Credentials not found")?;

    let accepted =
        ContactsProtocol::send_request(router.endpoint(), contact_ticket.node_id, self_ticket)
            .await?;
    Ok((contact_ticket, accepted))
}

#[tauri::command]
async fn respond_to_contact_request(
    app_state: State<'_, AppState>,
    accept: bool,
) -> Result<(), String> {
    let app_state = app_state.read().await;

    if let Some(response_tx) = &app_state.response_tx {
        // Send the response to the contact request
        response_tx.send(accept).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Contact request response channel not initialized".to_owned())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
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
            get_contacts,
            add_contact,
            send_contact_request,
            respond_to_contact_request,
        ]);

    #[cfg(any(target_os = "android", target_os = "ios"))]
    let builder = builder.plugin(tauri_plugin_barcode_scanner::init());

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
