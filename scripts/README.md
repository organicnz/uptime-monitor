# Scripts

## chunk_sql.py

A Python script to dump SQLite database to SQL and split it into manageable chunks.

## chunk_sql.sh

A shell script version to dump SQLite database to SQL and split it into manageable chunks.

### Usage

```bash
# Basic usage - dumps uptime/kuma.db and creates 50MB chunks
./scripts/chunk_sql.sh

# Custom database path and chunk size
./scripts/chunk_sql.sh --db-path /path/to/database.db --chunk-size 100

# Use existing SQL dump file
./scripts/chunk_sql.sh --skip-dump --sql-output existing_dump.sql

# Custom output directory
./scripts/chunk_sql.sh --output-dir my_chunks
```

### Options

- `--db-path`: Path to SQLite database (default: uptime/kuma.db)
- `--sql-output`: Path for SQL dump file (default: kuma_dump.sql)
- `--chunk-size`: Chunk size in MB (default: 50)
- `--output-dir`: Output directory for chunks (default: chunks)
- `--skip-dump`: Skip database dump, use existing SQL file
- `--help`: Show help message

### Requirements

- sqlite3 command-line tool
- split command (coreutils)
- For Python version: Python 3