# Path to the build.py file
build_py_path = "/home/reycelmeshnet/.buildozer-kivyapp/android/platform/python-for-android/pythonforandroid/build.py"

# Read the file
with open(build_py_path, 'r') as f:
    lines = f.readlines()

# Fix line 878 (index 877)
# Replace the broken line with proper escaping
lines[877] = '            "source venv/bin/activate && pip install -U \\"pip<25\\""\n'

# Write back
with open(build_py_path, 'w') as f:
    f.writelines(lines)

print("Fixed pip version escaping in build.py")
