//! The probe: a one-shot batch runner for monitor checks.
//!
//! The Bun app spawns this binary once per batch, writes a JSON job list to
//! its stdin, and reads a JSON result list from its stdout. It is a separate
//! process on purpose: a probe that crashes, hangs, or leaks a file
//! descriptor cannot take the server down with it, and the app can fall back
//! to its own implementation without unpicking a native crash.
//!
//! The probe has no opinion about what may be reached. It is given an
//! address that the app's SSRF policy has already resolved and validated,
//! and it connects to that address.

mod probe;
mod protocol;

use protocol::Batch;
use std::io::Read;

/// Exit code used when the batch could not be read or understood. The app
/// treats it the same way it treats a crash: fall back.
const EXIT_BAD_INPUT: i32 = 2;

#[tokio::main]
async fn main() {
    let mut input = String::new();
    if let Err(error) = std::io::stdin().read_to_string(&mut input) {
        eprintln!("probe: could not read the job list: {error}");
        std::process::exit(EXIT_BAD_INPUT);
    }

    let batch: Batch = match serde_json::from_str(&input) {
        Ok(batch) => batch,
        Err(error) => {
            eprintln!("probe: could not parse the job list: {error}");
            std::process::exit(EXIT_BAD_INPUT);
        }
    };

    let result = probe::run_batch(batch.jobs).await;

    // The result is the only thing on stdout, so the caller can parse it
    // without having to separate it from anything else.
    match serde_json::to_string(&result) {
        Ok(json) => println!("{json}"),
        Err(error) => {
            eprintln!("probe: could not serialize the results: {error}");
            std::process::exit(EXIT_BAD_INPUT);
        }
    }
}
