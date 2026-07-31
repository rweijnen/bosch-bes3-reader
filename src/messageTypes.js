// Per-address typed decoding, based on the actual Bosch protobuf message
// definitions and DriveUnitMessageBusWrapper field declarations (each
// address's exact wire type was individually confirmed, not guessed — see
// the private research notes for provenance). Fields not listed here fall
// back to the generic best-effort decoder in protocol.js; that fallback is
// intentionally still labeled as a guess, never presented as confirmed.
//
// decode "kind" values:
//   string          - protobuf field 1, length-delimited UTF-8 string
//   normFactor      - protobuf field 1, varint int (zigzag if `signed: true` — confirmed per
//                     type: Uint16NormFactor100Message/SafeUint16NormFactor10 use plain
//                     writeUInt32; Int16NormFactor10Message uses writeSInt32, i.e. zigzag),
//                     divide by `factor` for the real value
//   bool            - protobuf field 1, varint bool (0/1); proto3 omits the field entirely when false
//   uint            - protobuf field 1, raw varint uint, no message wrapper (bare Kotlin scalar
//                     type — UByte/UShort/UInt); inferred from the confirmed 'bool' pattern,
//                     see the FIELD_TYPES header note — not byte-confirmed like the above
//   uuid            - protobuf field 1 wraps a nested message whose own field 1 is 16 raw bytes
//   enum            - protobuf field 1, varint enum ordinal; look up in `enumTable`
//   tuningDetection - protobuf field 1 = bool flag, field 2 = varint counter
//   unixTimestamp   - protobuf field 1, SINT64 (zigzag varint — confirmed from decompile:
//                     Timestamp.value_ is read via codedInputStream.readSInt64(), not plain
//                     readInt64() — a real hardware capture caught this: an un-zigzag-decoded
//                     read showed a date ~2x too far in the future, exactly the zigzag-of-a-
//                     positive-value signature), Unix epoch seconds (com.bosch.ebike.bes3.
//                     messagebus.Timestamp — distinct from the separate TimestampInMilliseconds
//                     class Bosch also has, confirming this one is seconds, not ms)
//   uint32List      - protobuf field 1, repeated varint uint32 (com.bosch.ebike.bes3.messagebus.
//                     ArrayOf8Uint32) — up to 8 packed values, e.g. per-LED color codes
//   serviceDue      - protobuf field 1 = nested Timestamp submessage (same sint64/zigzag field as
//                     unixTimestamp above), field 2 = varint odometer (meters, same unit as
//                     ODOMETER elsewhere) — com.bosch.ebike.bes3.messagebus.ServiceDue

