use iroh::{
    endpoint::Connection,
    protocol::{AcceptError, ProtocolHandler},
    Endpoint, NodeAddr, NodeId,
};
use iroh_base::ticket::{ParseError as TicketParseError, Ticket};
use serde::{Deserialize, Serialize};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    sync::{
        broadcast::{Receiver, Sender},
        Mutex,
    },
};

pub const ALPN: &[u8] = b"free-voip/contacts";

const RESPONSE_ACCEPT: u8 = 1;
const RESPONSE_DECLINE: u8 = 0;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ContactTicket {
    pub nickname: String,
    pub node_id: NodeId,
}

impl Ticket for ContactTicket {
    const KIND: &'static str = "node";

    fn to_bytes(&self) -> Vec<u8> {
        postcard::to_stdvec(self).expect("Postcard serializtion should be infallible")
    }

    fn from_bytes(bytes: &[u8]) -> Result<Self, TicketParseError> {
        postcard::from_bytes(bytes).map_err(Into::into)
    }
}

#[derive(Debug)]
pub struct ContactsProtocol {
    request_tx: Sender<ContactTicket>,
    response_rx: Mutex<Receiver<bool>>,
}

impl ContactsProtocol {
    pub fn new(request_tx: Sender<ContactTicket>, response_rx: Receiver<bool>) -> Self {
        Self {
            request_tx,
            response_rx: Mutex::new(response_rx),
        }
    }

    pub async fn send_request(
        endpoint: &Endpoint,
        recipient_addr: impl Into<NodeAddr>,
        sender_ticket: ContactTicket,
    ) -> Result<bool, String> {
        let connection = endpoint
            .connect(recipient_addr, ALPN)
            .await
            .map_err(|e| e.to_string())?;
        let (mut proto_tx, mut proto_rx) = connection.open_bi().await.map_err(|e| e.to_string())?;

        // Send the contact ticket
        let serialized_ticket = Ticket::serialize(&sender_ticket);
        proto_tx
            .write(serialized_ticket.as_bytes())
            .await
            .map_err(|e| e.to_string())?;

        // Listen for accept/decline response
        let response = proto_rx.read_u8().await.map_err(|e| e.to_string())?;
        Ok(response == RESPONSE_ACCEPT)
    }
}

impl ProtocolHandler for ContactsProtocol {
    async fn accept(&self, connection: Connection) -> Result<(), AcceptError> {
        let (mut proto_tx, mut proto_rx) = connection.accept_bi().await?;

        // Retrieve connecting side's contact ticket
        let contact_ticket = {
            let mut str_buf = String::new();
            proto_rx.read_to_string(&mut str_buf).await?;
            <ContactTicket as Ticket>::deserialize(&str_buf).map_err(AcceptError::from_err)?
        };
        println!(
            "Received contact request from {} ({})",
            contact_ticket.nickname, contact_ticket.node_id
        );

        // Get user's response
        let response = {
            let mut response_rx = self.response_rx.lock().await;
            self.request_tx
                .send(contact_ticket)
                .map_err(AcceptError::from_err)?;
            let user_response = response_rx.recv().await.map_err(AcceptError::from_err)?;

            if user_response {
                RESPONSE_ACCEPT
            } else {
                RESPONSE_DECLINE
            }
        };

        // Send user's response to requester
        proto_tx
            .write_u8(response)
            .await
            .map_err(AcceptError::from_err)?;

        // Finished here
        proto_tx.finish()?;
        connection.closed().await;
        Ok(())
    }
}
