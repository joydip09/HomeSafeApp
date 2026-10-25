# HomeSafe Android companion

Native Android companion app for the HomeSafe ESP32-S3 terminal. The app connects directly to the device on the same Wi-Fi network and has no cloud service or account requirement. Sensor interpretation, security decisions, and the physical alarm remain on the ESP32.

## Requirements

- Node.js 22.11 or newer (the generated React Native 0.88 project requires it)
- JDK 21
- Android SDK Platform 36, NDK 27.1.12297006, and CMake 3.22.1
- An Android device or emulator

The app uses React Native Community CLI 20.2.0 / React Native 0.88.0. Install dependencies with `npm install`. A postinstall script applies the one-line build compatibility change SQLite 6.0.1 needs with current Android Gradle Plugin versions.

## Run on Android

1. Connect the phone and ESP32 to the same local Wi-Fi network, or connect the ESP32 to the phone hotspot in station mode.
2. In the project directory, run `npm start`.
3. In a second terminal, run `npm run android` (or `cd android && ./gradlew assembleDebug`).
4. In the app, open the gear on Home, enter the ESP32's current IP address, keep port `81`, and save. Tap **Connect**.
5. The app reports synchronized only after it receives a valid protocol v1 state snapshot.

For a debug build, start Metro in one terminal, then build and install the APK from a second terminal:

```bash
# Terminal 1: keep Metro running while using the debug app.
npm start

# Terminal 2:
adb devices
cd android
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
cd ..
```

For a release build, no Metro server is needed because the JavaScript bundle is included in the APK:

```bash
adb devices
cd android
./gradlew assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
cd ..
```

Accept the USB debugging prompt on the phone if it appears. The `-r` option reinstalls the APK while preserving the app's local data. The current release build uses the debug signing configuration and is intended for local/device testing, not Play Store distribution.

Use the device's current IP address; it may change between networks or DHCP leases. The endpoint is `ws://<IP>:81`. Android cleartext traffic is enabled for this local WebSocket endpoint.

## App behavior

- Four tabs: Home, Environment, Security, and History; Settings is in the Home header.
- State changes replace only sections present in a `state_update`; snapshots establish the full state baseline. Preserved readings are labeled stale when disconnected or older than 15 seconds.
- MQ-2 and MQ-135 readings are displayed as raw ADC counts. Firmware hazard flags are shown as reported.
- Only firmware-supported commands are sent. Replies are correlated by request ID, and timeout/disconnect outcomes are shown as uncertain.
- Events received while connected are de-duplicated and retained in a local SQLite database (up to 500). AsyncStorage holds small preferences. The device does not provide historical replay, so events may be missed during disconnection.
- Notification preference controls in-app alerts while the app is open. This build does not implement Android system notifications or background WebSocket delivery. Physical alarm behavior is independent of the phone.

## Protocol and firmware notes

Protocol v1 source of truth is the sibling firmware's `include/protocol.h`, `src/network.cpp`, and `src/security.cpp`. Supported commands are `get_status`, `set_security_mode`, `set_security_schedule`, and `silence_alarm`. Schedule hours/minutes are range-limited, and equal arm/disarm times are rejected. `silence_alarm` affects the security alarm output only; environmental hazard state remains separate.

## Checks

Run `npm test -- --runInBand`, `npm run lint`, `npx tsc --noEmit`, and `cd android && ./gradlew assembleDebug`. Physical device behavior still needs confirmation on the target ESP32 and phone.
