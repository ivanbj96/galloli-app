import re, sys

styles_path = "android/app/src/main/res/values/styles.xml"
try:
    with open(styles_path, "r") as f:
        content = f.read()
    content = re.sub(
        r'\s*<style name="AppTheme\.NoActionBarLaunch"[^>]*>.*?</style>',
        '',
        content,
        flags=re.DOTALL
    )
    with open(styles_path, "w") as f:
        f.write(content)
    print("NoActionBarLaunch eliminado de styles.xml")
except FileNotFoundError:
    print(f"No encontrado: {styles_path}")
