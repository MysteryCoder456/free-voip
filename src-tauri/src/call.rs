use crate::contacts::ContactTicket;
use iroh::{
    endpoint::{Connection, WriteError},
    protocol::{AcceptError, ProtocolHandler},
    Endpoint, NodeAddr,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    sync::{broadcast, Mutex},
};

pub const ALPN: &[u8] = b"free-voip/call";

const RESPONSE_ACCEPT: u8 = 1;
const RESPONSE_DECLINE: u8 = 0;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
#[serde(rename_all_fields = "camelCase")]
pub enum CallMedia {
    Video {
        #[serde(rename = "type")]
        frame_type: String,
        timestamp: u64,
        duration: Option<u64>,
        byte_length: u64,
        frame_data: Vec<u8>,
    },
    Audio {
        #[serde(rename = "type")]
        frame_type: String,
        timestamp: u64,
        duration: Option<u64>,
        byte_length: u64,
        frame_data: Vec<u8>,
    },
}

#[derive(Debug)]
pub struct CallProtocol {
    ring_tx: broadcast::Sender<ContactTicket>,
    response_rx: Mutex<broadcast::Receiver<bool>>,
    in_media_tx: broadcast::Sender<CallMedia>,
    out_media_rx: broadcast::Receiver<CallMedia>,
    hang_up_tx: broadcast::Sender<()>,
    connection: Arc<Mutex<Option<Connection>>>,
}

impl Clone for CallProtocol {
    fn clone(&self) -> Self {
        let response_rx = self.response_rx.try_lock().unwrap();

        Self {
            ring_tx: self.ring_tx.clone(),
            response_rx: Mutex::new(response_rx.resubscribe()),
            in_media_tx: self.in_media_tx.clone(),
            out_media_rx: self.out_media_rx.resubscribe(),
            hang_up_tx: self.hang_up_tx.clone(),
            connection: self.connection.clone(),
        }
    }
}

impl CallProtocol {
    pub fn new(
        ring_tx: broadcast::Sender<ContactTicket>,
        response_rx: broadcast::Receiver<bool>,
        in_media_tx: broadcast::Sender<CallMedia>,
        out_media_rx: broadcast::Receiver<CallMedia>,
        hang_up_tx: broadcast::Sender<()>,
    ) -> Self {
        Self {
            ring_tx,
            response_rx: Mutex::new(response_rx),
            in_media_tx,
            out_media_rx,
            hang_up_tx,
            connection: Arc::new(Mutex::new(None)),
        }
    }

