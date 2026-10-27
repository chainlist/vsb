use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum Error {
  #[error(transparent)]
  Io(#[from] std::io::Error),
  #[error(transparent)]
  Json(#[from] serde_json::Error),
  #[error(transparent)]
  Sql(#[from] rusqlite::Error),
  #[error("{0}")]
  Msg(String),
}

pub type Result<T> = std::result::Result<T, Error>;

pub fn msg<T>(text: impl Into<String>) -> Result<T> {
  Err(Error::Msg(text.into()))
}

// Commands hand errors to the frontend as plain strings.
impl Serialize for Error {
  fn serialize<S: Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
    s.serialize_str(&self.to_string())
  }
}