(function () {
const REGIO_SPEED_CONFIGURATION_ENUM = {
  0: { name: 'UNSPECIFIED', label: 'Unspecified' },
  1: { name: 'EUROPE_AUSTRALIA25KMH', label: 'Europe / Australia, 25 km/h' },
  2: { name: 'USA_CANADA_NEW_ZEALAND20MPH', label: 'USA / Canada / New Zealand, 20 mph' },
  3: { name: 'JAPAN24KMH', label: 'Japan, 24 km/h' },
  4: { name: 'SOUTH_KOREA25KMH', label: 'South Korea, 25 km/h' },
  5: { name: 'TAIWAN25KMH', label: 'Taiwan, 25 km/h' },
  6: { name: 'EUROPE45KMH', label: 'Europe, 45 km/h (S-Pedelec class)' },
  7: { name: 'USA28MPH', label: 'USA, 28 mph' },
  8: { name: 'EUROPE_ATHLETE25KMH', label: 'Europe, "Athlete" 25 km/h' },
  9: { name: 'USA_ATHLETE20MPH', label: 'USA, "Athlete" 20 mph' },
  10: { name: 'SOUTH_AFRICA25KMH', label: 'South Africa, 25 km/h' },
  11: { name: 'NEW_ZEALAND45KMH', label: 'New Zealand, 45 km/h (S-Pedelec class)' },
  '-1': { name: 'UNRECOGNIZED', label: 'Unrecognized' },
};

// Labels are Bosch's own UI strings (from DiagnosticTool 3's enum_en.properties,
// ConfigurationDetailsI18n.BikeCategoryEnum.*) — the actual dealer-facing text.
const BIKE_CATEGORY_ENUM = {
  0: { name: 'BIKE_CATEGORY_NOT_CONFIGURED', label: 'Not configured' },
  1: { name: 'CITY', label: 'eCity' },
  2: { name: 'TREKKING', label: 'eTrekking' },
  3: { name: 'M_T_B_TOUR', label: 'eMTB (Tour)' },
  4: { name: 'M_T_B_TRAIL', label: 'eMTB (Trail)' },
  5: { name: 'ROAD', label: 'eRoad' },
  6: { name: 'GRAVEL', label: 'eGravel' },
  7: { name: 'KIDS', label: 'eKids' },
  8: { name: 'CARGO', label: 'eCargo Long John' },
  9: { name: 'FLEET', label: 'eFleet' },
  10: { name: 'OTHERS', label: 'Other' },
  11: { name: 'E_CARGO_LONG_TAIL', label: 'eCargo Long Tail' },
  12: { name: 'COMPACT', label: 'eCompact' },
  '-1': { name: 'UNRECOGNIZED', label: 'Unknown' },
};

// com.bosch.ebike.bes3.messagebus.StartAssistModePositionEnumType — confirmed
// via decompile. Backs both START_ASSIST_MODE_CONFIGURATION (addr 6180,
// writable — see below) and its _OEM counterpart (addr 6179, read-only
// manufacturer default).
const START_ASSIST_MODE_POSITION_ENUM = {
  0: { name: 'START_ASSIST_MODE_NOT_CONFIGURED', label: 'Not configured' },
  1: { name: 'START_ASSIST_MODE_LAST_USED', label: 'Last used mode' },
  2: { name: 'START_ASSIST_MODE_POSITION0', label: 'Position 0 (off/walk)' },
  3: { name: 'START_ASSIST_MODE_POSITION1', label: 'Position 1' },
  4: { name: 'START_ASSIST_MODE_POSITION2', label: 'Position 2' },
  5: { name: 'START_ASSIST_MODE_POSITION3', label: 'Position 3' },
  6: { name: 'START_ASSIST_MODE_POSITION4', label: 'Position 4' },
  '-1': { name: 'UNRECOGNIZED', label: 'Unrecognized' },
};

// com.bosch.ebike.bes3.messagebus.UnitEnumType — confirmed via decompile
// (RemoteControlMessageBusWrapper.getUnits(): ReadableWritableSubscribableDataPoint<UnitEnumMessage>).
const UNIT_ENUM = {
  0: { name: 'METRIC', label: 'Metric' },
  1: { name: 'IMPERIAL', label: 'Imperial' },
  '-1': { name: 'UNRECOGNIZED', label: 'Unrecognized' },
};

// com.bosch.ebike.bes3.messagebus.TimeFormatEnumType — confirmed via decompile
// (RemoteControlMessageBusWrapper.getTimeFormat(): ReadableWritableSubscribableDataPoint<TimeFormatEnumMessage>).
const TIME_FORMAT_ENUM = {
  0: { name: 'HOUR24', label: '24-hour' },
  1: { name: 'HOUR12', label: '12-hour' },
  '-1': { name: 'UNRECOGNIZED', label: 'Unrecognized' },
};

// Address -> typed decode metadata, across all components (address ranges
// don't overlap — see addresses.js). Labels for plain fields are Bosch's own
// DiagnosticTool 3 UI strings where a matching one was found
// (diagnostic_en.properties), otherwise a plain descriptive label.
//
// Fields marked "inferred" use kind 'uint': these are bare Kotlin scalar
// types (UByte/UShort/UInt), not one of Bosch's own protobuf message wrapper
// classes. We haven't captured a real nonzero example of one on the wire —
// the inference rests on the CONFIRMED behavior of 'bool' fields (also a
// bare scalar type, verified empty-for-false against a real capture),
// generalized to other bit-widths of the same no-wrapper pattern. Reasonable,
// but a notch below the byte-confirmed fields above it.

// --- DriveUnit (Flow decompile additions) ---
const DRIVEUNIT_SHIFT_RECOMMENDATION_ENUM = {
  0: { name: "NO_SHIFT_RECOMMENDED", label: "No Shift Recommended" },
  1: { name: "SHIFT_UP_RECOMMENDED", label: "Shift Up Recommended" },
  2: { name: "SHIFT_DOWN_RECOMMENDED", label: "Shift Down Recommended" },
};
const DRIVEUNIT_WALK_ASSIST_TIP_ENUM = {
  0: { name: "WALK_ASSIST_AND_HILL_TIP_OFF", label: "Walk Assist And Hill Tip Off" },
  1: { name: "WALK_ASSIST_TIP_RECOMMENDED", label: "Walk Assist Tip Recommended" },
  2: { name: "HILL_START_TIP_RECOMMENDED", label: "Hill Start Tip Recommended" },
};
const DRIVEUNIT_ROTOR_POSITION_CALIBRATION_RESULT_ENUM = {
  0: { name: "NOT_STARTED", label: "Not Started" },
  1: { name: "RUNNING", label: "Running" },
  2: { name: "SUCCESSFUL", label: "Successful" },
  3: { name: "FAILURE", label: "Failure" },
};
const DRIVEUNIT_BRAKE_DETECTION_STATUS_ENUM = {
  0: { name: "NOT_AVAILABLE", label: "Not Available" },
  1: { name: "NO_BRAKING_DETECTED", label: "No Braking Detected" },
  2: { name: "NORMAL_BRAKING_DETECTED", label: "Normal Braking Detected" },
  3: { name: "STRONG_BRAKING_DETECTED", label: "Strong Braking Detected" },
};
// Enums below back the field-number-verified 'submessage' decoders added after diving into
// the address-only entries above — field numbers confirmed via decompiled FIELD_NUMBER
// constants (not guessed sequentially; e.g. ComponentState's real order is context=1,
// systemState=2, preCharge=3, which a sequential guess would have gotten wrong).
const DRIVEUNIT_COMPONENT_STATE_CONTEXT_ENUM = {
  0: { name: 'UNINITIALIZED_CONTEXT', label: 'Uninitialized' },
  1: { name: 'BOOTLOADER', label: 'Bootloader' },
  2: { name: 'APPLICATION', label: 'Application' },
};
const DRIVEUNIT_COMPONENT_STATE_SYSTEM_STATE_ENUM = {
  0: { name: 'UNINITIALIZED_SYSTEM_STATE', label: 'Uninitialized' },
  1: { name: 'NORMAL', label: 'Normal' },
  2: { name: 'SW_INSTALLATION', label: 'Software Installation' },
};
const DRIVEUNIT_COMPONENT_STATE_PRE_CHARGE_STATE_ENUM = {
  0: { name: 'UNINITIALIZED_PRE_CHARGE', label: 'Uninitialized' },
  1: { name: 'NONE_PRE_CHARGE', label: 'None' },
  2: { name: 'POWER_OFF', label: 'Power Off' },
  3: { name: 'IN_PRE_CHARGE', label: 'In Pre-charge' },
  4: { name: 'PRE_CHARGE_FINISHED', label: 'Pre-charge Finished' },
};
const DRIVEUNIT_WALK_ASSIST_STATE_ENUM = {
  0: { name: 'WALK_ASSIST_AND_HILL_START_OFF', label: 'Off' },
  1: { name: 'WALK_ASSIST_WAITING_FOR_MOVEMENT', label: 'Walk Assist: Waiting For Movement' },
  2: { name: 'WALK_ASSIST_WAITING_FOR_BUTTON_PRESS', label: 'Walk Assist: Waiting For Button Press' },
  3: { name: 'WALK_ASSIST_ACTIVE', label: 'Walk Assist: Active' },
  4: { name: 'HILL_START_WAITING_FOR_PEDAL_TORQUE', label: 'Hill Start: Waiting For Pedal Torque' },
  5: { name: 'HILL_START_WAITING_FOR_BUTTON_PRESS', label: 'Hill Start: Waiting For Button Press' },
  6: { name: 'HILL_START_ACTIVE', label: 'Hill Start: Active' },
};
const DRIVEUNIT_SOUND_TYPE_ENUM = {
  0: { name: 'UNLOCK', label: 'Unlock' },
  1: { name: 'CONNECT_MODULE_SIGNIFICANT_MOVE', label: 'Connect Module: Significant Move' },
  2: { name: 'CRASH_ALARM', label: 'Crash Alarm' },
  3: { name: 'LOCK', label: 'Lock' },
  4: { name: 'CRITICAL_ERROR', label: 'Critical Error' },
  5: { name: 'SAFETY_LAMP_ON_DUE_TO_ERROR', label: 'Safety Lamp On (Error)' },
  6: { name: 'CONNECT_MODULE_MOVEMENT', label: 'Connect Module: Movement' },
  7: { name: 'POSITIVE_CONFIRMATION', label: 'Positive Confirmation' },
};
const DRIVEUNIT_TRICK_ACTIVITY_STATE_ENUM = {
  0: { name: 'NO_TRICK', label: 'No Trick' },
  1: { name: 'START', label: 'Start' },
  2: { name: 'UPDATE', label: 'Update' },
};
const DRIVEUNIT_CHAIN_LOAD_ENUM = {
  0: { name: 'UNKNOWN', label: 'Unknown' },
  1: { name: 'NO_LOAD', label: 'No Load' },
  2: { name: 'LOAD', label: 'Load' },
};
const DRIVEUNIT_CHAIN_MOVEMENT_ENUM = {
  0: { name: 'UNKNOWN', label: 'Unknown' },
  1: { name: 'NO_MOVEMENT', label: 'No Movement' },
  2: { name: 'MOVEMENT', label: 'Movement' },
};
const DRIVEUNIT_CRASH_CLASS_ENUM = {
  0: { name: 'NO_CRASH', label: 'No Crash' },
  1: { name: 'CRASH_RIDING_COLLISION_TIP_OVER', label: 'Riding: Collision, Tip Over' },
  2: { name: 'CRASH_RIDING_STRONG_COLLISION_NO_TIP_OVER', label: 'Riding: Strong Collision, No Tip Over' },
  3: { name: 'CRASH_RIDING_COLLISION_NOSE_OVER', label: 'Riding: Collision, Nose Over' },
  4: { name: 'CRASH_RIDING_STRONG_COLLISION_TIP_OVER', label: 'Riding: Strong Collision, Tip Over' },
  5: { name: 'CRASH_RIDING_STRONG_COLLISION_NOSE_OVER', label: 'Riding: Strong Collision, Nose Over' },
  6: { name: 'CRASH_RIDING_NO_COLLISION_TIP_OVER', label: 'Riding: No Collision, Tip Over' },
  7: { name: 'CRASH_RIDING_NO_COLLISION_NOSE_OVER', label: 'Riding: No Collision, Nose Over' },
  8: { name: 'CRASH_LOW_SPEED_NO_COLLISION_TIP_OVER', label: 'Low Speed: No Collision, Tip Over' },
  9: { name: 'CRASH_LOW_SPEED_NO_COLLISION_NOSE_OVER', label: 'Low Speed: No Collision, Nose Over' },
  10: { name: 'CRASH_STAND_STILL_NO_COLLISION_TIP_OVER', label: 'Standstill: No Collision, Tip Over' },
  11: { name: 'CRASH_STAND_STILL_SOFT_COLLISION_TIP_OVER', label: 'Standstill: Soft Collision, Tip Over' },
  12: { name: 'CRASH_STAND_STILL_STRONG_COLLISION_NO_TIP_OVER', label: 'Standstill: Strong Collision, No Tip Over' },
  13: { name: 'CRASH_STAND_STILL_COLLISION_TIP_OVER', label: 'Standstill: Collision, Tip Over' },
  14: { name: 'CRASH_STAND_STILL_STRONG_COLLISION_TIP_OVER', label: 'Standstill: Strong Collision, Tip Over' },
  15: { name: 'NO_CRASH_STAND_STILL_RIDERLESS_ROLL_OVER', label: 'No Crash: Standstill, Riderless Roll Over' },
};
const DRIVEUNIT_CRASH_STATUS_ENUM = {
  0: { name: 'NO_CRASH', label: 'No Crash' },
  1: { name: 'POTENTIAL_CRASH_DETECTED', label: 'Potential Crash Detected' },
};
const DRIVEUNIT_TUNING_DETECTION_CONFIG_TYPE_ENUM = {
  0: { name: 'DEFAULT', label: 'Default' },
  1: { name: 'ROBUST_AI_CONFIGURATION', label: 'Robust AI Configuration' },
  2: { name: 'ROBUST_CLASSIC_AND_AI_CONFIGURATION', label: 'Robust Classic + AI Configuration' },
};
const DRIVEUNIT_MOUNTING_ANGLE_ESTIMATION_STATUS_ENUM = {
  0: { name: 'NOT_YET_LEARNED', label: 'Not Yet Learned' },
  1: { name: 'LEARNED', label: 'Learned' },
};

// --- Battery (Flow decompile additions) ---
const BATTERY_SHUTDOWN_STATE_ENUM = {
  0: { name: "NOT_RUNNING", label: "Not Running" },
  1: { name: "RUNNING", label: "Running" },
  2: { name: "FINISHED", label: "Finished" },
};
const BATTERY_RESET_SETTINGS_ENUM = {
  0: { name: "RESET_ALL", label: "Reset All" },
};
// Two distinct enums despite both fields being named "chargingMode" — CHARGING_INFORMATION's
// live/active-session mode vs CHARGING_SETTINGS' persisted user preference, confirmed as
// separate value sets via decompile.
const BATTERY_CHARGING_INFORMATION_MODE_ENUM = {
  0: { name: 'STANDARD_CHARGING', label: 'Standard Charging' },
  1: { name: 'FAST_CHARGING', label: 'Fast Charging' },
};
const BATTERY_CHARGING_SETTINGS_MODE_ENUM = {
  0: { name: 'CHARGE_TIME_OPTIMIZED_CHARGING', label: 'Charge-time Optimized' },
  1: { name: 'BATTERY_LIFETIME_OPTIMIZED_CHARGING', label: 'Battery-lifetime Optimized' },
};

// --- ConnectModule (Flow decompile additions) ---
const CONNECTMODULE_BATTERY_CHARGING_STATUS_ENUM = {
  0: { name: "NOT_CHARGING", label: "Not Charging" },
  1: { name: "CHARGING", label: "Charging" },
  2: { name: "CHARGE_FULL", label: "Charge Full" },
};
const CONNECTMODULE_BACKEND_ENVIRONMENT_ENUM = {
  0: { name: "DEV", label: "Dev" },
  1: { name: "Q_A", label: "Q A" },
  2: { name: "STAGE", label: "Stage" },
  3: { name: "PROD", label: "Prod" },
};
const CONNECTMODULE_UNLOCK_COMPONENT_ENUM = {
  0: { name: "UNKNOWN", label: "Unknown" },
  1: { name: "SUCCESS", label: "Success" },
  2: { name: "UNKNOWN_ERROR", label: "Unknown Error" },
  3: { name: "IDENTIFIER_ERROR", label: "Identifier Error" },
  4: { name: "EXPIRATION_ERROR", label: "Expiration Error" },
  5: { name: "FRESHNESS_ERROR", label: "Freshness Error" },
  6: { name: "SIGNATURE_ERROR", label: "Signature Error" },
};

// --- AntiLockBrakeSystem (Flow decompile additions) ---
const ANTILOCKBRAKESYSTEM_OVERALL_ASSEMBLY_TEST_RESULT_ENUM = {
  0: { name: "FAILED", label: "Failed" },
  1: { name: "PASSED", label: "Passed" },
  2: { name: "PENDING", label: "Pending" },
  3: { name: "INCOMPLETE", label: "Incomplete" },
  4: { name: "NOT_APPLICABLE", label: "Not Applicable" },
};
const ANTILOCKBRAKESYSTEM_WHEEL_SPEED_SENSOR_ASSEMBLY_TEST_RESULT_ENUM = {
  0: { name: "FAILED", label: "Failed" },
  1: { name: "PASSED", label: "Passed" },
  2: { name: "PENDING", label: "Pending" },
  3: { name: "INCOMPLETE", label: "Incomplete" },
  4: { name: "NOT_APPLICABLE", label: "Not Applicable" },
};
const ANTILOCKBRAKESYSTEM_UNLOCK_COMPONENT_ENUM = {
  0: { name: "UNKNOWN", label: "Unknown" },
  1: { name: "SUCCESS", label: "Success" },
  2: { name: "UNKNOWN_ERROR", label: "Unknown Error" },
  3: { name: "IDENTIFIER_ERROR", label: "Identifier Error" },
  4: { name: "EXPIRATION_ERROR", label: "Expiration Error" },
  5: { name: "FRESHNESS_ERROR", label: "Freshness Error" },
  6: { name: "SIGNATURE_ERROR", label: "Signature Error" },
};

// --- HeadUnit (Flow decompile additions) ---
const HEADUNIT_STATUSBAR_CUSTOMIZATION_ENUM = {
  0: { name: "SOC", label: "Soc" },
  1: { name: "CLOCK", label: "Clock" },
  2: { name: "BIKE_SPEED", label: "Bike Speed" },
  3: { name: "E_SHIFT_INFO", label: "E Shift Info" },
};
const HEADUNIT_KEY_DEVICE_ENUM = {
  0: { name: "UNKNOWN", label: "Unknown" },
  1: { name: "ACTIVE", label: "Active" },
  2: { name: "INACTIVE", label: "Inactive" },
  3: { name: "NOT_SUPPORTED", label: "Not Supported" },
  4: { name: "TOKEN_CONTAINER_NOT_FOUND", label: "Token Container Not Found" },
  5: { name: "UNLOCK_ERROR", label: "Unlock Error" },
};
const HEADUNIT_SET_AS_KEY_DEVICE_ENUM = {
  0: { name: "UNKNOWN", label: "Unknown" },
  1: { name: "UNKNOWN_ERROR", label: "Unknown Error" },
  2: { name: "SUCCESS", label: "Success" },
  3: { name: "NOT_SUPPORTED", label: "Not Supported" },
  4: { name: "TOKEN_CONTAINER_NOT_FOUND", label: "Token Container Not Found" },
  5: { name: "PERSISTENCE_ERROR", label: "Persistence Error" },
};
const HEADUNIT_UNLOCK_COMPONENT_ENUM = {
  0: { name: "UNKNOWN", label: "Unknown" },
  1: { name: "SUCCESS", label: "Success" },
  2: { name: "UNKNOWN_ERROR", label: "Unknown Error" },
  3: { name: "IDENTIFIER_ERROR", label: "Identifier Error" },
  4: { name: "EXPIRATION_ERROR", label: "Expiration Error" },
  5: { name: "FRESHNESS_ERROR", label: "Freshness Error" },
  6: { name: "SIGNATURE_ERROR", label: "Signature Error" },
};

// --- RemoteControl (Flow decompile additions) ---
const REMOTECONTROL_ACTIVE_UI_COMPONENT_ENUM = {
  0: { name: "REMOTE_CONTROL_UI_COMPONENT", label: "Remote Control Ui Component" },
  1: { name: "HEAD_UNIT_UI_COMPONENT", label: "Head Unit Ui Component" },
  2: { name: "MOBILE_APP_UI_COMPONENT", label: "Mobile App Ui Component" },
};
const REMOTECONTROL_UI_CONTROL_ENUM = {
  0: { name: "UP", label: "Up" },
  1: { name: "DOWN", label: "Down" },
  2: { name: "LEFT", label: "Left" },
  3: { name: "RIGHT", label: "Right" },
  4: { name: "SCROLL_UP", label: "Scroll Up" },
  5: { name: "SCROLL_DOWN", label: "Scroll Down" },
  6: { name: "SCROLL_LEFT", label: "Scroll Left" },
  7: { name: "SCROLL_RIGHT", label: "Scroll Right" },
  8: { name: "CONFIRM", label: "Confirm" },
  9: { name: "CONTEXT_MENU", label: "Context Menu" },
  10: { name: "FAVORITE_SCREEN", label: "Favorite Screen" },
};
const REMOTECONTROL_DYNAMIC_UI_CONTROL_STATE_ENUM = {
  0: { name: "NORMAL", label: "Normal" },
  1: { name: "ADDITIONAL_MENU_CONTROL", label: "Additional Menu Control" },
  2: { name: "GAMING_MODE", label: "Gaming Mode" },
};
const REMOTECONTROL_STATUSBAR_CUSTOMIZATION_ENUM = {
  0: { name: "SOC", label: "Soc" },
  1: { name: "CLOCK", label: "Clock" },
  2: { name: "BIKE_SPEED", label: "Bike Speed" },
  3: { name: "E_SHIFT_INFO", label: "E Shift Info" },
};
const REMOTECONTROL_SNOOZE_STATE_ENUM = {
  0: { name: "SNOOZE_OFF", label: "Snooze Off" },
  1: { name: "SNOOZE_ON_UNTIL_POWER_BUTTON_PRESS", label: "Snooze On Until Power Button Press" },
  2: { name: "SNOOZE_ON_UNTIL_ANY_BUTTON_PRESS", label: "Snooze On Until Any Button Press" },
};
const REMOTECONTROL_HEART_RATE_STATUS_ENUM = {
  0: { name: "DEVICE_UNAVAILABLE", label: "Device Unavailable" },
  1: { name: "DEVICE_SET_UP", label: "Device Set Up" },
  2: { name: "DEVICE_CONNECTED", label: "Device Connected" },
};
const REMOTECONTROL_UNLOCK_COMPONENT_ENUM = {
  0: { name: "UNKNOWN", label: "Unknown" },
  1: { name: "SUCCESS", label: "Success" },
  2: { name: "UNKNOWN_ERROR", label: "Unknown Error" },
  3: { name: "IDENTIFIER_ERROR", label: "Identifier Error" },
  4: { name: "EXPIRATION_ERROR", label: "Expiration Error" },
  5: { name: "FRESHNESS_ERROR", label: "Freshness Error" },
  6: { name: "SIGNATURE_ERROR", label: "Signature Error" },
};
const REMOTECONTROL_E_SHIFT_OPERATION_MODE_REQUEST_ENUM = {
  0: { name: "INVALID", label: "Invalid" },
  1: { name: "NORMAL", label: "Normal" },
  2: { name: "STANDBY", label: "Standby" },
  3: { name: "SERVICE", label: "Service" },
  4: { name: "FINE_ADJUSTMENT", label: "Fine Adjustment" },
};
const REMOTECONTROL_CURRENT_E_SHIFT_OPERATION_MODE_ENUM = {
  0: { name: "INVALID", label: "Invalid" },
  1: { name: "NORMAL", label: "Normal" },
  2: { name: "STANDBY", label: "Standby" },
  3: { name: "SERVICE", label: "Service" },
  4: { name: "FINE_ADJUSTMENT", label: "Fine Adjustment" },
};
const REMOTECONTROL_FINE_ADJUSTMENT_STEP_REQUEST_ENUM = {
  0: { name: "DOWN", label: "Down" },
  1: { name: "UP", label: "Up" },
};
const REMOTECONTROL_SHIFT_MODE_ENUM = {
  0: { name: "UNINITIALIZED", label: "Uninitialized" },
  1: { name: "MANUAL", label: "Manual" },
  2: { name: "AUTOMATIC", label: "Automatic" },
  3: { name: "MANUAL_PLUS", label: "Manual Plus" },
};
const REMOTECONTROL_BLE_HEART_RATE_STATUS_ENUM = {
  0: { name: "DEVICE_UNAVAILABLE", label: "Device Unavailable" },
  1: { name: "DEVICE_SET_UP", label: "Device Set Up" },
  2: { name: "DEVICE_CONNECTED", label: "Device Connected" },
};
const REMOTECONTROL_AUTOMATIC_ACTIVITY_RESET_ENUM = {
  0: { name: "TWO_HOURS_WITHOUT_BIKE_MOVEMENT", label: "Two Hours Without Bike Movement" },
  1: { name: "FOUR_HOURS_WITHOUT_BIKE_MOVEMENT", label: "Four Hours Without Bike Movement" },
  2: { name: "MIDNIGHT", label: "Midnight" },
  3: { name: "SEVEN_DAYS_AFTER_START_OF_ACTIVITY", label: "Seven Days After Start Of Activity" },
};

// --- MobileApp (Flow decompile additions) ---
const MOBILEAPP_HEART_RATE_STATUS_ENUM = {
  0: { name: "DEVICE_UNAVAILABLE", label: "Device Unavailable" },
  1: { name: "DEVICE_SET_UP", label: "Device Set Up" },
  2: { name: "DEVICE_CONNECTED", label: "Device Connected" },
};
const MOBILEAPP_NAVIGATION_CURRENT_STATUS_ENUM = {
  0: { name: "NO_NAVIGATION", label: "No Navigation" },
  1: { name: "ONGOING", label: "Ongoing" },
  2: { name: "DESTINATION_REACHED", label: "Destination Reached" },
};


// --- Battery2 (Flow decompile additions) ---
const BATTERY2_RESET_SETTINGS_ENUM = {
  0: { name: "RESET_ALL", label: "Reset All" },
};

const FIELD_TYPES = buildFieldTypesFromRegistry();

// FIELD_TYPES is now DERIVED from src/address-registry.json (via its generated .js wrapper)
// instead of being hand-written here — that JSON file is the single source of truth for
// every address's decode behavior. Only entries with a confirmed decode kind (i.e. not
// 'unknown') are included — addresses with no confirmed decode fall through to the generic
// best-effort decoder in protocol.js, exactly as before.
function buildFieldTypesFromRegistry() {
  let addresses;
  if (typeof window !== 'undefined' && window.Bes3AddressRegistry) {
    addresses = window.Bes3AddressRegistry.ADDRESS_REGISTRY.addresses;
  } else if (typeof require !== 'undefined') {
    addresses = require('./address-registry.generated.js').ADDRESS_REGISTRY.addresses;
  } else {
    addresses = [];
  }
  const out = {};
  for (const entry of addresses) {
    if (entry.kind && entry.kind !== 'unknown') out[entry.address] = entry;
  }
  return out;
}

function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ');
}
function decodeUtf8(bytes) {
  return new TextDecoder('utf-8').decode(Uint8Array.from(bytes));
}

// Reads a single protobuf varint starting at offset; returns [value, nextOffset].
function readVarint(bytes, offset) {
  let result = 0;
  let shift = 0;
  let i = offset;
  while (true) {
    const b = bytes[i++];
    result |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7;
  }
  return [result >>> 0, i];
}

// Protobuf zigzag decode (used by sint32 fields, e.g. Int16NormFactor10Message) —
// maps the unsigned wire value back to a signed int: 0,1,2,3,4 -> 0,-1,1,-2,2 ...
function zigzagDecode(n) {
  return (n >>> 1) ^ -(n & 1);
}

// Parses top-level protobuf fields (tag + value) out of a message body.
// Only handles what this protocol actually uses: varints and length-delimited.
function parseFields(bytes) {
  const fields = {};
  let i = 0;
  while (i < bytes.length) {
    const [tagByte, afterTag] = readVarint(bytes, i);
    i = afterTag;
    const fieldNum = tagByte >>> 3;
    const wireType = tagByte & 0x7;
    if (wireType === 0) {
      const [value, next] = readVarint(bytes, i);
      fields[fieldNum] = { wireType, value };
      i = next;
    } else if (wireType === 2) {
      const [len, next] = readVarint(bytes, i);
      const content = bytes.slice(next, next + len);
      fields[fieldNum] = { wireType, value: content };
      i = next + len;
    } else {
      break; // unsupported wire type for this protocol — stop rather than misparse
    }
  }
  return fields;
}

// --- CVC (Card Verifiable Certificate, ISO 7816-8 / EAC) parser ---
// Used only for DEVICE_CERTIFICATE (addr 224) so far. Confirmed against a real captured
// battery certificate: this is the same certificate family already documented elsewhere in
// this project's private research (BES3CONFIG's dealer/OEM signing chain, tags 5F25/5F24/5F37) —
// also used, apparently, for a per-battery device identity certificate. Verified end-to-end
// against a real capture: the OID decodes to Ed25519 (1.3.101.112), the 5F25 "valid from" date
// decodes to exactly this battery's own real MANUFACTURING_DATE, the holder-reference and
// authorization-template fields contain this battery's own serial number and product code in
// plain ASCII, and the signature is exactly 64 bytes (Ed25519 signature size) — not a guess.

// BER tag: 1 byte, or 2 bytes if the low 5 bits of the first byte are all set (0x1F) — this
// format never goes beyond 2-byte tags in the samples seen. "Constructed" (contains nested
// TLVs) is bit 0x20 of the first tag byte, standard ASN.1/BER convention.
function readCvcTag(bytes, i) {
  const first = bytes[i];
  if ((first & 0x1f) === 0x1f) return [(first << 8) | bytes[i + 1], 2, !!(first & 0x20)];
  return [first, 1, !!(first & 0x20)];
}
// BER length: short form (high bit clear) is the length itself; long form (high bit set) says
// how many following bytes encode the big-endian length.
function readCvcLen(bytes, i) {
  const b = bytes[i];
  if ((b & 0x80) === 0) return [b, 1];
  const n = b & 0x7f;
  let val = 0;
  for (let k = 0; k < n; k++) val = (val << 8) | bytes[i + 1 + k];
  return [val, 1 + n];
}
function parseCvcTlv(bytes, start, end) {
  let i = start;
  const items = [];
  while (i < end) {
    const [tag, tagLen, constructed] = readCvcTag(bytes, i);
    i += tagLen;
    const [len, lenLen] = readCvcLen(bytes, i);
    i += lenLen;
    items.push({ tag, value: bytes.slice(i, i + len), constructed });
    i += len;
  }
  return items;
}
function findCvcTag(items, tag) {
  return items.find((it) => it.tag === tag);
}
// Extracts printable-ASCII runs (length >= 4) from a byte value — these CVC fields mix binary
// identifiers with embedded plain-text identifiers (bike/component serials, product codes);
// this surfaces the readable parts without asserting exact field semantics for the rest.
function cvcAsciiRuns(bytes) {
  const runs = [];
  let cur = [];
  for (const b of bytes) {
    if (b >= 0x20 && b <= 0x7e) cur.push(b);
    else { if (cur.length >= 4) runs.push(decodeUtf8(cur)); cur = []; }
  }
  if (cur.length >= 4) runs.push(decodeUtf8(cur));
  return runs;
}
// CVC dates (tags 5F25/5F24): 6 bytes, each byte's plain decimal value (0-9, not BCD-packed) is
// one digit of YYMMDD. Confirmed against the real capture: bytes [02,03,00,01,01,02] -> "230112"
// -> 2023-01-12, which is exactly this battery's own MANUFACTURING_DATE.
function decodeCvcDate(bytes) {
  if (bytes.length !== 6) return null;
  const digits = Array.from(bytes).join('');
  return `20${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`;
}
const CVC_KEY_OIDS = { '2b6570': 'Ed25519', '2b6571': 'Ed448' };
function parseCvcCertificate(bytes) {
  // A single leading byte (not part of the CVC TLV itself — likely a container version/count
  // byte) precedes the outer 7F21 template in the one real sample this was checked against.
  let start = 0;
  if (bytes[0] !== 0x7f && bytes[1] === 0x7f && bytes[2] === 0x21) start = 1;
  const outer = parseCvcTlv(bytes, start, bytes.length);
  const cert = findCvcTag(outer, 0x7f21);
  if (!cert || !cert.constructed) return null; // not a recognized CVC — caller falls back to raw hex

  const body = findCvcTag(parseCvcTlv(cert.value, 0, cert.value.length), 0x7f4e);
  const sig = findCvcTag(parseCvcTlv(cert.value, 0, cert.value.length), 0x5f37);
  if (!body) return null;
  const bodyItems = parseCvcTlv(body.value, 0, body.value.length);

  const car = findCvcTag(bodyItems, 0x42); // Certification Authority Reference
  const pubKeyItem = findCvcTag(bodyItems, 0x7f49);
  let keyAlgorithm = null, publicKey = null;
  if (pubKeyItem && pubKeyItem.constructed) {
    const pkItems = parseCvcTlv(pubKeyItem.value, 0, pubKeyItem.value.length);
    const oid = findCvcTag(pkItems, 0x06);
    const key = findCvcTag(pkItems, 0x86);
    keyAlgorithm = oid ? (CVC_KEY_OIDS[toHex(oid.value).replace(/ /g, '')] || `OID ${toHex(oid.value)}`) : null;
    publicKey = key ? toHex(key.value).replace(/ /g, '') : null;
  }
  const holderRef = findCvcTag(bodyItems, 0x5f20); // Certificate Holder Reference
  const authTemplate = findCvcTag(bodyItems, 0x7f4c); // Certificate Holder Authorization Template
  const validFromItem = findCvcTag(bodyItems, 0x5f25);
  const validUntilItem = findCvcTag(bodyItems, 0x5f24);
  const serialItem = findCvcTag(bodyItems, 0x5f34);

  return {
    keyAlgorithm,
    publicKeyHex: publicKey,
    caReferenceHex: car ? toHex(car.value).replace(/ /g, '') : null,
    holderReferenceText: holderRef ? cvcAsciiRuns(holderRef.value).join(' / ') : null,
    authorizationText: authTemplate && authTemplate.constructed
      ? parseCvcTlv(authTemplate.value, 0, authTemplate.value.length)
          .flatMap((it) => cvcAsciiRuns(it.value))
          .join(' / ')
      : null,
    validFrom: validFromItem ? decodeCvcDate(validFromItem.value) : null,
    validUntil: validUntilItem ? decodeCvcDate(validUntilItem.value) : null,
    serialHex: serialItem ? toHex(serialItem.value).replace(/ /g, '') : null,
    signatureHex: sig ? toHex(sig.value).replace(/ /g, '') : null,
    signatureLength: sig ? sig.value.length : null,
  };
}

function decodeTyped(addr, payload) {
  const meta = FIELD_TYPES[addr];
  if (!meta) return null; // no confirmed type — caller should fall back to generic decode

  if (!payload || payload.length === 0) {
    // proto3 omits default-value scalar fields entirely — for bool this means false;
    // for a bare uint it means the value really is 0; for everything else it
    // usually means "not present".
    if (meta.kind === 'bool') return { label: meta.label, display: 'false', value: false };
    if (meta.kind === 'uint') return { label: meta.label, display: meta.unit ? `0 ${meta.unit}` : '0', value: 0 };
    // proto3 omits a false flag / zero counter entirely — an empty tuningDetection
    // read means "no tuning detected", not "unknown". Return a real value object so
    // callers can read .flag / .counter without a null guard.
    if (meta.kind === 'tuningDetection') return { label: meta.label, display: 'flag=false, counter=0', value: { flag: false, counter: 0 } };
    if (meta.kind === 'startAssistModeOem') {
      const entry = meta.enumTable[0];
      return { label: meta.label, display: `${entry.label}, configurable=false`, technical: `${entry.name}=0`, value: { position: entry.name, configurable: false } };
    }
    // Pre-existing gap fixed here: proto3 omits an enum field entirely when its value is the
    // default (0) — same reasoning as 'bool'/'uint' above, just not handled for 'enum' until now.
    // Affects any enum-kind field whenever the bike reports its 0 value (e.g. UNITS=METRIC,
    // TIME_FORMAT=HOUR24) — previously misreported as "(empty / default)" instead of resolving
    // to the real enum-0 value.
    if (meta.kind === 'enum') {
      const entry = meta.enumTable[0];
      // `display` is the human-friendly label only; `technical` carries the raw enum
      // name=ordinal pair for callers that want it (e.g. a hover tooltip or the JSON export).
      return { label: meta.label, display: entry ? entry.label : 'unknown enum value 0', technical: entry ? `${entry.name}=0` : undefined, value: entry ? entry.name : 0 };
    }
    // Unlike a 0-value counter or false flag, an epoch-0 timestamp (1970-01-01) is never a
    // real bike-reported clock value — showing it as a literal date would be misleading, so
    // this is deliberately displayed as "(not set)" rather than following strict proto3-omission
    // semantics like the kinds above.
    if (meta.kind === 'unixTimestamp') return { label: meta.label, display: '(not set)', value: 0 };
    if (meta.kind === 'uint32List') return { label: meta.label, display: '(none)', value: [] };
    if (meta.kind === 'serviceDue') return { label: meta.label, display: '(not set)', value: { timestamp: 0, odometer: 0 } };
    if (meta.kind === 'deactivationProof') return { label: meta.label, display: 'not deactivated (no proof present)', value: { deactivated: false, signatureLength: 0 } };
    if (meta.kind === 'certificateBytes') return { label: meta.label, display: '(no certificate)', value: null };
    if (meta.kind === 'assistModeColors') return { label: meta.label, display: '(none)', value: [] };
    if (meta.kind === 'submessage') return decodeSubmessageFields(meta, {});
    return { label: meta.label, display: '(empty / default)', value: null };
  }

  const fields = parseFields(payload);
  const f1 = fields[1];

  switch (meta.kind) {
    case 'string': {
      if (!f1 || f1.wireType !== 2) return { label: meta.label, display: '(unexpected encoding)', value: null };
      const str = decodeUtf8(f1.value);
      return { label: meta.label, display: str, value: str };
    }
    case 'normFactor': {
      if (!f1 || f1.wireType !== 0) return { label: meta.label, display: '(unexpected encoding)', value: null };
      const raw = meta.signed ? zigzagDecode(f1.value) : f1.value;
      const real = raw / meta.factor;
      return { label: meta.label, display: meta.unit ? `${real} ${meta.unit}` : String(real), value: real };
    }
    case 'bool': {
      if (!f1) return { label: meta.label, display: 'false', value: false };
      return { label: meta.label, display: f1.value ? 'true' : 'false', value: !!f1.value };
    }
    case 'uint': {
      if (!f1 || f1.wireType !== 0) return { label: meta.label, display: '(unexpected encoding)', value: null };
      return { label: meta.label, display: meta.unit ? `${f1.value} ${meta.unit}` : String(f1.value), value: f1.value };
    }
    case 'enum': {
      if (!f1 || f1.wireType !== 0) return { label: meta.label, display: '(unexpected encoding)', value: null };
      const entry = meta.enumTable[f1.value] || meta.enumTable[String(f1.value)];
      return {
        label: meta.label,
        display: entry ? entry.label : `unknown enum value ${f1.value}`,
        technical: entry ? `${entry.name}=${f1.value}` : undefined,
        value: entry ? entry.name : f1.value,
      };
    }
    case 'uuid': {
      if (!f1 || f1.wireType !== 2) return { label: meta.label, display: '(unexpected encoding)', value: null };
      // f1.value is itself a nested message: field 1, length-delimited, 16 raw bytes
      const inner = parseFields(f1.value);
      const raw = inner[1] && inner[1].wireType === 2 ? inner[1].value : null;
      if (!raw || raw.length !== 16) return { label: meta.label, display: `hex: ${toHex(f1.value)}`, value: null };
      const hex = toHex(raw).replace(/ /g, '');
      const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
      return { label: meta.label, display: uuid, value: uuid };
    }
    case 'tuningDetection': {
      const flag = fields[1] ? !!fields[1].value : false;
      const counter = fields[2] ? fields[2].value : 0;
      return { label: meta.label, display: `flag=${flag}, counter=${counter}`, value: { flag, counter } };
    }
    case 'startAssistModeOem': {
      const posValue = f1 && f1.wireType === 0 ? f1.value : 0;
      const entry = meta.enumTable[posValue] || meta.enumTable[String(posValue)];
      const position = entry ? entry.name : posValue;
      const positionLabel = entry ? entry.label : `unknown enum value ${posValue}`;
      const configurable = fields[2] ? !!fields[2].value : false;
      return {
        label: meta.label,
        display: `${positionLabel}, configurable=${configurable}`,
        technical: entry ? `${entry.name}=${posValue}` : undefined,
        value: { position, configurable },
      };
    }
    case 'unixTimestamp': {
      if (!f1 || f1.wireType !== 0) return { label: meta.label, display: '(unexpected encoding)', value: null };
      const seconds = zigzagDecode(f1.value); // sint64 — see file header note
      // Bike clock is reported as a plain Unix epoch (UTC instant) — displayed in the
      // viewer's local time zone, not UTC, since that's what a rider actually cares about.
      const local = new Date(seconds * 1000).toLocaleString();
      return { label: meta.label, display: local, value: seconds };
    }
    case 'uint32List': {
      if (!f1 || f1.wireType !== 2) return { label: meta.label, display: '(unexpected encoding)', value: null };
      // proto3 packed repeated scalar encoding: field 1 is one length-delimited run of
      // concatenated varints, not one wire entry per element.
      const values = [];
      let i = 0;
      while (i < f1.value.length) {
        const [v, next] = readVarint(f1.value, i);
        values.push(v);
        i = next;
      }
      return { label: meta.label, display: values.length ? values.join(', ') : '(none)', value: values };
    }
    case 'serviceDue': {
      let timestamp = 0;
      if (fields[1] && fields[1].wireType === 2) {
        const inner = parseFields(fields[1].value);
        // field 1 of the nested Timestamp submessage is sint64 (zigzag) — same field as
        // unixTimestamp above, see the file header note.
        timestamp = inner[1] && inner[1].wireType === 0 ? zigzagDecode(inner[1].value) : 0;
      }
      const odometer = fields[2] && fields[2].wireType === 0 ? fields[2].value : 0;
      const display = timestamp
        ? `${new Date(timestamp * 1000).toLocaleString()}, odometer ${odometer} m`
        : `odometer ${odometer} m`;
      return { label: meta.label, display, value: { timestamp, odometer } };
    }
    case 'deactivationProof': {
      // DeactivationProof: field1=deactivationState (bool), field2=certificateSerialNumber
      // (nested submessage, not decoded further — no confirmed shape), field3=signature (bytes).
      const deactivated = fields[1] ? !!fields[1].value : false;
      const sig = fields[3] && fields[3].wireType === 2 ? fields[3].value : null;
      const display = deactivated
        ? `DEACTIVATED (signed proof, ${sig ? sig.length : 0}-byte signature)`
        : `not deactivated${sig ? ` (${sig.length}-byte signature present)` : ''}`;
      return { label: meta.label, display, value: { deactivated, signatureLength: sig ? sig.length : 0 } };
    }
    case 'certificateBytes': {
      if (!f1 || f1.wireType !== 2) return { label: meta.label, display: '(unexpected encoding)', value: null };
      const raw = f1.value;
      const cvc = parseCvcCertificate(raw);
      if (!cvc) {
        // Not a recognized CVC — show what we can without asserting a format we haven't verified.
        return {
          label: meta.label,
          display: `${raw.length} bytes, unrecognized format (not X.509/CVC-parsed) — hex: ${toHex(raw).slice(0, 60)}...`,
          value: { raw: toHex(raw).replace(/ /g, '') },
        };
      }
      const display =
        `${cvc.keyAlgorithm || 'unknown key alg'}, holder: ${cvc.holderReferenceText || '?'}, ` +
        `valid ${cvc.validFrom || '?'} to ${cvc.validUntil || '?'}`;
      return { label: meta.label, display, value: cvc };
    }
    case 'assistModeColors': {
      // Confirmed against Flow's own decompiled source (MessageBus.java / PayloadKt.java): this
      // field is a genuine protobuf message, `ArrayOf5Uint32` (`repeated uint32 value = 1`, packed
      // encoding) — NOT a raw fixed-width ARGB byte array as previously assumed. Field 1's stripped
      // content is a sequence of varint-encoded uint32s, one per assist mode slot.
      // Byte order within each uint32 is R<<24|G<<16|B<<8|A (alpha LAST), not Android's
      // conventional ARGB (alpha first) — confirmed empirically against a real capture: treating
      // the high byte as alpha produced implausible, inconsistent per-mode alpha values, while
      // treating the LOW byte as alpha gives 0xff (fully opaque) on every real mode and exactly
      // 0x00000000 (fully unset) for the off/walk slot, matching proto3 default-omission — and the
      // resulting RGB values (olive-green/sky-blue/purple/red) match what a rider actually sees on
      // the bike, unlike the old alpha-first decode.
      const bytes = f1 && f1.wireType === 2 ? f1.value : payload;
      const colors = [];
      let i = 0;
      while (i < bytes.length) {
        const [v, next] = readVarint(bytes, i);
        i = next;
        const r = (v >>> 24) & 0xff, g = (v >>> 16) & 0xff, b = (v >>> 8) & 0xff, a = v & 0xff;
        const hex = '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
        colors.push({ a, r, g, b, hex });
      }
      return { label: meta.label, display: colors.length ? colors.map((c) => c.hex).join(', ') : '(none)', value: colors };
    }
    case 'submessage':
      return decodeSubmessageFields(meta, fields);
    default:
      return null;
  }
}

// Generic multi-field protobuf message decoder — used by any FIELD_TYPES entry with
// kind: 'submessage' and a `fields: [{num, name, label, kind, enumTable?}]` spec. Only
// covers the field kinds this project already decodes elsewhere (bool/uint/string/enum);
// nested sub-submessages are left as their raw wire value rather than recursively decoded.
// A field with no spec entry (an address with no `fields` array at all) still returns a
// valid result — just an empty one — so callers never need a null-guard for this kind.
function decodeSubmessageFields(meta, fields) {
  const value = {};
  const parts = [];
  for (const f of meta.fields || []) {
    const raw = fields[f.num];
    let decoded;
    if (!raw) {
      decoded = f.kind === 'bool' ? false : undefined;
    } else if (f.kind === 'bool') {
      decoded = !!raw.value;
    } else if (f.kind === 'string') {
      decoded = raw.wireType === 2 ? decodeUtf8(raw.value) : undefined;
    } else if (f.kind === 'enum') {
      const entry = f.enumTable && (f.enumTable[raw.value] || f.enumTable[String(raw.value)]);
      decoded = entry ? entry.name : raw.value;
    } else {
      // 'uint' or unspecified — bare varint value, no scaling.
      decoded = raw.wireType === 0 ? raw.value : undefined;
    }
    value[f.name] = decoded;
    if (decoded !== undefined) parts.push(`${f.label || f.name}=${decoded}`);
  }
  return { label: meta.label, display: parts.length ? parts.join(', ') : '(empty)', value };
}

// Re-derive a fresh display string from a report's `rawValue` alone (no raw bytes available —
// a loaded report only has the already-decoded value, not the wire frame). Only meaningful for
// kinds whose display depends on the viewing environment rather than being a pure function of
// the value itself — right now that's just the two timestamp-bearing kinds, since a date's
// toLocaleString() reflects whoever's *looking* at it, not whoever exported the report. A report
// generated on one machine/locale and reloaded later (possibly by someone else, in a different
// locale) would otherwise show the exporter's frozen locale forever. Returns null for every other
// kind — callers should fall back to the report's own stored display string in that case, since
// re-deriving offers no benefit there and risks drifting from decodeTyped's real logic.
function reformatDisplayFromRaw(addr, rawValue) {
  const meta = FIELD_TYPES[addr];
  if (!meta) return null;
  if (meta.kind === 'unixTimestamp') {
    if (!rawValue) return '(not set)';
    return new Date(rawValue * 1000).toLocaleString();
  }
  if (meta.kind === 'serviceDue') {
    const timestamp = rawValue && rawValue.timestamp;
    const odometer = (rawValue && rawValue.odometer) || 0;
    if (!timestamp) return odometer ? `odometer ${odometer} m` : '(not set)';
    return `${new Date(timestamp * 1000).toLocaleString()}, odometer ${odometer} m`;
  }
  return null;
}

const messageTypesExports = { FIELD_TYPES, decodeTyped, reformatDisplayFromRaw, REGIO_SPEED_CONFIGURATION_ENUM, BIKE_CATEGORY_ENUM };
if (typeof module !== 'undefined' && module.exports) {
  module.exports = messageTypesExports;
} else if (typeof window !== 'undefined') {
  window.Bes3MessageTypes = messageTypesExports;
}
})();
