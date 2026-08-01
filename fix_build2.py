import re

# Path to the build.py file
build_py_path = "/home/reycelmeshnet/.buildozer-kivyapp/android/platform/python-for-android/pythonforandroid/build.py"

# Read the file
with open(build_py_path, 'r') as f:
    content = f.read()

# Replace the pip install command
content = content.replace('pip install -U pip', 'pip install -U "pip<25"')

# Write back
with open(build_py_path, 'w') as f:
    f.write(content)

print("Fixed pip version in build.py")
