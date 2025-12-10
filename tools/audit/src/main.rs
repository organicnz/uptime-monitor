use clap::{Parser, Subcommand};
use colored::*;
use regex::Regex;
use std::fs;
use std::path::Path;
use std::process::Command;
use anyhow::{Result, Context, bail};

#[derive(Parser)]
#[command(author, version, about, long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
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
    DepsCheck {
        old_head: String,
        new_head: String,
    },
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

const SKIP_PATTERNS: &[&str] = &[
    ".example",
    ".sample",
    ".md",
    ".lock",
];

const DEBUG_PATTERNS: &[&str] = &[
    r"console\.log\(",
    r"console\.debug\(",
    r"debugger",
    r"alert\(",
];

fn main() -> Result<()> {
    let cli = Cli::parse();

    match &cli.command {
        Commands::NoDebug { files } => check_no_debug(files),
        Commands::SecretsCheck { files } => check_secrets(files),
        Commands::BranchName => check_branch_name(),
        Commands::CommitMsg { file } => check_commit_msg(file),
        Commands::CommitMsgLength { file } => check_commit_msg_length(file),
        Commands::JsonValidate { files } => validate_json(files),
        Commands::FileSize { files } => check_file_size(files),
        Commands::DepsCheck { old_head, new_head } => check_deps(old_head, new_head),
        Commands::DepsReminder => remind_deps(),
    }
}

fn should_skip(path: &str) -> bool {
    SKIP_PATTERNS.iter().any(|p| path.ends_with(p))
}

fn check_no_debug(files: &[String]) -> Result<()> {
    let mut errors = 0;
    let patterns: Vec<Regex> = DEBUG_PATTERNS.iter()
        .map(|p| Regex::new(p).unwrap())
        .collect();

    for file in files {
        if should_skip(file) { continue; }
        if !Path::new(file).exists() { continue; }

        let content = fs::read_to_string(file).ok();
        // Skip binary files
        if content.is_none() { continue; }
        let content = content.unwrap();

        for (i, line) in content.lines().enumerate() {
            for (_, pattern) in patterns.iter().enumerate() {
                if pattern.is_match(line) {
                    println!("{} {}:{}: {}", "❌ Debug statement found in".red(), file, i + 1, line.trim());
                    errors += 1;
                }
            }
        }
    }

    if errors > 0 {
        bail!("Found debug statements!");
    }
    Ok(())
}

fn check_secrets(files: &[String]) -> Result<()> {
    let mut errors = 0;
    let patterns: Vec<Regex> = SECRET_PATTERNS.iter()
        .map(|p| Regex::new(p).expect("Invalid regex"))
        .collect();

    for file in files {
        if should_skip(file) { continue; }
        if !Path::new(file).exists() { continue; }

        let content = fs::read_to_string(file).ok();
        if content.is_none() { continue; }
        let content = content.unwrap();

        for (i, line) in content.lines().enumerate() {
            for (j, pattern) in patterns.iter().enumerate() {
                if pattern.is_match(line) {
                    // Skip if environment variable or benign
                    if line.contains("process.env") || line.contains("NEXT_PUBLIC") {
                        continue;
                    }
                    
                    println!("{} {}:{}", "🔐 Potential secret found in".red(), file, i + 1);
                    println!("   Pattern: {}", SECRET_PATTERNS[j]);
                    errors += 1;
                    break;
                }
            }
        }
    }

    if errors > 0 {
        bail!("Potential secrets found!");
    }
    Ok(())
}

fn check_branch_name() -> Result<()> {
    // Current branch
    let output = Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .output()?;
        
    let branch = String::from_utf8(output.stdout)?.trim().to_string();

    if ["main", "master", "develop", "HEAD"].contains(&branch.as_str()) {
        return Ok(());
    }

    let pattern = r"^(feature|fix|hotfix|release|chore|docs|refactor|test)/[a-zA-Z0-9-]*[a-zA-Z0-9]$";
    let regex = Regex::new(pattern).unwrap();

    if !regex.is_match(&branch) {
         println!("{}", "❌ Invalid branch name!".red());
         println!("Expected format: type/description");
         println!("Types: feature, fix, hotfix, release, chore, docs, refactor, test");
         bail!("Invalid branch naming convention");
    }

    Ok(())
}

fn check_commit_msg(file: &str) -> Result<()> {
    let msg = fs::read_to_string(file).context("Failed to read commit message file")?;
    let subject = msg.lines().next().unwrap_or("").trim();
    
    // Conventional commits pattern
    let pattern = r"^(revert: )?(feat|fix|docs|style|refactor|perf|test|chore|build|ci)(\(.+\))?: .+";
    let regex = Regex::new(pattern).unwrap();
    
    // Allow merge commits
    if subject.starts_with("Merge branch") || subject.starts_with("Merge pull request") {
        return Ok(());
    }

    if !regex.is_match(subject) {
        println!("{}", "❌ Invalid commit message format!".red());
        println!("Use conventional commits: type(scope?): subject");
        bail!("Invalid commit message");
    }
    Ok(())
}

fn check_commit_msg_length(file: &str) -> Result<()> {
    let msg = fs::read_to_string(file).context("Failed to read commit message file")?;
    let subject = msg.lines().next().unwrap_or("").trim();
    
    if subject.len() > 72 {
         println!("{}", "❌ Commit subject too long!".red());
         bail!("Commit message subject longer than 72 chars");
    }
    Ok(())
}

fn validate_json(files: &[String]) -> Result<()> {
    for file in files {
        if !file.ends_with(".json") { continue; }
        if file.ends_with("package-lock.json") { continue; }
         
        let content = fs::read_to_string(file)?;
        let _: serde_json::Value = serde_json::from_str(&content)
            .with_context(|| format!("Invalid JSON in {}", file))?;
    }
    Ok(())
}

fn check_file_size(files: &[String]) -> Result<()> {
    for file in files {
        if file.contains("/target/") || file.starts_with("target/") { continue; }
        if !Path::new(file).exists() { continue; }
        let metadata = fs::metadata(file)?;
        // 500KB limit
        if metadata.len() > 500 * 1024 {
             println!("{} {} ({} bytes)", "❌ File too large:".red(), file, metadata.len());
             bail!("File larger than 500KB detected");
        }
    }
    Ok(())
}

fn check_deps(old_head: &str, new_head: &str) -> Result<()> {
    let output = Command::new("git")
        .args(["diff", "--name-only", old_head, new_head])
        .output()?;
        
    let diff = String::from_utf8(output.stdout)?;
    
    if diff.lines().any(|l| l.contains("package-lock.json") || l.contains("yarn.lock") || l.contains("pnpm-lock.yaml")) {
        println!("{}", "⚠️  Dependencies changed!".yellow());
        println!("Run 'npm install' or 'yarn' to update your local dependencies.");
    }
    Ok(())
}

fn remind_deps() -> Result<()> {
    let output = Command::new("git")
        .args(["diff", "--name-only", "ORIG_HEAD", "HEAD"])
        .output()
        .context("Failed to run git diff")?;
        
    let diff = String::from_utf8(output.stdout)?;
    
    if diff.lines().any(|l| l.contains("package-lock.json") || l.contains("yarn.lock") || l.contains("pnpm-lock.yaml")) {
        println!("{}", "⚠️  Dependencies changed!".yellow());
        println!("Run 'npm install' or 'yarn' to update your local dependencies.");
    }
    Ok(())
}
