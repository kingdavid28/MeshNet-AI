"""
test_basic.py
────────────────────────────────────────────────────────────────────────────
Basic Kivy test to verify the app can start.
"""

from kivy.app import App
from kivy.uix.label import Label


class TestApp(App):
    def build(self):
        return Label(text='Kivy app is running!')


if __name__ == '__main__':
    TestApp().run()
