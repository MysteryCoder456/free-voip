use iroh::{protocol::ProtocolHandler, NodeAddr};

pub const ALPN: &[u8] = b"free-voip/call";

#[derive(Debug)]
pub struct CallProtocol;

impl CallProtocol {
    pub fn ring(recipient_addr: impl Into<NodeAddr>) -> Result<bool, String> {
        // TODO: send ring to recipient
        todo!()
    }
}

impl ProtocolHandler for CallProtocol {
    async fn accept(
        &self,
        connection: iroh::endpoint::Connection,
    ) -> Result<(), iroh::protocol::AcceptError> {
        // TODO: accept incoming call
        todo!()
    }
}
