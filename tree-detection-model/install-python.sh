#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTORCH_CPU_INDEX="https://download.pytorch.org/whl/cpu"

# fiona (a deeptrees dependency) needs the GDAL C library to compile from source.
# Check for it and install via pacman if missing.
if ! command -v gdal-config &> /dev/null; then
  echo ""
  echo "GDAL not found — installing via pacman (sudo required)..."
  sudo pacman -S --noconfirm gdal
  echo "GDAL installed."
fi

echo ""
echo "Creating Python virtual environment..."
python3 -m venv "$SCRIPT_DIR/.venv"

echo "Upgrading pip..."
"$SCRIPT_DIR/.venv/bin/pip" install --upgrade pip -q

# Install torch CPU-only before deeptrees so pip does not pull in the
# ~3.5 GB of nvidia-cuda-* packages that come with the default CUDA wheel.
# pip treats torch==2.9.1+cpu as satisfying the torch==2.9.1 constraint
# (PEP 440 excludes local identifiers from equality comparisons), so
# deeptrees will not attempt to upgrade to the CUDA build afterwards.
echo ""
echo "Installing PyTorch (CPU-only)..."
"$SCRIPT_DIR/.venv/bin/pip" install \
  torch==2.9.1 torchvision==0.24.1 \
  --index-url "$PYTORCH_CPU_INDEX"

# deeptrees imports osgeo at module level but doesn't declare it as a pip dep.
# The Python GDAL bindings must match the system library version exactly.
GDAL_VERSION=$(gdal-config --version)
echo "Installing Python GDAL bindings (v${GDAL_VERSION} to match system)..."
"$SCRIPT_DIR/.venv/bin/pip" install "GDAL==${GDAL_VERSION}"

echo "Installing remaining dependencies..."
"$SCRIPT_DIR/.venv/bin/pip" install -r "$SCRIPT_DIR/requirements.txt"
echo ""
echo "Python environment ready at tree-detection-model/.venv"
