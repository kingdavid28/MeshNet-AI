#!/bin/bash
cd "$(dirname "$0")"
source .buildozer-venv/bin/activate
export PATH=/usr/bin:$PATH
export PYTHON=/usr/bin/python3.12
export PYTHON3=/usr/bin/python3.12
export P4A_BUILD_ISOLATED_PYTHON=/usr/bin/python3.12
export P4A_PYTHON=/usr/bin/python3.12
buildozer android debug
