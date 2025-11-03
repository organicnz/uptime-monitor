#!/bin/bash

# Script to chunk database files into 95MB pieces
# Usage: ./chunk-db.sh [database_file] [output_directory]

DB_FILE="${1:-../uptime/kuma.db}"
OUTPUT_DIR="${2:-../db-chunks}"
CHUNK_SIZE="95M"

# Check if database file exists
if [ ! -f "$DB_FILE" ]; then
    echo "Error: Database file '$DB_FILE' not found!"
    exit 1
fi

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

# Get the base filename without path
BASENAME=$(basename "$DB_FILE")

# Get file size in MB
FILE_SIZE=$(du -m "$DB_FILE" | cut -f1)
echo "Database file: $DB_FILE"
echo "File size: ${FILE_SIZE}MB"
echo "Chunk size: $CHUNK_SIZE"
echo "Output directory: $OUTPUT_DIR"
echo ""

# Split the file into chunks
echo "Splitting database into ${CHUNK_SIZE}B chunks..."
split -b $CHUNK_SIZE "$DB_FILE" "$OUTPUT_DIR/${BASENAME}.part_"

# Count the number of chunks created
CHUNK_COUNT=$(ls -1 "$OUTPUT_DIR/${BASENAME}.part_"* 2>/dev/null | wc -l)

if [ "$CHUNK_COUNT" -eq 0 ]; then
    echo "Error: No chunks were created!"
    exit 1
fi

echo "Successfully created $CHUNK_COUNT chunks in $OUTPUT_DIR"
echo ""
echo "Chunks created:"
ls -lh "$OUTPUT_DIR/${BASENAME}.part_"*

# Create a script to reassemble the chunks
cat > "$OUTPUT_DIR/reassemble.sh" << 'EOF'
#!/bin/bash
# Script to reassemble database chunks

OUTPUT_FILE="${1:-../uptime/kuma-restored.db}"
CHUNKS_PATTERN="kuma.db.part_*"

echo "Reassembling chunks matching pattern: $CHUNKS_PATTERN"
echo "Output file: $OUTPUT_FILE"

# Check if chunks exist
if ! ls $CHUNKS_PATTERN 1> /dev/null 2>&1; then
    echo "Error: No chunks found matching pattern '$CHUNKS_PATTERN'"
    exit 1
fi

# Concatenate all chunks in alphabetical order
cat $CHUNKS_PATTERN > "$OUTPUT_FILE"

if [ -f "$OUTPUT_FILE" ]; then
    echo "Successfully reassembled database to: $OUTPUT_FILE"
    ls -lh "$OUTPUT_FILE"
else
    echo "Error: Failed to create output file"
    exit 1
fi
EOF

chmod +x "$OUTPUT_DIR/reassemble.sh"
echo ""
echo "Reassembly script created at: $OUTPUT_DIR/reassemble.sh"
echo "To reassemble: cd $OUTPUT_DIR && ./reassemble.sh [output_file]"