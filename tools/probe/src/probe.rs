//! The actual probing: HTTP(S) requests and TCP connects.
//!
//! Every job arrives with an address that the policy layer has already
//! resolved and validated. The probe connects to that address, never to a
//! name, and never resolves anything itself.

use crate::protocol::{BatchResult, ErrorKind, HttpJob, Job, JobResult, TcpJob};
use std::collections::{BTreeMap, HashMap};
use std::net::{IpAddr, SocketAddr};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::net::TcpStream;
use tokio::time::timeout;

/// A cache of HTTP clients, one per distinct target.
///
/// Building a client means building a TLS configuration and a connection
/// pool, which is not free. A batch usually has a handful of distinct
/// targets, so the clients are built once and shared: the connection pool
/// and the TLS session cache then work across the jobs that share a target.
///
/// The per-request budget is deliberately *not* part of the client. It goes
/// on the request instead, so two jobs against the same target can have
/// different timeouts and still share a client.
#[derive(Clone, Default)]
struct ClientCache(Arc<Mutex<HashMap<String, reqwest::Client>>>);

impl ClientCache {
    /// Returns the client for `key`, building it the first time it is asked
    /// for.
    fn get(
        &self,
        key: String,
        build: impl FnOnce() -> reqwest::Client,
    ) -> reqwest::Client {
        let mut cache = self.0.lock().expect("client cache is not poisoned");
        cache.entry(key).or_insert_with(build).clone()
    }
}

/// Runs every job in the batch, concurrently, and returns the results in the
/// same order as the jobs.
pub async fn run_batch(jobs: Vec<Job>) -> BatchResult {
    let cache = ClientCache::default();
    let mut handles = Vec::with_capacity(jobs.len());

    for job in jobs {
        let cache = cache.clone();
        handles.push(tokio::spawn(async move {
            match job {
                Job::Http(job) => run_http(job, &cache).await,
                Job::Tcp(job) => run_tcp(job).await,
            }
        }));
    }

    let mut results = Vec::with_capacity(handles.len());
    for handle in handles {
        // A panic inside a job must not lose the whole batch: the other
        // jobs still have results worth reporting.
        results.push(handle.await.unwrap_or_else(|_| JobResult {
            id: "unknown".to_string(),
            ok: false,
            status_code: None,
            status_text: None,
            ping_ms: None,
            headers: None,
            body: None,
            location: None,
            error: Some("probe task panicked".to_string()),
            error_kind: Some(ErrorKind::Io),
        }));
    }

    BatchResult { results }
}

/// One HTTP(S) request against a pre-validated target.
async fn run_http(job: HttpJob, cache: &ClientCache) -> JobResult {
    let started = Instant::now();
    let budget = Duration::from_millis(job.timeout_ms);

    let parsed = match reqwest::Url::parse(&job.url) {
        Ok(url) => url,
        Err(error) => {
            return failed(
                &job.id,
                started,
                format!("Invalid URL: {error}"),
                ErrorKind::Protocol,
            )
        }
    };

    let host = match parsed.host_str() {
        Some(host) => host.to_string(),
        None => {
            return failed(
                &job.id,
                started,
                "URL has no host".to_string(),
                ErrorKind::Protocol,
            )
        }
    };

    let port = parsed.port_or_known_default().unwrap_or(80);
    let scheme = parsed.scheme().to_string();

    // The policy layer already rejects anything but HTTP and HTTPS. This is
    // the second gate: the probe refuses to speak any other protocol even
    // if it is handed one.
    if scheme != "http" && scheme != "https" {
        return failed(
            &job.id,
            started,
            format!("Unsupported protocol: {scheme}"),
            ErrorKind::Protocol,
        );
    }

    // Pin the connection to the validated address while keeping the
    // hostname for the `Host` header and the TLS server name. This is what
    // defeats DNS rebinding: a second DNS answer cannot move the socket.
    //
    // A URL that already names the address needs no override.
    let override_address = if host.parse::<IpAddr>().is_err() {
        match job.resolved_ip.parse::<IpAddr>() {
            Ok(ip) => Some(SocketAddr::new(ip, port)),
            Err(error) => {
                return failed(
                    &job.id,
                    started,
                    format!("Invalid resolved address: {error}"),
                    ErrorKind::Protocol,
                )
            }
        }
    } else {
        None
    };

    let key = format!("{host}:{port}:{}", job.resolved_ip);
    let client = cache.get(key, || {
        let mut builder = reqwest::Client::builder()
            // The caller follows redirects itself, so that every hop is
            // re-validated against the SSRF policy before it is requested.
            .redirect(reqwest::redirect::Policy::none());
        if let Some(address) = override_address {
            builder = builder.resolve(&host, address);
        }
        builder.build().expect("the HTTP client is well configured")
    });

    let mut request = client
        .request(
            reqwest::Method::from_bytes(job.method.as_bytes())
                .unwrap_or(reqwest::Method::GET),
            parsed.clone(),
        )
        // The budget goes on the request, not on the client, so that two
        // jobs against the same target can share one client.
        .timeout(budget);

    for (name, value) in &job.headers {
        request = request.header(name, value);
    }

    if let Some(body) = &job.body {
        request = request.body(body.clone());
    }

    let response = match request.send().await {
        Ok(response) => response,
        Err(error) => {
            let kind = classify(&error);
            return failed(&job.id, started, error.to_string(), kind);
        }
    };

    // The ping is the time to the response headers, measured before the
    // body is read — the same point the TypeScript implementation measured
    // it, so the numbers on the dashboard stay comparable.
    let ping_ms = started.elapsed().as_millis() as u64;

    let status_code = response.status().as_u16();
    let status_text = response
        .status()
        .canonical_reason()
        .unwrap_or("")
        .to_string();

    let mut headers = BTreeMap::new();
    for (name, value) in response.headers() {
        if let Ok(text) = value.to_str() {
            headers.insert(name.as_str().to_ascii_lowercase(), text.to_string());
        }
    }

    let location = headers.get("location").cloned();

    let body = if job.read_body {
        match read_capped(response, job.max_body_bytes).await {
            Ok(body) => Some(body),
            Err(error) => {
                return failed(&job.id, started, error.to_string(), ErrorKind::Io);
            }
        }
    } else {
        // Drain the body so the connection can be reused and the socket is
        // not left half-read.
        let _ = response.bytes().await;
        None
    };

    JobResult {
        id: job.id,
        ok: true,
        status_code: Some(status_code),
        status_text: Some(status_text),
        ping_ms: Some(ping_ms),
        headers: Some(headers),
        body,
        location,
        error: None,
        error_kind: None,
    }
}

