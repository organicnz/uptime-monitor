#!/usr/bin/env python3
"""
Script to create chunks from SQLite database dump.
This script dumps the SQLite database to SQL and splits it into manageable chunks.
"""

import os
import sys
import subprocess
import argparse
from pathlib import Path

def dump_sqlite_to_sql(db_path, output_path):
    """Dump SQLite database to SQL file using sqlite3 command."""
    try:
        with open(output_path, 'w') as f:
            subprocess.run(['sqlite3', db_path, '.dump'], stdout=f, check=True)
        print(f"Database dumped to {output_path}")
        return True
    except subprocess.CalledProcessError as e:
        print(f"Error dumping database: {e}")
        return False
    except FileNotFoundError:
        print("sqlite3 command not found. Please install SQLite3.")
        return False

def chunk_sql_file(sql_file, chunk_size_mb=50, output_dir="chunks"):
    """Split SQL file into chunks of specified size."""
    chunk_size_bytes = chunk_size_mb * 1024 * 1024

    # Create output directory
    os.makedirs(output_dir, exist_ok=True)

    chunk_num = 1
    current_chunk_size = 0
    current_chunk_lines = []

    with open(sql_file, 'r') as f:
        for line in f:
            current_chunk_lines.append(line)
            current_chunk_size += len(line.encode('utf-8'))

            # If we've reached the chunk size or hit a transaction boundary
            if (current_chunk_size >= chunk_size_bytes and
                (line.strip().endswith(';') or line.strip() == 'COMMIT;')):

                # Write current chunk
                chunk_filename = os.path.join(output_dir, f"chunk_{chunk_num:03d}.sql")
                with open(chunk_filename, 'w') as chunk_file:
                    chunk_file.writelines(current_chunk_lines)

                print(f"Created {chunk_filename} ({current_chunk_size / 1024 / 1024:.2f} MB)")

                # Reset for next chunk
                chunk_num += 1
                current_chunk_size = 0
                current_chunk_lines = []

        # Write remaining lines if any
        if current_chunk_lines:
            chunk_filename = os.path.join(output_dir, f"chunk_{chunk_num:03d}.sql")
            with open(chunk_filename, 'w') as chunk_file:
                chunk_file.writelines(current_chunk_lines)
            print(f"Created {chunk_filename} ({current_chunk_size / 1024 / 1024:.2f} MB)")

def main():
    parser = argparse.ArgumentParser(description='Chunk SQLite database into SQL files')
    parser.add_argument('--db-path', default='uptime/kuma.db',
                       help='Path to SQLite database (default: uptime/kuma.db)')
    parser.add_argument('--sql-output', default='kuma_dump.sql',
                       help='Path for SQL dump file (default: kuma_dump.sql)')
    parser.add_argument('--chunk-size', type=int, default=50,
                       help='Chunk size in MB (default: 50)')
    parser.add_argument('--output-dir', default='chunks',
                       help='Output directory for chunks (default: chunks)')
    parser.add_argument('--skip-dump', action='store_true',
                       help='Skip database dump, use existing SQL file')

    args = parser.parse_args()

    # Check if database exists
    if not args.skip_dump and not os.path.exists(args.db_path):
        print(f"Database file not found: {args.db_path}")
        sys.exit(1)

    # Dump database to SQL if not skipping
    if not args.skip_dump:
        print(f"Dumping database {args.db_path}...")
        if not dump_sqlite_to_sql(args.db_path, args.sql_output):
            sys.exit(1)

    # Check if SQL file exists
    if not os.path.exists(args.sql_output):
        print(f"SQL file not found: {args.sql_output}")
        sys.exit(1)

    # Get file size
    file_size_mb = os.path.getsize(args.sql_output) / 1024 / 1024
    print(f"SQL file size: {file_size_mb:.2f} MB")

    # Chunk the SQL file
    print(f"Creating chunks of {args.chunk_size} MB each...")
    chunk_sql_file(args.sql_output, args.chunk_size, args.output_dir)

    print(f"Chunking complete! Check the '{args.output_dir}' directory for chunks.")

if __name__ == "__main__":
    main()