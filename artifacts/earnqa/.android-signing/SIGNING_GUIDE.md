# Opinoza Android Signing Guide

## Keystore Details (KEEP THIS SAFE — BACK UP SECURELY)

| Property | Value |
|---|---|
| **File** | `android.p12` (PKCS12 format) |
| **Alias** | `opinoza` |
| **Password** | `Opinoza2025!` |
| **SHA-256 Fingerprint** | `B0:67:A6:DB:B4:93:F5:E5:F5:9F:2C:F9:D3:53:AD:C5:BF:1D:D3:EE:5A:4A:EC:CC:FF:3D:7F:A0:93:97:81:92` |
| **Algorithm** | RSA 2048 |
| **Valid for** | 25 years (~2050) |
| **CN** | Opinoza |

## Package Details

| Property | Value |
|---|---|
| **Package name** | `com.opinoza.app` |
| **App name** | Opinoza |
| **Version code** | 1 |
| **Version name** | 1.0.0 |
| **Min SDK** | 21 (Android 5.0+) |
| **Target URL** | https://opinoza.com |

## Digital Asset Links

The `assetlinks.json` is already deployed at:
`https://opinoza.com/.well-known/assetlinks.json`

It contains the real SHA-256 fingerprint above, so TWA domain verification will pass.

---

## Building the APK/AAB (Run on your local machine — requires Java 11+)

### Prerequisites (one-time setup)

```bash
# 1. Install Java 11+ (if not already installed)
# macOS: brew install openjdk@11
# Ubuntu: sudo apt install openjdk-11-jdk
# Windows: download from https://adoptium.net

# 2. Install Android SDK Command Line Tools
# Download from: https://developer.android.com/studio (scroll to "Command line tools only")
# Or install Android Studio which includes everything

# 3. Accept Android SDK licenses
yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses

# 4. Install bubblewrap CLI
npm install -g @bubblewrap/cli
```

### Step 1: Download project files from the Replit environment

Download these files to your local machine:
- `artifacts/earnqa/public/twa/` → entire folder
- `artifacts/earnqa/.android-signing/android.p12` → keystore file

### Step 2: Initialize the TWA Android project

```bash
mkdir opinoza-android && cd opinoza-android

# Initialize from the live manifest (bubblewrap reads from opinoza.com)
bubblewrap init --manifest https://opinoza.com/manifest.json
```

When bubblewrap prompts you for values, use these:

| Prompt | Value |
|---|---|
| Package ID | `com.opinoza.app` |
| App name | `Opinoza` |
| Launcher name | `Opinoza` |
| Theme color | `#f5b924` |
| Background color | `#F8F5F0` |
| Start URL | `/` |
| Signing key path | path to `android.p12` |
| Key alias | `opinoza` |
| Key password | `Opinoza2025!` |
| Store password | `Opinoza2025!` |

### Step 3: Copy custom splash/icon assets

After `bubblewrap init`, copy the prepared Android resources into the project:

```bash
# Copy all custom resources (icons, splash drawables, colors, styles)
cp -r twa/res/* android/app/src/main/res/

# This gives you:
# - Adaptive launcher icons (all density buckets)
# - Splash screen drawables (pre-Android 12 + Android 12+ SplashScreen API)
# - Brand colors and theme styles
```

### Step 4: Build the APK (for device testing)

```bash
bubblewrap build

# The APK will be at:
# android/app/build/outputs/apk/release/app-release.apk
```

### Step 5: Build the AAB (for Play Store)

```bash
cd android
./gradlew bundleRelease

# Sign the AAB
jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 \
  -keystore ../android.p12 \
  -storetype PKCS12 \
  -storepass "Opinoza2025!" \
  -keypass "Opinoza2025!" \
  app/build/outputs/bundle/release/app-release.aab \
  opinoza

# The signed AAB is at:
# android/app/build/outputs/bundle/release/app-release.aab
```

---

## Using Google Play App Signing (Recommended for Play Store)

Google Play offers to manage your signing key for you (required for some Play features).
If you opt in:

1. You upload the AAB signed with the keystore above (upload key)
2. Google re-signs it with their key for distribution
3. **You must update `assetlinks.json`** with Google's distribution key fingerprint
   - Find it in Play Console → App Signing → "App signing key certificate"
   - Update `artifacts/earnqa/public/.well-known/assetlinks.json` with that fingerprint
   - Deploy the updated site

For TWA to work with Google Play App Signing, `assetlinks.json` needs:
- The upload key fingerprint (already set, allows development testing)
- AND Google's distribution key fingerprint (add after enrolling in Play App Signing)

---

## Updating for Future Releases

### Change app icon
1. Replace files in `twa/res/mipmap-*/ic_launcher*.png`
2. Rebuild with bubblewrap

### Change splash screen
1. Edit `twa/res/drawable/splash.xml` and `twa/res/values/styles.xml`
2. Replace `twa/res/drawable-*/ic_splash_icon.png` assets
3. Rebuild

### Change website URL
1. Update `host` in `twa-manifest.json`
2. Update `fullScopeUrl` in `twa-manifest.json`
3. Update `assetlinks.json` on the new domain
4. Rebuild

### Increment version (required for each Play Store update)
1. Bump `appVersionCode` (integer, must be higher than last upload)
2. Bump `appVersionName` (string, shown to users)
3. Rebuild and upload new AAB

---

## Verify Digital Asset Links

Test that domain verification passes:
```
https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://opinoza.com&relation=delegate_permission/common.handle_all_urls
```

You should see `com.opinoza.app` in the results with the matching fingerprint.
