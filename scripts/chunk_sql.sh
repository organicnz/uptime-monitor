#!/bin/bash

# Script to create chunks from SQLite database dump
# This script dumps the SQLite database to SQL and splits it into manageable chunks

set -e

# Default values
DB_PATH="uptime/kuma.db"
SQL_OUTPUT="kuma_dump.sql"
CHUNK_SIZE_MB=50
OUTPUT_DIR="chunks"
SKIP_DUMP=false

# Function to show usage
show_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Chunk SQLite database into SQL files

OPTIONS:
    --db-path PATH          Path to SQLite database (default: uptime/kuma.db)
    --sql-output PATH       Path for SQL dump file (default: kuma_dump.sql)
    --chunk-size SIZE       Chunk size in MB (default: 50)
    --output-dir DIR        Output directory for chunks (default: chunks)
    --skip-dump             Skip database dump, use existing SQL file
    --help                  Show this help message

EXAMPLES:
    $0                                              # Basic usage
    $0 --chunk-size 100                            # Custom chunk size
    $0 --skip-dump --sql-output existing_dump.sql  # Use existing SQL file
    $0 --output-dir my_chunks                       # Custom output directory

REQUIREMENTS:
    - sqlite3 command-line tool
    - split command (coreutils)
EOF
}

# Function to dump SQLite database to SQL file
dump_sqlite_to_sql() {
    local db_path="$1"
    local output_path="$2"

    echo "Dumping database $db_path to $output_path..."

    if ! command -v sqlite3 >/dev/null 2>&1; then
        echo "Error: sqlite3 command not found. Please install SQLite3."
        exit 1
    fi

    if ! sqlite3 "$db_path" .dump > "$output_path"; then
        echo "Error: Failed to dump database"
        exit 1
    fi

    echo "Database dumped to $output_path"
}

# Function to chunk SQL file
chunk_sql_file() {
    local sql_file="$1"
    local chunk_size_mb="$2"
    local output_dir="$3"

    # Create output directory
    mkdir -p "$output_dir"

    # Calculate chunk size in bytes (split uses bytes)
    local chunk_size_bytes=$((chunk_size_mb * 1024 * 1024))

    echo "Creating chunks of ${chunk_size_mb} MB each..."

    # Create a temporary directory for initial split
    local temp_dir=$(mktemp -d)

    # Split the file by size first
    split -b "$chunk_size_bytes" "$sql_file" "$temp_dir/chunk_"

    # Process each chunk to ensure we don't break SQL statements
    local chunk_num=1

    for chunk_file in "$temp_dir"/chunk_*; do
        if [[ -f "$chunk_file" ]]; then
            local output_file="$output_dir/chunk_$(printf '%03d' $chunk_num).sql"

            # Read the chunk and ensure it ends at a complete SQL statement
            local temp_output=$(mktemp)
            local buffer=""
            local in_statement=false

            while IFS= read -r line || [[ -n "$line" ]]; do
                buffer+="$line"$'\n'

                # Check if this line completes a statement
                if [[ "$line" =~ \;[[:space:]]*$ ]] || [[ "$line" == "COMMIT;" ]]; then
                    in_statement=false
                elif [[ "$line" =~ ^(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|BEGIN) ]]; then
                    in_statement=true
                fi

                # If we're not in the middle of a statement, we can write the buffer
                if [[ "$in_statement" == false && -n "$buffer" ]]; then
                    echo -n "$buffer" >> "$temp_output"
                    buffer=""
                fi
            done < "$chunk_file"

            # Write any remaining buffer
            if [[ -n "$buffer" ]]; then
                echo -n "$buffer" >> "$temp_output"
            fi

            # Move the processed chunk to final location
            mv "$temp_output" "$output_file"

            # Get file size for reporting
            local file_size_mb=$(du -m "$output_file" | cut -f1)
            echo "Created $output_file (${file_size_mb} MB)"

            chunk_num=$((chunk_num + 1))
        fi
    done

    # Clean up temporary directory
    rm -rf "$temp_dir"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --db-path)
            DB_PATH="$2"
            shift 2
            ;;
        --sql-output)
            SQL_OUTPUT="$2"
            shift 2
            ;;
        --chunk-size)
            CHUNK_SIZE_MB="$2"
            shift 2
            ;;
        --output-dir)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        --skip-dump)
            SKIP_DUMP=true
            shift
            ;;
        --help)
            show_usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Validate chunk size is a number
if ! [[ "$CHUNK_SIZE_MB" =~ ^[0-9]+$ ]]; then
    echo "Error: Chunk size must be a positive integer"
    exit 1
fi

# Check if database exists (if not skipping dump)
if [[ "$SKIP_DUMP" == false && ! -f "$DB_PATH" ]]; then
    echo "Error: Database file not found: $DB_PATH"
    exit 1
fi

# Dump database to SQL if not skipping
if [[ "$SKIP_DUMP" == false ]]; then
    dump_sqlite_to_sql "$DB_PATH" "$SQL_OUTPUT"
fi

# Check if SQL file exists
if [[ ! -f "$SQL_OUTPUT" ]]; then
    echo "Error: SQL file not found: $SQL_OUTPUT"
    exit 1
fi

# Get and display file size
file_size_bytes=$(stat -f%z "$SQL_OUTPUT" 2>/dev/null || stat -c%s "$SQL_OUTPUT" 2>/dev/null)
file_size_mb=$((file_size_bytes / 1024 / 1024))
echo "SQL file size: ${file_size_mb} MB"

# Chunk the SQL file
chunk_sql_file "$SQL_OUTPUT" "$CHUNK_SIZE_MB" "$OUTPUT_DIR"

echo "Chunking complete! Check the '$OUTPUT_DIR' directory for chunks."