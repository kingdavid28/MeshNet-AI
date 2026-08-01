import sys
f = open("/home/reycelmeshnet/.buildozer-kivyapp/android/platform/python-for-android/pythonforandroid/build.py", "r")
c = f.read()
f.close()
c = c.replace("pip install -U pip", "pip install -U \"pip<25\"")
f = open("/home/reycelmeshnet/.buildozer-kivyapp/android/platform/python-for-android/pythonforandroid/build.py", "w")
f.write(c)
f.close()
print("Fixed")
