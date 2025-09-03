use crate::contacts::ContactTicket;
use iroh::{
    endpoint::Connection,
    protocol::{AcceptError, ProtocolHandler},
    Endpoint, NodeAddr,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    sync::{
        broadcast::{Receiver, Sender},
        Mutex,
    },
};

pub const ALPN: &[u8] = b"free-voip/call";

const RESPONSE_ACCEPT: u8 = 1;
const RESPONSE_DECLINE: u8 = 0;

#[derive(Debug)]
pub struct CallProtocol {
    ring_tx: Sender<ContactTicket>,
    response_rx: Mutex<Receiver<bool>>,
}

impl CallProtocol {
    pub fn new(ring_tx: Sender<ContactTicket>, response_rx: Receiver<bool>) -> Self {
        Self {
            ring_tx,
            response_rx: Mutex::new(response_rx),
        }
    }

    pub async fn ring(
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
        Ok(response == RESPONSE_ACCEPT)
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
        proto_tx.write_u8(response).await?;
        Ok(())
    }
}
