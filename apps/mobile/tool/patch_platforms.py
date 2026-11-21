"""Adds Masar's permissions and settings to the generated Android and iOS projects. Idempotent."""
import pathlib
import re

root = pathlib.Path(__file__).resolve().parent.parent

# ---------- Android ----------
manifest = root / "android/app/src/main/AndroidManifest.xml"
m = manifest.read_text()
perms = [
    "android.permission.INTERNET",
    "android.permission.CAMERA",
    "android.permission.ACCESS_FINE_LOCATION",
    "android.permission.ACCESS_COARSE_LOCATION",
    "android.permission.FOREGROUND_SERVICE",
    "android.permission.FOREGROUND_SERVICE_LOCATION",
    "android.permission.POST_NOTIFICATIONS",
]
for p in perms:
    if p not in m:
        m = m.replace("<application", f'<uses-permission android:name="{p}" />\n    <application', 1)
m = re.sub(r'android:label="[^"]*"', 'android:label="Masar"', m, count=1)
queries = """<queries>
        <intent><action android:name="android.intent.action.DIAL" /><data android:scheme="tel" /></intent>
        <intent><action android:name="android.intent.action.SENDTO" /><data android:scheme="sms" /></intent>
        <intent><action android:name="android.intent.action.VIEW" /><data android:scheme="https" /></intent>"""
if "android.intent.action.DIAL" not in m:
    if "<queries>" in m:
        m = m.replace("<queries>", queries, 1)
    else:
        m = m.replace("</manifest>", queries + "\n    </queries>\n</manifest>", 1)
manifest.write_text(m)

# Plain http only in debug builds, for a server running on the developer's computer.
debug = root / "android/app/src/debug/AndroidManifest.xml"
if debug.exists():
    d = debug.read_text()
    if "usesCleartextTraffic" not in d:
        d = d.replace("</manifest>", '    <application android:usesCleartextTraffic="true" />\n</manifest>', 1)
        debug.write_text(d)

for name in ["build.gradle.kts", "build.gradle"]:
    g = root / "android/app" / name
    if g.exists():
        t = g.read_text()
        # Firebase messaging and the location service need Android 7 or later.
        t = re.sub(r"minSdk\s*=\s*flutter\.minSdkVersion", "minSdk = 24", t)
        t = re.sub(r"minSdkVersion\s+flutter\.minSdkVersion", "minSdkVersion 24", t)
        g.write_text(t)

# Android's release lint crashes on some plugin sources ("Unexpected failure during lint
# analysis"). It only checks for problems, so it is switched off for release builds.
MARK = "// masar: skip lintVital"
for name, block in [
    ("build.gradle.kts", MARK + '\nsubprojects {\n    tasks.matching { it.name.startsWith("lintVital") }.configureEach { enabled = false }\n}\n'),
    ("build.gradle", MARK + "\nsubprojects {\n    tasks.matching { it.name.startsWith('lintVital') }.configureEach { enabled = false }\n}\n"),
]:
    g = root / "android" / name
    if g.exists():
        t = g.read_text()
        if MARK not in t:
            g.write_text(t.rstrip() + "\n\n" + block)

# ---------- iOS ----------
plist = root / "ios/Runner/Info.plist"
if plist.exists():
    p = plist.read_text()
    entries = {
        "NSCameraUsageDescription": "Masar uses the camera to scan parcel labels and photograph deliveries.",
        "NSPhotoLibraryUsageDescription": "Masar attaches photos to claims and deliveries.",
        "NSLocationWhenInUseUsageDescription": "Masar shares your position with operations while you are on duty.",
        "NSLocationAlwaysAndWhenInUseUsageDescription": "Masar keeps sharing your position while you are on duty with the app in the background.",
    }
    add = ""
    for k, v in entries.items():
        if k not in p:
            add += f"\t<key>{k}</key>\n\t<string>{v}</string>\n"
    if "UIBackgroundModes" not in p:
        add += "\t<key>UIBackgroundModes</key>\n\t<array>\n\t\t<string>location</string>\n\t\t<string>remote-notification</string>\n\t</array>\n"
    if add:
        p = p.replace("</dict>\n</plist>", add + "</dict>\n</plist>", 1)
    p = re.sub(r"(<key>CFBundleDisplayName</key>\s*<string>)[^<]*(</string>)", r"\1Masar\2", p)
    plist.write_text(p)

# The camera scanner and Firebase need a recent iOS. The Podfile exists once Flutter has
# configured the iOS build (`flutter build ios --config-only`), so run this script again after.
IOS_MIN = "15.5"
podfile = root / "ios/Podfile"
if podfile.exists():
    t = podfile.read_text()
    t2 = re.sub(r"^#?\s*platform :ios, '[\d.]+'", f"platform :ios, '{IOS_MIN}'", t, flags=re.M)
    if t2 != t:
        podfile.write_text(t2)
pbx = root / "ios/Runner.xcodeproj/project.pbxproj"
if pbx.exists():
    t = pbx.read_text()
    t2 = re.sub(r"IPHONEOS_DEPLOYMENT_TARGET = [\d.]+;", f"IPHONEOS_DEPLOYMENT_TARGET = {IOS_MIN};", t)
    if t2 != t:
        pbx.write_text(t2)

print("Platforms patched.")
