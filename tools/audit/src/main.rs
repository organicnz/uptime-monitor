mod config;

use anyhow::{Context, Result};
use clap::{Parser, Subcommand, ValueEnum};
use colored::*;
use config::{Config, OutputFormat};
use rayon::prelude::*;
use regex::Regex;
use serde::Serialize;
use std::fs;
use std::path::Path;
use std::process::Command;
use std::sync::atomic::{AtomicUsize, Ordering};

// Exit codes
#[allow(dead_code)]
const EXIT_SUCCESS: i32 = 0;
const EXIT_VIOLATIONS: i32 = 1;
#[allow(dead_code)]
const EXIT_CONFIG_ERROR: i32 = 2;
const EXIT_RUNTIME_ERROR: i32 = 3;

#[derive(Parser)]
#[command(author, version, about, long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,

    /// Output format
    #[arg(long, value_enum, default_value = "text", global = true)]
    format: Format,
}

#[derive(Clone, Copy, ValueEnum)]
enum Format {
    Text,
    Json,
}

impl From<Format> for OutputFormat {
    fn from(f: Format) -> Self {
        match f {
            Format::Text => OutputFormat::Text,
            Format::Json => OutputFormat::Json,
        }
    }
}

#[derive(Subcommand)]
enum Commands {
    /// Check for debug statements
    NoDebug {
        /// Files to check
        files: Vec<String>,
    },
    /// Check for potential secrets
    SecretsCheck {
        /// Files to check
        files: Vec<String>,
    },
    /// Validate branch naming
    BranchName,
    /// Validate commit message format
    CommitMsg {
        /// Path to commit message file
        file: String,
    },
    /// Check commit message length
    CommitMsgLength {
        /// Path to commit message file
        file: String,
    },
    /// Validate JSON files
    JsonValidate {
        /// Files to check
        files: Vec<String>,
    },
    /// Check file sizes
    FileSize {
        /// Files to check
        files: Vec<String>,
    },
    /// Check dependencies
    DepsCheck { old_head: String, new_head: String },
    /// Reminder to check dependencies
    DepsReminder,
}

const SECRET_PATTERNS: &[&str] = &[
    r#"api[_-]?key\s*[:=]\s*['"][a-zA-Z0-9]"#,
    r#"api[_-]?secret\s*[:=]\s*['"][a-zA-Z0-9]"#,
    r#"access[_-]?token\s*[:=]\s*['"][a-zA-Z0-9]"#,
    r#"auth[_-]?token\s*[:=]\s*['"][a-zA-Z0-9]"#,
    r"bearer\s+[a-zA-Z0-9_-]{20,}",
    r"AKIA[0-9A-Z]{16}",
    r"aws[_-]?secret",
    r"sbp_[a-zA-Z0-9]{30,}",
    r"sb_secret_[a-zA-Z0-9_-]{20,}",
    r"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.",
    r#"QSTASH_TOKEN\s*[:=]\s*['"]eyJ"#,
    r"sig_[a-zA-Z0-9]{20,}",
    r"-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----",
    r"-----BEGIN PGP PRIVATE KEY BLOCK-----",
    r#"password\s*[:=]\s*['"][^'"]{8,}"#,
    r"postgres://[^:]+:[^@]+@",
    r"mysql://[^:]+:[^@]+@",
    r"mongodb://[^:]+:[^@]+@",
    r#"secret[_-]?key\s*[:=]\s*['"][a-zA-Z0-9]"#,
];

const SKIP_PATTERNS: &[&str] = &[".example", ".sample", ".md", ".lock"];

const DEBUG_PATTERNS: &[&str] = &[
    r"console\.log\(",
    r"console\.debug\(",
    r"debugger",
    r"alert\(",
];

const IGNORE_MARKERS: &[&str] = &[
    "// audit-ignore",
    "/* audit-ignore */",
    "# audit-ignore",
    "// @audit-ignore",
    "/* @audit-ignore */",
];

/// Represents a single violation found during checks
#[derive(Debug, Serialize)]
struct Violation {
    file: String,
    line: Option<usize>,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pattern: Option<String>,
}

/// Result of a check operation
#[derive(Debug, Serialize)]
struct CheckResult {
    check: String,
    passed: bool,
    violations: Vec<Violation>,
}

