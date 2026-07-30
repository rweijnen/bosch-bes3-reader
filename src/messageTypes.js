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

const FIELD_TYPES = {
  // --- Battery2 (Flow decompile additions) ---
  688: { label: "Full charge cycles counted on-bike", kind: 'normFactor', factor: 10, unit: "cycles" }, // Flow decompile, confidence: medium — mirrors Battery's NUMBER_OF_FULL_CHARGE_CYCLES_ON_BIKE (same field, Battery2 instance) — Room model exposes as Float; scaled uint fits nullable-float semantics
  689: { label: "Full charge cycles counted off-bike", kind: 'normFactor', factor: 10, unit: "cycles" }, // Flow decompile, confidence: medium — mirrors Battery's NUMBER_OF_FULL_CHARGE_CYCLES_OFF_BIKE (same field, Battery2 instance) — same as above
  692: { label: "Total energy delivered", kind: 'uint', unit: "Wh" }, // Flow decompile, confidence: medium — mirrors Battery's TOTAL_ENERGY (same field, Battery2 instance) — Energy measurement wrapper base-converts to Wh; RoomComponent$Battery.totalEnergy
  695: { label: "Time spent cell-balancing", kind: 'uint', unit: "s" }, // Flow decompile, confidence: low — mirrors Battery's TIME_IN_BALANCING (same field, Battery2 instance) — unit unconfirmed (s or min)
  701: { label: "Data model / schema version", kind: 'uint' }, // Flow decompile, confidence: high — mirrors Battery's DATA_MODEL_VERSION (same field, Battery2 instance) — consistent generic version counter across all components
  705: { label: "Discharge duration", kind: 'uint', unit: "s" }, // Flow decompile, confidence: low — mirrors Battery's DISCHARGE_DURATION (same field, Battery2 instance) — unit unconfirmed
  708: { label: "Charging active (per-instance)", kind: "bool" }, // Flow decompile, confidence: high — mirrors Battery's INSTANCE_CHARGING_ACTIVE (same field, Battery2 instance) — mirrors CHARGING_ACTIVE at instance scope
  709: { label: "Remaining energy for rider (instance)", kind: 'uint', unit: "Wh" }, // Flow decompile, confidence: medium — mirrors Battery's INSTANCE_REMAINING_ENERGY_FOR_RIDER (same field, Battery2 instance) — Energy measurement, instance-scoped
  710: { label: "Maximum allowed discharge current (instance)", kind: 'normFactor', factor: 10, unit: "A" }, // Flow decompile, confidence: medium — mirrors Battery's INSTANCE_MAXIMUM_ALLOWED_DISCHARGE_CURRENT (same field, Battery2 instance) — current-scaling pattern, instance-scoped
  711: { label: "Maximum allowed reverse current (instance)", kind: 'normFactor', factor: 10, unit: "A" }, // Flow decompile, confidence: medium — mirrors Battery's INSTANCE_MAXIMUM_ALLOWED_REVERSE_CURRENT (same field, Battery2 instance) — current-scaling pattern, instance-scoped
  712: { label: "Present discharge current (instance)", kind: 'normFactor', factor: 10, unit: "A" }, // Flow decompile, confidence: medium — mirrors Battery's INSTANCE_PRESENT_DISCHARGE_CURRENT (same field, Battery2 instance) — current-scaling pattern, instance-scoped
  713: { label: "Light-reserve threshold reached (instance)", kind: "bool" }, // Flow decompile, confidence: high — mirrors Battery's INSTANCE_LIGHT_RESERVE_STATE (same field, Battery2 instance) — instance-scoped mirror of addr 182
  714: { label: "State of charge for rider (instance)", kind: 'uint', unit: "%" }, // Flow decompile, confidence: high — mirrors Battery's INSTANCE_STATE_OF_CHARGE_FOR_RIDER (same field, Battery2 instance) — instance-scoped mirror of addr 188
  715: { label: "Maximum allowed charge current (instance)", kind: 'normFactor', factor: 10, unit: "A" }, // Flow decompile, confidence: medium — mirrors Battery's INSTANCE_MAXIMUM_ALLOWED_CHARGE_CURRENT (same field, Battery2 instance) — current-scaling pattern, instance-scoped
  718: { label: "Easter-egg text/code", kind: "string" }, // Flow decompile, confidence: high — mirrors Battery's EASTER_EGG (same field, Battery2 instance) — EasterEgg{value:string}, field 1
  720: { label: "Dual-battery mode enabled", kind: "bool" }, // Flow decompile, confidence: medium — mirrors Battery's DUAL_BATTERY_MODE (same field, Battery2 instance) — no dedicated proto class found, generic bool assumed
  730: { label: "Energy reserve (instance)", kind: 'uint', unit: "Wh" }, // Flow decompile, confidence: medium — mirrors Battery's INSTANCE_ENERGY_RESERVE (same field, Battery2 instance) — Energy measurement, instance-scoped
  738: { label: "Total capacity", kind: 'uint', unit: "Ah" }, // Flow decompile, confidence: medium — mirrors Battery's TOTAL_CAPACITY (same field, Battery2 instance) — Charge measurement wrapper, base-converts to Ah
  739: { label: "Bootmanager firmware version string", kind: "string" }, // Flow decompile, confidence: high — mirrors Battery's BOOTMANAGER_SOFTWARE_VERSION (same field, Battery2 instance) — matches sibling *_SOFTWARE_VERSION string fields
  742: { label: "Reset command", kind: 'enum', enumTable: BATTERY2_RESET_SETTINGS_ENUM }, // Flow decompile, confidence: high — mirrors Battery's RESET_SETTINGS (same field, Battery2 instance) — ResetSettingsParamsEnumType, single-value enum
  743: { label: "OEM component-lock enable toggle", kind: "bool" }, // Flow decompile, confidence: medium — mirrors Battery's OEM_COMPONENT_LOCK_ENABLE (same field, Battery2 instance) — distinct from OemComponentLockConfiguration submessage
  // Field-number-verified submessage decoders, mirroring Battery's (same field, Battery2 instance).
  706: { label: 'Feature properties, release 4', kind: 'submessage', fields: [
    { num: 1, name: 'centralInformationVisualization', kind: 'bool' },
    { num: 2, name: 'preventShutdown', kind: 'bool' },
    { num: 3, name: 'serviceCharge', kind: 'bool' },
  ] },
  717: { label: 'Static feature-capability flags', kind: 'submessage', fields: [
    { num: 1, name: 'powerCycleIssueList', kind: 'bool' },
    { num: 2, name: 'systemDerating', kind: 'bool' },
    { num: 4, name: 'energyReserveV3', kind: 'bool' },
    { num: 5, name: 'improvedSocCalculation', kind: 'bool' },
    { num: 6, name: 'shortButtonPressChargeSleep', kind: 'bool' },
    { num: 7, name: 'issueHealing', kind: 'bool' },
    { num: 8, name: 'improvedCurrentMonitor', kind: 'bool' },
    { num: 9, name: 'onboardDataCollection', kind: 'bool' },
    { num: 10, name: 'chargingModeConfigurable', kind: 'bool' },
    { num: 11, name: 'ccfWithoutReboot', kind: 'bool' },
    { num: 12, name: 'oemComponentLockingSupport', kind: 'bool' },
    { num: 13, name: 'chargingLimitConfigurable', kind: 'bool' },
    { num: 14, name: 'dsoApprovalForIssueSnapshotDataCollection', kind: 'bool' },
  ] },
  737: { label: 'Harmful-event counters', kind: 'submessage', fields: [
    { num: 1, name: 'deepDischargeCount', kind: 'uint' },
  ] },
  741: { label: 'Charging settings', kind: 'submessage', fields: [
    { num: 1, name: 'chargingMode', kind: 'enum', enumTable: BATTERY_CHARGING_SETTINGS_MODE_ENUM },
    { num: 2, name: 'chargingLimitSoc', label: 'chargingLimitSoc (%)', kind: 'uint' },
  ] },
  // --- DriveUnit (Flow decompile additions) ---
  4129: { label: "Remote control component present", kind: "bool" }, // Flow decompile, confidence: high — Component-presence flag, same pattern as sibling *_AVAILABLE addresses
  4130: { label: "Battery 1 present", kind: "bool" }, // Flow decompile, confidence: high — Component-presence flag
  4131: { label: "Battery 1 present, in bootloader mode", kind: "bool" }, // Flow decompile, confidence: high — Component-presence flag (bootloader variant)
  4132: { label: "Head unit present", kind: "bool" }, // Flow decompile, confidence: high — Component-presence flag
  4133: { label: "Head unit present, in bootloader mode", kind: "bool" }, // Flow decompile, confidence: high — Component-presence flag (bootloader variant)
  4134: { label: "Connect module present", kind: "bool" }, // Flow decompile, confidence: high — Component-presence flag
  4135: { label: "Connect module present, in bootloader mode", kind: "bool" }, // Flow decompile, confidence: high — Component-presence flag (bootloader variant)
  4136: { label: "ABS present", kind: "bool" }, // Flow decompile, confidence: high — Component-presence flag
  4137: { label: "ABS present, in bootloader mode", kind: "bool" }, // Flow decompile, confidence: high — Component-presence flag (bootloader variant)
  4138: { label: "Battery 2 present", kind: "bool" }, // Flow decompile, confidence: high — Component-presence flag
  4139: { label: "Battery 2 present, in bootloader mode", kind: "bool" }, // Flow decompile, confidence: high — Component-presence flag (bootloader variant)
  4248: { label: "Reset user-adjusted rear wheel circumference to default", kind: "bool" }, // Flow decompile, confidence: medium — Write-trigger address, no dedicated message class found
  4251: { label: "Request/trigger time-until-derating computation", kind: "bool" }, // Flow decompile, confidence: low — Write-trigger address; result likely surfaced via a different (not-listed) address
  4252: { label: "Limit motor assistance until next power cycle", kind: "bool" }, // Flow decompile, confidence: medium — Write-flag address, no dedicated message class found
  4254: { label: "Trigger reset of learned gear ratios", kind: "bool" }, // Flow decompile, confidence: medium — Write-trigger address
  4260: { label: "Trigger start of rotor position calibration", kind: "bool" }, // Flow decompile, confidence: high — Write-trigger; result reported via ROTOR_POSITION_CALIBRATION_RESULT (6304)
  6154: { label: "Trigger: switch to next-higher assist mode", kind: "bool" }, // Flow decompile, confidence: medium — Write-trigger address, no dedicated message class found
  6155: { label: "Trigger: switch to next-lower assist mode", kind: "bool" }, // Flow decompile, confidence: medium — Write-trigger address, no dedicated message class found
  6160: { label: "Data model / schema version", kind: 'uint' }, // Flow decompile, confidence: high — Plain int version counter, consistent across all components
  6164: { label: "Instantaneous rider (pedal) torque", kind: 'uint', unit: "Nm" }, // Flow decompile, confidence: medium — No dedicated message wrapper; plain scalar per Bosch BES3 convention
  6165: { label: "Instantaneous motor torque", kind: 'uint', unit: "Nm" }, // Flow decompile, confidence: medium — No dedicated message wrapper; plain scalar
  6170: { label: "Bike detected as not driving (motor cut-off state)", kind: "bool" }, // Flow decompile, confidence: high — Confirmed via EbikeDriveUnit.isNotDriving boolean field
  6174: { label: "Currently applied instantaneous assist factor", kind: 'normFactor', factor: 10, unit: "%" }, // Flow decompile, confidence: medium — Likely scaled percentage factor akin to assistanceLevel fields (Room AssistMode.assistanceLevel* are Float)
  6218: { label: "Total riding time excluding stops", kind: 'uint', unit: "s" }, // Flow decompile, confidence: medium — No dedicated message wrapper; plain scalar counter
  6219: { label: "Notification: bike about to enter energy-reserve mode", kind: "bool" }, // Flow decompile, confidence: medium — Paired trigger/event flag with ENERGY_RESERVE (6230)
  6224: { label: "Recommended gear-shift direction", kind: 'enum', enumTable: DRIVEUNIT_SHIFT_RECOMMENDATION_ENUM }, // Flow decompile, confidence: high — ShiftRecommendationEnumType / ShiftRecommendationEnumMessage
  6230: { label: "Currently operating in energy-reserve (low battery protection) mode", kind: "bool" }, // Flow decompile, confidence: medium — Companion state flag to ENTERING_ENERGY_RESERVE
  6234: { label: "Rider pedal cadence", kind: 'uint', unit: "rpm" }, // Flow decompile, confidence: medium — No dedicated message wrapper; plain scalar
  6235: { label: "Rider (pedal) power", kind: 'uint', unit: "W" }, // Flow decompile, confidence: high — Confirmed via EbikeDriveUnit.riderPower:Power(measurement.Power wraps double inWatts); wire field is plain int watts (cf. MaximumAvailableMotorPowerOrBuilder int fields)
  6236: { label: "Motor cadence", kind: 'uint', unit: "rpm" }, // Flow decompile, confidence: medium — No dedicated message wrapper; plain scalar, mirrors RIDER_CADENCE
  6237: { label: "Motor output power", kind: 'uint', unit: "W" }, // Flow decompile, confidence: high — Confirmed via EbikeDriveUnit.motorPower:Power
  6244: { label: "Boot manager firmware version string", kind: "string" }, // Flow decompile, confidence: high — Matches string-typed *_SOFTWARE_VERSION pattern (e.g. bootloaderSoftwareVersion field in RoomComponent$DriveUnit)
  6245: { label: "Bike detected as stationary", kind: "bool" }, // Flow decompile, confidence: high — Confirmed via EbikeDriveUnit.isNotMoving boolean field
  6258: { label: "Companion app usable in rider's current region", kind: "bool" }, // Flow decompile, confidence: medium — Regional feature-availability flag, no dedicated message class
  6259: { label: "Navigation feature usable in rider's current region", kind: "bool" }, // Flow decompile, confidence: medium — Regional feature-availability flag, no dedicated message class
  6265: { label: "Easter-egg text string", kind: "string" }, // Flow decompile, confidence: high — EasterEgg protobuf message: getValue():String (same shape on every component)
  6266: { label: "Feature-properties bitset, release 4", kind: "bool" }, // Flow decompile, confidence: medium — DriveUnitFeaturePropertiesRelease4 message currently has a single boolean field (centralInformationVisualization); treat as bool but may grow more fields in future firmware
  6270: { label: "Bike configured as speed pedelec (S-Pedelec/25mph class)", kind: "bool" }, // Flow decompile, confidence: high — Confirmed via RoomComponent$DriveUnit.isSpeedPedelec and EbikeDriveUnit.isSpeedPedelec boolean fields
  6271: { label: "Prohibit motor assistance", kind: "bool" }, // Flow decompile, confidence: medium — Write-flag address, no dedicated message class found (cf. MotorSupportProhibitionRequest on RemoteControl, different address)
  6274: { label: "Predicted pedal dead-center crank-angle/timestamp samples", kind: "uint32List" }, // Flow decompile, confidence: high — DeadCenterTimestamps protobuf message: repeated int32 value
  6275: { label: "Motor assistance currently active", kind: "bool" }, // Flow decompile, confidence: medium — State flag, no dedicated message class found
  6277: { label: "Configured maximum motor power limit", kind: 'uint', unit: "W" }, // Flow decompile, confidence: medium — No dedicated message wrapper; plain scalar, unit inferred from Power convention
  6278: { label: "Configured maximum motor torque limit", kind: 'uint', unit: "Nm" }, // Flow decompile, confidence: medium — No dedicated message wrapper; plain scalar
  6279: { label: "Continuous (sustained) motor torque rating", kind: 'uint', unit: "Nm" }, // Flow decompile, confidence: medium — No dedicated message wrapper; plain scalar, parallels MotorPowerConfiguration.continuousRatedMotorPower pattern
  6282: { label: "Automatic assist mode feature available", kind: "bool" }, // Flow decompile, confidence: high — Simple availability flag, naming pattern consistent with other *_AVAILABLE bools
  6284: { label: "Configured max battery discharge current", kind: 'uint', unit: "A" }, // Flow decompile, confidence: medium — Domain model exposes as nullable Double (maximumConfiguredDischargeCurrent); wire type/scale not directly confirmed
  6285: { label: "Rear cassette rotational speed", kind: 'uint', unit: "rpm" }, // Flow decompile, confidence: medium — No dedicated message wrapper; plain scalar
  6286: { label: "Walk-assist/hill-start tip to show rider", kind: 'enum', enumTable: DRIVEUNIT_WALK_ASSIST_TIP_ENUM }, // Flow decompile, confidence: high — WalkAssistTipEnumType / WalkAssistTipEnumMessage
  6288: { label: "Motor interaction ramp-down timing config", kind: 'uint', unit: "ms" }, // Flow decompile, confidence: medium — MotorInteractionConfiguration protobuf message: single optional int field motorRampDownTime
  6295: { label: "Request to reduce battery input (charge) current", kind: "bool" }, // Flow decompile, confidence: medium — Write-flag address, no dedicated message class found
  6301: { label: "Motor's own distance/rotation odometer", kind: 'uint', unit: "m" }, // Flow decompile, confidence: medium — Parallels ODOMETER (Length-typed) but for the motor unit specifically; no dedicated message wrapper confirmed
  6303: { label: "Current sensor-measured roll mounting angle", kind: 'uint', unit: "°" }, // Flow decompile, confidence: medium — Companion scalar to ESTIMATED_MOUNTING_ANGLE_INFORMATION's estimatedMountingAngleRoll int field
  6304: { label: "Result of rotor position calibration", kind: 'enum', enumTable: DRIVEUNIT_ROTOR_POSITION_CALIBRATION_RESULT_ENUM }, // Flow decompile, confidence: high — RotorPositionCalibrationResultEnumType / EnumMessage
  6305: { label: "Braking intensity detection status", kind: 'enum', enumTable: DRIVEUNIT_BRAKE_DETECTION_STATUS_ENUM }, // Flow decompile, confidence: high — BrakeDetectionStatusEnumType / EnumMessage
  6306: { label: "Trigger reset of hub-cable diagnosis result", kind: "bool" }, // Flow decompile, confidence: high — Write-trigger address, companion to DIAGNOSE_HUB_CABLE (4261)
  6311: { label: "OEM enable flag for component-lock feature", kind: "bool" }, // Flow decompile, confidence: medium — Write-flag address, no dedicated message class found (distinct from OemComponentLockConfiguration submessage)
  // Field-number-verified submessage decoders (dove into the address-only entries above) —
  // field numbers confirmed via decompiled FIELD_NUMBER constants, not guessed.
  4259: { label: 'Reset rider-context features', kind: 'submessage', fields: [
    { num: 1, name: 'distractedRiderAlert', kind: 'bool' },
  ] }, // ResetRiderContextFeatures — write-trigger message, single bool field
  6246: { label: 'Component state', kind: 'submessage', fields: [
    { num: 1, name: 'context', kind: 'enum', enumTable: DRIVEUNIT_COMPONENT_STATE_CONTEXT_ENUM },
    { num: 2, name: 'systemState', kind: 'enum', enumTable: DRIVEUNIT_COMPONENT_STATE_SYSTEM_STATE_ENUM },
    { num: 3, name: 'preChargeState', kind: 'enum', enumTable: DRIVEUNIT_COMPONENT_STATE_PRE_CHARGE_STATE_ENUM },
  ] }, // ComponentState
  6247: { label: 'Configured speed range', kind: 'submessage', fields: [
    { num: 1, name: 'minimumSpeed', kind: 'uint' },
    { num: 2, name: 'maximumSpeed', kind: 'uint' },
  ] }, // SpeedRange
  6250: { label: 'Walk-assist / hill-start status', kind: 'submessage', fields: [
    { num: 1, name: 'state', kind: 'enum', enumTable: DRIVEUNIT_WALK_ASSIST_STATE_ENUM },
    { num: 2, name: 'countdown', kind: 'uint' },
  ] }, // WalkAssistStatus
  6255: { label: 'Sound status', kind: 'submessage', fields: [
    { num: 1, name: 'soundType', kind: 'enum', enumTable: DRIVEUNIT_SOUND_TYPE_ENUM },
    { num: 2, name: 'remainingRepetitions', kind: 'uint' },
  ] }, // SoundStatus
  6280: { label: 'Trick/jump detection status', kind: 'submessage', fields: [
    { num: 2, name: 'activityState', kind: 'enum', enumTable: DRIVEUNIT_TRICK_ACTIVITY_STATE_ENUM },
    { num: 4, name: 'duration', kind: 'uint' },
    { num: 5, name: 'distance', kind: 'uint' },
    { num: 6, name: 'height', kind: 'uint' },
    { num: 7, name: 'pitchAngle', kind: 'uint' },
    { num: 8, name: 'rollAngle', kind: 'uint' },
    { num: 9, name: 'yawAngle', kind: 'uint' },
  ] }, // TrickDetectionStatus — trickType(1)/startTimestamp(3) omitted: trickType's enum values weren't confirmed, startTimestamp is a 64-bit field this project's varint-only field parser doesn't attempt
  6283: { label: 'Per-mode assist limits', kind: 'submessage', fields: [
    { num: 1, name: 'maximumSpeed', kind: 'uint' },
    { num: 2, name: 'maximumMotorPower', kind: 'uint' },
    { num: 3, name: 'maximumMotorTorque', kind: 'uint' },
    { num: 4, name: 'maximumMotorAssistance', kind: 'uint' },
  ] }, // AssistModeLimits — field 5 (motorAssistanceApplication, a factor map) omitted, too complex for this generic decoder
  6287: { label: 'Drivetrain chain state', kind: 'submessage', fields: [
    { num: 1, name: 'chainMovement', kind: 'enum', enumTable: DRIVEUNIT_CHAIN_MOVEMENT_ENUM },
    { num: 2, name: 'chainLoad', kind: 'enum', enumTable: DRIVEUNIT_CHAIN_LOAD_ENUM },
  ] }, // ChainState
  6291: { label: 'Predicted speed-tuning (derestriction) confidence', kind: 'submessage', fields: [
    { num: 1, name: 'confidencePredictor', kind: 'uint' },
    { num: 2, name: 'confidencePredictorMax', kind: 'uint' },
    { num: 3, name: 'tuningDetectedFlag', kind: 'bool' },
  ] }, // SpeedTuningPredicted
  6292: { label: 'Crash detection status', kind: 'submessage', fields: [
    { num: 1, name: 'crashClass', kind: 'enum', enumTable: DRIVEUNIT_CRASH_CLASS_ENUM },
    { num: 2, name: 'crashStatus', kind: 'enum', enumTable: DRIVEUNIT_CRASH_STATUS_ENUM },
  ] }, // CrashDetectionStatus
  6293: { label: 'Crash detection configuration', kind: 'submessage', fields: [
    { num: 1, name: 'featureActivationFlag', kind: 'bool' },
    { num: 2, name: 'soundActivationFlag', kind: 'bool' },
  ] }, // CrashDetectionConfig
  6307: { label: 'Tuning detection configuration', kind: 'submessage', fields: [
    { num: 1, name: 'configuration', kind: 'enum', enumTable: DRIVEUNIT_TUNING_DETECTION_CONFIG_TYPE_ENUM },
  ] }, // TuningDetectionConfig — field 2 (serialNumber) is itself a nested submessage, omitted
  6308: { label: 'Per-mode assist limits (v2)', kind: 'submessage', fields: [
    { num: 1, name: 'maximumSpeed', kind: 'uint' },
    { num: 2, name: 'maximumMotorPower', kind: 'uint' },
    { num: 3, name: 'maximumMotorTorque', kind: 'uint' },
    { num: 4, name: 'maximumMotorAssistance', kind: 'uint' },
  ] }, // AssistModeLimitsV2 — field 5 (motorApplication, a characteristic map) omitted
  6309: { label: 'Estimated IMU mounting angle', kind: 'submessage', fields: [
    { num: 1, name: 'pitch', kind: 'uint' },
    { num: 2, name: 'roll', kind: 'uint' },
    { num: 3, name: 'status', kind: 'enum', enumTable: DRIVEUNIT_MOUNTING_ANGLE_ESTIMATION_STATUS_ENUM },
  ] }, // MountingAngleEstimationInformation
  // --- Battery (Flow decompile additions) ---
  142: { label: "Prepare-for-shutdown flag", kind: "bool" }, // Flow decompile, confidence: medium — matches FEATURE_PROPERTIES naming pattern of shutdown-lifecycle bools
  143: { label: "Veto/deny shutdown flag", kind: "bool" }, // Flow decompile, confidence: medium — paired with PREPARE_SHUTDOWN/PREVENT_SHUTDOWN lifecycle
  147: { label: "Maximum allowed discharge current", kind: 'normFactor', factor: 10, unit: "A" }, // Flow decompile, confidence: medium — Uint16NormFactor10Message pattern for current fields
  148: { label: "Present discharge current", kind: 'normFactor', factor: 10, unit: "A" }, // Flow decompile, confidence: medium — same current-scaling pattern
  149: { label: "Remaining charging time", kind: 'uint', unit: "min" }, // Flow decompile, confidence: medium — plain uint16 duration, likely minutes
  167: { label: "Maximum allowed reverse current", kind: 'normFactor', factor: 10, unit: "A" }, // Flow decompile, confidence: medium — current-scaling pattern
  176: { label: "Full charge cycles counted on-bike", kind: 'normFactor', factor: 10, unit: "cycles" }, // Flow decompile, confidence: medium — Room model exposes as Float; scaled uint fits nullable-float semantics
  177: { label: "Full charge cycles counted off-bike", kind: 'normFactor', factor: 10, unit: "cycles" }, // Flow decompile, confidence: medium — same as above
  180: { label: "Total energy delivered", kind: 'uint', unit: "Wh" }, // Flow decompile, confidence: medium — Energy measurement wrapper base-converts to Wh; RoomComponent$Battery.totalEnergy
  182: { label: "Light-reserve threshold reached", kind: "bool" }, // Flow decompile, confidence: high — RoomComponent$Battery.isLightReserveReached direct match
  183: { label: "Time spent cell-balancing", kind: 'uint', unit: "s" }, // Flow decompile, confidence: low — unit unconfirmed (s or min)
  188: { label: "System state of charge for rider", kind: 'uint', unit: "%" }, // Flow decompile, confidence: high — rider-facing SoC percentage, uint8 range 0-100
  189: { label: "Data model / schema version", kind: 'uint' }, // Flow decompile, confidence: high — consistent generic version counter across all components
  192: { label: "Trigger service-charge request", kind: "bool" }, // Flow decompile, confidence: medium — command trigger, no payload fields found
  193: { label: "Discharge duration", kind: 'uint', unit: "s" }, // Flow decompile, confidence: low — unit unconfirmed
  195: { label: "Prevent-shutdown flag", kind: "bool" }, // Flow decompile, confidence: high — matches BatteryFeaturePropertiesRelease4.preventShutdown_ field
  196: { label: "Charging active (per-instance)", kind: "bool" }, // Flow decompile, confidence: high — mirrors CHARGING_ACTIVE at instance scope
  197: { label: "Remaining energy for rider (instance)", kind: 'uint', unit: "Wh" }, // Flow decompile, confidence: medium — Energy measurement, instance-scoped
  198: { label: "Maximum allowed discharge current (instance)", kind: 'normFactor', factor: 10, unit: "A" }, // Flow decompile, confidence: medium — current-scaling pattern, instance-scoped
  199: { label: "Maximum allowed reverse current (instance)", kind: 'normFactor', factor: 10, unit: "A" }, // Flow decompile, confidence: medium — current-scaling pattern, instance-scoped
  200: { label: "Present discharge current (instance)", kind: 'normFactor', factor: 10, unit: "A" }, // Flow decompile, confidence: medium — current-scaling pattern, instance-scoped
  201: { label: "Light-reserve threshold reached (instance)", kind: "bool" }, // Flow decompile, confidence: high — instance-scoped mirror of addr 182
  202: { label: "State of charge for rider (instance)", kind: 'uint', unit: "%" }, // Flow decompile, confidence: high — instance-scoped mirror of addr 188
  203: { label: "Maximum allowed charge current (instance)", kind: 'normFactor', factor: 10, unit: "A" }, // Flow decompile, confidence: medium — current-scaling pattern, instance-scoped
  206: { label: "Easter-egg text/code", kind: "string" }, // Flow decompile, confidence: high — EasterEgg{value:string}, field 1
  208: { label: "Dual-battery mode enabled", kind: "bool" }, // Flow decompile, confidence: medium — no dedicated proto class found, generic bool assumed
  209: { label: "Battery shutdown progress", kind: 'enum', enumTable: BATTERY_SHUTDOWN_STATE_ENUM }, // Flow decompile, confidence: high — BatteryShutdownStateEnumType confirmed
  211: { label: "Time until derating", kind: 'uint', unit: "s" }, // Flow decompile, confidence: medium — TimeUntilDerating{value:int32}, unit likely seconds
  213: { label: "Continuous pack power", kind: 'uint', unit: "W" }, // Flow decompile, confidence: medium — RoomComponent field name match, likely watts
  217: { label: "System total energy for rider", kind: 'uint', unit: "Wh" }, // Flow decompile, confidence: medium — Energy measurement
  218: { label: "Energy reserve (instance)", kind: 'uint', unit: "Wh" }, // Flow decompile, confidence: medium — Energy measurement, instance-scoped
  226: { label: "Total capacity", kind: 'uint', unit: "Ah" }, // Flow decompile, confidence: medium — Charge measurement wrapper, base-converts to Ah
  227: { label: "Bootmanager firmware version string", kind: "string" }, // Flow decompile, confidence: high — matches sibling *_SOFTWARE_VERSION string fields
  230: { label: "Reset command", kind: 'enum', enumTable: BATTERY_RESET_SETTINGS_ENUM }, // Flow decompile, confidence: high — ResetSettingsParamsEnumType, single-value enum
  231: { label: "OEM component-lock enable toggle", kind: "bool" }, // Flow decompile, confidence: medium — distinct from OemComponentLockConfiguration submessage
  // Field-number-verified submessage decoders (dove into the address-only entries above).
  194: { label: 'Feature properties, release 4', kind: 'submessage', fields: [
    { num: 1, name: 'centralInformationVisualization', kind: 'bool' },
    { num: 2, name: 'preventShutdown', kind: 'bool' },
    { num: 3, name: 'serviceCharge', kind: 'bool' },
  ] }, // BatteryFeaturePropertiesRelease4
  205: { label: 'Static feature-capability flags', kind: 'submessage', fields: [
    { num: 1, name: 'powerCycleIssueList', kind: 'bool' },
    { num: 2, name: 'systemDerating', kind: 'bool' },
    { num: 4, name: 'energyReserveV3', kind: 'bool' },
    { num: 5, name: 'improvedSocCalculation', kind: 'bool' },
    { num: 6, name: 'shortButtonPressChargeSleep', kind: 'bool' },
    { num: 7, name: 'issueHealing', kind: 'bool' },
    { num: 8, name: 'improvedCurrentMonitor', kind: 'bool' },
    { num: 9, name: 'onboardDataCollection', kind: 'bool' },
    { num: 10, name: 'chargingModeConfigurable', kind: 'bool' },
    { num: 11, name: 'ccfWithoutReboot', kind: 'bool' },
    { num: 12, name: 'oemComponentLockingSupport', kind: 'bool' },
    { num: 13, name: 'chargingLimitConfigurable', kind: 'bool' },
    { num: 14, name: 'dsoApprovalForIssueSnapshotDataCollection', kind: 'bool' },
  ] }, // BatteryStaticFeatureProperties — field 3 (systemTotalEnergyForRider) omitted, type unconfirmed
  225: { label: 'Harmful-event counters', kind: 'submessage', fields: [
    { num: 1, name: 'deepDischargeCount', kind: 'uint' },
  ] }, // HarmfulEvents — fields 2-10 (reservedEvent2..10) are unused reserved slots, omitted
  228: { label: 'Live charging information', kind: 'submessage', fields: [
    { num: 1, name: 'targetSocForCharging', label: 'targetSocForCharging (%)', kind: 'uint' },
    { num: 2, name: 'chargingMode', kind: 'enum', enumTable: BATTERY_CHARGING_INFORMATION_MODE_ENUM },
  ] }, // ChargingInformation
  229: { label: 'Charging settings', kind: 'submessage', fields: [
    { num: 1, name: 'chargingMode', kind: 'enum', enumTable: BATTERY_CHARGING_SETTINGS_MODE_ENUM },
    { num: 2, name: 'chargingLimitSoc', label: 'chargingLimitSoc (%)', kind: 'uint' },
  ] }, // ChargingSettings
  // --- ConnectModule (Flow decompile additions) ---
  2825: { label: "Component data-model/schema version", kind: 'uint' }, // Flow decompile, confidence: high — shared plumbing scalar
  2848: { label: "Hidden/easter-egg text value", kind: "string" }, // Flow decompile, confidence: high — EasterEgg{value}
  2855: { label: "Activates the Connect Module (BCM) with backend/connectivity", kind: "bool" }, // Flow decompile, confidence: medium — no dedicated class; positional + BikeProtectSettingsViewModel context
  2856: { label: "Trigger to send connection-acknowledge ping to Bosch backend", kind: "bool" }, // Flow decompile, confidence: medium — inferred command trigger, part of backend registration workflow
  2859: { label: "Boot-manager firmware version string", kind: "string" }, // Flow decompile, confidence: high — sibling of BOOTLOADER/HARDWARE/SOFTWARE_VERSION String fields
  2864: { label: "Command to disable/clear transportation (shipping) mode", kind: "bool" }, // Flow decompile, confidence: medium — beside TRANSPORTATION_MODE_CONFIGURATION
  2866: { label: "Battery charging status", kind: 'enum', enumTable: CONNECTMODULE_BATTERY_CHARGING_STATUS_ENUM }, // Flow decompile, confidence: high — BatteryChargingStatusEnumType
  2870: { label: "Selected backend environment", kind: 'enum', enumTable: CONNECTMODULE_BACKEND_ENVIRONMENT_ENUM }, // Flow decompile, confidence: high — BackendEnvironmentEnumType
  2871: { label: "Free-form debug/diagnostic component state text", kind: "string" }, // Flow decompile, confidence: high — DebugComponentState{value}, same wrapper pattern as EasterEgg
  2872: { label: "Trigger to (re)fetch remote configuration from backend", kind: "bool" }, // Flow decompile, confidence: medium — paired with REMOTE_CONFIGURATION_DATA/SETTINGS neighbors
  2875: { label: "Signed unlock command result", kind: 'enum', enumTable: CONNECTMODULE_UNLOCK_COMPONENT_ENUM }, // Flow decompile, confidence: high — UnlockComponentResult + UnlockResultEnumType
  2869: { label: 'Static feature-capability flags', kind: 'submessage', fields: [
    { num: 1, name: 'powerCycleIssueList', kind: 'bool' },
    { num: 2, name: 'componentLockingSupport', kind: 'bool' },
    { num: 3, name: 'issueHealing', kind: 'bool' },
  ] }, // ConnectModuleStaticFeatureProperties — field-number-verified
  // --- AntiLockBrakeSystem (Flow decompile additions) ---
  2318: { label: "Sample/prototype hardware marker", kind: "bool" }, // Flow decompile, confidence: high — standard cross-component boolean flag
  2329: { label: "Factory end-of-line test completion flag", kind: "bool" }, // Flow decompile, confidence: high — complements OVERALL_ASSEMBLY_TEST_RESULT
  2334: { label: "Aggregate pass/fail of all component self-tests", kind: 'enum', enumTable: ANTILOCKBRAKESYSTEM_OVERALL_ASSEMBLY_TEST_RESULT_ENUM }, // Flow decompile, confidence: high — TestResultEnumType
  2342: { label: "Schema version number of this component", kind: 'uint' }, // Flow decompile, confidence: medium — generic plumbing field, no dedicated class
  2346: { label: "Combined wheel-speed-sensor factory test result", kind: 'enum', enumTable: ANTILOCKBRAKESYSTEM_WHEEL_SPEED_SENSOR_ASSEMBLY_TEST_RESULT_ENUM }, // Flow decompile, confidence: high — TestResultEnumType (merged result of front/rear sensor tests)
  2351: { label: "Duration of most recent (hard-)brake event", kind: 'uint' }, // Flow decompile, confidence: medium — no dedicated ABS "BrakeDuration" message class; scale/unit (ms vs s) not recoverable from decompile
  2352: { label: "Distance traveled during/for most recent brake event", kind: 'uint' }, // Flow decompile, confidence: medium — no dedicated "BrakeDistance" class found; scale/unit (m vs cm) not recoverable
  2353: { label: "Boot-manager firmware version string", kind: "string" }, // Flow decompile, confidence: high — SoftwareVersion{value}
  2354: { label: "Hidden/diagnostic string", kind: "string" }, // Flow decompile, confidence: high — EasterEgg{value}
  2355: { label: "Feature-capability flag (release 4)", kind: "bool" }, // Flow decompile, confidence: high — AntiLockBrakeSystemFeaturePropertiesRelease4OrBuilder — single field: centralInformationVisualization
  2360: { label: "Result of component-unlock (anti-theft/service) operation", kind: 'enum', enumTable: ANTILOCKBRAKESYSTEM_UNLOCK_COMPONENT_ENUM }, // Flow decompile, confidence: high — UnlockComponentResult / UnlockResultEnumType
  2357: { label: 'Static feature-capability flags', kind: 'submessage', fields: [
    { num: 1, name: 'powerCycleIssueList', kind: 'bool' },
    { num: 2, name: 'isInertialMeasurementUnitSystem', kind: 'bool' },
    { num: 3, name: 'lastBrakeEventWithBrakeType', kind: 'bool' },
    { num: 4, name: 'onboardDataCollection', kind: 'bool' },
    { num: 5, name: 'dsoApprovalForIssueSnapshotDataCollection', kind: 'bool' },
    { num: 6, name: 'issueHealing', kind: 'bool' },
  ] }, // AntiLockBrakeSystemStaticFeatureProperties — field-number-verified
  2362: { label: 'Configured bike category', kind: 'submessage', fields: [
    { num: 1, name: 'category', kind: 'enum', enumTable: BIKE_CATEGORY_ENUM },
    { num: 2, name: 'checksum', kind: 'uint' },
  ] }, // BikeCategoryConfiguration — field-number-verified against a real capture (category=TREKKING matched this bike's actual eTrekking category)
  // --- HeadUnit (Flow decompile additions) ---
  3098: { label: "Which issue severities the head unit can visualize", kind: "uint32List" }, // Flow decompile, confidence: high — VisualizableIssueTypesOrBuilder, repeated IssueTypeEnum
  3340: { label: "Protocol/data-model version of head unit", kind: "string" }, // Flow decompile, confidence: medium — inferred from sibling SoftwareVersion/ShortVersion shape
  3341: { label: "Boot-manager firmware version string", kind: "string" }, // Flow decompile, confidence: medium — SoftwareVersion{value}; sibling BOOTLOADER_SOFTWARE_VERSION confirmed as plain String
  3342: { label: "Hidden/diagnostic string", kind: "string" }, // Flow decompile, confidence: high — EasterEggOrBuilder
  3351: { label: "Trigger command to reset internal head-unit state", kind: "bool" }, // Flow decompile, confidence: low — naming convention only, no dedicated class
  3352: { label: "Which metric shown in status bar", kind: 'enum', enumTable: HEADUNIT_STATUSBAR_CUSTOMIZATION_ENUM }, // Flow decompile, confidence: high — StatusbarCustomizationEnumMessageOrBuilder
  3355: { label: "Status of phone-as-key-device pairing", kind: 'enum', enumTable: HEADUNIT_KEY_DEVICE_ENUM }, // Flow decompile, confidence: high — KeyDeviceStatusEnumMessageOrBuilder
  3356: { label: "Result of setting this phone as key device", kind: 'enum', enumTable: HEADUNIT_SET_AS_KEY_DEVICE_ENUM }, // Flow decompile, confidence: high — SetAsKeyDeviceResponseEnumMessageOrBuilder
  3359: { label: "Freshness/anti-replay nonce for unlock-token generation", kind: 'uint' }, // Flow decompile, confidence: high — NonceOrBuilder; ties to UnlockResultEnum.FRESHNESS_ERROR
  3361: { label: "Id selecting a view-stripe/category configuration", kind: 'uint' }, // Flow decompile, confidence: medium — CategoryConfigurationIdOrBuilder
  3363: { label: "Tile ids the app wants streamed", kind: "uint32List" }, // Flow decompile, confidence: high — FeatureStreamingTilesOfInterestOrBuilder, repeated int32
  3367: { label: "Request for a category's configuration keyed by id", kind: 'uint' }, // Flow decompile, confidence: medium — inferred from CategoryConfigurationIdOrBuilder
  3369: { label: "Selects which configuration id to display now", kind: 'uint' }, // Flow decompile, confidence: medium — no dedicated class found
  3375: { label: "Currently selected option ids across option groups", kind: "uint32List" }, // Flow decompile, confidence: high — FeatureStreamingOptionStripeOrBuilder, repeated int32
  3465: { label: "Result of a component-unlock attempt", kind: 'enum', enumTable: HEADUNIT_UNLOCK_COMPONENT_ENUM }, // Flow decompile, confidence: high — UnlockComponentResultOrBuilder + UnlockResultEnumType
  // --- RemoteControl (Flow decompile additions) ---
  8209: { label: "Active UI priority", kind: 'uint' }, // Flow decompile, confidence: medium — Priority of the currently-active UI, used for UI arbitration (byte value, scale seen in UiType.priority)
  8210: { label: "Active UI component", kind: 'enum', enumTable: REMOTECONTROL_ACTIVE_UI_COMPONENT_ENUM }, // Flow decompile, confidence: high — Identifies which UI currently owns control
  8247: { label: "CPU load history", kind: "uint32List" }, // Flow decompile, confidence: high — ArrayOf10CpuLoad, recent CPU load samples (10 slots)
  8257: { label: "Available buttons bitmask", kind: 'uint' }, // Flow decompile, confidence: low — likely bitmask of present button keycodes, no dedicated class found
  8263: { label: "UI control command", kind: 'enum', enumTable: REMOTECONTROL_UI_CONTROL_ENUM }, // Flow decompile, confidence: medium — UiControlCommandEnum has 15 values, only a subset confirmed - ordinal order not fully verified
  8264: { label: "Request dynamic UI control", kind: "bool" }, // Flow decompile, confidence: low — requests activation of dynamic UI control mode
  8265: { label: "Dynamic UI control state", kind: 'enum', enumTable: REMOTECONTROL_DYNAMIC_UI_CONTROL_STATE_ENUM }, // Flow decompile, confidence: high — current UI mode state
  8273: { label: "Diagnosis program active", kind: "bool" }, // Flow decompile, confidence: high — matches RemoteControl.diagnosisProgramActive domain field
  8298: { label: "Easter egg string", kind: "string" }, // Flow decompile, confidence: high — hidden developer string
  8305: { label: "Data model version", kind: "string" }, // Flow decompile, confidence: high — Room column dataModelVersion TEXT
  8307: { label: "Sample/prototype hardware marker", kind: "bool" }, // Flow decompile, confidence: low — flags pre-production/sample hardware
  8340: { label: "CAN time-sync enabled", kind: "bool" }, // Flow decompile, confidence: low — whether CAN-bus time sync is enabled
  8353: { label: "UI priority (own)", kind: 'uint' }, // Flow decompile, confidence: medium — this component's own advertised UI priority (byte value, 0-80 scale)
  8357: { label: "Welcome light pattern finished", kind: "bool" }, // Flow decompile, confidence: low — startup light pattern completed
  8358: { label: "Dismiss error pattern (command)", kind: "bool" }, // Flow decompile, confidence: low — clears currently displayed error light pattern
  8359: { label: "Error pattern active", kind: "bool" }, // Flow decompile, confidence: low — error light/signal pattern currently active
  8360: { label: "Critical error pattern active", kind: "bool" }, // Flow decompile, confidence: low — critical-severity error light pattern active
  8361: { label: "Request +/- button control by active UI", kind: "bool" }, // Flow decompile, confidence: medium — requests +/- buttons be handed to active UI
  8362: { label: "+/- button control granted", kind: "bool" }, // Flow decompile, confidence: high — matches RemoteControl.plusMinusButtonControlByActiveUi domain field
  8364: { label: "Visualizable issue severity types", kind: "uint32List" }, // Flow decompile, confidence: high — repeated IssueTypeEnum (IM_INFORMATION,IM_WARNING,IM_ERROR,IM_CRITICAL_ERROR) — a list, not a single enum value; shows as raw ordinals for now
  8368: { label: "Status-bar customization selection", kind: 'enum', enumTable: REMOTECONTROL_STATUSBAR_CUSTOMIZATION_ENUM }, // Flow decompile, confidence: high — selects what ride-screen status bar shows
  8372: { label: "Bike-supported UI languages", kind: "string" }, // Flow decompile, confidence: high — repeated Language{value:string} e.g. "en","de"
  8375: { label: "Tile IDs app wants streamed", kind: "uint32List" }, // Flow decompile, confidence: medium — repeated int32 (TileIdEnumType values)
  8376: { label: "Selected category-configuration id", kind: 'uint' }, // Flow decompile, confidence: high — UByte (0-255)
  8381: { label: "Request to display a category-configuration id", kind: 'uint' }, // Flow decompile, confidence: low — no direct call-site found; inferred
  8382: { label: "Persist current view-stripe configuration", kind: "bool" }, // Flow decompile, confidence: high — bool ack, no payload; confirmed via DisplayConfigurationDatapoints
  8430: { label: "Device mid software-installation flag", kind: "bool" }, // Flow decompile, confidence: low — no dedicated class found; naming implies boolean state flag
  8443: { label: "Kick off installation report for update-set", kind: "uuid" }, // Flow decompile, confidence: high — carries update-set UUID for install report
  8460: { label: "Current display/remote snooze mode", kind: 'enum', enumTable: REMOTECONTROL_SNOOZE_STATE_ENUM }, // Flow decompile, confidence: high — matches RemoteControl.SnoozeState domain enum
  8461: { label: "Exit snooze mode command", kind: "bool" }, // Flow decompile, confidence: low — stateless "wake now" trigger
  8462: { label: "Live heart-rate reading", kind: 'uint', unit: "bpm" }, // Flow decompile, confidence: high — HeartRate domain model: heartRate is raw Integer bpm
  8463: { label: "Heart-rate sensor connection status", kind: 'enum', enumTable: REMOTECONTROL_HEART_RATE_STATUS_ENUM }, // Flow decompile, confidence: high — mirrored by RemoteControl.HeartRateStatus domain enum
  8465: { label: "Reason system/head unit woke up", kind: 'uint' }, // Flow decompile, confidence: medium — SystemWakeUpReasonEnum has 13 gapped/deprecated ordinals, unsafe to auto-generate as enum — needs manual decompile check
  8466: { label: "Eco/range-extend control mode active", kind: "bool" }, // Flow decompile, confidence: high — 2-value enum (OFF/ACTIVE), semantically boolean
  8467: { label: "Command to toggle bike light on/off", kind: "bool" }, // Flow decompile, confidence: low — zero other references in decompiled tree; possibly unused/reflection-dispatched
  8469: { label: "Result of component-unlock attempt", kind: 'enum', enumTable: REMOTECONTROL_UNLOCK_COMPONENT_ENUM }, // Flow decompile, confidence: high — request=signed UnlockTokenContainer, response=UnlockComponentResult enum
  8489: { label: "All active issue IDs", kind: "uint32List" }, // Flow decompile, confidence: high — ListOfIssueIds, code-confirmed ReadableSubscribableDataPoint<ListOfIssueIds>
  8531: { label: "Acknowledge an issue by ID", kind: 'uint' }, // Flow decompile, confidence: high — IssueId{value:uint32} -> Unit, code-confirmed CallableDataPoint<IssueId,Unit>
  8552: { label: "Automatic down-shift recommended", kind: "bool" }, // Flow decompile, confidence: medium — no dedicated message; likely a downshift-hint flag
  8556: { label: "E-shift device available via CAN bus", kind: "bool" }, // Flow decompile, confidence: medium — CAN has only one device so a plain bool suffices
  8559: { label: "Requested e-shift operation mode", kind: 'enum', enumTable: REMOTECONTROL_E_SHIFT_OPERATION_MODE_REQUEST_ENUM }, // Flow decompile, confidence: high — requests gear device switch operation mode
  8560: { label: "Current e-shift operation mode", kind: 'enum', enumTable: REMOTECONTROL_CURRENT_E_SHIFT_OPERATION_MODE_ENUM }, // Flow decompile, confidence: high — reports gear device's current operating mode
  8561: { label: "Fine-adjustment step direction request", kind: 'enum', enumTable: REMOTECONTROL_FINE_ADJUSTMENT_STEP_REQUEST_ENUM }, // Flow decompile, confidence: high — requests a single micro-adjustment step of derailleur
  8562: { label: "Current fine-adjustment step index", kind: 'uint' }, // Flow decompile, confidence: medium — no dedicated wrapper found; step counter paired with FINE_ADJUSTMENT_STEP_REQUEST
  8563: { label: "Current/requested shift mode", kind: 'enum', enumTable: REMOTECONTROL_SHIFT_MODE_ENUM }, // Flow decompile, confidence: high — matches EShift.ShiftMode domain enum 1:1
  8564: { label: "Manual override target gear feedback", kind: 'uint' }, // Flow decompile, confidence: high — reports rider manual override gear during AUTOMATIC shift mode
  8570: { label: "E-shift ready-to-shutdown handshake", kind: "bool" }, // Flow decompile, confidence: medium — gates power-down until gear device confirms safe state
  8603: { label: "Lock/alarm sound enabled setting", kind: "bool" }, // Flow decompile, confidence: high — matches RoomComponent RemoteControl.systemLockIsLockSoundEnabled
  8644: { label: "USB port has power present (VBUS detected)", kind: "bool" }, // Flow decompile, confidence: medium — no dedicated proto class; generic bool pattern
  8648: { label: "Device actively drawing charge current from USB port", kind: "bool" }, // Flow decompile, confidence: medium — same generic-bool pattern as USB_POWER_AVAILABLE
  8652: { label: "Max current the BRC HMI/display port may source/sink", kind: 'uint', unit: "mA" }, // Flow decompile, confidence: low — scale unconfirmed; no dedicated wrapper
  8705: { label: "Paired mobile app (Flow) currently connected", kind: "bool" }, // Flow decompile, confidence: medium — generic bool wrapper pattern
  8742: { label: "Issue severities visualizable on BLE-central peripheral", kind: "uint32List" }, // Flow decompile, confidence: low — repeated IssueTypeEnum, internal issue-visualization plumbing
  8744: { label: "Heart rate from paired BLE strap", kind: 'uint', unit: "bpm" }, // Flow decompile, confidence: medium — mirrors AVERAGE_HEART_RATE plain-scalar convention
  8745: { label: "BLE heart-rate sensor connection status", kind: 'enum', enumTable: REMOTECONTROL_BLE_HEART_RATE_STATUS_ENUM }, // Flow decompile, confidence: high — also persisted as RemoteControl.HeartRateStatus
  8746: { label: "Readiness of paired BLE electronic shifter", kind: "bool" }, // Flow decompile, confidence: medium — corroborated by BLE_SHIFTER peripheral profile
  8769: { label: "Ride/activity session identifier", kind: 'uint' }, // Flow decompile, confidence: low — opaque uint id, no direct consumer found in app code
  8770: { label: "Unix timestamp when current activity started", kind: 'uint', unit: "s" }, // Flow decompile, confidence: low — seconds since epoch, no direct app consumer found
  8771: { label: "Moving time of current ride excluding stops", kind: 'uint', unit: "s" }, // Flow decompile, confidence: high — confirmed as display tile REMOTE_CONTROL_DURATION_WITHOUT_STOPS_OF_ACTIVITY
  8772: { label: "Timezone/UTC offset at activity start", kind: 'uint', unit: "min" }, // Flow decompile, confidence: low — minutes offset from UTC (inferred); sibling TIME_ZONE/LOCAL_TIME_OFFSET use same representation
  8773: { label: "Bike odometer reading at activity start", kind: 'uint', unit: "m" }, // Flow decompile, confidence: low — analogous to DriveUnit ODOMETER bare-uint convention
  8774: { label: "Average speed of ride activity", kind: 'uint', unit: "km/h" }, // Flow decompile, confidence: high — ActivityService.java proto field average_speed
  8776: { label: "Average pedal cadence of ride activity", kind: 'uint', unit: "rpm" }, // Flow decompile, confidence: high — ActivityService.java proto field average_cadence
  8777: { label: "Maximum pedal cadence of ride activity", kind: 'uint', unit: "rpm" }, // Flow decompile, confidence: high — ActivityService.java proto field maximum_cadence
  8778: { label: "Average rider (pedal) power of ride activity", kind: 'uint', unit: "W" }, // Flow decompile, confidence: high — ActivityService.java proto field average_rider_power
  8779: { label: "Maximum rider (pedal) power of ride activity", kind: 'uint', unit: "W" }, // Flow decompile, confidence: high — ActivityService.java proto field maximum_rider_power
  8780: { label: "Average heart rate of ride activity", kind: 'uint', unit: "bpm" }, // Flow decompile, confidence: high — ActivityService.java proto field average_heart_rate
  8781: { label: "Maximum heart rate of ride activity", kind: 'uint', unit: "bpm" }, // Flow decompile, confidence: high — ActivityService.java proto field maximum_heart_rate
  8782: { label: "Rider energy consumed over ride activity", kind: 'uint', unit: "Wh" }, // Flow decompile, confidence: high — ActivityService.java proto field energy_consumed
  8783: { label: "Reset/clear current activity/ride session", kind: "bool" }, // Flow decompile, confidence: medium — void-RPC pattern; distinguished from enum-based AUTOMATIC_ACTIVITY_RESET
  8784: { label: "Automatic activity-reset trigger condition", kind: 'enum', enumTable: REMOTECONTROL_AUTOMATIC_ACTIVITY_RESET_ENUM }, // Flow decompile, confidence: high — condition under which app-tracked ride auto-ends
  8785: { label: "Calories consumed during activity", kind: 'uint', unit: "kcal" }, // Flow decompile, confidence: high — CaloriesConsumedSampleProvider.java wraps Flow<UShort>
  8786: { label: "Per-assist-mode total usage duration", kind: "uint32List" }, // Flow decompile, confidence: medium — seconds per mode, array; BikeDataSupplier.getAssistModeUsage()
  8787: { label: "Per-assist-mode usage duration while motor actively assisting", kind: "uint32List" }, // Flow decompile, confidence: medium — motor-active subset of usage time
  8788: { label: "Rider's share of total propulsion energy", kind: 'uint', unit: "%" }, // Flow decompile, confidence: high — RiderEnergyShareSampleProvider.java wraps Flow<UByte>
  8832: { label: "Debug command to trigger display screenshot", kind: "bool" }, // Flow decompile, confidence: low — no class/usage found outside enum declaration
  8842: { label: "Generic free-text string to show on bike display", kind: "string" }, // Flow decompile, confidence: low — no dedicated class found; likely plain string wrapper
  8843: { label: "Reset/clear display tile values", kind: "bool" }, // Flow decompile, confidence: low — internal UI plumbing trigger
  8965: { label: "Third-party device (accessory/trailer motor) drawing full power", kind: "bool" }, // Flow decompile, confidence: medium — no class/usage found outside enum; name implies boolean status flag
  8980: { label: "Duration of most recent brake event", kind: 'uint', unit: "ms" }, // Flow decompile, confidence: medium — displayed as ABS brake-duration tile; generic scalar wrapper
  8981: { label: "Distance traveled during most recent brake event", kind: 'uint' }, // Flow decompile, confidence: medium — meters/cm unconfirmed; displayed as ABS brake-distance tile
  8983: { label: "Icon IDs for currently available ABS modes", kind: "uint32List" }, // Flow decompile, confidence: high — ArrayOf5AbsModeIconsOrBuilder + AbsModeIconEnumType
  8984: { label: "ABS modes currently available/selectable", kind: "uint32List" }, // Flow decompile, confidence: medium — AbsModeEnumType; array-wrapper mirrors icon list
  8985: { label: "Currently active ABS mode", kind: 'uint' }, // Flow decompile, confidence: high — AbsModeEnumMessage / AbsModeEnumType; ordinal-to-mode mapping (ABS_MODE1..5) not individually confirmed, kept as raw uint rather than guessed enum
  8993: { label: "Signal/running lamp legally/functionally required", kind: "bool" }, // Flow decompile, confidence: medium — no class/usage found outside enum; paired with SIGNAL_LAMP_CONTROL
  8610: { label: 'Automatic bike-light configuration', kind: 'submessage', fields: [
    { num: 1, name: 'enabled', kind: 'bool' },
    { num: 2, name: 'illuminanceOn', kind: 'uint' },
    { num: 3, name: 'illuminanceOff', kind: 'uint' },
    { num: 4, name: 'timeOff', kind: 'uint' },
  ] }, // AutomaticBikeLightConfiguration — field-number-verified
  8651: { label: 'Power-management status', kind: 'submessage', fields: [
    { num: 1, name: 'maximumCurrent', label: 'maximumCurrent (mA)', kind: 'uint' },
    { num: 2, name: 'powerProfile', kind: 'uint' },
  ] }, // PowerManagementInformation — field-number-verified
  8789: { label: 'Aggregate brake-event counters', kind: 'submessage', fields: [
    { num: 1, name: 'amountOfNormalBrakeEvents', kind: 'uint' },
    { num: 2, name: 'amountOfAbsInterventionEvents', kind: 'uint' },
  ] }, // BrakeEvents — field-number-verified
  8982: { label: 'ABS runtime capability flags', kind: 'submessage', fields: [
    { num: 1, name: 'absModes', kind: 'bool' },
    { num: 2, name: 'brakeStatistics', kind: 'bool' },
  ] }, // XAbsDynamicFeatureProperties — field-number-verified
  // --- MobileApp (Flow decompile additions) ---
  16513: { label: "UI priority level", kind: 'uint' }, // Flow decompile, confidence: high — raw priority index, no scaling; PayloadKt.java maps to Uint8Message
  16517: { label: "Current altitude", kind: 'uint', unit: "m" }, // Flow decompile, confidence: high — Int16NullableMessage, no scale factor
  16518: { label: "Maximum altitude reached", kind: 'uint', unit: "m" }, // Flow decompile, confidence: high — Int16NullableMessage, same wrapper as ALTITUDE
  16519: { label: "Cumulative ascent", kind: 'uint', unit: "m" }, // Flow decompile, confidence: high — Uint16Message, no scaling
  16520: { label: "Cumulative descent", kind: 'uint', unit: "m" }, // Flow decompile, confidence: high — Uint16Message, same wrapper as ASCENT
  16521: { label: "Phone/system state of charge", kind: 'uint', unit: "%" }, // Flow decompile, confidence: high — Uint8Message, no scaling
  16522: { label: "Road slope", kind: 'uint', unit: "%" }, // Flow decompile, confidence: high — Int8Message, signed; corroborated by DefaultGetRoadSlopePercentage.java
  16523: { label: "Current country (ISO code)", kind: "string" }, // Flow decompile, confidence: high — Country.java, string field, e.g. "DE"
  16529: { label: "Mobile app software version", kind: "string" }, // Flow decompile, confidence: high — SoftwareVersion.java, string field
  16530: { label: "Message-bus data model version", kind: "string" }, // Flow decompile, confidence: medium — inferred by analogy to sibling version wrapper
  16531: { label: "Message-bus business logic version", kind: "string" }, // Flow decompile, confidence: medium — inferred by naming/positional analogy in same proto family
  16532: { label: "Heart rate", kind: 'uint', unit: "bpm" }, // Flow decompile, confidence: medium — generic Uint8Message wrapper; HeartRateSampleProvider.java models as plain Int
  16533: { label: "Heart-rate sensor connection status", kind: 'enum', enumTable: MOBILEAPP_HEART_RATE_STATUS_ENUM }, // Flow decompile, confidence: high — HeartRateStatusEnumMessage
  16534: { label: "Current navigation/guidance state", kind: 'enum', enumTable: MOBILEAPP_NAVIGATION_CURRENT_STATUS_ENUM }, // Flow decompile, confidence: high — MobileAppNavigationStatusEnumMessage
  16535: { label: "Remaining distance to destination", kind: 'uint', unit: "m" }, // Flow decompile, confidence: low — exact wrapper width unconfirmed; RideInfoService.java feeds distanceRemaining in meters
  16536: { label: "Estimated arrival time", kind: 'uint' }, // Flow decompile, confidence: high — epoch-based Timestamp int64, unit unconfirmed
  16537: { label: "Time remaining until destination", kind: 'uint', unit: "s" }, // Flow decompile, confidence: high — MobileAppDuration int32, confirmed seconds via getInWholeSeconds
  16538: { label: "Number of altitude-graph samples available/planned", kind: 'uint' }, // Flow decompile, confidence: high — AltitudeGraphNumberOfAvailableSamples, single int32
  16541: { label: "Issue types the mobile app can visualize", kind: "uint32List" }, // Flow decompile, confidence: high — repeated IssueTypeEnum (IM_INFORMATION,IM_WARNING,IM_ERROR,IM_CRITICAL_ERROR) — a list, not a single enum value
  16546: { label: "Predicted battery state-of-charge % at destination", kind: 'uint', unit: "%" }, // Flow decompile, confidence: high — Uint8NullableMessage; SendArrivalChargeToBhu.java feeds getBatteryPercentage()
  16547: { label: "Whether the phone is currently charging", kind: "bool" }, // Flow decompile, confidence: high — PhoneCharging provider returns MobileDevice.Battery.isCharging()
  16553: { label: "Bike/system initialization stage reported by mobile app", kind: 'uint' }, // Flow decompile, confidence: medium — StartupStageEnumType has 12 values (UNINITIALIZED, STAGE1-10, UNRECOGNIZED) but full ordinal list wasn't individually confirmed — kept as raw uint rather than guessed enum
  16555: { label: "Flag indicating a CCF (bike computer) reboot is required", kind: "bool" }, // Flow decompile, confidence: high — CcfRebootRequestedOrBuilder.getCcfRebootRequiredFlag()
  // --- CanTestNode (Flow decompile additions) ---
  10257: { label: "Battery 1 (primary) component present", kind: "bool" }, // Flow decompile, confidence: medium — inferred bool by analogy with confirmed sibling addresses
  10258: { label: "Drive unit (motor) present", kind: "bool" }, // Flow decompile, confidence: high — DriveUnitReader.java: remoteControl.getDriveUnitAvailable()
  10259: { label: "Remote control / display unit present", kind: "bool" }, // Flow decompile, confidence: medium — inferred bool by naming/family analogy
  10260: { label: "Battery 2 (secondary/dual-battery) present", kind: "bool" }, // Flow decompile, confidence: high — Battery2Reader.java: remoteControl.getBattery2Available()
  // --- BoschDiagnoseApp (Flow decompile additions) ---
  3649: { label: "List of available software-update-manifest resource IDs", kind: "uint32List" }, // Flow decompile, confidence: high — SoftwareUpdateManifests, single repeated uint32 value field
  3650: { label: "List of available software-update resource IDs", kind: "uint32List" }, // Flow decompile, confidence: high — SoftwareUpdates, identical structure
  3651: { label: "List of configuration-container resource IDs", kind: "uint32List" }, // Flow decompile, confidence: high — ConfigurationContainers, repeated uint32 value
  // --- DriveUnit ---
  6145: { label: 'Serial Number', kind: 'string' },
  6146: { label: 'Part Number', kind: 'string' },
  6147: { label: 'Product Code', kind: 'string' },
  6148: { label: 'Hardware Version', kind: 'string' }, // ShortVersion, same wrapper as 6149/6151
  6149: { label: 'HW/SW Version', kind: 'string' },
  6150: { label: 'SW Version', kind: 'string' },
  6151: { label: 'FBL Version', kind: 'string' }, // "FBL" = Bosch's own term for the bootloader
  6163: { label: 'Maximum Legal Bike Speed', kind: 'normFactor', factor: 100, unit: 'km/h' },
  6166: { label: 'Maximum Gear Ratio', kind: 'normFactor', factor: 100 },
  6167: { label: 'Maximum Assistance Speed', kind: 'normFactor', factor: 100, unit: 'km/h' },
  // NOT a plain enum, despite the name suggesting it's just the OEM default position — confirmed
  // via decompile of the real Bosch DiagnosticTool 3 UI (AssistModesTilesModel/ViewModel,
  // eds-bdp-ui-assistmode-17.9.3.jar): StartAssistModeConfigurationOem is a 2-field protobuf message,
  // field 1 = startAssistModePosition (enum, the OEM default — what we already decoded), field 2 =
  // startAssistModePositionConfigurable (bool, proto3-omitted when false). The official UI reads
  // ONLY field 2 to decide whether to let the user change START_ASSIST_MODE_CONFIGURATION (6180) at
  // all — shows a "locked by manufacturer" tooltip and treats the control as non-configurable when
  // false. Our own write path never checked this flag before — a real hardware test showed a write
  // to 6180 get a genuine WRITE_RESPONSE/SUCCESS ack that didn't durably stick, and this gate is the
  // leading candidate explanation (firmware silently no-ops the write when field2 is false here).
  6179: { label: 'Start Assist Mode (OEM default)', kind: 'startAssistModeOem', enumTable: START_ASSIST_MODE_POSITION_ENUM },
  6180: { label: 'Start Assist Mode', kind: 'enum', enumTable: START_ASSIST_MODE_POSITION_ENUM }, // writable — MessageBus.DriveUnit.getStartAssistModeConfiguration() is ReadableWritableSubscribableDataPoint, no dealer/HSM gate found
  6183: { label: 'Product Line', kind: 'string' },
  6184: { label: 'Rear Wheel Circumference (OEM)', kind: 'normFactor', factor: 10, unit: 'mm' }, // SafeUint16NormFactor10 — has a field-2 checksum we ignore
  6185: { label: 'Rear Wheel Circumference (User)', kind: 'normFactor', factor: 10, unit: 'mm' }, // MessageBus.DriveUnit.Companion.normalizeRearWheelCircumferenceUser (Flow source)
  6186: { label: 'OEM Brand Identifier', kind: 'string' },
  6187: { label: 'Gearing System', kind: 'string' },
  6188: { label: 'eBike ID', kind: 'uuid' },
  6190: { label: 'Product Name', kind: 'string' },
  6172: { label: 'Bike Light', kind: 'bool' }, // BikeStateWritable<Boolean> per addresses.js
  6176: { label: 'Bike Light Available', kind: 'bool' },
  6196: { label: 'Component Locked', kind: 'bool' },
  6198: { label: 'Sample Software', kind: 'bool' },
  6210: { label: 'Maximum Assistance Speed (IBD)', kind: 'normFactor', factor: 100, unit: 'km/h' },
  6212: { label: 'In Software Installation State', kind: 'bool' },
  6214: { label: 'UDAM Modification Possible', kind: 'bool' },
  6216: { label: 'Connect Module Ready', kind: 'bool' },
  6217: { label: 'Range Extender Ready', kind: 'bool' },
  6220: { label: 'Production Plant Code', kind: 'string' },
  6225: { label: 'Tuning Detection', kind: 'tuningDetection' },
  6228: { label: 'Front ABS Assembled', kind: 'bool' },
  6229: { label: 'Bike Category', kind: 'enum', enumTable: BIKE_CATEGORY_ENUM },
  // Not decompile-confirmed (this address was never wired up before — the histogram used a
  // fixed design palette instead, see web/app.js). Inferred from the raw bytes themselves: a
  // real capture's 20-byte payload splits cleanly into 5x 4-byte entries (one per assist mode
  // slot, same order as ACTIVE_ASSIST_MODES, index 0 = off/walk) with no protobuf tag/length
  // wrapper at all (confirmed by the fact this payload used to fall through to the generic
  // raw-hex fallback rather than matching the 0x0a tag check). Read as packed ARGB bytes
  // (alpha first, matching Android's int-color convention) the AUTO-position entry decodes to
  // alpha 0x8f, RGB(178, 9, 255) — a vivid purple — which matches what the rider's own Flow
  // app/head unit actually shows for AUTO, confirming both the entry alignment and byte order.
  6158: { label: 'Assist Mode Colors', kind: 'assistModeColors' },
  // Confirmed via Flow's own decompile (DriveUnitAddresses.REACHABLE_RANGE, addr 6231) — a real,
  // live, bike-computed per-assist-mode range estimate (ReachableRangeType: repeated uint32, one
  // value per mode, in km, same slot order as ACTIVE_ASSIST_MODES) — this is the actual source
  // behind Flow's "Schatting van actieradius" (range estimate) screen, not a client-side formula.
  6231: { label: 'Reachable Range (per mode, km)', kind: 'uint32List' },
  6238: { label: 'OEM Bike ID', kind: 'string' },
  6239: { label: 'OEM Manufacturing Location', kind: 'string' },
  6240: { label: 'OEM Manufacturing Line', kind: 'string' },
  6242: { label: 'OEM Free Text Field', kind: 'string' },
  6252: { label: 'OEM Brand Name', kind: 'string' },
  6261: { label: 'OEM Bike Model ID', kind: 'string' },
  6263: { label: 'Maximum Available Motor Torque', kind: 'normFactor', factor: 10, unit: 'Nm' }, // MessageBus.DriveUnit.Companion.normalizeMotorTorque (Flow source)
  6269: { label: 'Regional Speed Configuration ("Speed ID")', kind: 'enum', enumTable: REGIO_SPEED_CONFIGURATION_ENUM },
  6276: { label: 'Present PCB Temperature', kind: 'normFactor', factor: 10, unit: '°C', signed: true }, // Int16NormFactor10Message — zigzag varint (writeSInt32)
  6302: { label: 'Motor Product Code', kind: 'string' },
  6168: { label: 'Odometer', kind: 'uint', unit: 'm' }, // inferred — bare UInt, see file header
  6169: { label: 'Power-On Time', kind: 'uint', unit: 's' }, // inferred — bare UShort
  6253: { label: 'Power-On Time (Motor Support)', kind: 'uint', unit: 's' }, // was previously address-only, falling through to the generic (wrong) little-endian-byte-concat heuristic instead of this project's real protobuf varint parser — this is the "running hours" figure Flow's own UI shows
  // Read-only (ReadableSubscribableDataPoint<Boolean>, no write method anywhere) — this is the
  // trigger flag behind the "distracted riding" disclaimer flow, see the private research notes
  // for the full trigger/display-mechanism writeup. Baked into the signed region config; not
  // independently settable from the client side.
  6161: { label: 'Distracted Riding Alert', kind: 'bool' },

  // --- Battery (slot 1) ---
  129: { label: 'Serial Number', kind: 'string' },
  130: { label: 'Part Number', kind: 'string' },
  131: { label: 'Product Code', kind: 'string' },
  132: { label: 'Hardware Version', kind: 'string' },
  134: { label: 'SW Version', kind: 'string' },
  135: { label: 'FBL Version', kind: 'string' },
  136: { label: 'State of Charge', kind: 'uint', unit: '%' }, // inferred — bare UByte
  139: { label: 'Present Pack Temperature', kind: 'normFactor', factor: 10, unit: '°C', signed: true }, // Bosch's own wrapper calls the identical address "presentCellTemperature" — same data point, our own address-table name predates that discovery
  140: { label: 'Present Cell Voltage', kind: 'uint', unit: 'mV' }, // inferred — bare UShort, confirmed via decompile (BatteryMessageBusWrapper.getPresentCellVoltage())
  145: { label: 'Remaining Energy (Rider)', kind: 'normFactor', factor: 10, unit: 'Wh' },
  146: { label: 'Remaining Energy', kind: 'normFactor', factor: 10, unit: 'Wh' },
  150: { label: 'Full Charge Cycles', kind: 'normFactor', factor: 10 },
  153: { label: 'Deactivation Proof', kind: 'deactivationProof' }, // DeactivationProof: field1=deactivationState (bool), field2=certificateSerialNumber (nested submessage), field3=signature (bytes) — confirmed via decompile
  154: { label: 'Deactivation Enabled', kind: 'bool' }, // confirmed via decompile — ReadableDataPoint<Boolean>
  155: { label: 'Product Name', kind: 'string' },
  157: { label: 'Duration in Thermal Protection', kind: 'uint', unit: 's' }, // inferred — bare UInt, confirmed via decompile (BatteryMessageBusWrapper.getDurationInThermalProtection())
  158: { label: 'Last End-of-Charge Voltage', kind: 'normFactor', factor: 10, unit: 'V' }, // Uint16NormFactor10Message, confirmed via decompile
  159: { label: 'Maximum Charging Current', kind: 'normFactor', factor: 10, unit: 'A', signed: true }, // Int16NormFactor10Message, confirmed via decompile
  160: { label: 'Maximum Pack Temperature', kind: 'normFactor', factor: 10, unit: '°C', signed: true }, // Int16NormFactor10Message, confirmed via decompile
  161: { label: 'Minimum Pack Temperature', kind: 'normFactor', factor: 10, unit: '°C', signed: true }, // Int16NormFactor10Message, confirmed via decompile
  162: { label: 'SoC Lower Limit', kind: 'uint', unit: '%' }, // inferred — bare UByte, writable (see addresses.js)
  163: { label: 'SoC Upper Limit', kind: 'uint', unit: '%' }, // inferred — bare UByte, writable (see addresses.js)
  210: { label: 'Present FET Temperature', kind: 'normFactor', factor: 10, unit: '°C', signed: true }, // Int16NormFactor10Message, confirmed via decompile
  215: { label: 'Delivered Ah (Lifetime)', kind: 'uint', unit: 'Ah' }, // bare UInt; unit corrected from an earlier "mAh" guess — a real capture showed 1024 (raw) alongside DELIVERED_WH_OVER_LIFETIME=36884 Wh, and 36884/1024 = 36.02 V, matching a typical Bosch PowerTube pack's nominal voltage — confirms the raw value is whole Ah, not milliamp-hours
  220: { label: 'Self-Discharging Rate', kind: 'normFactor', factor: 10 }, // Uint8NullableNormFactor10Message, confirmed via decompile — "Nullable" just means protobuf presence-tracking, decodes the same as any other NormFactor10 on the wire
  224: { label: 'Device Certificate', kind: 'certificateBytes' }, // Certificate: field1 = raw bytes (ByteString), confirmed via decompile — likely an X.509 or Bosch CVC-format cert, not parsed further (see decode comment)
  156: { label: 'Delivered Wh (Lifetime)', kind: 'uint', unit: 'Wh' }, // inferred — bare UInt
  216: { label: 'State of Health', kind: 'uint', unit: '%' }, // inferred — bare UByte

  // --- RemoteControl (BRC) — all confirmed via decompile of RemoteControlMessageBusWrapper.
  // LANGUAGE/UNITS/TIME/TIME_FORMAT/LED_COLORS/SERVICE_DUE are all declared writable
  // (ReadableWritable[Subscribable]DataPoint) — same trust tier as START_ASSIST_MODE_CONFIGURATION,
  // but none of these write paths have been traced/tested the way that one has (see private
  // research notes) — decoded here as read-only for now, no write UI added.
  8226: { label: 'Time', kind: 'unixTimestamp' },
  8354: { label: 'LED Colors', kind: 'uint32List' },
  8577: { label: 'Language', kind: 'string' },
  8578: { label: 'Units', kind: 'enum', enumTable: UNIT_ENUM },
  8579: { label: 'Time Format', kind: 'enum', enumTable: TIME_FORMAT_ENUM },
  8581: { label: 'Service Due', kind: 'serviceDue' },
};

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
      // Raw byte array, not protobuf tag-wrapped — parse the payload param directly, not
      // the generic `fields`/`f1` this switch normally works from (see FIELD_TYPES comment).
      const colors = [];
      for (let i = 0; i + 4 <= payload.length; i += 4) {
        const a = payload[i], r = payload[i + 1], g = payload[i + 2], b = payload[i + 3];
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

const messageTypesExports = { FIELD_TYPES, decodeTyped, REGIO_SPEED_CONFIGURATION_ENUM, BIKE_CATEGORY_ENUM };
if (typeof module !== 'undefined' && module.exports) {
  module.exports = messageTypesExports;
} else if (typeof window !== 'undefined') {
  window.Bes3MessageTypes = messageTypesExports;
}
})();
