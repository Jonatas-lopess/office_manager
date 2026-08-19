use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        ConnectInfo, Query, State,
    },
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Router,
};
use futures::{sink::SinkExt, stream::StreamExt};
use std::{collections::HashMap, net::{IpAddr, SocketAddr}, path::PathBuf, sync::{Arc, Mutex}, time::Duration};
use tokio::{net::TcpStream, sync::{broadcast, oneshot}, time::timeout};
use tauri::{Emitter, Manager, RunEvent};
use tauri_plugin_opener::OpenerExt;
use uuid::Uuid;
use serde_json;
use std::sync::Mutex as StdMutex;

// 1. The state now uses a per-connection UUID as the unique identifier.
//    - The broadcast channel sends a (sender_uuid, msg) tuple.
//    - We track clients in a HashMap mapping the UUID to their IP for logging/display.
struct AppState {
    // The broadcast channel now holds a (sender_uuid, msg) tuple.
    tx: broadcast::Sender<(Uuid, String)>,
    connected_clients: Mutex<HashMap<Uuid, String>>,
    // Shared office secret (VITE_SYNC_TOKEN). Connections must present this
    // as a `?token=` query param before we upgrade to WebSocket.
    token: String,
}

struct HubState {
    shutdown_tx: StdMutex<Option<oneshot::Sender<()>>>,
}

// Only strips path separators and reserved Windows chars, plus "." / ".."
// segments, which would otherwise let a join() escape base_dir by one level.
// Used for both subfolder names and filenames.
fn sanitize_path_segment(name: &str) -> Option<String> {
    let cleaned: String = name
        .chars()
        .filter(|c| !"\\/:*?\"<>|".contains(*c))
        .collect();
    let trimmed = cleaned.trim();
    if trimmed.is_empty() || trimmed == "." || trimmed == ".." {
        None
    } else {
        Some(trimmed.to_string())
    }
}

// Resolves base_dir/sub_dir, creating it if needed, and confirms the result
// really stays inside base_dir before returning it (defense in depth against
// a sub_dir value that snuck a ".." segment past sanitize_path_segment).
fn resolve_managed_dir(base_dir: &str, sub_dir: Option<&str>) -> Result<PathBuf, String> {
    if base_dir.trim().is_empty() {
        return Err("Pasta base não configurada.".into());
    }
    let base = PathBuf::from(base_dir);

    let target = match sub_dir {
        Some(name) => {
            let sanitized = sanitize_path_segment(name)
                .ok_or_else(|| "Nome de subpasta inválido.".to_string())?;
            base.join(sanitized)
        }
        None => base.clone(),
    };

    std::fs::create_dir_all(&target).map_err(|e| e.to_string())?;

    let canon_base = std::fs::canonicalize(&base).map_err(|e| e.to_string())?;
    let canon_target = std::fs::canonicalize(&target).map_err(|e| e.to_string())?;
    if !canon_target.starts_with(&canon_base) {
        return Err("Caminho de pasta inválido.".into());
    }

    Ok(target)
}

// Ensures base_dir/sub_dir exists and opens it in the OS file explorer.
// Runs entirely on the Rust side (bypassing the plugin-fs/plugin-opener ACL
// scopes, which are static and can't cover a user-configurable base_dir) so
// it works no matter what folder the user picked in Settings — client folder
// base, per-client folder, or the network backup share.
#[tauri::command]
fn open_managed_folder(
    app: tauri::AppHandle,
    base_dir: String,
    sub_dir: Option<String>,
) -> Result<(), String> {
    let target = resolve_managed_dir(&base_dir, sub_dir.as_deref())?;
    app.opener()
        .open_path(target.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| e.to_string())
}