impl CheckResult {
    fn new(check: &str) -> Self {
        Self {
            check: check.to_string(),
            passed: true,
            violations: vec![],
        }
    }

    fn add_violation(&mut self, violation: Violation) {
        self.passed = false;
        self.violations.push(violation);
    }
}

fn main() {
    let cli = Cli::parse();
    let config = Config::load();
    let format: OutputFormat = cli.format.into();

    let result = match &cli.command {
        Commands::NoDebug { files } => check_no_debug(files, &config),
        Commands::SecretsCheck { files } => check_secrets(files, &config),
        Commands::BranchName => check_branch_name(),
        Commands::CommitMsg { file } => check_commit_msg(file),
        Commands::CommitMsgLength { file } => check_commit_msg_length(file),
        Commands::JsonValidate { files } => validate_json(files, &config),
        Commands::FileSize { files } => check_file_size(files, &config),
        Commands::DepsCheck { old_head, new_head } => check_deps(old_head, new_head),
        Commands::DepsReminder => remind_deps(),
    };

    match result {
        Ok(check_result) => {
            output_result(&check_result, format);
            if !check_result.passed {
                std::process::exit(EXIT_VIOLATIONS);
            }
        }
        Err(e) => {
            if format == OutputFormat::Json {
                let error_output = serde_json::json!({
                    "error": e.to_string(),
                    "exit_code": EXIT_RUNTIME_ERROR
                });
                println!("{}", serde_json::to_string_pretty(&error_output).unwrap());
            } else {
                eprintln!("{} {}", "Error:".red(), e);
            }
            std::process::exit(EXIT_RUNTIME_ERROR);
        }
    }
}

fn output_result(result: &CheckResult, format: OutputFormat) {
    match format {
        OutputFormat::Json => {
            println!(
                "{}",
                serde_json::to_string_pretty(result).unwrap_or_else(|_| "{}".to_string())
            );
        }
        OutputFormat::Text => {
            // Text output is already handled in check functions
        }
    }
}

fn should_skip(path: &str, config: &Config) -> bool {
    SKIP_PATTERNS.iter().any(|p| path.ends_with(p)) || config.is_excluded(path)
}

fn has_ignore_marker(line: &str) -> bool {
    IGNORE_MARKERS.iter().any(|marker| line.contains(marker))
}

fn check_no_debug(files: &[String], config: &Config) -> Result<CheckResult> {
    let mut result = CheckResult::new("no-debug");

    // Combine default and extra patterns
    let all_patterns: Vec<&str> = DEBUG_PATTERNS
        .iter()
        .copied()
        .chain(config.debug.extra_patterns.iter().map(|s| s.as_str()))
        .collect();

    let patterns: Vec<Regex> = all_patterns
        .iter()
        .map(|p| Regex::new(p).expect("Invalid regex pattern"))
        .collect();

    let error_count = AtomicUsize::new(0);

    let violations: Vec<Violation> = files
        .par_iter()
        .filter(|file| !should_skip(file, config))
        .filter(|file| Path::new(file).exists())
        .flat_map(|file| {
            let content = match fs::read_to_string(file) {
                Ok(c) => c,
                Err(_) => return vec![], // Skip binary files
            };

            let mut file_violations = vec![];
            for (i, line) in content.lines().enumerate() {
                if has_ignore_marker(line) {
                    continue;
                }
                for pattern in &patterns {
                    if pattern.is_match(line) {
                        println!(
                            "{} {}:{}: {}",
                            "❌ Debug statement found in".red(),
                            file,
                            i + 1,
                            line.trim()
                        );
                        error_count.fetch_add(1, Ordering::Relaxed);
                        file_violations.push(Violation {
                            file: file.clone(),
                            line: Some(i + 1),
                            message: format!("Debug statement: {}", line.trim()),
                            pattern: None,
                        });
                        break; // Only report once per line
                    }
                }
            }
            file_violations
        })
        .collect();

    for v in violations {
        result.add_violation(v);
    }

    Ok(result)
}

