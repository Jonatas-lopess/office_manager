use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        ConnectInfo, State,
    },
    routing::get,
    Router,
};
use futures::{sink::SinkExt, stream::StreamExt};
use std::{collections::HashMap, net::{IpAddr, SocketAddr}, sync::{Arc, Mutex}, time::Duration};
use tokio::{net::TcpStream, sync::{broadcast, oneshot}, time::timeout};
use tauri::{Emitter, Manager, RunEvent};
use uuid::Uuid;
use serde_json;

// 1. The state now uses a per-connection UUID as the unique identifier.
//    - The broadcast channel sends a (sender_uuid, msg) tuple.
//    - We track clients in a HashMap mapping the UUID to their IP for logging/display.
struct AppState {
    // The broadcast channel now holds a (sender_uuid, msg) tuple.
    tx: broadcast::Sender<(Uuid, String)>,
    connected_clients: Mutex<HashMap<Uuid, String>>,
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

    // 1. Get the local IP address dynamically from the OS
    let my_local_ip = match local_ip_address::local_ip() {
        Ok(ip) => ip,
        Err(e) => return Err(format!("Failed to get local IP: {}", e)),
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
                Duration::from_millis(500),
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

pub fn run() {
    // 1. Create the shutdown channel
    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
    
    // Wrap the transmitter in a Mutex so it can be safely moved into Tauri's event loop
    let shutdown_tx = Arc::new(Mutex::new(Some(shutdown_tx)));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![find_hub_ip, close_splashscreen])
        .setup(move |app| {
            let handle = app.handle().clone();
            
            tokio::spawn(async move {
                let (tx, _rx) = broadcast::channel(100);
                let app_state = Arc::new(AppState {
                    tx,
                    connected_clients: Mutex::new(HashMap::new()),
                });

                let axum_app = Router::new()
                    .route("/ws", get(ws_handler))
                    .with_state(app_state);

                match tokio::net::TcpListener::bind("0.0.0.0:1234").await {
                    Ok(listener) => {
                        println!("🟢 [Hub] Local Hub Server started on port 1234");
                        
                        // Fix: Instead of .with_graceful_shutdown (which can hang waiting for connections),
                        // we use tokio::select! to immediately drop the server future when notified.
                        let server = axum::serve(
                            listener,
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
                    Err(e) => {
                        eprintln!("❌ [Hub] CRITICAL: Port 1234 might be in use! Error: {}", e);
                        let _ = handle.emit(
                            "server-error",
                            format!("Port 1234 is in use. The sync server could not start."),
                        );
                    }
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(move |_app_handle, event| {
            // 2. Intercept the exit event
            if let RunEvent::ExitRequested { .. } | RunEvent::Exit = event {
                // Take the transmitter out of the Mutex and send the shutdown signal
                if let Ok(mut lock) = shutdown_tx.lock() {
                    if let Some(tx) = lock.take() {
                        println!("🚪 [App] App exiting, sending shutdown signal to Hub...");
                        let _ = tx.send(()); 
                    }
                }
            }
        });
}

// 3. Extract the IP address before upgrading the connection
async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
) -> axum::response::Response {
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