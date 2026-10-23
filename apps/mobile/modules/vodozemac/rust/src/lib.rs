//! Thin uniffi wrapper over vodozemac. No cryptography of our own (spec D10):
//! every method forwards to vodozemac. Keys, pickles and messages cross as strings;
//! plaintext crosses as bytes. NOT yet compiled (see docs/specs/e2ee-mobile-crypto-spike.md):
//! vodozemac method names follow the 0.9 docs and may need small fixes on first build.
use std::sync::{Arc, Mutex};

use vodozemac::megolm::{
    GroupSession, GroupSessionPickle, InboundGroupSession, InboundGroupSessionPickle, MegolmMessage,
    SessionConfig as MegolmConfig, SessionKey,
};
use vodozemac::olm::{Account, AccountPickle, OlmMessage, Session, SessionConfig, SessionPickle};
use vodozemac::Curve25519PublicKey;

uniffi::setup_scaffolding!();

#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum CryptoError {
    #[error("{0}")]
    Failed(String),
}
type R<T> = Result<T, CryptoError>;

fn err<E: std::fmt::Display>(x: E) -> CryptoError {
    CryptoError::Failed(x.to_string())
}
fn key32(b: &[u8]) -> R<[u8; 32]> {
    b.try_into().map_err(|_| CryptoError::Failed("pickle key must be 32 bytes".into()))
}

#[derive(uniffi::Record)]
pub struct IdentityKeys {
    pub ed25519: String,
    pub curve25519: String,
}
#[derive(uniffi::Record)]
pub struct EncryptedOlm {
    /// 0 = pre-key message, 1 = normal message
    pub message_type: u32,
    pub body: String,
}
#[derive(uniffi::Record)]
pub struct InboundOlm {
    pub session: Arc<OlmSession>,
    pub plaintext: Vec<u8>,
}
#[derive(uniffi::Record)]
pub struct DecryptedMegolm {
    pub plaintext: Vec<u8>,
    pub message_index: u32,
}

#[derive(uniffi::Object)]
pub struct OlmAccount(Mutex<Account>);

#[uniffi::export]
impl OlmAccount {
    #[uniffi::constructor]
    pub fn new() -> Arc<Self> {
        Arc::new(Self(Mutex::new(Account::new())))
    }
    #[uniffi::constructor]
    pub fn from_pickle(pickle: String, key: Vec<u8>) -> R<Arc<Self>> {
        let p = AccountPickle::from_encrypted(&pickle, &key32(&key)?).map_err(err)?;
        Ok(Arc::new(Self(Mutex::new(Account::from_pickle(p)))))
    }
    pub fn pickle(&self, key: Vec<u8>) -> R<String> {
        Ok(self.0.lock().unwrap().pickle().encrypt(&key32(&key)?))
    }
    pub fn identity_keys(&self) -> IdentityKeys {
        let k = self.0.lock().unwrap().identity_keys();
        IdentityKeys { ed25519: k.ed25519.to_base64(), curve25519: k.curve25519.to_base64() }
    }
    pub fn sign(&self, message: Vec<u8>) -> String {
        self.0.lock().unwrap().sign(&message).to_base64()
    }
    pub fn generate_one_time_keys(&self, count: u32) {
        self.0.lock().unwrap().generate_one_time_keys(count as usize);
    }
    /// Unpublished one-time keys as base64 curve25519 keys.
    pub fn one_time_keys(&self) -> Vec<String> {
        self.0.lock().unwrap().one_time_keys().values().map(|k| k.to_base64()).collect()
    }
    pub fn mark_keys_as_published(&self) {
        self.0.lock().unwrap().mark_keys_as_published();
    }
    pub fn create_outbound_session(
        &self,
        their_identity_key: String,
        their_one_time_key: String,
    ) -> R<Arc<OlmSession>> {
        let id = Curve25519PublicKey::from_base64(&their_identity_key).map_err(err)?;
        let otk = Curve25519PublicKey::from_base64(&their_one_time_key).map_err(err)?;
        let s = self.0.lock().unwrap().create_outbound_session(SessionConfig::version_2(), id, otk);
        Ok(Arc::new(OlmSession(Mutex::new(s))))
    }
    pub fn create_inbound_session(
        &self,
        their_identity_key: String,
        message_type: u32,
        body: String,
    ) -> R<InboundOlm> {
        let id = Curve25519PublicKey::from_base64(&their_identity_key).map_err(err)?;
        let msg = OlmMessage::from_parts(message_type as usize, &body).map_err(err)?;
        let OlmMessage::PreKey(pre) = msg else {
            return Err(CryptoError::Failed("not a pre-key message".into()));
        };
        let r = self.0.lock().unwrap().create_inbound_session(id, &pre).map_err(err)?;
        Ok(InboundOlm { session: Arc::new(OlmSession(Mutex::new(r.session))), plaintext: r.plaintext })
    }
}