fn check_secrets(files: &[String], config: &Config) -> Result<CheckResult> {
    let mut result = CheckResult::new("secrets-check");

    // Combine default and extra patterns
    let extra_patterns: Vec<&str> = config
        .secrets
        .extra_patterns
        .iter()
        .map(|s| s.as_str())
        .collect();

    let all_pattern_strs: Vec<&str> = SECRET_PATTERNS
        .iter()
        .copied()
        .chain(extra_patterns)
        .collect();

    let patterns: Vec<Regex> = all_pattern_strs
        .iter()
        .map(|p| Regex::new(p).expect("Invalid regex pattern"))
        .collect();

    let violations: Vec<Violation> = files
        .par_iter()
        .filter(|file| !should_skip(file, config))
        .filter(|file| Path::new(file).exists())
        .flat_map(|file| {
            let content = match fs::read_to_string(file) {
                Ok(c) => c,
                Err(_) => return vec![],
            };

            let mut file_violations = vec![];
            for (i, line) in content.lines().enumerate() {
                if has_ignore_marker(line) {
                    continue;
                }
                // Skip if environment variable or benign
                if line.contains("process.env") || line.contains("NEXT_PUBLIC") {
                    continue;
                }

                for (j, pattern) in patterns.iter().enumerate() {
                    if pattern.is_match(line) {
                        println!(
                            "{} {}:{}",
                            "🔐 Potential secret found in".red(),
                            file,
                            i + 1
                        );
                        println!("   Pattern: {}", all_pattern_strs[j]);
                        file_violations.push(Violation {
                            file: file.clone(),
                            line: Some(i + 1),
                            message: "Potential secret detected".to_string(),
                            pattern: Some(all_pattern_strs[j].to_string()),
                        });
                        break;
                    }
                }
            }
            file_violations
        })
        .collect();

    for v in violations {
        result.add_violation(v);
    }

    Ok(result)
}

fn check_branch_name() -> Result<CheckResult> {
    let mut result = CheckResult::new("branch-name");

    let output = Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .output()?;

    let branch = String::from_utf8(output.stdout)?.trim().to_string();

    if ["main", "master", "develop", "HEAD"].contains(&branch.as_str()) {
        return Ok(result);
    }

    let pattern =
        r"^(feature|fix|hotfix|release|chore|docs|refactor|test)/[a-zA-Z0-9-]*[a-zA-Z0-9]$";
    let regex = Regex::new(pattern).unwrap();

    if !regex.is_match(&branch) {
        println!("{}", "❌ Invalid branch name!".red());
        println!("Expected format: type/description");
        println!("Types: feature, fix, hotfix, release, chore, docs, refactor, test");
        result.add_violation(Violation {
            file: String::new(),
            line: None,
            message: format!("Invalid branch name: {}", branch),
            pattern: None,
        });
    }

    Ok(result)
}

fn check_commit_msg(file: &str) -> Result<CheckResult> {
    let mut result = CheckResult::new("commit-msg");

    let msg = fs::read_to_string(file).context("Failed to read commit message file")?;
    let subject = msg.lines().next().unwrap_or("").trim();

    // Conventional commits pattern
    let pattern =
        r"^(revert: )?(feat|fix|docs|style|refactor|perf|test|chore|build|ci)(\(.+\))?: .+";
    let regex = Regex::new(pattern).unwrap();

    // Allow merge commits
    if subject.starts_with("Merge branch") || subject.starts_with("Merge pull request") {
        return Ok(result);
    }

    if !regex.is_match(subject) {
        println!("{}", "❌ Invalid commit message format!".red());
        println!("Use conventional commits: type(scope?): subject");
        result.add_violation(Violation {
            file: file.to_string(),
            line: Some(1),
            message: format!("Invalid commit message: {}", subject),
            pattern: None,
        });
    }

    Ok(result)
}

fn check_commit_msg_length(file: &str) -> Result<CheckResult> {
    let mut result = CheckResult::new("commit-msg-length");

    let msg = fs::read_to_string(file).context("Failed to read commit message file")?;
    let subject = msg.lines().next().unwrap_or("").trim();

    if subject.len() > 72 {
        println!("{}", "❌ Commit subject too long!".red());
        result.add_violation(Violation {
            file: file.to_string(),
            line: Some(1),
            message: format!(
                "Commit subject is {} characters (max 72)",
                subject.len()
            ),
            pattern: None,
        });
    }

    Ok(result)
}

