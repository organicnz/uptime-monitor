use serde::Deserialize;
use std::fs;
use std::path::Path;

/// Configuration loaded from .audit.toml
#[derive(Debug, Deserialize, Default)]
pub struct Config {
    #[serde(default)]
    pub secrets: SecretsConfig,
    #[serde(default)]
    pub debug: DebugConfig,
    #[serde(default)]
    pub files: FilesConfig,
    #[serde(default)]
    #[allow(dead_code)] // Reserved for future use
    pub output: OutputConfig,
}

#[derive(Debug, Deserialize)]
pub struct SecretsConfig {
    /// Additional secret patterns to check (regex)
    #[serde(default)]
    pub extra_patterns: Vec<String>,
    /// Patterns to exclude from secret detection
    #[serde(default)]
    #[allow(dead_code)] // Reserved for future use
    pub exclude_patterns: Vec<String>,
}

impl Default for SecretsConfig {
    fn default() -> Self {
        Self {
            extra_patterns: vec![],
            exclude_patterns: vec![],
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct DebugConfig {
    /// Additional debug statement patterns (regex)
    #[serde(default)]
    pub extra_patterns: Vec<String>,
    /// File extensions to check for debug statements
    #[serde(default = "default_debug_extensions")]
    #[allow(dead_code)] // Reserved for future use
    pub extensions: Vec<String>,
}

fn default_debug_extensions() -> Vec<String> {
    vec![
        "ts".to_string(),
        "tsx".to_string(),
        "js".to_string(),
        "jsx".to_string(),
    ]
}

impl Default for DebugConfig {
    fn default() -> Self {
        Self {
            extra_patterns: vec![],
            extensions: default_debug_extensions(),
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct FilesConfig {
    /// Maximum file size in bytes (default: 500KB)
    #[serde(default = "default_max_size")]
    pub max_size_bytes: u64,
    /// Paths to exclude from all checks
    #[serde(default)]
    pub exclude_paths: Vec<String>,
}

fn default_max_size() -> u64 {
    500 * 1024 // 500KB
}

impl Default for FilesConfig {
    fn default() -> Self {
        Self {
            max_size_bytes: default_max_size(),
            exclude_paths: vec![],
        }
    }
}

#[derive(Debug, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum OutputFormat {
    Text,
    Json,
}

impl Default for OutputFormat {
    fn default() -> Self {
        Self::Text
    }
}

#[derive(Debug, Deserialize, Default)]
pub struct OutputConfig {
    #[serde(default)]
    #[allow(dead_code)] // Reserved for future use
    pub format: OutputFormat,
}

impl Config {
    /// Load configuration from .audit.toml if it exists
    pub fn load() -> Self {
        Self::load_from_path(".audit.toml")
    }

    /// Load configuration from a specific path
    pub fn load_from_path<P: AsRef<Path>>(path: P) -> Self {
        let path = path.as_ref();
        if !path.exists() {
            return Self::default();
        }

        match fs::read_to_string(path) {
            Ok(content) => match toml::from_str(&content) {
                Ok(config) => config,
                Err(e) => {
                    eprintln!("Warning: Failed to parse {}: {}", path.display(), e);
                    Self::default()
                }
            },
            Err(e) => {
                eprintln!("Warning: Failed to read {}: {}", path.display(), e);
                Self::default()
            }
        }
    }

    /// Check if a path should be excluded based on config
    pub fn is_excluded(&self, path: &str) -> bool {
        self.files
            .exclude_paths
            .iter()
            .any(|exclude| path.contains(exclude))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = Config::default();
        assert_eq!(config.files.max_size_bytes, 500 * 1024);
        assert!(config.secrets.extra_patterns.is_empty());
    }

    #[test]
    fn test_config_exclusion() {
        let mut config = Config::default();
        config.files.exclude_paths = vec!["node_modules".to_string(), "dist".to_string()];

        assert!(config.is_excluded("src/node_modules/package.json"));
        assert!(config.is_excluded("dist/bundle.js"));
        assert!(!config.is_excluded("src/main.rs"));
    }
}