    async fn start_media_tasks(&self, conn: Connection, self_is_ringer: bool) {
        // TODO: propagate errors to GUI

        let stream = if self_is_ringer {
            conn.open_bi().await
        } else {
            conn.accept_bi().await
        };

        if let Err(err) = stream {
            if self_is_ringer {
                eprintln!("Failed to open media stream: {}", err);
                conn.close(1u32.into(), b"Failed to open media stream");
            } else {
                eprintln!("Failed to accept media stream: {}", err);
                conn.closed().await;
            }
            return;
        }
        let (mut proto_tx, mut proto_rx) = stream.unwrap();

        // Set connection state
        {
            let mut conn_state = self.connection.lock().await;
            *conn_state = Some(conn);
        }

        // Prime the lazy QUIC stream
        if self_is_ringer {
            proto_tx.write_u8(0).await.unwrap();
        } else {
            assert_eq!(proto_rx.read_u8().await.unwrap(), 0);
        }

        let in_media_tx = self.in_media_tx.clone();
        let mut out_media_rx = self.out_media_rx.resubscribe();

        // Incoming media
        let hang_up_clone = self.hang_up_tx.clone();
        tokio::spawn(async move {
            loop {
                let buf_size = proto_rx
                    .read_u64()
                    .await
                    .expect("Expected to receive message size");
                let buf_result = proto_rx.read_to_end(buf_size as usize).await;

                match buf_result {
                    Ok(buf) => match postcard::from_bytes::<CallMedia>(&buf) {
                        Ok(media) => {
                            if let Err(err) = in_media_tx.send(media) {
                                eprintln!("Failed to forward incoming media frame to GUI: {}", err);
                            }
                        }
                        Err(err) => eprintln!("Unable to deserialize media frame: {}", err),
                    },
                    Err(err) => match err {
                        iroh::endpoint::ReadToEndError::Read(read_error) => match read_error {
                            iroh::endpoint::ReadError::ConnectionLost(connection_error) => {
                                println!("Peer disconnected: {}", connection_error);
                                break;
                            }
                            iroh::endpoint::ReadError::Reset(var_int) => {
                                println!("Stream reset by peer: {}", var_int);
                                break;
                            }
                            iroh::endpoint::ReadError::ClosedStream => {
                                println!("Stream closed by peer");
                                break;
                            }
                            _ => {
                                eprintln!("Failed to read media frame from peer: {}", read_error);
                            }
                        },
                        iroh::endpoint::ReadToEndError::TooLong => {
                            eprintln!("Read too long error!");
                        }
                    },
                }
            }
            hang_up_clone.send(()).expect("Failed to signal hang up");
        });

        // Outgoing media
        let hang_up_clone = self.hang_up_tx.clone();
        tokio::spawn(async move {
            while let Ok(media) = out_media_rx.recv().await {
                match postcard::to_stdvec(&media) {
                    Ok(buf) => {
                        // Send buffer size
                        proto_tx
                            .write_u64(buf.len() as u64)
                            .await
                            .expect("Expected to send message size");

                        // Send buffer
                        if let Err(err) = proto_tx.write_all(&buf).await {
                            match err {
                                WriteError::ConnectionLost(connection_error) => {
                                    println!("Peer disconnected: {}", connection_error);
                                    break;
                                }
                                WriteError::ClosedStream => {
                                    println!("Stream closed by peer");
                                    break;
                                }
                                _ => {
                                    eprintln!("Failed to send media frame to peer: {}", err);
                                }
                            }
                        }
                    }
                    Err(err) => eprintln!("Unable to serialize media frame: {}", err),
                }
            }
            hang_up_clone.send(()).expect("Failed to signal hang up");
        });
    }

    pub async fn ring(
        &self,
        endpoint: &Endpoint,
        recipient_addr: impl Into<NodeAddr>,
        self_ticket: &ContactTicket,
    ) -> Result<bool, String> {
        let conn = endpoint
            .connect(recipient_addr, ALPN)
            .await
            .map_err(|e| e.to_string())?;
        let (mut proto_tx, mut proto_rx) = conn.open_bi().await.map_err(|e| e.to_string())?;

        // Identify ourself with recipient
        let serialized_ticket = postcard::to_stdvec(self_ticket).map_err(|e| e.to_string())?;
        proto_tx
            .write_all(&serialized_ticket)
            .await
            .map_err(|e| e.to_string())?;

        // Wait for ring response
        let response = proto_rx.read_u8().await.map_err(|e| e.to_string())?;

        if response == RESPONSE_ACCEPT {
            self.start_media_tasks(conn, true).await;
        } else {
            conn.close(0u32.into(), b"Ring request complete");
        }

        Ok(response == RESPONSE_ACCEPT)
    }

    pub async fn disconnect(&self) {
        let mut conn_state = self.connection.lock().await;
        if let Some(conn) = conn_state.as_ref() {
            conn.close(0u32.into(), b"Hanging up");
            conn.closed().await;
        }
        *conn_state = None;
    }
}

impl ProtocolHandler for CallProtocol {
    async fn accept(&self, connection: Connection) -> Result<(), AcceptError> {
        let (mut proto_tx, mut proto_rx) = connection.accept_bi().await?;

        // Identify caller
        let ticket = {
            let mut buf = Vec::<u8>::new();
            proto_rx.read_buf(&mut buf).await?;
            postcard::from_bytes::<ContactTicket>(&buf).map_err(AcceptError::from_err)?
        };

        // Display call UI and get user's response
        let response = {
            let mut response_rx = self.response_rx.lock().await;

            self.ring_tx.send(ticket).map_err(AcceptError::from_err)?;
            let gui_response = response_rx.recv().await.map_err(AcceptError::from_err)?;

            if gui_response {
                RESPONSE_ACCEPT
            } else {
                RESPONSE_DECLINE
            }
        };

        // Send response back to caller
        dbg!(response);
        proto_tx.write_u8(response).await?;

        if response == RESPONSE_ACCEPT {
            self.start_media_tasks(connection, false).await;
        } else {
            connection.closed().await;
        }

        Ok(())
    }
}
