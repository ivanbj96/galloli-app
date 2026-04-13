#!/usr/bin/env python3
"""Parcha los build.gradle para agregar Firebase/google-services."""
import sys

# Root build.gradle
with open('android/build.gradle', 'r') as f:
    content = f.read()

if 'google-services' not in content:
    content = content.replace(
        'dependencies {',
        "dependencies {\n        classpath 'com.google.gms:google-services:4.4.2'",
        1
    )
    with open('android/build.gradle', 'w') as f:
        f.write(content)
    print("✅ google-services classpath agregado a root build.gradle")
else:
    print("ℹ️ google-services ya estaba en root build.gradle")

# App build.gradle
with open('android/app/build.gradle', 'r') as f:
    content = f.read()

changed = False
if 'google-services' not in content:
    content = "apply plugin: 'com.google.gms.google-services'\n" + content
    print("✅ google-services plugin agregado a app/build.gradle")
    changed = True

if 'firebase-messaging' not in content:
    content = content.replace(
        'dependencies {',
        "dependencies {\n    implementation 'com.google.firebase:firebase-messaging:24.0.0'",
        1
    )
    print("✅ firebase-messaging dependency agregada")
    changed = True

if changed:
    with open('android/app/build.gradle', 'w') as f:
        f.write(content)