// Ensures base_dir/sub_dir exists and writes `contents` to `filename` inside
// it, returning the final absolute path. Same rationale as
// open_managed_folder: sidesteps the static plugin-fs ACL for a
// user-configurable base_dir (e.g. the custom backup path).
#[tauri::command]
fn write_managed_file(
    base_dir: String,
    sub_dir: Option<String>,
    filename: String,
    contents: String,
) -> Result<String, String> {
    let dir = resolve_managed_dir(&base_dir, sub_dir.as_deref())?;
    let sanitized_filename =
        sanitize_path_segment(&filename).ok_or_else(|| "Nome de arquivo inválido.".to_string())?;
    let file_path = dir.join(sanitized_filename);

    std::fs::write(&file_path, contents).map_err(|e| e.to_string())?;

    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn close_splashscreen(window: tauri::Window) {
    // Close splashscreen
    if let Some(splashscreen) = window.get_webview_window("splashscreen") {
        splashscreen.close().unwrap();
    }
    // Show main window
    window.get_webview_window("main").unwrap().show().unwrap();
}

#[tauri::command]
async fn find_hub_ip() -> Result<Option<String>, String> {
    let port = 1234;

    let my_local_ip = match local_ip_address::local_ip() {
        Ok(ip) => ip,
        Err(e) => {
            eprintln!("Failed to get local IP: {}. Skipping network scan.", e);
            return Ok(None);
        }
    };

    // 2. Ensure it is an IPv4 address and extract the subnet
    let base_ip = match my_local_ip {
        IpAddr::V4(ipv4) => {
            // .octets() breaks the IP into an array of 4 numbers [192, 168, 1, 5]
            let octets = ipv4.octets();
            format!("{}.{}.{}", octets[0], octets[1], octets[2])
        }
        IpAddr::V6(_) => {
            return Err("IPv6 network scanning is not currently supported.".to_string());
        }
    };

    let mut tasks = vec![];

    for i in 1..=255 {
        let ip = format!("{}.{}", base_ip, i);
        let address = format!("{}:{}", ip, port);

        if ip == my_local_ip.to_string() {
            continue;
        }

        let task = tokio::spawn(async move {
            let connect_attempt = timeout(
                Duration::from_millis(1500), // Increased from 500ms to 1500ms
                TcpStream::connect(&address)
            ).await;

            if let Ok(Ok(_)) = connect_attempt {
                return Some(ip);
            }
            None
        });
        tasks.push(task);
    }

    let mut found_ip = None;
    // We iterate by value to await, but this consumes the vector.
    // So we'll move the handles into a temporary container if we want to abort the rest.
    for task in tasks {
        if found_ip.is_none() {
            if let Ok(Some(ip)) = task.await {
                found_ip = Some(ip);
            }
        } else {
            // Already found one, abort the rest
            task.abort();
        }
    }

    Ok(found_ip)
}

#[tauri::command]
async fn start_hub(token: String, state: tauri::State<'_, HubState>, app_handle: tauri::AppHandle) -> Result<bool, String> {
    let mut lock = state.shutdown_tx.lock().unwrap();
    if lock.is_some() {
        return Ok(true); // already running
    }

    let (tx, shutdown_rx) = oneshot::channel::<()>();
    *lock = Some(tx);

    let handle = app_handle.clone();

    tokio::spawn(async move {
        let (tx, _rx) = broadcast::channel(100);
        let app_state = Arc::new(AppState {
            tx,
            connected_clients: Mutex::new(HashMap::new()),
            token,
        });

        let axum_app = Router::new()
            .route("/ws", get(ws_handler))
            .with_state(app_state);

        // Retry binding to handle process fast-restarts hanging the port on Windows
        let mut listener = None;
        for i in 0..5 {
            match tokio::net::TcpListener::bind("0.0.0.0:1234").await {
                Ok(l) => {
                    listener = Some(l);
                    break;
                }
                Err(e) => {
                    eprintln!("⚠️ [Hub] Bind attempt {} failed: {}. Retrying in 2s...", i+1, e);
                    tokio::time::sleep(Duration::from_secs(2)).await;
                }
            }
        }

        match listener {
            Some(l) => {
                println!("🟢 [Hub] Local Hub Server started on port 1234");
                let server = axum::serve(
                    l,
                    axum_app.into_make_service_with_connect_info::<SocketAddr>(),
                );

                tokio::select! {
                    _ = server => {
                        println!("⚪ [Hub] Server stopped naturally.");
                    }
                    _ = shutdown_rx => {
                        println!("🔴 [Hub] Shutdown signal received. Closing Hub immediately.");
                    }
                }
            }
            None => {
                eprintln!("❌ [Hub] CRITICAL: Port 1234 is in use after retries!");
                let _ = handle.emit(
                    "server-error",
                    format!("Port 1234 is in use. The sync server could not start."),
                );
            }
        }
    });
    Ok(true)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(HubState { shutdown_tx: StdMutex::new(None) })
        .invoke_handler(tauri::generate_handler![
            find_hub_ip,
            close_splashscreen,
            start_hub,
            open_managed_folder,
            write_managed_file
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(move |app_handle, event| {
            // Intercept the exit event
            if let RunEvent::ExitRequested { .. } | RunEvent::Exit = event {
                // Take the transmitter out of the Mutex and send the shutdown signal
                let state: tauri::State<HubState> = app_handle.state();
                if let Ok(mut lock) = state.shutdown_tx.lock() {
                    if let Some(tx) = lock.take() {
                        println!("🚪 [App] App exiting, sending shutdown signal to Hub...");
                        let _ = tx.send(()); 
                    }
                };
            }
        });
}

// 3. Extract the IP address before upgrading the connection
async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Query(params): Query<HashMap<String, String>>,
) -> axum::response::Response {
    // Reject before the WS upgrade so unauthenticated peers never join the
    // broadcast group (they can't send/receive sync or epoch_reset messages).
    let provided = params.get("token").map(|s| s.as_str()).unwrap_or("");
    if provided.is_empty() || provided != state.token.as_str() {
        eprintln!("🚫 [Hub] Rejected connection from {}: bad sync token", addr);
        return (StatusCode::UNAUTHORIZED, "invalid sync token").into_response();
    }

    let ip = addr.ip().to_string();
    // **FIX**: Generate a unique ID for this specific connection.
    let client_uuid = Uuid::new_v4();
    ws.on_upgrade(move |socket| handle_socket(socket, state, ip, client_uuid))
}

// 4. The Smart Router Engine (now using UUIDs)
async fn handle_socket(socket: WebSocket, state: Arc<AppState>, ip: String, client_uuid: Uuid) {
    println!("🟢 Client connected from IP: {}, UUID: {}", ip, client_uuid);

    // Subscribe EARLY so we don't miss the initial presence broadcast!
    let mut rx = state.tx.subscribe();

    let (mut sender, mut receiver) = socket.split();

    // --- IDENTITY EVENT: Tell the client who they are ---
    let ident_msg = format!(
        r#"{{"type": "identity", "payload": "{}"}}"#,
        client_uuid
    );
    let _ = sender.send(Message::Text(ident_msg)).await;

    // --- CONNECTION EVENT: Add to roster and broadcast ---
    {
        // Add the new client to our map.
        let mut clients = state.connected_clients.lock().unwrap();
        clients.insert(client_uuid, ip.clone());

        // Collect all connected clients for the roster.
        let roster: Vec<serde_json::Value> = clients.iter()
            .map(|(id, ip)| serde_json::json!({ "id": id, "ip": ip }))
            .collect();

        let roster_msg = format!(
            r#"{{"type": "presence", "payload": {}}}"#,
            serde_json::to_string(&roster).unwrap()
        );
        // We use a nil UUID for server-sent messages so echo cancellation doesn't block it.
        let _ = state.tx.send((Uuid::nil(), roster_msg));
    }

    // TASK A: Sending DOWN to the client
    let my_uuid = client_uuid;
    let mut send_task = tokio::spawn(async move {
        loop {
            match rx.recv().await {
                Ok((sender_uuid, msg)) => {
                    // SERVER-SIDE ECHO CANCELLATION
                    if sender_uuid == my_uuid {
                        continue;
                    }
                    if sender.send(Message::Text(msg)).await.is_err() {
                        break;
                    }
                }
                Err(broadcast::error::RecvError::Lagged(count)) => {
                    eprintln!("⚠️ [Hub] Client {} is lagging. Missed {} messages.", my_uuid, count);
                    continue;
                }
                Err(broadcast::error::RecvError::Closed) => {
                    break;
                }
            }
        }
    });

    // TASK B: Receiving UP from the client
    let tx = state.tx.clone();
    let my_uuid_for_recv = client_uuid;
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(Message::Text(text))) = receiver.next().await {
            // **FIX**: Tag the outgoing message with this client's unique UUID.
            let _ = tx.send((my_uuid_for_recv, text));
        }
    });

    // Wait until the connection drops
    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    };

    // --- DISCONNECT EVENT: Remove from roster and broadcast ---
    println!("🔴 Client disconnected: {}, UUID: {}", ip, client_uuid);
    {
        let mut clients = state.connected_clients.lock().unwrap();
        clients.remove(&client_uuid);

        // Collect all connected clients for the roster.
        let roster: Vec<serde_json::Value> = clients.iter()
            .map(|(id, ip)| serde_json::json!({ "id": id, "ip": ip }))
            .collect();

        let roster_msg = format!(
            r#"{{"type": "presence", "payload": {}}}"#,
            serde_json::to_string(&roster).unwrap()
        );
        let _ = state.tx.send((Uuid::nil(), roster_msg));
    }
}