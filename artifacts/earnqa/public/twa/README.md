# Opinoza — Android TWA / Play Store Assets

Everything in this directory is ready to drop into an Android TWA project.
The website itself is **not modified** by any of this.

---

## Directory Structure

```
twa/
├── twa-manifest.json           ← bubblewrap CLI config
├── splash-sources/
│   ├── splash-icon.svg         ← coin icon (source, 108×108dp canvas)
│   ├── splash-wordmark.svg     ← "Opinoza" wordmark (source)
│   └── splash-combined-preview.svg  ← full splash screen preview (design only)
└── res/
    ├── values/
    │   ├── colors.xml          ← brand + splash colors
    │   └── styles.xml          ← SplashTheme (pre-Android-12)
    ├── values-v31/
    │   └── styles.xml          ← SplashTheme (Android 12+ SplashScreen API)
    ├── drawable/
    │   ├── splash.xml          ← pre-Android-12 launch drawable
    │   └── ic_launcher_background.xml  ← adaptive icon background
    ├── mipmap-anydpi-v26/
    │   ├── ic_launcher.xml     ← adaptive icon definition
    │   └── ic_launcher_round.xml
    ├── mipmap-mdpi/ … mipmap-xxxhdpi/
    │   ├── ic_launcher.png          (48–192px)
    │   ├── ic_launcher_round.png    (48–192px)
    │   └── ic_launcher_foreground.png  (108–432px)
    └── drawable-mdpi/ … drawable-xxxhdpi/
        ├── ic_splash_icon.png       (240–960px)  ← windowSplashScreenAnimatedIcon
        └── splash_branding.png      (400–1600px) ← wordmark branding
```

---

## Option A — bubblewrap CLI (Recommended)

bubblewrap creates the entire Android project from your PWA manifest.

### 1. Install bubblewrap
```bash
npm install -g @bubblewrap/cli
```

### 2. Initialize the project
```bash
bubblewrap init --manifest https://opinoza.com/manifest.json
```
bubblewrap will read the manifest, download icons, and scaffold the Android project.

### 3. Copy in the custom splash assets
After `bubblewrap init`, copy these files into the generated Android project:

```bash
# Colors and styles (merge manually if styles.xml already exists)
cp twa/res/values/colors.xml          android/app/src/main/res/values/
cp twa/res/values/styles.xml          android/app/src/main/res/values/
cp twa/res/values-v31/styles.xml      android/app/src/main/res/values-v31/

# Android 12+ splash icon (all densities)
cp twa/res/drawable-*/ic_splash_icon.png   android/app/src/main/res/drawable-*/
cp twa/res/drawable-*/splash_branding.png  android/app/src/main/res/drawable-*/

# Pre-12 splash drawable
cp twa/res/drawable/splash.xml         android/app/src/main/res/drawable/
```

### 4. Set the SHA-256 fingerprint
Generate your keystore fingerprint:
```bash
keytool -list -v -keystore android.keystore -alias opinoza
```
Then update TWO places:
- `public/.well-known/assetlinks.json` on the website
- `twa-manifest.json` → `fingerprints[0].value`
Then redeploy the website so `https://opinoza.com/.well-known/assetlinks.json` is live.

### 5. Build the APK / AAB
```bash
bubblewrap build
```

---

## Option B — Android Studio (Manual)

1. Create a new project in Android Studio using the **"Trusted Web Activity"** template
2. Copy all `res/` subdirectories from this folder into `app/src/main/res/`
3. In `AndroidManifest.xml`, set `android:theme="@style/SplashTheme"` on `LauncherActivity`
4. Add the `androidx.browser:browser` dependency (for CustomTabsClient)
5. Set your package name to `com.opinoza.app`
6. Add your SHA-256 fingerprint to `assetlinks.json` and deploy the website

---

## Splash Screen Behavior by Android Version

| Android version | Splash behavior |
|---|---|
| Android 12+ (API 31+) | System-controlled: `#F8F5F0` bg + coin icon centered + "Opinoza" wordmark at bottom |
| Android 11 and below | `splash.xml` layer-list: `#F8F5F0` bg + `ic_launcher.png` centered at 160dp |
| iOS (PWA / Add to Home Screen) | Browser uses `background_color` + `apple-touch-icon` from manifest |

---

## Splash Design Spec

| Element | Value |
|---|---|
| Background | `#F8F5F0` (warm off-white) |
| Icon | Gold coin, coin radius fills ~90% of 240dp icon area |
| Icon background circle | `#FFFFFF` (white plate behind coin) |
| Wordmark | "Opinoza", Inter 800, `#1E3A5F` navy, bottom of screen |
| Theme color (status bar) | `#F5B924` (gold) |

---

## What Cannot Be Done in PWA Splash

The browser-generated PWA splash screen (Chrome Android) is **fully automatic**:
- It reads `background_color`, `name`, and the manifest icon
- Font weight, spacing, wordmark position, and overall layout are controlled by the browser
- No custom HTML/CSS/JS can run during the splash — it is rendered natively

All custom splash control happens in the **Android TWA layer**, which is what
these assets enable. The website pages are never modified.