fn validate_json(files: &[String], config: &Config) -> Result<CheckResult> {
    let mut result = CheckResult::new("json-validate");

    let violations: Vec<Violation> = files
        .par_iter()
        .filter(|file| file.ends_with(".json"))
        .filter(|file| !file.ends_with("package-lock.json"))
        .filter(|file| !config.is_excluded(file))
        .flat_map(|file| {
            let content = match fs::read_to_string(file) {
                Ok(c) => c,
                Err(e) => {
                    return vec![Violation {
                        file: file.clone(),
                        line: None,
                        message: format!("Failed to read file: {}", e),
                        pattern: None,
                    }];
                }
            };

            match serde_json::from_str::<serde_json::Value>(&content) {
                Ok(_) => vec![],
                Err(e) => {
                    println!("{} {}: {}", "❌ Invalid JSON in".red(), file, e);
                    vec![Violation {
                        file: file.clone(),
                        line: None,
                        message: format!("Invalid JSON: {}", e),
                        pattern: None,
                    }]
                }
            }
        })
        .collect();

    for v in violations {
        result.add_violation(v);
    }

    Ok(result)
}

fn check_file_size(files: &[String], config: &Config) -> Result<CheckResult> {
    let mut result = CheckResult::new("file-size");
    let max_size = config.files.max_size_bytes;

    let violations: Vec<Violation> = files
        .par_iter()
        .filter(|file| !file.contains("/target/") && !file.starts_with("target/"))
        .filter(|file| !config.is_excluded(file))
        .filter(|file| Path::new(file).exists())
        .flat_map(|file| {
            match fs::metadata(file) {
                Ok(metadata) => {
                    if metadata.len() > max_size {
                        println!(
                            "{} {} ({} bytes)",
                            "❌ File too large:".red(),
                            file,
                            metadata.len()
                        );
                        vec![Violation {
                            file: file.clone(),
                            line: None,
                            message: format!(
                                "File size {} bytes exceeds limit of {} bytes",
                                metadata.len(),
                                max_size
                            ),
                            pattern: None,
                        }]
                    } else {
                        vec![]
                    }
                }
                Err(_) => vec![],
            }
        })
        .collect();

    for v in violations {
        result.add_violation(v);
    }

    Ok(result)
}

fn check_deps(old_head: &str, new_head: &str) -> Result<CheckResult> {
    let result = CheckResult::new("deps-check");

    let output = Command::new("git")
        .args(["diff", "--name-only", old_head, new_head])
        .output()?;

    let diff = String::from_utf8(output.stdout)?;

    if diff.lines().any(|l| {
        l.contains("package-lock.json")
            || l.contains("yarn.lock")
            || l.contains("pnpm-lock.yaml")
    }) {
        println!("{}", "⚠️  Dependencies changed!".yellow());
        println!("Run 'npm install' or 'yarn' to update your local dependencies.");
    }

    Ok(result)
}

fn remind_deps() -> Result<CheckResult> {
    let result = CheckResult::new("deps-reminder");

    let output = Command::new("git")
        .args(["diff", "--name-only", "ORIG_HEAD", "HEAD"])
        .output()
        .context("Failed to run git diff")?;

    let diff = String::from_utf8(output.stdout)?;

    if diff.lines().any(|l| {
        l.contains("package-lock.json")
            || l.contains("yarn.lock")
            || l.contains("pnpm-lock.yaml")
    }) {
        println!("{}", "⚠️  Dependencies changed!".yellow());
        println!("Run 'npm install' or 'yarn' to update your local dependencies.");
    }

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ignore_markers() {
        assert!(has_ignore_marker("console.log('test'); // audit-ignore"));
        assert!(has_ignore_marker("/* audit-ignore */ const secret = 'key'"));
        assert!(has_ignore_marker("# audit-ignore"));
        assert!(!has_ignore_marker("console.log('test');"));
    }

    #[test]
    fn test_should_skip() {
        let config = Config::default();
        assert!(should_skip("file.example", &config));
        assert!(should_skip("package-lock.json.lock", &config));
        assert!(!should_skip("src/main.rs", &config));
    }

    #[test]
    fn test_check_result_violations() {
        let mut result = CheckResult::new("test");
        assert!(result.passed);
        assert!(result.violations.is_empty());

        result.add_violation(Violation {
            file: "test.js".to_string(),
            line: Some(1),
            message: "Test violation".to_string(),
            pattern: None,
        });

        assert!(!result.passed);
        assert_eq!(result.violations.len(), 1);
    }
}
