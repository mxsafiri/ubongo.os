#!/bin/bash

# Simple script to run the Assistant CLI

cd "$(dirname "$0")"

echo "🚀 Starting Assistant CLI..."
echo ""

# Activate virtual environment
source venv/bin/activate

# Run the CLI
python -m assistant_cli