/// Reads at most `max_bytes` of the response body.
async fn read_capped(
    response: reqwest::Response,
    max_bytes: usize,
) -> Result<String, String> {
    use futures_util::StreamExt;

    let mut stream = response.bytes_stream();
    let mut buffer: Vec<u8> = Vec::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| error.to_string())?;
        let remaining = max_bytes.saturating_sub(buffer.len());
        if remaining == 0 {
            break;
        }
        let take = remaining.min(chunk.len());
        buffer.extend_from_slice(&chunk[..take]);
        if buffer.len() >= max_bytes {
            break;
        }
    }

    Ok(String::from_utf8_lossy(&buffer).into_owned())
}

/// One TCP connect against a pre-validated target.
async fn run_tcp(job: TcpJob) -> JobResult {
    let started = Instant::now();
    let budget = Duration::from_millis(job.timeout_ms);

    let ip: IpAddr = match job.host.parse() {
        Ok(ip) => ip,
        Err(error) => {
            return failed(
                &job.id,
                started,
                format!("Invalid host: {error}"),
                ErrorKind::Protocol,
            )
        }
    };

    let address = SocketAddr::new(ip, job.port);
    match timeout(budget, TcpStream::connect(address)).await {
        Ok(Ok(_stream)) => {
            // The probe only has to prove the port is reachable, so the
            // socket is dropped as soon as it opens.
            JobResult {
                id: job.id,
                ok: true,
                status_code: None,
                status_text: None,
                ping_ms: Some(started.elapsed().as_millis() as u64),
                headers: None,
                body: None,
                location: None,
                error: None,
                error_kind: None,
            }
        }
        Ok(Err(error)) => failed(&job.id, started, error.to_string(), ErrorKind::Connect),
        Err(_) => failed(
            &job.id,
            started,
            format!("Timeout after {}s", job.timeout_ms / 1000),
            ErrorKind::Timeout,
        ),
    }
}

/// Builds a failed result.
fn failed(
    id: &str,
    started: Instant,
    error: String,
    kind: ErrorKind,
) -> JobResult {
    JobResult {
        id: id.to_string(),
        ok: false,
        status_code: None,
        status_text: None,
        ping_ms: Some(started.elapsed().as_millis() as u64),
        headers: None,
        body: None,
        location: None,
        error: Some(error),
        error_kind: Some(kind),
    }
}

/// Works out what kind of failure a request error was.
///
/// `reqwest` reports a TLS failure as a connect failure, because the
/// handshake is part of establishing the connection. The distinction is
/// worth keeping, so the source chain is inspected for a TLS cause.
fn classify(error: &reqwest::Error) -> ErrorKind {
    if error.is_timeout() {
        return ErrorKind::Timeout;
    }

    let mut source: Option<&(dyn std::error::Error + 'static)> = Some(error);
    while let Some(current) = source {
        let text = current.to_string().to_ascii_lowercase();
        if text.contains("tls") || text.contains("certificate") || text.contains("handshake")
        {
            return ErrorKind::Tls;
        }
        source = current.source();
    }

    if error.is_connect() {
        return ErrorKind::Connect;
    }
    if error.is_body() || error.is_decode() {
        return ErrorKind::Io;
    }
    ErrorKind::Io
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_tcp_job_to_a_closed_port_fails_to_connect() {
        // Port 1 on the loopback interface is not listening. The address is
        // already an IP literal, so no DNS is involved.
        let job = TcpJob {
            id: "t".into(),
            host: "127.0.0.1".into(),
            port: 1,
            timeout_ms: 500,
        };

        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime");

        let result = runtime.block_on(run_tcp(job));
        assert!(!result.ok);
        assert_eq!(result.error_kind, Some(ErrorKind::Connect));
    }

    #[test]
    fn a_tcp_job_with_a_bad_address_is_a_protocol_error() {
        let job = TcpJob {
            id: "t".into(),
            host: "not-an-ip".into(),
            port: 80,
            timeout_ms: 500,
        };

        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime");

        let result = runtime.block_on(run_tcp(job));
        assert!(!result.ok);
        assert_eq!(result.error_kind, Some(ErrorKind::Protocol));
    }

    #[test]
    fn an_http_job_with_an_invalid_url_is_a_protocol_error() {
        let job = HttpJob {
            id: "h".into(),
            url: "not a url".into(),
            resolved_ip: "93.184.216.34".into(),
            method: "GET".into(),
            headers: BTreeMap::new(),
            body: None,
            timeout_ms: 500,
            read_body: false,
            max_body_bytes: 1024,
        };

        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime");

        let result = runtime.block_on(run_http(job, &ClientCache::default()));
        assert!(!result.ok);
        assert_eq!(result.error_kind, Some(ErrorKind::Protocol));
    }
}
