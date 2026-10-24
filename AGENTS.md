# HomeSafe Android app notes

- This is a React Native Community CLI app. Keep the ESP32 firmware in the sibling `HomeSafe` project untouched.
- Firmware protocol source of truth: `include/protocol.h`, `src/network.cpp`, and `src/security.cpp`.
- Protocol v1 has four commands: `get_status`, `set_security_mode`, `set_security_schedule`, and `silence_alarm`. Keep request correlation by `request_id`; do not assume responses arrive adjacent to sends.
- `state_update.data` replaces only its present top-level sections. `timestamp_ms` is ESP32 uptime. Raw gas ADC values must not be described as ppm/AQI.
- Schedule time ranges are hours 0–23/minutes 0–59; identical arm/disarm times are rejected by firmware.
- Safety decisions and physical alarms stay on the ESP32. The app is display/control only. Never imply reliable Android background monitoring.
- Persist preferences in AsyncStorage and events in local SQLite. Do not add a cloud service or infer hazard thresholds in the app.
- Check `README.md` for setup, network, build, and current capability limitations.
