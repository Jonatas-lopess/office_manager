use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        ConnectInfo, State,
    },
    routing::get,
    Router,
};
use futures::{sink::SinkExt, stream::StreamExt};
use std::{
    collections::HashSet,
    net::{IpAddr, SocketAddr},
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::{net::TcpStream, sync::{broadcast, oneshot}, time::timeout};
use tauri::RunEvent;

// 1. The state now tracks connected IPs and uses a Tuple (Sender IP, JSON Message) for the channel
struct AppState {
    tx: broadcast::Sender<(String, String)>,
    connected_ips: Mutex<HashSet<String>>,
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
                Duration::from_millis(200),
                TcpStream::connect(&address)
            ).await;

            if let Ok(Ok(_)) = connect_attempt {
                return Some(ip);
            }
            None
        });
        tasks.push(task);
    }

    for task in tasks {
        if let Ok(Some(found_ip)) = task.await {
            return Ok(Some(found_ip)); 
        }
    }

    Ok(None)
}

pub fn run() {
    // Create the shutdown channel
    // tx = Transmitter (we keep this on the main thread)
    // rx = Receiver (we send this to the background server thread)
    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
    
    // Wrap the transmitter in a Mutex so it can be safely moved into Tauri's event loop
    let shutdown_tx = Mutex::new(Some(shutdown_tx));

    // Notice we use `.build()` instead of `.default().run()` so we can attach the event listener
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![find_hub_ip])
        .setup(|_app| {
            tokio::spawn(async move {
                // The channel now holds the tuple: (String, String)
                let (tx, _rx) = broadcast::channel(100);
                let app_state = Arc::new(AppState {
                    tx,
                    connected_ips: Mutex::new(HashSet::new()),
                });

                let axum_app = Router::new()
                    .route("/ws", get(ws_handler))
                    .with_state(app_state);

                match tokio::net::TcpListener::bind("0.0.0.0:1234").await {
                    Ok(listener) => {
                        println!("Local Hub Server started on port 1234");
                        // 2. Tell Axum to extract IP addresses from incoming connections
                        axum::serve(
                            listener,
                            axum_app.into_make_service_with_connect_info::<SocketAddr>(),
                        )
                        .with_graceful_shutdown(async {
                            // The server will pause here and wait for the rx signal
                            shutdown_rx.await.ok();
                            println!("Gracefully shutting down the WebSocket server...");
                        })
                        .await
                        .unwrap();
                    }
                    Err(e) => eprintln!("CRITICAL: Port 1234 might be in use! Error: {}", e),
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application");

        // Start the application event loop
    app.run(move |_app_handle, event| {
        // Intercept the close event
        if let RunEvent::ExitRequested { .. } = event {
            // Take the transmitter out of the Mutex and send the shutdown signal
            if let Some(tx) = shutdown_tx.lock().unwrap().take() {
                let _ = tx.send(()); 
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
    ws.on_upgrade(move |socket| handle_socket(socket, state, ip))
}

// 4. The Smart Router Engine
async fn handle_socket(socket: WebSocket, state: Arc<AppState>, ip: String) {
    println!("🟢 Client connected from IP: {}", ip);

    // --- CONNECTION EVENT: Add to roster and broadcast ---
    {
        let mut ips = state.connected_ips.lock().unwrap();
        ips.insert(ip.clone());
        
        let roster_msg = format!(
            r#"{{"type": "presence", "payload": {:?}}}"#,
            ips.iter().collect::<Vec<_>>()
        );
        // We use "server" as the sender IP so the echo cancellation doesn't block it!
        let _ = state.tx.send(("server".to_string(), roster_msg));
    }

    let (mut sender, mut receiver) = socket.split();
    let mut rx = state.tx.subscribe();

    // TASK A: Sending DOWN to the client
    let my_ip = ip.clone();
    let mut send_task = tokio::spawn(async move {
        while let Ok((sender_ip, msg)) = rx.recv().await {
            // SERVER-SIDE ECHO CANCELLATION: 
            // If the message came from THIS exact IP, skip it!
            if sender_ip == my_ip {
                continue; 
            }
            if sender.send(Message::Text(msg)).await.is_err() {
                break;
            }
        }
    });

    // TASK B: Receiving UP from the client
    let tx = state.tx.clone();
    let my_ip_for_recv = ip.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(Message::Text(text))) = receiver.next().await {
            // Tag the outgoing message with this client's IP!
            let _ = tx.send((my_ip_for_recv.clone(), text));
        }
    });

    // Wait until the connection drops
    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    };

    // --- DISCONNECT EVENT: Remove from roster and broadcast ---
    println!("🔴 Client disconnected: {}", ip);
    {
        let mut ips = state.connected_ips.lock().unwrap();
        ips.remove(&ip);
        
        let roster_msg = format!(
            r#"{{"type": "presence", "payload": {:?}}}"#,
            ips.iter().collect::<Vec<_>>()
        );
        let _ = state.tx.send(("server".to_string(), roster_msg));
    }
}