#[derive(uniffi::Object)]
pub struct OlmSession(Mutex<Session>);

#[uniffi::export]
impl OlmSession {
    #[uniffi::constructor]
    pub fn from_pickle(pickle: String, key: Vec<u8>) -> R<Arc<Self>> {
        let p = SessionPickle::from_encrypted(&pickle, &key32(&key)?).map_err(err)?;
        Ok(Arc::new(Self(Mutex::new(Session::from_pickle(p)))))
    }
    pub fn pickle(&self, key: Vec<u8>) -> R<String> {
        Ok(self.0.lock().unwrap().pickle().encrypt(&key32(&key)?))
    }
    pub fn session_id(&self) -> String {
        self.0.lock().unwrap().session_id()
    }
    pub fn encrypt(&self, plaintext: Vec<u8>) -> EncryptedOlm {
        let (t, body) = self.0.lock().unwrap().encrypt(plaintext).to_parts();
        EncryptedOlm { message_type: t as u32, body }
    }
    pub fn decrypt(&self, message_type: u32, body: String) -> R<Vec<u8>> {
        let msg = OlmMessage::from_parts(message_type as usize, &body).map_err(err)?;
        self.0.lock().unwrap().decrypt(&msg).map_err(err)
    }
}

#[derive(uniffi::Object)]
pub struct MegolmOutbound(Mutex<GroupSession>);

#[uniffi::export]
impl MegolmOutbound {
    #[uniffi::constructor]
    pub fn new() -> Arc<Self> {
        Arc::new(Self(Mutex::new(GroupSession::new(MegolmConfig::version_1()))))
    }
    #[uniffi::constructor]
    pub fn from_pickle(pickle: String, key: Vec<u8>) -> R<Arc<Self>> {
        let p = GroupSessionPickle::from_encrypted(&pickle, &key32(&key)?).map_err(err)?;
        Ok(Arc::new(Self(Mutex::new(GroupSession::from_pickle(p)))))
    }
    pub fn pickle(&self, key: Vec<u8>) -> R<String> {
        Ok(self.0.lock().unwrap().pickle().encrypt(&key32(&key)?))
    }
    pub fn session_id(&self) -> String {
        self.0.lock().unwrap().session_id()
    }
    pub fn session_key(&self) -> String {
        self.0.lock().unwrap().session_key().to_base64()
    }
    pub fn message_index(&self) -> u32 {
        self.0.lock().unwrap().message_index()
    }
    pub fn encrypt(&self, plaintext: Vec<u8>) -> String {
        self.0.lock().unwrap().encrypt(plaintext).to_base64()
    }
}

#[derive(uniffi::Object)]
pub struct MegolmInbound(Mutex<InboundGroupSession>);

#[uniffi::export]
impl MegolmInbound {
    #[uniffi::constructor]
    pub fn new(session_key: String) -> R<Arc<Self>> {
        let k = SessionKey::from_base64(&session_key).map_err(err)?;
        Ok(Arc::new(Self(Mutex::new(InboundGroupSession::new(&k, MegolmConfig::version_1())))))
    }
    #[uniffi::constructor]
    pub fn from_pickle(pickle: String, key: Vec<u8>) -> R<Arc<Self>> {
        let p = InboundGroupSessionPickle::from_encrypted(&pickle, &key32(&key)?).map_err(err)?;
        Ok(Arc::new(Self(Mutex::new(InboundGroupSession::from_pickle(p)))))
    }
    pub fn pickle(&self, key: Vec<u8>) -> R<String> {
        Ok(self.0.lock().unwrap().pickle().encrypt(&key32(&key)?))
    }
    pub fn session_id(&self) -> String {
        self.0.lock().unwrap().session_id()
    }
    pub fn decrypt(&self, message: String) -> R<DecryptedMegolm> {
        let m = MegolmMessage::from_base64(&message).map_err(err)?;
        let d = self.0.lock().unwrap().decrypt(&m).map_err(err)?;
        Ok(DecryptedMegolm { plaintext: d.plaintext, message_index: d.message_index })
    }
}
