//! The wire format between the Bun app and the probe binary.
//!
//! The contract is deliberately narrow. The probe is told *where* to connect
//! (a hostname and an IP that the TypeScript policy layer has already
//! resolved and validated) and *what* to send. It is never told whether a
//! target is allowed to be reached — that decision belongs to
//! `lib/security.ts`, and the probe has no way to override it.
//!
//! That split is what keeps the SSRF policy in exactly one place. The probe
//! cannot be talked into connecting somewhere the policy layer did not
//! approve, because it is given an address rather than a name.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// One probe to run.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Job {
    /// An HTTP or HTTPS request to a pre-validated target.
    Http(HttpJob),
    /// A TCP connect to a pre-validated target.
    Tcp(TcpJob),
}

#[derive(Debug, Clone, Deserialize)]
pub struct HttpJob {
    /// Opaque identifier, echoed back on the result so the caller can match
    /// results to jobs.
    pub id: String,
    /// The original URL, with its hostname intact. The probe connects to
    /// `resolved_ip` but keeps this URL for the `Host` header and the TLS
    /// server name, exactly as the TypeScript implementation did.
    pub url: String,
    /// The address the policy layer resolved and validated. The probe never
    /// resolves this name itself.
    pub resolved_ip: String,
    pub method: String,
    #[serde(default)]
    pub headers: BTreeMap<String, String>,
    #[serde(default)]
    pub body: Option<String>,
    /// Total budget for the request, in milliseconds.
    pub timeout_ms: u64,
    /// Whether the response body is needed (keyword monitors need it).
    #[serde(default)]
    pub read_body: bool,
    /// Hard cap on how much of the body is read, so a huge response cannot
    /// exhaust memory.
    #[serde(default = "default_max_body_bytes")]
    pub max_body_bytes: usize,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TcpJob {
    pub id: String,
    /// The validated address to connect to.
    pub host: String,
    pub port: u16,
    pub timeout_ms: u64,
}

fn default_max_body_bytes() -> usize {
    64 * 1024
}

/// The whole batch, as read from stdin.
#[derive(Debug, Clone, Deserialize)]
pub struct Batch {
    #[serde(default)]
    pub jobs: Vec<Job>,
}

/// What went wrong, in a form the caller can turn into a message.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorKind {
    /// The budget ran out.
    Timeout,
    /// The TCP connection could not be established.
    Connect,
    /// The TLS handshake failed.
    Tls,
    /// The connection dropped mid-request.
    Io,
    /// The URL or the job itself was not usable.
    Protocol,
}

/// The outcome of one job.
#[derive(Debug, Clone, Serialize)]
pub struct JobResult {
    pub id: String,
    /// True when the request or connection completed. A completed HTTP
    /// request with a 500 status is still `ok: true` — "ok" means "the
    /// probe reached the far end", not "the far end was happy".
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status_code: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status_text: Option<String>,
    /// Time to the response headers, in milliseconds. This is the number the
    /// dashboard shows, so it is measured the same way the TypeScript
    /// implementation measured it: before the body is read.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ping_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub headers: Option<BTreeMap<String, String>>,
    /// The response body, when the job asked for it.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_kind: Option<ErrorKind>,
}

/// The whole batch, as written to stdout.
#[derive(Debug, Clone, Serialize)]
pub struct BatchResult {
    pub results: Vec<JobResult>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_mixed_batch() {
        let raw = r#"{
          "jobs": [
            {
              "kind": "http",
              "id": "a",
              "url": "https://example.com/",
              "resolved_ip": "93.184.216.34",
              "method": "GET",
              "timeout_ms": 1000
            },
            {
              "kind": "tcp",
              "id": "b",
              "host": "93.184.216.34",
              "port": 443,
              "timeout_ms": 1000
            }
          ]
        }"#;

        let batch: Batch = serde_json::from_str(raw).expect("parses");
        assert_eq!(batch.jobs.len(), 2);
        match &batch.jobs[0] {
            Job::Http(job) => {
                assert_eq!(job.id, "a");
                assert_eq!(job.resolved_ip, "93.184.216.34");
                // The default cap applies when the caller does not set one.
                assert_eq!(job.max_body_bytes, 64 * 1024);
                assert!(!job.read_body);
            }
            Job::Tcp(_) => panic!("expected an http job"),
        }
    }

    #[test]
    fn accepts_an_empty_batch() {
        let batch: Batch = serde_json::from_str(r#"{"jobs":[]}"#).expect("parses");
        assert!(batch.jobs.is_empty());
    }

    #[test]
    fn a_failed_result_omits_the_fields_it_does_not_have() {
        let result = JobResult {
            id: "a".into(),
            ok: false,
            status_code: None,
            status_text: None,
            ping_ms: None,
            headers: None,
            body: None,
            location: None,
            error: Some("connection refused".into()),
            error_kind: Some(ErrorKind::Connect),
        };

        let json = serde_json::to_string(&result).expect("serializes");
        assert!(!json.contains("status_code"));
        assert!(!json.contains("ping_ms"));
        assert!(json.contains("\"error_kind\":\"connect\""));
    }
}
