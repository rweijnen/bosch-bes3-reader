// Full per-component address table, extracted from Bosch DiagnosticTool 3
// (com.bosch.ebike.messagebus.MessageBus + .constants.*Addresses). Pure data,
// no dependencies — reusable from Node or browser (WebUSB) code alike.
// `readable`: true = plain read (no argument) works with the generic sweep;
// false = a callable RPC needing an argument (not attempted by the sweep);
// null = could not confirm the field type during extraction.

const ALL_ADDRESSES = {
  AntiLockBrakeSystem: [
    { name: 'IS_SAMPLE_HARDWARE', addr: 2318, readable: true },
    { name: 'IS_END_OF_LINE_TESTED', addr: 2329, readable: true },
    { name: 'ISSUE_VISUALIZATION_EVENT', addr: 2333, readable: true }, // Flow decompile, confidence: high — IssueVisualizationEventOrBuilder | fields: IssueId,IssueTypeEnum(IM_INFORMATION,IM_WARNING,IM_ERROR,IM_CRITICAL_ERROR),description,countermeasure
    { name: 'OVERALL_ASSEMBLY_TEST_RESULT', addr: 2334, readable: true },
    { name: 'ISSUE_EVENT', addr: 2335, readable: true }, // Flow decompile, confidence: high — IssueEventOrBuilder | fields: IssueId,IssueSnapshot,Timestamp
    { name: 'EXECUTE_INFORMATION_MANAGER_COMMAND_RIDER', addr: 2336, readable: true }, // Flow decompile, confidence: high — ExecuteInformationManagerCommandParameters | fields: command,IssueId,entryNumber
    { name: 'FRONT_WHEEL_SPEED', addr: 2341, readable: true }, // Flow decompile, confidence: medium — WheelSpeedWithValidity; no live call-site found, exact scale/unit not confirmed | fields: value:uint32, validity:bool
    { name: 'DATA_MODEL_VERSION', addr: 2342, readable: true },
    { name: 'REAR_WHEEL_SPEED', addr: 2343, readable: true }, // Flow decompile, confidence: medium — WheelSpeedWithValidity; same caveat as FRONT_WHEEL_SPEED | fields: value:uint32, validity:bool
    { name: 'WHEEL_SPEED_SENSOR_ASSEMBLY_TEST_RESULT', addr: 2346, readable: true },
    { name: 'BRAKE_DURATION_OF_LAST_BRAKE_EVENT', addr: 2351, readable: true },
    { name: 'BRAKE_DISTANCE_OF_LAST_BRAKE_EVENT', addr: 2352, readable: true },
    { name: 'BOOTMANAGER_SOFTWARE_VERSION', addr: 2353, readable: true },
    { name: 'EASTER_EGG', addr: 2354, readable: true },
    { name: 'ANTI_LOCK_BRAKE_SYSTEM_FEATURE_PROPERTIES_RELEASE4', addr: 2355, readable: true },
    { name: 'ALL_ISSUE_VISUALIZATION_EVENTS', addr: 2356, readable: true }, // Flow decompile, confidence: medium — no distinctly named wrapper class found | fields: repeated IssueVisualizationEvent (inferred)
    { name: 'ANTI_LOCK_BRAKE_SYSTEM_STATIC_FEATURE_PROPERTIES', addr: 2357, readable: true }, // Flow decompile, confidence: high — AntiLockBrakeSystemStaticFeaturePropertiesOrBuilder | fields: dsoApprovalForIssueSnapshotDataCollection, isInertialMeasurementUnitSystem, issueHealing, lastBrakeEventWithBrakeType, onboardDataCollection, powerCycleIssueList (all bool)
    { name: 'ANTI_LOCK_BRAKE_SYSTEM_EVENT', addr: 2358, readable: true }, // Flow decompile, confidence: high — AntiLockBrakeSystemEvent; abbreviated enum names not fully expanded in source | fields: type:AntiLockBrakeSystemTypeEnum(NO_EVENT,NORMAL_BRAKE,...,gapped ordinals), timestamp
    { name: 'UNLOCK_COMPONENT', addr: 2360, readable: true },
    { name: 'REPORT_ISSUE', addr: 2361, readable: true }, // Flow decompile, confidence: high — ReportIssueParametersOrBuilder | fields: IssueId,IssueSnapshot,Timestamp
    { name: 'BIKE_CATEGORY_CONFIGURATION', addr: 2362, readable: true }, // Flow decompile, confidence: high — BikeCategoryConfiguration/BikeCategoryEnumType | fields: category:BikeCategoryEnum(NOT_CONFIGURED,CITY,TREKKING,MTB_TOUR,MTB_TRAIL,ROAD,GRAVEL,KIDS,CARGO,FLEET,OTHERS,E_CARGO_LONG_TAIL,COMPACT), checksum:uint32
    { name: 'ABS_CALIBRATION_TYPE', addr: 2328, readable: true },
    { name: 'ABS_MODE', addr: 2313, readable: true },
    { name: 'ABS_RELEASED_AFTER_ASSEMBLY', addr: 2325, readable: true },
    { name: 'ANTI_LOCK_BRAKE_SYSTEM_FEATURE_PROPERTIES_RELEASE3', addr: 2323, readable: true },
    { name: 'AVAILABLE_ABS_MODES', addr: 2314, readable: true },
    { name: 'BOOTLOADER_SOFTWARE_VERSION', addr: 2311, readable: true },
    { name: 'BRAKE_HOSE_LENGTH_FROM_FRONT_ANTI_LOCK_BRAKE_SYSTEM_TO_WHEEL_CALIPER', addr: 2349, readable: true },
    { name: 'BRAKE_HOSE_LENGTH_FROM_MASTER_CYLINDER_TO_FRONT_ANTI_LOCK_BRAKE_SYSTEM', addr: 2348, readable: true },
    { name: 'COMPONENT_LOCKED', addr: 2321, readable: true },
    { name: 'COMPONENT_LOCK_CONFIGURATION', addr: 2322, readable: true },
    { name: 'EXECUTE_INFORMATION_MANAGER_COMMAND_BOSCH', addr: 2340, readable: false },
    { name: 'EXECUTE_INFORMATION_MANAGER_COMMAND_IBD', addr: 2337, readable: false },
    { name: 'EXECUTE_INFORMATION_MANAGER_COMMAND_OEM', addr: 2338, readable: false },
    { name: 'EXECUTE_INFORMATION_MANAGER_COMMAND_SP', addr: 2339, readable: false },
    { name: 'FRONT_BRAKE_DISC_SIZE', addr: 2332, readable: true },
    { name: 'FRONT_BRAKE_FOUNDATION', addr: 2331, readable: true },
    { name: 'FRONT_WHEEL_CIRCUMFERENCE', addr: 2330, readable: true },
    { name: 'FRONT_WHEEL_SPEED_SENSOR_ASSEMBLY_TEST_RESULT', addr: 2327, readable: true },
    { name: 'HARDWARE_SOFTWARE_VERSION', addr: 2309, readable: true },
    { name: 'HARDWARE_VERSION', addr: 2308, readable: true },
    { name: 'IN_SOFTWARE_INSTALLATION_STATE', addr: 2315, readable: true },
    { name: 'IS_SAMPLE_SOFTWARE', addr: 2317, readable: true },
    { name: 'IS_TWO_CHANNEL_SYSTEM', addr: 2316, readable: true },
    { name: 'MANUFACTURING_DATE', addr: 2320, readable: true },
    { name: 'NUMBER_OF_SOFTWARE_UPDATES', addr: 2324, readable: true },
    { name: 'PART_NUMBER', addr: 2306, readable: true },
    { name: 'PRODUCT_CODE', addr: 2307, readable: true },
    { name: 'PRODUCT_NAME', addr: 2319, readable: true },
    { name: 'REAR_WHEEL_SPEED_SENSOR_ASSEMBLY_TEST_RESULT', addr: 2326, readable: true },
    { name: 'RESET_WHEEL_SPEED_SENSOR_ASSEMBLY_TEST_RESULT', addr: 2347, readable: false },
    { name: 'SERIAL_NUMBER', addr: 2305, readable: true },
    { name: 'SIGNAL_LAMP_CONTROL', addr: 2312, readable: true },
    { name: 'SOFTWARE_VERSION', addr: 2310, readable: true },
    { name: 'TRIGGER_FRONT_WHEEL_SPEED_SENSOR_ASSEMBLY_TEST', addr: 2344, readable: false },
    { name: 'TRIGGER_REAR_WHEEL_SPEED_SENSOR_ASSEMBLY_TEST', addr: 2345, readable: false },
    { name: 'USE_INERTIAL_MEASUREMENT_UNIT', addr: 2359, readable: true },
  ],
  Battery: [
    { name: 'REQUEST_SHUTDOWN', addr: 141, readable: true }, // Flow decompile, confidence: high — two-field protobuf command message | fields: shutdownType:ShutdownTypeEnum[SHUTDOWN,RESTART], shutdownReason:ShutdownReasonEnum(25 values incl. BATTERY_EMPTY,BATTERY_REMOVAL,BATTERY_POWER_BUTTON)
    { name: 'PREPARE_SHUTDOWN', addr: 142, readable: true },
    { name: 'NO_SHUTDOWN', addr: 143, readable: true },
    { name: 'WAKEUP_REASON', addr: 144, readable: true }, // Flow decompile, confidence: low — SystemWakeUpReasonEnumType has gapped/deprecated ordinals (2,3,4,5,7,8,10,12 deprecated) that couldn't be confirmed precisely enough to safely auto-generate an enum table — needs manual decompile check before adding as enum | fields: -
    { name: 'MAXIMUM_ALLOWED_DISCHARGE_CURRENT', addr: 147, readable: true },
    { name: 'PRESENT_DISCHARGE_CURRENT', addr: 148, readable: true },
    { name: 'REMAINING_CHARGING_TIME', addr: 149, readable: true },
    { name: 'MAXIMUM_ALLOWED_REVERSE_CURRENT', addr: 167, readable: true },
    { name: 'EXECUTE_INFORMATION_MANAGER_COMMAND_RIDER', addr: 168, readable: true }, // Flow decompile, confidence: high — matches DriveUnit/HeadUnit sibling addresses | fields: command:enum, issueId:IssueId, entryNumber:int
    { name: 'REPORT_ISSUE', addr: 173, readable: true }, // Flow decompile, confidence: medium — class only OrBuilder read, fields not fully confirmed | fields: ReportIssueParameters (issue id/type payload)
    { name: 'ISSUE_EVENT', addr: 174, readable: true }, // Flow decompile, confidence: low — only OrBuilder interface found, concrete class not isolated | fields: issueId:IssueId, type, state
    { name: 'ISSUE_VISUALIZATION_EVENT', addr: 175, readable: true }, // Flow decompile, confidence: high — confirmed field numbers 1,3,4,5 | fields: issueId:IssueId, issueType:enum, description:enum, countermeasure:enum
    { name: 'NUMBER_OF_FULL_CHARGE_CYCLES_ON_BIKE', addr: 176, readable: true },
    { name: 'NUMBER_OF_FULL_CHARGE_CYCLES_OFF_BIKE', addr: 177, readable: true },
    { name: 'TOTAL_ENERGY', addr: 180, readable: true },
    { name: 'LIGHT_RESERVE_STATE', addr: 182, readable: true },
    { name: 'TIME_IN_BALANCING', addr: 183, readable: true },
    { name: 'SYSTEM_STATE_OF_CHARGE_FOR_RIDER', addr: 188, readable: true },
    { name: 'DATA_MODEL_VERSION', addr: 189, readable: true },
    { name: 'REQUEST_SERVICE_CHARGE', addr: 192, readable: true },
    { name: 'DISCHARGE_DURATION', addr: 193, readable: true },
    { name: 'FEATURE_PROPERTIES_RELEASE4', addr: 194, readable: true }, // Flow decompile, confidence: high — 3 bool fields confirmed | fields: centralInformationVisualization:bool, preventShutdown:bool, serviceCharge:bool
    { name: 'PREVENT_SHUTDOWN', addr: 195, readable: true },
    { name: 'INSTANCE_CHARGING_ACTIVE', addr: 196, readable: true },
    { name: 'INSTANCE_REMAINING_ENERGY_FOR_RIDER', addr: 197, readable: true },
    { name: 'INSTANCE_MAXIMUM_ALLOWED_DISCHARGE_CURRENT', addr: 198, readable: true },
    { name: 'INSTANCE_MAXIMUM_ALLOWED_REVERSE_CURRENT', addr: 199, readable: true },
    { name: 'INSTANCE_PRESENT_DISCHARGE_CURRENT', addr: 200, readable: true },
    { name: 'INSTANCE_LIGHT_RESERVE_STATE', addr: 201, readable: true },
    { name: 'INSTANCE_STATE_OF_CHARGE_FOR_RIDER', addr: 202, readable: true },
    { name: 'INSTANCE_MAXIMUM_ALLOWED_CHARGE_CURRENT', addr: 203, readable: true },
    { name: 'ALL_ISSUE_VISUALIZATION_EVENTS', addr: 204, readable: true }, // Flow decompile, confidence: medium — plural/"ALL" naming implies repeated field of addr 175's type | fields: repeated IssueVisualizationEvent
    { name: 'BATTERY_STATIC_FEATURE_PROPERTIES', addr: 205, readable: true }, // Flow decompile, confidence: high — 14 boolean capability fields confirmed | fields: 14 boolean capability fields (systemDerating, energyReserveV3, improvedSocCalculation, chargingModeConfigurable, oemComponentLockingSupport, etc.)
    { name: 'EASTER_EGG', addr: 206, readable: true },
    { name: 'DUAL_BATTERY_MODE', addr: 208, readable: true },
    { name: 'SHUTDOWN_STATE', addr: 209, readable: true },
    { name: 'GET_TIME_UNTIL_DERATING', addr: 211, readable: true },
    { name: 'CONTINUOUS_PACK_POWER', addr: 213, readable: true },
    { name: 'SYSTEM_TOTAL_ENERGY_FOR_RIDER', addr: 217, readable: true },
    { name: 'INSTANCE_ENERGY_RESERVE', addr: 218, readable: true },
    { name: 'UNLOCK_COMPONENT', addr: 219, readable: true }, // Flow decompile, confidence: low — UnlockComponentResult{unlockResult:UnlockResultEnumType} but exact enum value list not confirmed — needs manual decompile check before adding as enum | fields: -
    { name: 'LOCK_ACCESS_CERTIFICATE_CHAIN', addr: 221, readable: true }, // Flow decompile, confidence: high — 3 nested Certificate fields confirmed | fields: tokenCertificateAuthority:Certificate, unlockCertificateAuthority:Certificate, unlockCertificate:Certificate
    { name: 'HARMFUL_EVENTS', addr: 225, readable: true }, // Flow decompile, confidence: high — matches domain HarmfulEvents.deepDischargeCount | fields: deepDischargeCount:uint32, reservedEvent2..10:uint32 (reserved/unused)
    { name: 'TOTAL_CAPACITY', addr: 226, readable: true },
    { name: 'BOOTMANAGER_SOFTWARE_VERSION', addr: 227, readable: true },
    { name: 'CHARGING_INFORMATION', addr: 228, readable: true }, // Flow decompile, confidence: high — 2 fields confirmed | fields: targetSocForCharging:uint(%), chargingMode:enum[STANDARD_CHARGING,FAST_CHARGING]
    { name: 'CHARGING_SETTINGS', addr: 229, readable: true }, // Flow decompile, confidence: high — matches domain ChargingSettings/ChargingMode | fields: chargingMode:enum[CHARGE_TIME_OPTIMIZED_CHARGING,BATTERY_LIFETIME_OPTIMIZED_CHARGING], chargingLimitSoc:uint(%)
    { name: 'RESET_SETTINGS', addr: 230, readable: true },
    { name: 'OEM_COMPONENT_LOCK_ENABLE', addr: 231, readable: true },
    { name: 'BOOTLOADER_SOFTWARE_VERSION', addr: 135, readable: true },
    { name: 'BUTTON_PRESSED', addr: 187, readable: true },
    { name: 'CHARGER_CONNECTED', addr: 137, readable: true },
    { name: 'CHARGING_ACTIVE', addr: 138, readable: true },
    { name: 'COMPONENT_DEACTIVATION_ENABLED', addr: 154, readable: true },
    { name: 'COMPONENT_DEACTIVATION_PROOF', addr: 153, readable: true },
    { name: 'COMPONENT_LOCKED', addr: 152, readable: true },
    { name: 'COMPONENT_LOCK_CONFIGURATION', addr: 151, readable: true },
    { name: 'DELIVERED_AH_OVER_LIFETIME', addr: 215, readable: true },
    { name: 'DELIVERED_WH_OVER_LIFETIME', addr: 156, readable: true },
    { name: 'DEVICE_CERTIFICATE', addr: 224, readable: true },
    { name: 'DURATION_IN_THERMAL_PROTECTION', addr: 157, readable: true },
    { name: 'ENABLE_BUTTON_TEST_MODE', addr: 186, readable: true, writable: true },
    { name: 'ENABLE_LED_TEST_MODE', addr: 184, readable: true, writable: true },
    { name: 'EXECUTE_INFORMATION_MANAGER_COMMAND_BOSCH', addr: 172, readable: false },
    { name: 'EXECUTE_INFORMATION_MANAGER_COMMAND_IBD', addr: 169, readable: false },
    { name: 'EXECUTE_INFORMATION_MANAGER_COMMAND_OEM', addr: 170, readable: false },
    { name: 'EXECUTE_INFORMATION_MANAGER_COMMAND_SP', addr: 171, readable: false },
    { name: 'FEATURE_PROPERTIES_RELEASE1', addr: 190, readable: true },
    { name: 'HARDWARE_SOFTWARE_VERSION', addr: 133, readable: true },
    { name: 'HARDWARE_VERSION', addr: 132, readable: true },
    { name: 'IN_SOFTWARE_INSTALLATION_STATE', addr: 166, readable: true },
    { name: 'IS_SAMPLE_SOFTWARE', addr: 165, readable: true },
    { name: 'LAST_END_OF_CHARGE_VOLTAGE', addr: 158, readable: true },
    { name: 'LED_TEST_PATTERN_ON', addr: 185, readable: true, writable: true },
    { name: 'MANUFACTURING_DATE', addr: 164, readable: true },
    { name: 'MAXIMUM_CHARGING_CURRENT', addr: 159, readable: true },
    { name: 'MAXIMUM_PACK_TEMPERATURE', addr: 160, readable: true },
    { name: 'MINIMUM_PACK_TEMPERATURE', addr: 161, readable: true },
    { name: 'NUMBER_OF_FULL_CHARGE_CYCLES', addr: 150, readable: true },
    { name: 'PART_NUMBER', addr: 130, readable: true },
    { name: 'PRESENT_CELL_VOLTAGE', addr: 140, readable: true },
    { name: 'PRESENT_FET_TEMPERATURE', addr: 210, readable: true },
    { name: 'PRESENT_PACK_TEMPERATURE', addr: 139, readable: true },
    { name: 'PRODUCT_CODE', addr: 131, readable: true },
    { name: 'PRODUCT_NAME', addr: 155, readable: true },
    { name: 'REMAINING_ENERGY', addr: 146, readable: true },
    { name: 'REMAINING_ENERGY_FOR_RIDER', addr: 145, readable: true },
    { name: 'SELF_DISCHARGING_RATE', addr: 220, readable: true },
    { name: 'SERIAL_NUMBER', addr: 129, readable: true },
    { name: 'SERVICE_CHARGE_STATE', addr: 191, readable: true },
    { name: 'SOFTWARE_VERSION', addr: 134, readable: true },
    { name: 'SO_C_LOWER_LIMIT', addr: 162, readable: true, writable: true },
    { name: 'SO_C_UPPER_LIMIT', addr: 163, readable: true, writable: true },
    { name: 'STATE_OF_CHARGE', addr: 136, readable: true },
    { name: 'STATE_OF_HEALTH', addr: 216, readable: true },
  ],
  Battery2: [
    { name: 'EXECUTE_INFORMATION_MANAGER_COMMAND_RIDER', addr: 680, readable: true }, // Flow decompile, confidence: high — mirrors Battery's EXECUTE_INFORMATION_MANAGER_COMMAND_RIDER (same field, Battery2 instance) — matches DriveUnit/HeadUnit sibling addresses | fields: command:enum, issueId:IssueId, entryNumber:int
    { name: 'REPORT_ISSUE', addr: 685, readable: true }, // Flow decompile, confidence: medium — mirrors Battery's REPORT_ISSUE (same field, Battery2 instance) — class only OrBuilder read, fields not fully confirmed | fields: ReportIssueParameters (issue id/type payload)
    { name: 'ISSUE_EVENT', addr: 686, readable: true }, // Flow decompile, confidence: low — mirrors Battery's ISSUE_EVENT (same field, Battery2 instance) — only OrBuilder interface found, concrete class not isolated | fields: issueId:IssueId, type, state
    { name: 'ISSUE_VISUALIZATION_EVENT', addr: 687, readable: true }, // Flow decompile, confidence: high — mirrors Battery's ISSUE_VISUALIZATION_EVENT (same field, Battery2 instance) — confirmed field numbers 1,3,4,5 | fields: issueId:IssueId, issueType:enum, description:enum, countermeasure:enum
    { name: 'NUMBER_OF_FULL_CHARGE_CYCLES_ON_BIKE', addr: 688, readable: true },
    { name: 'NUMBER_OF_FULL_CHARGE_CYCLES_OFF_BIKE', addr: 689, readable: true },
    { name: 'TOTAL_ENERGY', addr: 692, readable: true },
    { name: 'TIME_IN_BALANCING', addr: 695, readable: true },
    { name: 'DATA_MODEL_VERSION', addr: 701, readable: true },
    { name: 'DISCHARGE_DURATION', addr: 705, readable: true },
    { name: 'FEATURE_PROPERTIES_RELEASE4', addr: 706, readable: true }, // Flow decompile, confidence: high — mirrors Battery's FEATURE_PROPERTIES_RELEASE4 (same field, Battery2 instance) — 3 bool fields confirmed | fields: centralInformationVisualization:bool, preventShutdown:bool, serviceCharge:bool
    { name: 'INSTANCE_CHARGING_ACTIVE', addr: 708, readable: true },
    { name: 'INSTANCE_REMAINING_ENERGY_FOR_RIDER', addr: 709, readable: true },
    { name: 'INSTANCE_MAXIMUM_ALLOWED_DISCHARGE_CURRENT', addr: 710, readable: true },
    { name: 'INSTANCE_MAXIMUM_ALLOWED_REVERSE_CURRENT', addr: 711, readable: true },
    { name: 'INSTANCE_PRESENT_DISCHARGE_CURRENT', addr: 712, readable: true },
    { name: 'INSTANCE_LIGHT_RESERVE_STATE', addr: 713, readable: true },
    { name: 'INSTANCE_STATE_OF_CHARGE_FOR_RIDER', addr: 714, readable: true },
    { name: 'INSTANCE_MAXIMUM_ALLOWED_CHARGE_CURRENT', addr: 715, readable: true },
    { name: 'ALL_ISSUE_VISUALIZATION_EVENTS', addr: 716, readable: true }, // Flow decompile, confidence: medium — mirrors Battery's ALL_ISSUE_VISUALIZATION_EVENTS (same field, Battery2 instance) — plural/"ALL" naming implies repeated field of addr 175's type | fields: repeated IssueVisualizationEvent
    { name: 'BATTERY_STATIC_FEATURE_PROPERTIES', addr: 717, readable: true }, // Flow decompile, confidence: high — mirrors Battery's BATTERY_STATIC_FEATURE_PROPERTIES (same field, Battery2 instance) — 14 boolean capability fields confirmed | fields: 14 boolean capability fields (systemDerating, energyReserveV3, improvedSocCalculation, chargingModeConfigurable, oemComponentLockingSupport, etc.)
    { name: 'EASTER_EGG', addr: 718, readable: true },
    { name: 'DUAL_BATTERY_MODE', addr: 720, readable: true },
    { name: 'INSTANCE_ENERGY_RESERVE', addr: 730, readable: true },
    { name: 'UNLOCK_COMPONENT', addr: 731, readable: true }, // Flow decompile, confidence: low — mirrors Battery's UNLOCK_COMPONENT (same field, Battery2 instance) — UnlockComponentResult{unlockResult:UnlockResultEnumType} but exact enum value list not confirmed — needs manual decompile check before adding as enum | fields: -
    { name: 'LOCK_ACCESS_CERTIFICATE_CHAIN', addr: 733, readable: true }, // Flow decompile, confidence: high — mirrors Battery's LOCK_ACCESS_CERTIFICATE_CHAIN (same field, Battery2 instance) — 3 nested Certificate fields confirmed | fields: tokenCertificateAuthority:Certificate, unlockCertificateAuthority:Certificate, unlockCertificate:Certificate
    { name: 'HARMFUL_EVENTS', addr: 737, readable: true }, // Flow decompile, confidence: high — mirrors Battery's HARMFUL_EVENTS (same field, Battery2 instance) — matches domain HarmfulEvents.deepDischargeCount | fields: deepDischargeCount:uint32, reservedEvent2..10:uint32 (reserved/unused)
    { name: 'TOTAL_CAPACITY', addr: 738, readable: true },
    { name: 'BOOTMANAGER_SOFTWARE_VERSION', addr: 739, readable: true },
    { name: 'CHARGING_SETTINGS', addr: 741, readable: true }, // Flow decompile, confidence: high — mirrors Battery's CHARGING_SETTINGS (same field, Battery2 instance) — matches domain ChargingSettings/ChargingMode | fields: chargingMode:enum[CHARGE_TIME_OPTIMIZED_CHARGING,BATTERY_LIFETIME_OPTIMIZED_CHARGING], chargingLimitSoc:uint(%)
    { name: 'RESET_SETTINGS', addr: 742, readable: true },
    { name: 'OEM_COMPONENT_LOCK_ENABLE', addr: 743, readable: true },
    { name: 'BOOTLOADER_SOFTWARE_VERSION', addr: 647, readable: true },
    { name: 'BUTTON_PRESSED', addr: 699, readable: true },
    { name: 'COMPONENT_DEACTIVATION_ENABLED', addr: 666, readable: true },
    { name: 'COMPONENT_DEACTIVATION_PROOF', addr: 665, readable: true },
    { name: 'COMPONENT_LOCKED', addr: 664, readable: true },
    { name: 'COMPONENT_LOCK_CONFIGURATION', addr: 663, readable: true },
    { name: 'DELIVERED_AH_OVER_LIFETIME', addr: 727, readable: true },
    { name: 'DELIVERED_WH_OVER_LIFETIME', addr: 668, readable: true },
    { name: 'DEVICE_CERTIFICATE', addr: 736, readable: true },
    { name: 'DURATION_IN_THERMAL_PROTECTION', addr: 669, readable: true },
    { name: 'ENABLE_BUTTON_TEST_MODE', addr: 698, readable: true, writable: true },
    { name: 'ENABLE_LED_TEST_MODE', addr: 696, readable: true, writable: true },
    { name: 'EXECUTE_INFORMATION_MANAGER_COMMAND_BOSCH', addr: 684, readable: false },
    { name: 'EXECUTE_INFORMATION_MANAGER_COMMAND_IBD', addr: 681, readable: false },
    { name: 'EXECUTE_INFORMATION_MANAGER_COMMAND_OEM', addr: 682, readable: false },
    { name: 'EXECUTE_INFORMATION_MANAGER_COMMAND_SP', addr: 683, readable: false },
    { name: 'FEATURE_PROPERTIES_RELEASE1', addr: 702, readable: true },
    { name: 'HARDWARE_SOFTWARE_VERSION', addr: 645, readable: true },
    { name: 'HARDWARE_VERSION', addr: 644, readable: true },
    { name: 'IN_SOFTWARE_INSTALLATION_STATE', addr: 678, readable: true },
    { name: 'IS_SAMPLE_SOFTWARE', addr: 677, readable: true },
    { name: 'LAST_END_OF_CHARGE_VOLTAGE', addr: 670, readable: true },
    { name: 'LED_TEST_PATTERN_ON', addr: 697, readable: true, writable: true },
    { name: 'MANUFACTURING_DATE', addr: 676, readable: true },
    { name: 'MAXIMUM_CHARGING_CURRENT', addr: 671, readable: true },
    { name: 'MAXIMUM_PACK_TEMPERATURE', addr: 672, readable: true },
    { name: 'MINIMUM_PACK_TEMPERATURE', addr: 673, readable: true },
    { name: 'NUMBER_OF_FULL_CHARGE_CYCLES', addr: 662, readable: true },
    { name: 'PART_NUMBER', addr: 642, readable: true },
    { name: 'PRESENT_CELL_VOLTAGE', addr: 652, readable: true },
    { name: 'PRESENT_FET_TEMPERATURE', addr: 722, readable: true },
    { name: 'PRESENT_PACK_TEMPERATURE', addr: 651, readable: true },
    { name: 'PRODUCT_CODE', addr: 643, readable: true },
    { name: 'PRODUCT_NAME', addr: 667, readable: true },
    { name: 'REMAINING_ENERGY', addr: 658, readable: true },
    { name: 'SELF_DISCHARGING_RATE', addr: 732, readable: true },
    { name: 'SERIAL_NUMBER', addr: 641, readable: true },
    { name: 'SERVICE_CHARGE_STATE', addr: 703, readable: true },
    { name: 'SOFTWARE_VERSION', addr: 646, readable: true },
    { name: 'SO_C_LOWER_LIMIT', addr: 674, readable: true, writable: true },
    { name: 'SO_C_UPPER_LIMIT', addr: 675, readable: true, writable: true },
    { name: 'STATE_OF_CHARGE', addr: 648, readable: true },
    { name: 'STATE_OF_HEALTH', addr: 728, readable: true },
  ],
  BoschDiagnoseApp: [
    { name: 'SOFTWARE_UPDATE_MANIFESTS', addr: 3649, readable: true },
    { name: 'SOFTWARE_UPDATES', addr: 3650, readable: true },
    { name: 'CONFIGURATION_CONTAINERS', addr: 3651, readable: true },
    { name: 'RESOURCE_METADATA', addr: 3652, readable: true }, // Flow decompile, confidence: high — ResourceMetadataList/ResourceMetadata | fields: repeated {name:string, size:uint32}
    { name: 'COLLECTED_DATA_SET_RESOURCE', addr: 3653, readable: true }, // Flow decompile, confidence: high — LargeBinaryTransport.PushTransfer.collectedDataSetResource | fields: opaque byte[] file payload
    { name: 'DEV_LOG_RESOURCE', addr: 3654, readable: true }, // Flow decompile, confidence: medium — no dedicated handler found in this build; inferred from enum + shared resource-push pattern | fields: opaque byte[] file payload
    { name: 'STATISTIC_RESOURCE', addr: 3655, readable: true }, // Flow decompile, confidence: high — LargeBinaryTransport.PushTransfer.statisticResource | fields: opaque byte[] file payload
    { name: 'USER_DATA_RESOURCE', addr: 3656, readable: true }, // Flow decompile, confidence: medium — not directly wired in this build; inferred from enum + shared resource-push pattern | fields: opaque byte[] file payload
    { name: 'TRUSTED_DATA_PACK_RESOURCE', addr: 3657, readable: true }, // Flow decompile, confidence: medium — not directly wired in this build; inferred from enum + shared resource-push pattern | fields: opaque byte[] file payload
    { name: 'DATA_MODEL_VERSION', addr: 3601, readable: null },
  ],
  ConnectModule: [
    { name: 'REPORT_ISSUE', addr: 2577, readable: true }, // Flow decompile, confidence: high — ReportIssueParameters | fields: IssueId,Snapshot,Timestamp
    { name: 'ISSUE_EVENT', addr: 2578, readable: true }, // Flow decompile, confidence: high — IssueEvent | fields: IssueId,Snapshot,TimeStamp
    { name: 'ISSUE_VISUALIZATION_EVENT', addr: 2579, readable: true }, // Flow decompile, confidence: high — IssueVisualizationEvent | fields: IssueId,IssueType,Description,Countermeasure
    { name: 'EXECUTE_INFORMATION_MANAGER_COMMAND_RIDER', addr: 2584, readable: true }, // Flow decompile, confidence: high — ExecuteInformationManagerCommandParameters; rider variant of shared role family | fields: Command,IssueId,EntryNumber
    { name: 'ALL_ISSUE_VISUALIZATION_EVENTS', addr: 2585, readable: true }, // Flow decompile, confidence: medium — inferred repeated-field wrapper, no dedicated descriptor found | fields: -
    { name: 'DATA_MODEL_VERSION', addr: 2825, readable: true },
    { name: 'GIT_INFORMATION', addr: 2828, readable: true }, // Flow decompile, confidence: high — GitInformation | fields: GitSha1,GitDescribe,GitRefspec,GitTag
    { name: 'BUILD_INFORMATION', addr: 2829, readable: true }, // Flow decompile, confidence: high — BuildInformation | fields: BuildHostname,BuildUsername,BuildNumber,BuildTime,BuildCompiler,BuildType
    { name: 'EASTER_EGG', addr: 2848, readable: true },
    { name: 'ACTIVATE', addr: 2855, readable: true },
    { name: 'SEND_CONNECTION_ACKNOWLEDGE_TO_BACKEND', addr: 2856, readable: true },
    { name: 'BOOTMANAGER_SOFTWARE_VERSION', addr: 2859, readable: true },
    { name: 'DISABLE_TRANSPORTATION_MODE', addr: 2864, readable: true },
    { name: 'BATTERY_CHARGING_STATUS', addr: 2866, readable: true },
    { name: 'CONNECT_MODULE_FEATURE_PROPERTIES_RELEASE4', addr: 2867, readable: true }, // Flow decompile, confidence: high — ConnectModuleFeaturePropertiesRelease4 | fields: CentralInformationVisualization
    { name: 'CONNECT_MODULE_STATIC_FEATURE_PROPERTIES', addr: 2869, readable: true }, // Flow decompile, confidence: high — ConnectModuleStaticFeatureProperties | fields: PowerCycleIssueList,ComponentLockingSupport,IssueHealing
    { name: 'BACKEND_ENVIRONMENT', addr: 2870, readable: true },
    { name: 'DEBUG_COMPONENT_STATE', addr: 2871, readable: true },
    { name: 'FETCH_REMOTE_CONFIGURATION', addr: 2872, readable: true },
    { name: 'UNLOCK_COMPONENT', addr: 2875, readable: true },
    { name: 'ALARM_FEATURE_ENABLED_CONFIGURATION', addr: 2857, readable: true },
    { name: 'ALARM_FEATURE_SETTINGS', addr: 2858, readable: true },
    { name: 'BATTERY_STATUS', addr: 2860, readable: true },
    { name: 'BATTERY_VOLTAGE', addr: 2841, readable: true },
    { name: 'BOOTLOADER_SOFTWARE_VERSION', addr: 2833, readable: true },
    { name: 'COMPONENT_LOCKED', addr: 2849, readable: true },
    { name: 'COMPONENT_LOCK_CONFIGURATION', addr: 2850, readable: true },
    { name: 'EXECUTE_INFORMATION_MANAGER_COMMAND_BOSCH', addr: 2583, readable: false },
    { name: 'EXECUTE_INFORMATION_MANAGER_COMMAND_IBD', addr: 2580, readable: false },
    { name: 'EXECUTE_INFORMATION_MANAGER_COMMAND_OEM', addr: 2581, readable: false },
    { name: 'EXECUTE_INFORMATION_MANAGER_COMMAND_SP', addr: 2582, readable: false },
    { name: 'HARDWARE_SOFTWARE_VERSION', addr: 2820, readable: true },
    { name: 'HARDWARE_VERSION', addr: 2819, readable: true },
    { name: 'IN_SOFTWARE_INSTALLATION_STATE', addr: 2853, readable: true },
    { name: 'IS_SAMPLE_SOFTWARE', addr: 2862, readable: true },
    { name: 'LATEST_GNSS_TIMESTAMP', addr: 2861, readable: true },
    { name: 'MANUFACTURING_DATE', addr: 2822, readable: true },
    { name: 'MODEM_FIRMWARE_VERSION', addr: 2865, readable: true },
    { name: 'PART_NUMBER', addr: 2818, readable: true },
    { name: 'PRODUCTION_LINE', addr: 2824, readable: true },
    { name: 'PRODUCTION_PLANT_CODE', addr: 2823, readable: true },
    { name: 'PRODUCT_CODE', addr: 2821, readable: true },
    { name: 'PRODUCT_NAME', addr: 2835, readable: true },
    { name: 'REMOTE_CONFIGURATION_DATA', addr: 2876, readable: true },
    { name: 'REMOTE_CONFIGURATION_SETTINGS', addr: 2873, readable: true },
    { name: 'SERIAL_NUMBER', addr: 2817, readable: true },
    { name: 'SHIPPING_MODE', addr: 2863, readable: true },
    { name: 'SOFTWARE_VERSION', addr: 2827, readable: true },
    { name: 'TRANSPORTATION_MODE_CONFIGURATION', addr: 2840, readable: true },
  ],
  DriveUnit: [
    { name: 'REMOTE_CONTROL_AVAILABLE', addr: 4129, readable: true },
    { name: 'BATTERY1_AVAILABLE', addr: 4130, readable: true },
    { name: 'BATTERY1_IN_BOOTLOADER_AVAILABLE', addr: 4131, readable: true },
    { name: 'HEAD_UNIT_AVAILABLE', addr: 4132, readable: true },
    { name: 'HEAD_UNIT_IN_BOOTLOADER_AVAILABLE', addr: 4133, readable: true },
    { name: 'CONNECT_MODULE_AVAILABLE', addr: 4134, readable: true },
    { name: 'CONNECT_MODULE_IN_BOOTLOADER_AVAILABLE', addr: 4135, readable: true },
    { name: 'ANTI_LOCK_BRAKE_SYSTEM_AVAILABLE', addr: 4136, readable: true },
    { name: 'ANTI_LOCK_BRAKE_SYSTEM_IN_BOOTLOADER_AVAILABLE', addr: 4137, readable: true },
    { name: 'BATTERY2_AVAILABLE', addr: 4138, readable: true },
    { name: 'BATTERY2_IN_BOOTLOADER_AVAILABLE', addr: 4139, readable: true },
    { name: 'EXECUTE_INFORMATION_MANAGER_COMMAND_RIDER', addr: 4225, readable: true }, // Flow decompile, confidence: high — ExecuteInformationManagerCommandParameters protobuf message | fields: command:DiagnosticCommandEnum(BLOCK_REPORTING,UNBLOCK_REPORTING,DELETE_ALL_ISSUES,DELETE_ISSUE,GET_ISSUE_COUNT,READ_ISSUE_BY_NUMBER,READ_ISSUE_BY_KEY,READ_ACTIVE_VISUALIZATION_EVENT,GET_ISSUE_STATE,SET_STATE_DELETED_ISSUE,SET_STATE_DELETED_ALL_ISSUES), entryNumber:int, issueId:IssueId{value:int}
    { name: 'REPORT_ISSUE', addr: 4232, readable: true }, // Flow decompile, confidence: high — ReportIssueParameters protobuf message | fields: issueId:IssueId{value:int}, snapshot:IssueSnapshot, timestamp:Timestamp
    { name: 'ISSUE_EVENT', addr: 4233, readable: true }, // Flow decompile, confidence: high — IssueEvent protobuf message | fields: issueId:IssueId, snapshot:IssueSnapshot, timeStamp:Timestamp
    { name: 'ISSUE_VISUALIZATION_EVENT', addr: 4234, readable: true }, // Flow decompile, confidence: high — IssueVisualizationEvent protobuf message | fields: countermeasure:int, description:int, issueId:IssueId, issueType:IssueTypeEnum
    { name: 'RESET_REAR_WHEEL_CIRCUMFERENCE_USER', addr: 4248, readable: true },
    { name: 'PLAY_SOUND', addr: 4249, readable: true }, // Flow decompile, confidence: high — PlaySound protobuf message (oneof pattern/customPattern) | fields: pattern:SoundPatternEnum(UNKNOWN,NEGATIVE,TURN_INSTRUCTION,DEVIATION_FROM_ROUTE,ARRIVAL_AT_DESTINATION,INCOMING_CALL,POSITIVE,CUSTOM) or customPattern:Tones
    { name: 'ALL_ISSUE_VISUALIZATION_EVENTS', addr: 4250, readable: true }, // Flow decompile, confidence: medium — Inferred from ListOfIssueIds/VisualizableIssueTypes repeated-list pattern; no dedicated "AllIssueVisualizationEvents" class found | fields: repeated IssueVisualizationEvent
    { name: 'GET_TIME_UNTIL_DERATING', addr: 4251, readable: true },
    { name: 'LIMIT_ASSISTANCE_FOR_POWER_CYCLE', addr: 4252, readable: true },
    { name: 'RESET_GEAR_RATIOS', addr: 4254, readable: true },
    { name: 'RESET_RIDER_CONTEXT', addr: 4259, readable: true }, // Flow decompile, confidence: high — ResetRiderContextFeatures protobuf message | fields: distractedRiderAlert:bool
    { name: 'ROTOR_POSITION_CALIBRATION_START', addr: 4260, readable: true },
    { name: 'DIAGNOSE_HUB_CABLE', addr: 4261, readable: true }, // Flow decompile, confidence: high — HubCableSelfDiagnosisResult protobuf message | fields: componentToBeExchanged:HubCableDiagComponentToExchangeEnum(NONE,MOTOR,CONTROLLER,BOTH,INCONCLUSIVE), logInfo:string, nextStep:HubCableDiagNextStepEnum(NO_FURTHER_STEPS_NEEDED,DISCONNECT_MOTOR,CONNECT_DONGLE,CONNECT_MOTOR), returnValue:HubCableDiagReturnValueEnum(ERROR,SUCCESS)
    { name: 'ASSIST_MODE_UP', addr: 6154, readable: true },
    { name: 'ASSIST_MODE_DOWN', addr: 6155, readable: true },
    { name: 'DATA_MODEL_VERSION', addr: 6160, readable: true },
    { name: 'RIDER_TORQUE', addr: 6164, readable: true },
    { name: 'MOTOR_TORQUE', addr: 6165, readable: true },
    { name: 'BIKE_NOT_DRIVING', addr: 6170, readable: true },
    { name: 'PRESENT_ASSIST_FACTOR', addr: 6174, readable: true },
    { name: 'LOCK_ACCESS_CERTIFICATE_CHAIN', addr: 6215, readable: true }, // Flow decompile, confidence: high — ComponentLockCertificateChain protobuf message | fields: tokenCertificateAuthority:Certificate, unlockCertificate:Certificate, unlockCertificateAuthority:Certificate
    { name: 'TOTAL_RIDING_TIME_WITHOUT_STOPS', addr: 6218, readable: true },
    { name: 'ENTERING_ENERGY_RESERVE', addr: 6219, readable: true },
    { name: 'SHIFT_RECOMMENDATION', addr: 6224, readable: true },
    { name: 'ENERGY_RESERVE', addr: 6230, readable: true },
    { name: 'RIDER_CADENCE', addr: 6234, readable: true },
    { name: 'RIDER_POWER', addr: 6235, readable: true },
    { name: 'MOTOR_CADENCE', addr: 6236, readable: true },
    { name: 'MOTOR_POWER', addr: 6237, readable: true },
    { name: 'TRIGGER_ALERT', addr: 6243, readable: true }, // Flow decompile, confidence: high — TriggerAlert protobuf message | fields: lightEnabled:bool, soundEnabled:bool, triggerAlertType:TriggerAlertTypeEnum(MOVEMENT,SIGNIFICANT_MOVEMENT)
    { name: 'BOOTMANAGER_SOFTWARE_VERSION', addr: 6244, readable: true },
    { name: 'BIKE_NOT_MOVING', addr: 6245, readable: true },
    { name: 'COMPONENT_STATE', addr: 6246, readable: true }, // Flow decompile, confidence: high — ComponentState protobuf message | fields: componentStateContext:ComponentStateContextEnum(UNINITIALIZED_CONTEXT,BOOTLOADER,APPLICATION), componentStatePreChargeState:ComponentStatePreChargeStateEnum(UNINITIALIZED_PRE_CHARGE,NONE_PRE_CHARGE,POWER_OFF,IN_PRE_CHARGE,PRE_CHARGE_FINISHED), componentStateSystemState:ComponentStateSystemStateEnum(UNINITIALIZED_SYSTEM_STATE,NORMAL,SW_INSTALLATION)
    { name: 'SPEED_RANGE', addr: 6247, readable: true }, // Flow decompile, confidence: high — SpeedRange protobuf message (fields likely km/h, un-normalized ints) | fields: maximumSpeed:int, minimumSpeed:int
    { name: 'WALK_ASSIST_STATUS', addr: 6250, readable: true }, // Flow decompile, confidence: high — WalkAssistStatus protobuf message | fields: countdown:int, state:WalkAssistStateEnum(WALK_ASSIST_AND_HILL_START_OFF,WALK_ASSIST_WAITING_FOR_MOVEMENT,WALK_ASSIST_WAITING_FOR_BUTTON_PRESS,WALK_ASSIST_ACTIVE,HILL_START_WAITING_FOR_PEDAL_TORQUE,HILL_START_WAITING_FOR_BUTTON_PRESS,HILL_START_ACTIVE)
    { name: 'WALK_ASSIST_CONTROL', addr: 6251, readable: true }, // Flow decompile, confidence: high — WalkAssistControl protobuf message | fields: request:bool, terminate:bool
    { name: 'UNLOCK_COMPONENT', addr: 6254, readable: true }, // Flow decompile, confidence: high — UnlockTokenContainer protobuf message | fields: signature:Signature, unlockToken:UnlockToken{expirationTime:Timestamp, freshnessCount:int, partNumber:PartNumber, serialNumber:SerialNumber}
    { name: 'SOUND_STATUS', addr: 6255, readable: true }, // Flow decompile, confidence: high — SoundStatus protobuf message | fields: remainingRepetitions:int, soundType:SoundTypeEnum(UNLOCK,CONNECT_MODULE_SIGNIFICANT_MOVE,CRASH_ALARM,LOCK,CRITICAL_ERROR,SAFETY_LAMP_ON_DUE_TO_ERROR,CONNECT_MODULE_MOVEMENT,POSITIVE_CONFIRMATION)
    { name: 'SMARTPHONE_APP_AVAILABLE_IN_CURRENT_REGION', addr: 6258, readable: true },
    { name: 'NAVIGATION_AVAILABLE_IN_CURRENT_REGION', addr: 6259, readable: true },
    { name: 'EASTER_EGG', addr: 6265, readable: true },
    { name: 'DRIVE_UNIT_FEATURE_PROPERTIES_RELEASE4', addr: 6266, readable: true },
    { name: 'IS_SPEED_PEDELEC', addr: 6270, readable: true },
    { name: 'PROHIBIT_MOTOR_SUPPORT', addr: 6271, readable: true },
    { name: 'MOTOR_INTERACTION_REQUEST', addr: 6273, readable: true }, // Flow decompile, confidence: high — MotorInteraction protobuf message (all scalar fields optional/"has*") | fields: cassetteRevolutionBeforeTorqueLimit:int, cassetteRevolutionWithTorqueLimit:int, cassetteRotationRequest:int, durationWithTorqueLimit:int, prohibitAutoShiftForDuration:int, prohibitAutoShiftForRearCassetteRevolutions:int, shiftDirection:ShiftDirectionEnum, startTime:int, torqueLimit:int
    { name: 'DEAD_CENTER_PREDICTION', addr: 6274, readable: true },
    { name: 'MOTOR_SUPPORT_ACTIVE', addr: 6275, readable: true },
    { name: 'LIMIT_MAXIMUM_MOTOR_POWER', addr: 6277, readable: true },
    { name: 'LIMIT_MAXIMUM_MOTOR_TORQUE', addr: 6278, readable: true },
    { name: 'CONTINUOUS_MOTOR_TORQUE', addr: 6279, readable: true },
    { name: 'TRICK_DETECTION_STATUS', addr: 6280, readable: true }, // Flow decompile, confidence: high — TrickDetectionStatus protobuf message | fields: activityState:TrickActivityStateEnum(NO_TRICK,START,UPDATE), distance:int, duration:int, height:int, pitchAngle:int, rollAngle:int, startTimestamp:long, trickType:TrickTypeEnum, yawAngle:int (all optional/"has*" except activityState/startTimestamp/trickType)
    { name: 'AUTOMATIC_MODE_AVAILABLE', addr: 6282, readable: true },
    { name: 'ASSIST_MODE_LIMITS', addr: 6283, readable: true }, // Flow decompile, confidence: high — AssistModeLimits protobuf message | fields: maximumMotorAssistance:int(%), maximumMotorPower:int(W), maximumMotorTorque:int(Nm), maximumSpeed:int, motorAssistanceApplication:ArrayOf6MotorAssistanceFactors
    { name: 'MAXIMUM_CONFIGURED_DISCHARGE_CURRENT', addr: 6284, readable: true },
    { name: 'REAR_CASSETTE_ANGULAR_SPEED', addr: 6285, readable: true },
    { name: 'WALK_ASSIST_TIP', addr: 6286, readable: true },
    { name: 'CHAIN_STATE', addr: 6287, readable: true }, // Flow decompile, confidence: high — ChainState protobuf message | fields: chainLoad:ChainLoadEnum(UNKNOWN,NO_LOAD,LOAD), chainMovement:ChainMovementEnum(UNKNOWN,NO_MOVEMENT,MOVEMENT)
    { name: 'MOTOR_INTERACTION_CONFIG', addr: 6288, readable: true },
    { name: 'SPEED_TUNING_PREDICTED', addr: 6291, readable: true }, // Flow decompile, confidence: high — SpeedTuningPredicted protobuf message | fields: confidencePredictor:int, confidencePredictorMax:int, tuningDetectedFlag:bool
    { name: 'CRASH_DETECTION_STATUS', addr: 6292, readable: true }, // Flow decompile, confidence: high — CrashDetectionStatus protobuf message | fields: crashClass:CrashClassEnum(NO_CRASH,CRASH_RIDING_COLLISION_TIP_OVER,CRASH_RIDING_STRONG_COLLISION_NO_TIP_OVER,CRASH_RIDING_COLLISION_NOSE_OVER,CRASH_RIDING_STRONG_COLLISION_TIP_OVER,CRASH_RIDING_STRONG_COLLISION_NOSE_OVER,CRASH_RIDING_NO_COLLISION_TIP_OVER,CRASH_RIDING_NO_COLLISION_NOSE_OVER,CRASH_LOW_SPEED_NO_COLLISION_TIP_OVER,CRASH_LOW_SPEED_NO_COLLISION_NOSE_OVER,CRASH_STAND_STILL_NO_COLLISION_TIP_OVER,CRASH_STAND_STILL_SOFT_COLLISION_TIP_OVER,CRASH_STAND_STILL_STRONG_COLLISION_NO_TIP_OVER,CRASH_STAND_STILL_COLLISION_TIP_OVER,CRASH_STAND_STILL_STRONG_COLLISION_TIP_OVER,NO_CRASH_STAND_STILL_RIDERLESS_ROLL_OVER), crashStatus:CrashStatusEnum(NO_CRASH,POTENTIAL_CRASH_DETECTED)
    { name: 'CRASH_DETECTION_CONFIG', addr: 6293, readable: true }, // Flow decompile, confidence: high — CrashDetectionConfig protobuf message | fields: featureActivationFlag:bool, soundActivationFlag:bool
    { name: 'REDUCE_INPUT_CURRENT', addr: 6295, readable: true },
    { name: 'ODOMETER_MOTOR', addr: 6301, readable: true },
    { name: 'MOUNTING_ANGLE_ROLL', addr: 6303, readable: true },
    { name: 'ROTOR_POSITION_CALIBRATION_RESULT', addr: 6304, readable: true },
    { name: 'BRAKE_DETECTION_STATUS', addr: 6305, readable: true },
    { name: 'RESET_HUB_CABLE_DIAGNOSIS', addr: 6306, readable: true },
    { name: 'TUNING_DETECTION_CONFIG', addr: 6307, readable: true }, // Flow decompile, confidence: high — TuningDetectionConfig protobuf message | fields: configuration:TuningDetectionConfigTypeEnum(DEFAULT,ROBUST_AI_CONFIGURATION,ROBUST_CLASSIC_AND_AI_CONFIGURATION), serialNumber:SerialNumber
    { name: 'ASSIST_MODE_LIMITS_V2', addr: 6308, readable: true }, // Flow decompile, confidence: high — AssistModeLimitsV2 protobuf message | fields: maximumMotorAssistance:int, maximumMotorPower:int(W), maximumMotorTorque:int(Nm), maximumSpeed:int, motorApplication:MotorCharacteristicMap
    { name: 'ESTIMATED_MOUNTING_ANGLE_INFORMATION', addr: 6309, readable: true }, // Flow decompile, confidence: high — MountingAngleEstimationInformation protobuf message | fields: estimatedMountingAnglePitch:int, estimatedMountingAngleRoll:int, statusMountingAngleEstimation:MountingAngleEstimationStatusEnum(NOT_YET_LEARNED,LEARNED)
    { name: 'OEM_COMPONENT_LOCK_ENABLE', addr: 6311, readable: true },
    { name: 'ACTIVE_ASSIST_MODES', addr: 6222, readable: true },
    { name: 'ADDING_ASSIST_MODES_LOCKED', addr: 6207, readable: true },
    { name: 'ALWAYS_SHOW_BIKE_SPEED_IN_DISPLAY', addr: 6171, readable: true },
    { name: 'ASSIST_MODE', addr: 6153, readable: true },
    { name: 'ASSIST_MODE_COLORS', addr: 6158, readable: true },
    { name: 'ASSIST_MODE_IS_OEM_ADJUSTABLE', addr: 4246, readable: false },
    { name: 'ASSIST_MODE_LONG_NAMES', addr: 6157, readable: true },
    { name: 'ASSIST_MODE_SHORT_NAMES', addr: 6156, readable: true },
    { name: 'ASSIST_MODE_STRENGTH', addr: 4245, readable: false },
    { name: 'AVAILABLE_ASSIST_MODES_LOWER', addr: 6248, readable: true },
    { name: 'AVAILABLE_ASSIST_MODES_UPPER', addr: 6159, readable: true },
    { name: 'AVERAGE_RIDER_CADENCE', addr: 6262, readable: true },
    { name: 'BATTERY_KEY_LOCK_NUMBER', addr: 6195, readable: true, writable: true },
    { name: 'BIKE_CATEGORY', addr: 6229, readable: true },
    { name: 'BIKE_CATEGORY_CONFIGURATION', addr: 6211, readable: true },
    { name: 'BIKE_ID', addr: 6188, readable: true },
    { name: 'BIKE_LIGHT', addr: 6172, readable: true, writable: true },
    { name: 'BIKE_LIGHT_AVAILABLE', addr: 6176, readable: true, writable: true },
    { name: 'BIKE_LIGHT_CONFIGURATION', addr: 6177, readable: true, writable: true },
    { name: 'BIKE_LIGHT_CONFIGURATION_OEM', addr: 6175, readable: true },
    { name: 'BIKE_LIGHT_POWER', addr: 6178, readable: true, writable: true },
    { name: 'BIKE_SPEED', addr: 6152, readable: true },
    { name: 'BOOTLOADER_SOFTWARE_VERSION', addr: 6151, readable: true },
    { name: 'COMPONENT_LOCKED', addr: 6196, readable: true },
    { name: 'COMPONENT_LOCK_CONFIGURATION', addr: 6197, readable: true },
    { name: 'CONNECT_MODULE_READY', addr: 6216, readable: true },
    { name: 'CURRENT_MOUNTING_ANGLE_AT_STANDSTILL', addr: 4257, readable: false },
    { name: 'DISPLAYED_BIKE_SPEED', addr: 6189, readable: true },
    { name: 'DISTRACTED_RIDING_ALERT', addr: 6161, readable: true },
    { name: 'DRIVE_UNIT_FEATURE_PROPERTIES_RELEASE1', addr: 6162, readable: true },
    { name: 'DRIVE_UNIT_FEATURE_PROPERTIES_RELEASE2', addr: 6256, readable: true },
    { name: 'DRIVE_UNIT_FEATURE_PROPERTIES_RELEASE3', addr: 6257, readable: true },
    { name: 'DRIVE_UNIT_STATIC_FEATURE_PROPERTIES', addr: 6272, readable: true },
    { name: 'EXECUTE_INFORMATION_MANAGER_COMMAND_BOSCH', addr: 4229, readable: false },
    { name: 'EXECUTE_INFORMATION_MANAGER_COMMAND_IBD', addr: 4226, readable: false },
    { name: 'EXECUTE_INFORMATION_MANAGER_COMMAND_OEM', addr: 4227, readable: false },
    { name: 'EXECUTE_INFORMATION_MANAGER_COMMAND_SP', addr: 4228, readable: false },
    { name: 'EXTENDED_BIKE_SPEED', addr: 6264, readable: true },
    { name: 'FRONT_ANTI_LOCK_BRAKE_SYSTEM_ASSEMBLED', addr: 6228, readable: true },
    { name: 'GEARING_SYSTEM', addr: 6187, readable: true },
    { name: 'GEARSHIFT_APPLICATION_AVAILABLE', addr: 6203, readable: true },
    { name: 'GEARSHIFT_APPLICATION_REQUIRED', addr: 6202, readable: true },
    { name: 'GET_ASSIST_MODE_INFORMATION', addr: 4235, readable: false },
    { name: 'GET_ASSIST_MODE_STATISTICS', addr: 4236, readable: false },
    { name: 'HARDWARE_SOFTWARE_VERSION', addr: 6149, readable: true },
    { name: 'HARDWARE_VERSION', addr: 6148, readable: true },
    { name: 'HIGH_POWER_PORT_ACTIVE', addr: 6194, readable: true, writable: true },
    { name: 'HUB_CONFIGURABLE_PORT_STATUS', addr: 6298, readable: true },
    { name: 'IN_SOFTWARE_INSTALLATION_STATE', addr: 6212, readable: true },
    { name: 'IS_SAMPLE_SOFTWARE', addr: 6198, readable: true },
    { name: 'LOW_POWER_PORT_ACTIVE', addr: 6193, readable: true, writable: true },
    { name: 'MANUFACTURING_DATE', addr: 6199, readable: true },
    { name: 'MAXIMUM_ASSISTANCE_SPEED', addr: 6167, readable: true },
    { name: 'MAXIMUM_ASSISTANCE_SPEED_IBD', addr: 6210, readable: true, writable: true },
    { name: 'MAXIMUM_AVAILABLE_MOTOR_POWER', addr: 6260, readable: true },
    { name: 'MAXIMUM_AVAILABLE_MOTOR_TORQUE', addr: 6263, readable: true },
    { name: 'MAXIMUM_GEAR_RATIO', addr: 6166, readable: true },
    { name: 'MAXIMUM_LEGAL_BIKE_SPEED', addr: 6163, readable: true },
    { name: 'MOTOR_CUT_OFF_DISTANCE', addr: 6227, readable: true },
    { name: 'MOTOR_POWER_CONFIGURATION', addr: 6226, readable: true },
    { name: 'MOTOR_PRODUCT_CODE', addr: 6302, readable: true },
    { name: 'MOUNTING_ANGLE', addr: 6281, readable: true },
    { name: 'MULTI_PURPOSE_PORT_STATUS', addr: 6268, readable: true, writable: true },
    { name: 'ODOMETER', addr: 6168, readable: true },
    { name: 'OEM_BIKE_ID', addr: 6238, readable: true },
    { name: 'OEM_BIKE_MODEL_ID', addr: 6261, readable: true },
    { name: 'OEM_BRAND_IDENTIFIER', addr: 6186, readable: true },
    { name: 'OEM_BRAND_NAME', addr: 6252, readable: true },
    { name: 'OEM_FREE_TEXT_FIELD', addr: 6242, readable: true },
    { name: 'OEM_HUB_CONFIGURABLE_PORT_CONFIGURATION', addr: 6297, readable: true },
    { name: 'OEM_MANUFACTURING_DATE', addr: 6241, readable: true },
    { name: 'OEM_MANUFACTURING_LINE', addr: 6240, readable: true },
    { name: 'OEM_MANUFACTURING_LOCATION', addr: 6239, readable: true },
    { name: 'OEM_MULTI_PURPOSE_PORT_CONFIGURATION', addr: 6267, readable: true },
    { name: 'OEM_PORT_CONFIGURATION', addr: 6192, readable: true },
    { name: 'OEM_SPEED_SOURCE_CONFIGURATION', addr: 6208, readable: true },
    { name: 'OEM_THROTTLE_CONFIGURATION', addr: 6299, readable: true },
    { name: 'OEM_TORQUE_LIMITATION', addr: 6294, readable: true },
    { name: 'PART_NUMBER', addr: 6146, readable: true },
    { name: 'POWER_ON_TIME', addr: 6169, readable: true },
    { name: 'POWER_ON_TIME_WITH_MOTOR_SUPPORT', addr: 6253, readable: true },
    { name: 'PRESENT_PCB_TEMPERATURE', addr: 6276, readable: true },
    { name: 'PRODUCTION_PLANT_CODE', addr: 6220, readable: true },
    { name: 'PRODUCT_APPLICATION_AVAILABLE', addr: 6201, readable: true },
    { name: 'PRODUCT_APPLICATION_REQUIRED', addr: 6200, readable: true },
    { name: 'PRODUCT_CODE', addr: 6147, readable: true },
    { name: 'PRODUCT_LINE', addr: 6183, readable: true },
    { name: 'PRODUCT_NAME', addr: 6190, readable: true },
    { name: 'RANGE_EXTENDER_READY', addr: 6217, readable: true },
    // Confirmed via Flow's own (newer, fuller) decompiled DriveUnitAddresses enum — genuinely
    // live, bike-computed per-assist-mode range estimate (ReachableRangeType: repeated uint32,
    // km). This is the actual data source behind Flow's "Schatting van actieradius" (range
    // estimate) screen — not a client-side formula, a real firmware-computed value. Confirmed
    // NOT present/wired in the older DiagnosticTool 3 dealer-jar address table this project
    // otherwise relies on — traced instead from C:\work\flow (Flow APK's own jadx decompile).
    { name: 'REACHABLE_RANGE', addr: 6231, readable: true },
    { name: 'READ_UDAM_DEFAULT_VALUES', addr: 4241, readable: false },
    { name: 'READ_UDAM_LIMITS', addr: 4242, readable: false },
    { name: 'READ_UDAM_VALUES', addr: 4240, readable: false },
    { name: 'REAR_WHEEL_CIRCUMFERENCE_OEM', addr: 6184, readable: true },
    { name: 'REAR_WHEEL_CIRCUMFERENCE_USER', addr: 6185, readable: true, writable: true },
    { name: 'REAR_WHEEL_CIRCUMFERENCE_USER_LIMITS', addr: 6191, readable: true },
    { name: 'REGIO_SPEED_APPLICATION_AVAILABLE', addr: 6205, readable: true },
    { name: 'REGIO_SPEED_APPLICATION_REQUIRED', addr: 6204, readable: true },
    { name: 'REGIO_SPEED_CONFIGURATION', addr: 6269, readable: true },
    { name: 'REQUIRED_ASSIST_MODES_LOWER', addr: 6249, readable: true },
    { name: 'REQUIRED_ASSIST_MODES_UPPER', addr: 6206, readable: true },
    { name: 'RESET_ACTIVE_ASSIST_MODES_TO_DEFAULT', addr: 4253, readable: false },
    { name: 'RESET_ALL_UDAM_VALUES', addr: 4247, readable: false },
    { name: 'RESET_RANGE_CALCULATION', addr: 4238, readable: false },
    { name: 'RESET_RIDE_STATISTICS', addr: 4237, readable: false, writable: true },
    { name: 'RESET_UDAM_VALUES', addr: 4244, readable: false, writable: true },
    { name: 'RIDE_STATISTICS', addr: 6223, readable: true },
    { name: 'RIM_MAGNET_TEST_STATUS', addr: 6296, readable: true },
    { name: 'RIM_MAGNET_TEST_TRIGGER', addr: 4258, readable: false },
    { name: 'ROAD_SLOPE', addr: 6173, readable: true },
    { name: 'SERIAL_NUMBER', addr: 6145, readable: true },
    { name: 'SET_UDAM_VALUES_PARAMETERS', addr: 4243, readable: false },
    { name: 'SOFTWARE_VERSION', addr: 6150, readable: true },
    { name: 'SPEED_BIKE_SIGNAL_LAMP_REQUIRED', addr: 6232, readable: true },
    { name: 'SPEED_DISPLAY_TOLERANCE', addr: 6213, readable: true },
    { name: 'SPEED_MANIPULATION_STATUS', addr: 6221, readable: true },
    { name: 'SPEED_SOURCE', addr: 6209, readable: true },
    { name: 'START_ASSIST_MODE_CONFIGURATION', addr: 6180, readable: true, writable: true },
    { name: 'START_ASSIST_MODE_CONFIGURATION_OEM', addr: 6179, readable: true },
    { name: 'THROTTLE_CONFIGURATION', addr: 6300, readable: true },
    { name: 'TUNING_DETECTION', addr: 6225, readable: true },
    { name: 'UDAM_MODIFICATION_POSSIBLE', addr: 6214, readable: true },
    { name: 'WALK_ASSIST_CONFIGURATION', addr: 6182, readable: true, writable: true },
    { name: 'WALK_ASSIST_CONFIGURATION_OEM', addr: 6181, readable: true },
  ],
  HeadUnit: [
    { name: 'REPORT_ISSUE', addr: 3089, readable: true }, // Flow decompile, confidence: high — ReportIssueParametersOrBuilder | fields: IssueId,IssueSnapshot,Timestamp
    { name: 'ISSUE_EVENT', addr: 3090, readable: true }, // Flow decompile, confidence: high — IssueEventOrBuilder | fields: IssueId,IssueSnapshot,Timestamp
    { name: 'ISSUE_VISUALIZATION_EVENT', addr: 3091, readable: true }, // Flow decompile, confidence: high — IssueVisualizationEventOrBuilder | fields: IssueId,IssueTypeEnum(IM_INFORMATION,IM_WARNING,IM_ERROR,IM_CRITICAL_ERROR),countermeasure,description
    { name: 'EXECUTE_INFORMATION_MANAGER_COMMAND_RIDER', addr: 3096, readable: true }, // Flow decompile, confidence: high — ExecuteInformationManagerCommandParametersOrBuilder/ReturnOrBuilder | fields: command:enum(11 values), returnValue:enum(7 values)
    { name: 'UPDATE_ISSUE_VISUALIZATION', addr: 3097, readable: true }, // Flow decompile, confidence: medium — no dedicated class found; positional inference | fields: likely reuses IssueVisualizationEvent
    { name: 'VISUALIZABLE_ISSUE_TYPES', addr: 3098, readable: true },
    { name: 'ALL_ISSUE_VISUALIZATION_EVENTS', addr: 3099, readable: true }, // Flow decompile, confidence: low — no dedicated list class located | fields: inferred repeated/list wrapper
    { name: 'DATA_MODEL_VERSION', addr: 3340, readable: true },
    { name: 'BOOTMANAGER_SOFTWARE_VERSION', addr: 3341, readable: true },
    { name: 'EASTER_EGG', addr: 3342, readable: true },
    { name: 'SUPPORTED_LANGUAGES', addr: 3347, readable: true }, // Flow decompile, confidence: high — SupportedLanguagesTypeOrBuilder | fields: repeated Language{value:String}
    { name: 'RESET_INTERNAL_VALUES', addr: 3351, readable: true },
    { name: 'STATUSBAR_CUSTOMIZATION', addr: 3352, readable: true },
    { name: 'KEY_DEVICE', addr: 3355, readable: true },
    { name: 'SET_AS_KEY_DEVICE', addr: 3356, readable: true },
    { name: 'HEAD_UNIT_FEATURE_PROPERTIES_RELEASE4', addr: 3358, readable: true }, // Flow decompile, confidence: high — HeadUnitFeaturePropertiesRelease4OrBuilder | fields: centralInformationVisualization,trailNavigation (bools)
    { name: 'UNLOCK_TOKENS_NONCE', addr: 3359, readable: true },
    { name: 'VIEW_STRIPE_CAPABILITIES', addr: 3360, readable: true }, // Flow decompile, confidence: high — ViewStripeCapabilitiesOrBuilder | fields: maximumCategoryCount,maximumOptionGroupCount,maximumTilesPerViewCount,maximumViewsPerCategoryCount,minimumTileSize,supportedTileIdCapabilities,supportedTileTemplateCapabilities
    { name: 'VIEW_STRIPE_CONFIGURATION_ID', addr: 3361, readable: true },
    { name: 'VIEW_STRIPE_CONFIGURATION', addr: 3362, readable: true }, // Flow decompile, confidence: high — ViewStripeConfigurationOrBuilder | fields: repeated CategoryConfigurationId
    { name: 'FEATURE_STREAMING_TILES_OF_INTEREST', addr: 3363, readable: true },
    { name: 'FEATURE_STREAMING_TILE', addr: 3364, readable: true }, // Flow decompile, confidence: high — FeatureStreamingTileOrBuilder | fields: tileId,optionGroupId,timeToLive,content:FeatureStreamingTileContent
    { name: 'FEATURE_STREAMING_TILE_PLACEHOLDER', addr: 3365, readable: true }, // Flow decompile, confidence: high — FeatureStreamingTilePlaceholderOrBuilder | fields: tileId,placeholderContent
    { name: 'FEATURE_STREAMING_OPTION_GROUP', addr: 3366, readable: true }, // Flow decompile, confidence: high — FeatureStreamingOptionGroupOrBuilder | fields: optionGroupId,icon:IconIdEnum,options,selectedId,text
    { name: 'GET_CATEGORY_CONFIGURATION', addr: 3367, readable: true },
    { name: 'SET_CATEGORY_CONFIGURATION', addr: 3368, readable: true }, // Flow decompile, confidence: high — CategoryConfigurationOrBuilder | fields: id:CategoryConfigurationId,views:list<ViewLayout>
    { name: 'SHOW_VIEW_STRIPE_CONFIGURATION', addr: 3369, readable: true },
    { name: 'STORE_VIEW_STRIPE_CONFIGURATION', addr: 3370, readable: true }, // Flow decompile, confidence: medium — no dedicated class found | fields: ViewStripeConfiguration or CategoryConfiguration (inferred)
    { name: 'SET_TILE_CONTENT', addr: 3371, readable: true }, // Flow decompile, confidence: high — FeatureStreamingTileContentOrBuilder | fields: id,icons,shortStrings,longStrings,tileTemplate:enum(ICON_AND_TEXTS,ICON,FORECAST,NAVIGATION)
    { name: 'FEATURE_STREAMING_CAPABILITIES', addr: 3372, readable: true }, // Flow decompile, confidence: high — FeatureStreamingCapabilitiesOrBuilder | fields: oneof{asOptionGroupCapabilities,asTrailNavigationCapabilities,asViewStripeCapabilities}
    { name: 'FEATURE_STREAMING_OPTION_STRIPE', addr: 3375, readable: true },
    { name: 'DISPLAY_GENERIC_TEXT', addr: 3402, readable: true }, // Flow decompile, confidence: high — GenericTextOrBuilder | fields: text:String,size:int
    { name: 'DEBUG_AMBIENT_LIGHT_SENSOR', addr: 3456, readable: true }, // Flow decompile, confidence: low — naming convention only | fields: -
    { name: 'DEBUG_TEMPERATURE', addr: 3457, readable: true }, // Flow decompile, confidence: low — naming convention only | fields: -
    { name: 'DEBUG_TAKE_SCREENSHOT', addr: 3458, readable: true }, // Flow decompile, confidence: high — ScreenshotConfigOrBuilder | fields: area:Area{x,y,width,height},preset:enum(7 values),shouldOutputImage:bool
    { name: 'DEBUG_UI_POSITION', addr: 3459, readable: true }, // Flow decompile, confidence: low — naming convention only | fields: -
    { name: 'HEAD_UNIT_STATIC_FEATURE_PROPERTIES', addr: 3460, readable: true }, // Flow decompile, confidence: high — HeadUnitStaticFeaturePropertiesOrBuilder | fields: componentLockingSupport,customizationOfOptions,customizationOfScreens,featureStreamingAlert,issueHealing,multiKeyDevice,navigationAdviceSubscription,onboardDataCollection,playSound,powerCycleIssueList,resetScreenCustomization (bools)
    { name: 'SUPPORTED_TILE_IDS', addr: 3461, readable: true }, // Flow decompile, confidence: low — TileIdEnum has ~30+ values (e.g. BATTERY1_PRESENT_PACK_TEMPERATURE, DRIVE_UNIT_RIDER_TORQUE) but full ordinal list wasn't confirmed — needs manual decompile check before adding as enum | fields: -
    { name: 'TEST_UI_FEATURE_PROPERTIES', addr: 3464, readable: true }, // Flow decompile, confidence: high — TestUiFeaturePropertiesOrBuilder | fields: animations,backgroundDimming,paginator,sampleText (bools)
    { name: 'UNLOCK_COMPONENT', addr: 3465, readable: true },
    { name: 'SUPPORTED_TILE_SIZES', addr: 3466, readable: true }, // Flow decompile, confidence: high — SupportedTileSizesOrBuilder | fields: repeated TileSize{width:FractionUint8,height:FractionUint8}
    { name: 'BOOTLOADER_SOFTWARE_VERSION', addr: 3335, readable: true },
    { name: 'BUZZER', addr: 3392, readable: true, writable: true },
    { name: 'COMPONENT_LOCKED', addr: 3344, readable: true },
    { name: 'COMPONENT_LOCK_CONFIGURATION', addr: 3345, readable: true },
    { name: 'DISPLAY_BRIGHTNESS_CONFIGURATION', addr: 3346, readable: true },
    { name: 'EXECUTE_INFORMATION_MANAGER_COMMAND_BOSCH', addr: 3095, readable: false },
    { name: 'EXECUTE_INFORMATION_MANAGER_COMMAND_IBD', addr: 3092, readable: false },
    { name: 'EXECUTE_INFORMATION_MANAGER_COMMAND_OEM', addr: 3093, readable: false },
    { name: 'EXECUTE_INFORMATION_MANAGER_COMMAND_SP', addr: 3094, readable: false },
    { name: 'HARDWARE_SOFTWARE_VERSION', addr: 3333, readable: true },
    { name: 'HARDWARE_VERSION', addr: 3332, readable: true },
    { name: 'HEAD_UNIT_FEATURE_PROPERTIES_RELEASE1', addr: 3349, readable: true },
    { name: 'HEAD_UNIT_FEATURE_PROPERTIES_RELEASE2', addr: 3353, readable: true },
    { name: 'HEAD_UNIT_FEATURE_PROPERTIES_RELEASE3', addr: 3357, readable: true },
    { name: 'IN_SOFTWARE_INSTALLATION_STATE', addr: 3348, readable: true },
    { name: 'IS_SAMPLE_SOFTWARE', addr: 3338, readable: true },
    { name: 'LCD_TEST_MODE', addr: 3463, readable: true, writable: true },
    { name: 'MANUFACTURING_DATE', addr: 3336, readable: true },
    { name: 'PART_NUMBER', addr: 3330, readable: true },
    { name: 'PLAY_SOUND', addr: 3373, readable: false },
    { name: 'PRODUCT_CODE', addr: 3331, readable: true },
    { name: 'PRODUCT_NAME', addr: 3337, readable: true },
    { name: 'SERIAL_NUMBER', addr: 3329, readable: true },
    { name: 'SIGNAL_LAMP_HASH_WITH_ALIVE_COUNTER', addr: 3350, readable: null },
    { name: 'SOFTWARE_VERSION', addr: 3334, readable: true },
    { name: 'SOUNDS_VOLUME_LEVEL', addr: 3374, readable: true },
    { name: 'UI_PRIORITY', addr: 3339, readable: true },
  ],
  RemoteControl: [
    { name: 'ACTIVE_UI_PRIORITY', addr: 8209, readable: true },
    { name: 'ACTIVE_UI_COMPONENT', addr: 8210, readable: true },
    { name: 'POWER_CYCLE_SYNC_TIME', addr: 8228, readable: true }, // Flow decompile, confidence: low — Inferred from Timestamp wrapper convention | fields: Timestamp{value:int64}
    { name: 'POWER_CYCLE_TIME', addr: 8229, readable: true }, // Flow decompile, confidence: low — Likely uptime/epoch at last power cycle | fields: Timestamp{value:int64}
    { name: 'RESET_LAST_STORED_TIME', addr: 8230, readable: true }, // Flow decompile, confidence: high — ResetLastStoredTimeParameters | fields: nonce:int32, timestamp:Timestamp
    { name: 'SHUTDOWN_REASON', addr: 8243, readable: true }, // Flow decompile, confidence: medium — full enum ordinal list not confirmed, needs manual check before adding as enum | fields: ShutdownReasonEnum, 25 values (NO_SHUTDOWN_REQUESTED, BATTERY_EMPTY, DRIVE_UNIT_EMERGENCY_SHUTDOWN, etc.)
    { name: 'CPU_LOAD', addr: 8247, readable: true },
    { name: 'AVAILABLE_BUTTONS', addr: 8257, readable: true },
    { name: 'AVAILABLE_BUTTON_DESCRIPTORS', addr: 8261, readable: true }, // Flow decompile, confidence: high — per-button descriptor list | fields: repeated ButtonDeviceDescriptor{device:enum, identifier:string}
    { name: 'UI_CONTROL', addr: 8263, readable: true },
    { name: 'REQUEST_DYNAMIC_UI_CONTROL', addr: 8264, readable: true },
    { name: 'DYNAMIC_UI_CONTROL_STATE', addr: 8265, readable: true },
    { name: 'DIAGNOSIS_PROGRAM_ACTIVE', addr: 8273, readable: true },
    { name: 'EASTER_EGG', addr: 8298, readable: true },
    { name: 'GIT_INFORMATION', addr: 8300, readable: true }, // Flow decompile, confidence: high — git commit/tag metadata for firmware | fields: gitDescribe,gitRefspec,gitSha1,gitTag:string
    { name: 'BUILD_INFORMATION', addr: 8301, readable: true }, // Flow decompile, confidence: high — build environment metadata | fields: buildCompiler,buildHostname,buildNumber,buildTime,buildType,buildUsername:string
    { name: 'DATA_MODEL_VERSION', addr: 8305, readable: true },
    { name: 'IS_SAMPLE_HARDWARE', addr: 8307, readable: true },
    { name: 'CAN_TIME_SYNC_ENABLED', addr: 8340, readable: true },
    { name: 'UI_PRIORITY', addr: 8353, readable: true },
    { name: 'SIGNAL_LAMP_HASH_WITH_ALIVE_COUNTER', addr: 8356, readable: true }, // Flow decompile, confidence: high — integrity hash of lamp state + heartbeat counter | fields: hash:int32, aliveCounter:int32
    { name: 'WELCOME_PATTERN_FINISHED', addr: 8357, readable: true },
    { name: 'DISMISS_ERROR_PATTERN', addr: 8358, readable: true },
    { name: 'ERROR_PATTERN_ACTIVE', addr: 8359, readable: true },
    { name: 'CRITICAL_ERROR_PATTERN_ACTIVE', addr: 8360, readable: true },
    { name: 'REQUEST_PLUS_MINUS_BUTTON_CONTROL_BY_ACTIVE_UI', addr: 8361, readable: true },
    { name: 'PLUS_MINUS_BUTTON_CONTROL_BY_ACTIVE_UI', addr: 8362, readable: true },
    { name: 'VISUALIZABLE_ISSUE_TYPES', addr: 8364, readable: true },
    { name: 'UPDATE_ISSUE_VISUALIZATION', addr: 8365, readable: true }, // Flow decompile, confidence: high — bike pushes active-issue event to app UI | fields: IssueId,IssueType,Description,Countermeasure
    { name: 'STATUSBAR_CUSTOMIZATION', addr: 8368, readable: true },
    { name: 'REQUEST_DYNAMIC_BUTTON_CONTROL_BY_ACTIVE_UI', addr: 8369, readable: true }, // Flow decompile, confidence: low — handshake counterpart of 8370 | fields: -
    { name: 'DYNAMIC_BUTTON_CONTROL_BY_ACTIVE_UI', addr: 8370, readable: true }, // Flow decompile, confidence: low — internal UI plumbing | fields: app-defined button-role submessage
    { name: 'SUPPORTED_LANGUAGES', addr: 8372, readable: true },
    { name: 'VIEW_STRIPE_CAPABILITIES', addr: 8373, readable: true }, // Flow decompile, confidence: high — display-configuration limits for tile UI | fields: maximumCategoryCount,maximumViewsPerCategoryCount,maximumTilesPerViewCount,minimumTileSize
    { name: 'FEATURE_STREAMING_CAPABILITIES', addr: 8374, readable: true }, // Flow decompile, confidence: high — which UI-streaming feature the bike supports | fields: oneof{asViewStripeCapabilities,asTrailNavigationCapabilities,asOptionGroupCapabilities}
    { name: 'FEATURE_STREAMING_TILES_OF_INTEREST', addr: 8375, readable: true },
    { name: 'VIEW_STRIPE_CONFIGURATION_ID', addr: 8376, readable: true },
    { name: 'VIEW_STRIPE_CONFIGURATION', addr: 8377, readable: true }, // Flow decompile, confidence: high — ordered list of category-configs on ride-screen | fields: repeated CategoryConfigurationId{value:int}
    { name: 'GET_CATEGORY_CONFIGURATION', addr: 8378, readable: true }, // Flow decompile, confidence: high — callable datapoint | fields: request:CategoryConfigurationId; response:CategoryConfiguration{Id,Views}
    { name: 'SET_CATEGORY_CONFIGURATION', addr: 8379, readable: true }, // Flow decompile, confidence: high — sets tiles/views belonging to a category | fields: CategoryConfiguration{Id,Views} -> bool ack
    { name: 'SET_TILE_CONTENT', addr: 8380, readable: true }, // Flow decompile, confidence: high — streams display strings/icons for a tile | fields: Id,TileTemplate,ShortStrings,LongStrings,Icons
    { name: 'SHOW_VIEW_STRIPE_CONFIGURATION', addr: 8381, readable: true },
    { name: 'STORE_VIEW_STRIPE_CONFIGURATION', addr: 8382, readable: true },
    { name: 'DEBUG_UI_POSITION', addr: 8383, readable: true }, // Flow decompile, confidence: low — internal debug plumbing | fields: -
    { name: 'DOWNLOAD_CONFIGURATION_CONTAINER_V2', addr: 8392, readable: true }, // Flow decompile, confidence: medium — OTA/config-container download flow | fields: Identifier, Source:enum
    { name: 'UPDATE_PROGRESS_OF_OTHER_COMPONENTS', addr: 8429, readable: true }, // Flow decompile, confidence: low — OTA/software-update plumbing | fields: -
    { name: 'IN_SOFTWARE_INSTALLATION_STATE', addr: 8430, readable: true },
    { name: 'INIT_INSTALLATION_REPORT_CREATION', addr: 8443, readable: true },
    { name: 'SNOOZE_STATE', addr: 8460, readable: true },
    { name: 'LEAVE_SNOOZE', addr: 8461, readable: true },
    { name: 'HEART_RATE', addr: 8462, readable: true },
    { name: 'HEART_RATE_STATUS', addr: 8463, readable: true },
    { name: 'SET_SYSTEM_WAKE_UP_REASON', addr: 8465, readable: true },
    { name: 'RANGE_CONTROL_ACTIVE', addr: 8466, readable: true },
    { name: 'TOGGLE_BIKE_LIGHT', addr: 8467, readable: true },
    { name: 'UNLOCK_COMPONENT', addr: 8469, readable: true },
    { name: 'REQUEST_MOTOR_SUPPORT_PROHIBITION', addr: 8470, readable: true }, // Flow decompile, confidence: high — prohibits motor support for a listed reason | fields: enableProhibition:bool, reason:enum(SERVICE_CHARGE,SNOOZE_MODE,SPEED_ALWAYS_SHOWN_FAILED,BOSCH_DIAGNOSTIC_TOOL_CONNECTED,SYSTEM_LOCKED,SOFTWARE_UPDATE_RUNNING,ESHIFT_NOT_READY,CRITICAL_ERROR)
    { name: 'BATTERY_HOT_PLUGOUT', addr: 8471, readable: true }, // Flow decompile, confidence: low — no protobuf/code reference found beyond enum entry | fields: -
    { name: 'EXECUTE_INFORMATION_MANAGER_COMMAND_RIDER', addr: 8481, readable: true }, // Flow decompile, confidence: high — request/response for issue-manager diagnostic commands | fields: command:enum(11 values), entryNumber, issueId -> returnValue,dataFrame,stateInformation
    { name: 'REPORT_ISSUE', addr: 8482, readable: true }, // Flow decompile, confidence: high — rider/app reports an issue incl. raw snapshot bytes | fields: issueId, snapshot:bytes, timestamp
    { name: 'ISSUE_EVENT', addr: 8483, readable: true }, // Flow decompile, confidence: high — bike-originated issue event with diagnostic snapshot | fields: issueId, snapshot:bytes, timeStamp
    { name: 'ISSUE_VISUALIZATION_EVENT', addr: 8484, readable: true }, // Flow decompile, confidence: high — human-facing issue with severity + text-table indices | fields: issueId, issueType:enum(IM_INFORMATION,IM_WARNING,IM_ERROR,IM_CRITICAL_ERROR), description:int, countermeasure:int
    { name: 'ALL_ISSUE_VISUALIZATION_EVENTS', addr: 8489, readable: true },
    { name: 'ACTIVE_ISSUE_VISUALIZATION_EVENT', addr: 8529, readable: true }, // Flow decompile, confidence: high — code-confirmed via ActiveIssueCallback | fields: value:IssueVisualizationEvent optional
    { name: 'REPORT_ISSUE_VISUALIZATION_EVENT', addr: 8530, readable: true }, // Flow decompile, confidence: medium — inferred from address-name/type-family adjacency | fields: IssueVisualizationEvent (same family as 8484/8529)
    { name: 'ACKNOWLEDGE_ISSUE_VISUALIZATION_EVENT', addr: 8531, readable: true },
    { name: 'SHIFT_REQUEST', addr: 8548, readable: true }, // Flow decompile, confidence: high — requests specific target gear with sequencing/timing mode | fields: shiftSequence:enum(SIMULTANEOUS,SEQUENCE), shiftType:enum(IMMEDIATE,SYNCHRONIZED), targetGear:int
    { name: 'AUTO_DOWN_SHIFT_RECOMMENDATION', addr: 8552, readable: true },
    { name: 'E_SHIFT_CAN_AVAILABLE', addr: 8556, readable: true },
    { name: 'E_SHIFT_BLE_AVAILABLE', addr: 8557, readable: true }, // Flow decompile, confidence: high — disambiguates among BLE devices | fields: identifier:BleCentralPeripheralIdentifier, vendorId:int
    { name: 'MOTOR_INTERACTION_REQUEST', addr: 8558, readable: true }, // Flow decompile, confidence: high — coordinates motor torque reduction with e-shift gear-changer | fields: cassetteRotationRequest, shiftDirection:enum, torqueLimit, durationWithTorqueLimit, cassetteRevolutionBeforeTorqueLimit, prohibitAutoShiftForDuration, startTime (ints)
    { name: 'E_SHIFT_OPERATION_MODE_REQUEST', addr: 8559, readable: true },
    { name: 'CURRENT_E_SHIFT_OPERATION_MODE', addr: 8560, readable: true },
    { name: 'FINE_ADJUSTMENT_STEP_REQUEST', addr: 8561, readable: true },
    { name: 'CURRENT_FINE_ADJUSTMENT_STEP', addr: 8562, readable: true },
    { name: 'SHIFT_MODE', addr: 8563, readable: true },
    { name: 'AUTOMATIC_SHIFT_FEEDBACK', addr: 8564, readable: true },
    { name: 'E_SHIFT_FEATURE_FLAGS', addr: 8568, readable: true }, // Flow decompile, confidence: high — capability bits reported by gear-shifting peripheral | fields: 7 bools: GearControlledManualMode, GearProvidesShiftFeedback, GearImplementsShiftRequest, GearControlledAutomaticMode, GearControlledAutoDownShift, GearControlledMultiShift, GearControlledLimpHome
    { name: 'E_BIKE_FEATURE_FLAGS_FOR_E_SHIFT', addr: 8569, readable: true }, // Flow decompile, confidence: high — capability bits reported by bike/motor side | fields: 8 bools: AdaptiveCadenceControlFeat, BikeControlledAutomaticMode, BikeControlledManualMode, BikeProvidesOperationModes, CassetteRevolutionBasedTorqueReduction, ChainStateAvailable, ProhibitAutoShiftFeat, RampDownConfigFeat
    { name: 'E_SHIFT_IS_READY_TO_SHUTDOWN', addr: 8570, readable: true },
    { name: 'HANDLE_SHIFTER_EVENT', addr: 8571, readable: true }, // Flow decompile, confidence: medium — value names compressed/abbreviated in source, exact ordinal list not safely recoverable as enum | fields: raw button/hardware event stream from e-shift shifter unit (INVALID, GENERIC_UP/DOWN(+CONTINUE), FINE_ADJUSTMENT_MODE, SERVICE_MODE, SWITCH_SHIFT_MODE, BATTERY_LOW, INTERNAL_ERROR, CRITICAL_ERROR, SHIFT_UP/DOWN(+CONTINUE), FINE_ADJUSTMENT_UP/DOWN, BATTERY_EMPTY)
    { name: 'LOCK_SOUND_ENABLED', addr: 8603, readable: true },
    { name: 'DEBUG_FEATURES', addr: 8608, readable: true }, // Flow decompile, confidence: low — app-internal debug-UI plumbing | fields: -
    { name: 'AUTO_BIKE_LIGHT_CONFIGURATION', addr: 8610, readable: true }, // Flow decompile, confidence: high — configures auto light on/off illuminance thresholds and shutoff timer | fields: enabled:bool, illuminanceOn:int, illuminanceOff:int, timeOff:int
    { name: 'USB_POWER_AVAILABLE', addr: 8644, readable: true },
    { name: 'USB_CHARGING_ACTIVE', addr: 8648, readable: true },
    { name: 'POWER_MANAGEMENT_INFORMATION', addr: 8651, readable: true }, // Flow decompile, confidence: high — PowerManagementInformation.java confirmed writeUInt32 fields | fields: maximumCurrent:uint32(mA), powerProfile:uint32
    { name: 'MAXIMUM_ALLOWED_BRC_HMI_PORT_CURRENT', addr: 8652, readable: true },
    { name: 'MOBILE_APPLICATION_AVAILABLE', addr: 8705, readable: true },
    { name: 'BLE_PERIPHERAL_CONNECTION_PARAMETERS', addr: 8711, readable: true }, // Flow decompile, confidence: high — BleConnectionParametersOrBuilder confirmed | fields: connectionInterval, slaveLatency, supervisionTimeout
    { name: 'CONFIGURED_SMARTPHONES', addr: 8716, readable: true }, // Flow decompile, confidence: high — ConfiguredSmartphonesOrBuilder / SmartphoneOrBuilder | fields: repeated Smartphone{name:string, available:bool, applicationType}
    { name: 'BLE_BUTTON_EVENT', addr: 8717, readable: true }, // Flow decompile, confidence: high — BleButtonEventOrBuilder + BleButtonEventTypeEnumType | fields: Button{device:enum, keyCode}, type:enum(PRESS/RELEASE/HOLD), timestamp
    { name: 'BLE_AVAILABLE_BUTTONS', addr: 8718, readable: true }, // Flow decompile, confidence: medium — mirrors non-BLE AVAILABLE_BUTTONS address | fields: repeated ButtonDeviceDescriptor
    { name: 'BLE_CENTRAL_VISUALIZABLE_ISSUE_TYPES', addr: 8742, readable: true },
    { name: 'BLE_CENTRAL_UPDATE_ISSUE_VISUALIZATION', addr: 8743, readable: true }, // Flow decompile, confidence: low — internal plumbing, no direct code linkage found | fields: issueId,issueType,description,countermeasure
    { name: 'BLE_HEART_RATE', addr: 8744, readable: true },
    { name: 'BLE_HEART_RATE_STATUS', addr: 8745, readable: true },
    { name: 'BLE_SHIFTER_READY', addr: 8746, readable: true },
    { name: 'ACTIVITY_ID', addr: 8769, readable: true },
    { name: 'START_TIME_OF_ACTIVITY', addr: 8770, readable: true },
    { name: 'DURATION_WITHOUT_STOPS_OF_ACTIVITY', addr: 8771, readable: true },
    { name: 'TIME_ZONE_OF_ACTIVITY', addr: 8772, readable: true },
    { name: 'START_ODOMETER_OF_ACTIVITY', addr: 8773, readable: true },
    { name: 'AVERAGE_SPEED', addr: 8774, readable: true },
    { name: 'AVERAGE_CADENCE', addr: 8776, readable: true },
    { name: 'MAXIMUM_CADENCE', addr: 8777, readable: true },
    { name: 'AVERAGE_RIDER_POWER', addr: 8778, readable: true },
    { name: 'MAXIMUM_RIDER_POWER', addr: 8779, readable: true },
    { name: 'AVERAGE_HEART_RATE', addr: 8780, readable: true },
    { name: 'MAXIMUM_HEART_RATE', addr: 8781, readable: true },
    { name: 'ENERGY_CONSUMED', addr: 8782, readable: true },
    { name: 'RESET_ACTIVITY', addr: 8783, readable: true },
    { name: 'AUTOMATIC_ACTIVITY_RESET', addr: 8784, readable: true },
    { name: 'CALORIES_CONSUMED', addr: 8785, readable: true },
    { name: 'ASSIST_MODE_USAGE_TOTAL', addr: 8786, readable: true },
    { name: 'ASSIST_MODE_USAGE_WITH_MOTOR_SUPPORT_ACTIVE', addr: 8787, readable: true },
    { name: 'RIDER_ENERGY_SHARE', addr: 8788, readable: true },
    { name: 'BRAKE_EVENTS', addr: 8789, readable: true }, // Flow decompile, confidence: high — BrakeEventsOrBuilder.java | fields: amountOfNormalBrakeEvents:int, amountOfAbsInterventionEvents:int
    { name: 'TRICK_STATS', addr: 8790, readable: true }, // Flow decompile, confidence: high — TrickStatsOrBuilder.java, 16 int fields | fields: counts + max distance/duration/height/angle per trick type (Jumps, Manuals, Stoppies, Wheelies)
    { name: 'DEBUG_TAKE_SCREENSHOT', addr: 8832, readable: true },
    { name: 'LED_PATTERN_HISTORY', addr: 8833, readable: true }, // Flow decompile, confidence: low — internal diagnostic/debug plumbing | fields: repeated LedPatternStatusChange
    { name: 'SUPPORTED_TILE_IDS', addr: 8834, readable: true }, // Flow decompile, confidence: low — TileIdEnumType full ordinal list not confirmed, needs manual decompile check before adding as enum | fields: -
    { name: 'FEATURE_STREAMING_OPTION_GROUP', addr: 8835, readable: true }, // Flow decompile, confidence: low — internal app-UI plumbing | fields: optionGroupId, icon, text, options[], selectedId
    { name: 'TEST_UI_FEATURE_PROPERTIES', addr: 8837, readable: true }, // Flow decompile, confidence: low — internal test-UI plumbing | fields: animations, backgroundDimming, paginator, sampleText:bool
    { name: 'SUPPORTED_TILE_SIZES', addr: 8838, readable: true }, // Flow decompile, confidence: low — app-UI plumbing | fields: repeated TileSize{width,height:FractionUint8}
    { name: 'DISPLAY_GENERIC_TEXT', addr: 8842, readable: true },
    { name: 'RESET_DISPLAY_VALUES', addr: 8843, readable: true },
    { name: 'REQUEST_TRUSTED_DATA_PACK', addr: 8900, readable: true }, // Flow decompile, confidence: high — requests a cryptographically signed data bundle | fields: metadata + dataPointAddresses:repeated int
    { name: 'TRUSTED_DATA_PACK_AVAILABLE', addr: 8901, readable: true }, // Flow decompile, confidence: high — response counterpart to REQUEST_TRUSTED_DATA_PACK | fields: repeated {client:enum, available:bool, requestID:Uuid}
    { name: 'THIRD_PARTY_DEVICE_IN_FULL_POWER_MODE', addr: 8965, readable: true },
    { name: 'X_ABS_BRAKE_EVENT', addr: 8979, readable: true }, // Flow decompile, confidence: high — XAbsBrakeEventOrBuilder + XAbsBrakeEventTypeEnumType | fields: timestamp:Timestamp, type:enum(NO_EVENT,NORMAL_BRAKE,ABS_BRAKE)
    { name: 'X_ABS_BRAKE_DURATION_OF_LAST_BRAKE_EVENT', addr: 8980, readable: true },
    { name: 'X_ABS_BRAKE_DISTANCE_OF_LAST_BRAKE_EVENT', addr: 8981, readable: true },
    { name: 'X_ABS_DYNAMIC_FEATURE_PROPERTIES', addr: 8982, readable: true }, // Flow decompile, confidence: high — XAbsDynamicFeaturePropertiesOrBuilder | fields: absModes:bool, brakeStatistics:bool
    { name: 'X_ABS_AVAILABLE_ABS_MODE_ICONS', addr: 8983, readable: true },
    { name: 'X_ABS_AVAILABLE_ABS_MODES', addr: 8984, readable: true },
    { name: 'X_ABS_CURRENT_ABS_MODE', addr: 8985, readable: true },
    { name: 'SIGNAL_LAMP_REQUIRED', addr: 8993, readable: true },
    { name: 'SIGNAL_LAMP_CONTROL', addr: 8994, readable: true }, // Flow decompile, confidence: high — SignalLampControlOrBuilder + SignalLampModeEnumType | fields: mode:enum(OFF,ON,STARTUP), aliveCounter:int
    { name: 'AMBIENT_BRIGHTNESS', addr: 8513, readable: true },
    { name: 'ANTI_LOCK_BRAKE_SYSTEM_AVAILABLE', addr: 8329, readable: true },
    { name: 'ANTI_LOCK_BRAKE_SYSTEM_IN_BOOTLOADER_AVAILABLE', addr: 8330, readable: true },
    { name: 'ANTI_LOCK_BRAKE_SYSTEM_UDS_IDENTIFICATION_DATA', addr: 8426, readable: true },
    { name: 'AVAILABLE_CONFIGURATION_BACKUP_SLOTS', addr: 8605, readable: true },
    { name: 'BATTERY1_AVAILABLE', addr: 8323, readable: true },
    { name: 'BATTERY1_IN_BOOTLOADER_AVAILABLE', addr: 8324, readable: true },
    { name: 'BATTERY1_UDS_IDENTIFICATION_DATA', addr: 8423, readable: true },
    { name: 'BATTERY2_AVAILABLE', addr: 8332, readable: true },
    { name: 'BATTERY2_IN_BOOTLOADER_AVAILABLE', addr: 8333, readable: true },
    { name: 'BATTERY2_UDS_IDENTIFICATION_DATA', addr: 8431, readable: true },
    { name: 'BIKE_ID', addr: 8580, readable: true },
    { name: 'BIKE_NAME', addr: 8582, readable: true },
    { name: 'BLE_CENTRAL_BATTERY_SERVICE_CHANGED', addr: 8737, readable: null },
    { name: 'BLE_CENTRAL_BOOKMARK', addr: 8712, readable: false },
    { name: 'BLE_CENTRAL_CLEAR_DATABASE', addr: 8721, readable: false },
    { name: 'BLE_CENTRAL_CONFIGURATION_DATA_CHANGED', addr: 8733, readable: null },
    { name: 'BLE_CENTRAL_CONNECT', addr: 8714, readable: false },
    { name: 'BLE_CENTRAL_CONNECTION_DATA_CHANGED', addr: 8732, readable: null },
    { name: 'BLE_CENTRAL_DATABASE', addr: 8720, readable: true },
    { name: 'BLE_CENTRAL_DISABLE_AUTO_RECONNECT', addr: 8729, readable: false },
    { name: 'BLE_CENTRAL_DISCONNECT', addr: 8715, readable: false },
    { name: 'BLE_CENTRAL_ENABLE_AUTO_RECONNECT', addr: 8728, readable: false },
    { name: 'BLE_CENTRAL_GET_AVAILABLE_DATABASE_SLOTS', addr: 8719, readable: true },
    { name: 'BLE_CENTRAL_GET_BATTERY_SERVICE', addr: 8736, readable: false },
    { name: 'BLE_CENTRAL_GET_BOSCH_DEVICE_INFORMATION_SERVICE', addr: 8735, readable: false },
    { name: 'BLE_CENTRAL_GET_CONFIGURATION_DATA', addr: 8731, readable: false },
    { name: 'BLE_CENTRAL_GET_CONNECTION_DATA', addr: 8730, readable: false },
    { name: 'BLE_CENTRAL_GET_DEVICE_INFORMATION_SERVICE', addr: 8734, readable: false },
    { name: 'BLE_CENTRAL_GET_INITIALIZATION_STATE', addr: 8740, readable: false },
    { name: 'BLE_CENTRAL_GET_PERIPHERAL_FOR_BUTTON_DEVICE', addr: 8739, readable: false },
    { name: 'BLE_CENTRAL_INITIALIZATION_STATE_CHANGED', addr: 8741, readable: null },
    { name: 'BLE_CENTRAL_RSSI_CHANGED', addr: 8727, readable: null },
    { name: 'BLE_CENTRAL_RSSI_POLLING_ENABLED', addr: 8738, readable: true },
    { name: 'BLE_CENTRAL_SCANNING_ENABLED', addr: 8707, readable: true },
    { name: 'BLE_CENTRAL_SCAN_FILTER', addr: 8726, readable: true },
    { name: 'BLE_CENTRAL_SCAN_RESULTS', addr: 8708, readable: null },
    { name: 'BLE_CENTRAL_UNBOOKMARK', addr: 8713, readable: false },
    { name: 'BLE_DEVICE_ADDRESS', addr: 8710, readable: true },
    { name: 'BLE_ENABLED', addr: 8706, readable: true },
    { name: 'BLE_PERIPHERAL_DATABASE_ENTRY_UPDATED', addr: 8724, readable: null },
    { name: 'BLE_PERIPHERAL_GET_AVAILABLE_DATABASE_SLOTS', addr: 8722, readable: true },
    { name: 'BLE_PERIPHERAL_GET_DATABASE_ENTRY', addr: 8723, readable: false },
    { name: 'BLE_PERIPHERAL_PAIRING_ENABLED', addr: 8709, readable: true },
    { name: 'BLE_PERIPHERAL_RSSI_POLLING_ENABLED', addr: 8725, readable: true },
    { name: 'BOOTLOADER_ERROR_STATES', addr: 8433, readable: true },
    { name: 'BOOTLOADER_SOFTWARE_VERSION', addr: 8302, readable: true },
    { name: 'BUTTON_EVENT', addr: 8258, readable: null },
    { name: 'BUTTON_EVENTS_ENABLED', addr: 8260, readable: true, writable: true },
    { name: 'BUZZER', addr: 8840, readable: true },
    { name: 'CANCEL_CONFIGURATION_CONTAINER_DOWNLOADS', addr: 8386, readable: false },
    { name: 'CANCEL_SOFTWARE_UPDATE_DOWNLOADS', addr: 8389, readable: false },
    { name: 'COMPONENT_IDENTIFIER_READ_ERROR_INFO', addr: 8440, readable: true },
    { name: 'COMPONENT_LOCKED', addr: 8451, readable: true },
    { name: 'COMPONENT_LOCK_CONFIGURATION', addr: 8452, readable: true },
    { name: 'CONFIGURATION_CONTAINER_DOWNLOADS_FINISHED', addr: 8387, readable: true },
    { name: 'CONNECT_MODULE_AVAILABLE', addr: 8327, readable: true },
    { name: 'CONNECT_MODULE_AVAILABLE_AT_SOME_POINT', addr: 8601, readable: true },
    { name: 'CONNECT_MODULE_IN_BOOTLOADER_AVAILABLE', addr: 8328, readable: true },
    { name: 'CONNECT_MODULE_UDS_IDENTIFICATION_DATA', addr: 8425, readable: true },
    { name: 'CURRENT_GEAR_CADENCE_SETPOINT', addr: 8549, readable: true },
    { name: 'CURRENT_GEAR_OR_RATIO', addr: 8547, readable: true },
    { name: 'CURRENT_MANIFEST', addr: 8391, readable: true },
    { name: 'DESIRED_GEAR_CADENCE_SETPOINT', addr: 8550, readable: null },
    { name: 'DEVICE_AVAILABILITY', addr: 9009, readable: true },
    { name: 'DEVICE_DATABASE', addr: 9010, readable: true },
    { name: 'DOWNLOAD_CONFIGURATION_CONTAINER', addr: 8385, readable: false },
    { name: 'DOWNLOAD_SOFTWARE_UPDATE_MANIFEST', addr: 8388, readable: false },
    { name: 'DRIVE_UNIT_AVAILABLE', addr: 8321, readable: true },
    { name: 'DRIVE_UNIT_IN_BOOTLOADER_AVAILABLE', addr: 8322, readable: true },
    { name: 'DRIVE_UNIT_UDS_IDENTIFICATION_DATA', addr: 8422, readable: true },
    { name: 'ENTER_BOOTLOADER', addr: 8244, readable: false },
    { name: 'EXECUTE_FACTORY_RESET', addr: 8246, readable: false },
    { name: 'EXECUTE_INFORMATION_MANAGER_COMMAND_BOSCH', addr: 8488, readable: false },
    { name: 'EXECUTE_INFORMATION_MANAGER_COMMAND_IBD', addr: 8485, readable: false },
    { name: 'EXECUTE_INFORMATION_MANAGER_COMMAND_OEM', addr: 8486, readable: false },
    { name: 'EXECUTE_INFORMATION_MANAGER_COMMAND_SP', addr: 8487, readable: false },
    { name: 'E_SHIFT_AVAILABLE', addr: 8554, readable: true },
    { name: 'E_SHIFT_AVAILABLE_AT_SOME_POINT', addr: 8555, readable: true },
    { name: 'E_SHIFT_CAPABILITIES_FOR_RIDER', addr: 8566, readable: true },
    { name: 'GEAR_CADENCE_LIMITS', addr: 8546, readable: true },
    { name: 'GEAR_CAN_DEVICE_INFORMATION', addr: 8553, readable: true },
    { name: 'GEAR_PROPERTIES', addr: 8545, readable: true },
    { name: 'GET_DEVICE_INFORMATION', addr: 9012, readable: false },
    { name: 'HARDWARE_SOFTWARE_VERSION', addr: 8292, readable: true },
    { name: 'HARDWARE_VERSION', addr: 8291, readable: true },
    { name: 'HEAD_UNIT_AVAILABLE', addr: 8325, readable: true },
    { name: 'HEAD_UNIT_AVAILABLE_AT_SOME_POINT', addr: 8599, readable: true },
    { name: 'HEAD_UNIT_IN_BOOTLOADER_AVAILABLE', addr: 8326, readable: true },
    { name: 'HEAD_UNIT_UDS_IDENTIFICATION_DATA', addr: 8424, readable: true },
    { name: 'INSTALL_CONFIGURATION_CONTAINERS', addr: 8417, readable: false },
    { name: 'INSTALL_SOFTWARE_UPDATE', addr: 8419, readable: false },
    { name: 'INTERNAL_BATTERY_TEMPERATURE', addr: 8645, readable: true },
    { name: 'INTERNAL_BATTERY_VOLTAGE', addr: 8641, readable: true },
    { name: 'IS_SAMPLE_SOFTWARE', addr: 8304, readable: true },
    { name: 'KEY_EXCHANGE_PENDING', addr: 8334, readable: true },
    { name: 'LANGUAGE', addr: 8577, readable: true, writable: true },
    { name: 'LAST_STORED_TIME_RESET_NONCE', addr: 8231, readable: true },
    { name: 'LCD_TEST_MODE', addr: 8367, readable: true, writable: true },
    { name: 'LED_BRIGHTNESS_CONFIGURATION', addr: 8604, readable: true },
    { name: 'LED_COLORS', addr: 8354, readable: true, writable: true },
    { name: 'LED_TEST_MODE_ENABLED', addr: 8355, readable: true },
    { name: 'LOAD_CONFIGURATION_BACKUP_RECORD', addr: 8607, readable: false },
    { name: 'LOCAL_TIME_OFFSET', addr: 8227, readable: true },
    { name: 'LOGGER_CONFIG', addr: 8615, readable: true },
    { name: 'MANUFACTURING_DATE', addr: 8294, readable: true },
    { name: 'MAXIMUM_ALLOWED_U_S_B_CHARGING_POWER', addr: 8650, readable: null },
    { name: 'MAXIMUM_BATTERIES_AVAILABLE_AT_SOME_POINT', addr: 8600, readable: true },
    { name: 'OVERWRITE_SOFTWARE_UPDATE_FINALIZE_BEHAVIOUR', addr: 8432, readable: false },
    { name: 'PART_NUMBER', addr: 8290, readable: true },
    { name: 'PCB_TEMPERATURE', addr: 8646, readable: true },
    { name: 'PLAY_SOUND', addr: 8841, readable: false },
    { name: 'PRESSED_BUTTONS', addr: 8262, readable: true },
    { name: 'PRODUCTION_LINE', addr: 8296, readable: true },
    { name: 'PRODUCTION_PLANT_CODE', addr: 8295, readable: true },
    { name: 'PRODUCT_CODE', addr: 8293, readable: true },
    { name: 'PRODUCT_NAME', addr: 8303, readable: true },
    { name: 'REFRESH_SOFTWARE_INSTALLATION_COMPONENT_INFORMATION', addr: 8434, readable: false },
    { name: 'REFRESH_SOFTWARE_INSTALLATION_COMPONENT_INFORMATION_STATUS', addr: 8435, readable: true },
    { name: 'REMAINING_BRC_BATTERY_CHARGING_TIME', addr: 8649, readable: true },
    { name: 'REMOTE_CONTROL_FEATURE_PROPERTIES_RELEASE1', addr: 8449, readable: true },
    { name: 'REMOTE_CONTROL_FEATURE_PROPERTIES_RELEASE2', addr: 8456, readable: true },
    { name: 'REMOTE_CONTROL_FEATURE_PROPERTIES_RELEASE3', addr: 8457, readable: true },
    { name: 'REMOTE_CONTROL_FEATURE_PROPERTIES_RELEASE4', addr: 8458, readable: true },
    { name: 'REMOTE_CONTROL_STATIC_FEATURE_PROPERTIES', addr: 8459, readable: true },
    { name: 'REMOVE_DEVICE', addr: 9011, readable: false },
    { name: 'RESET_INACTIVITY_SHUTDOWN_TIMER', addr: 8454, readable: false },
    { name: 'ROOT_CERTIFICATE', addr: 8297, readable: true },
    { name: 'SERIAL_NUMBER', addr: 8289, readable: true },
    { name: 'SERVICE_DUE', addr: 8581, readable: true, writable: true },
    { name: 'SHIFT_CONFIGURATION', addr: 8567, readable: true },
    { name: 'SHIFT_CONFIGURATION_LIMITS', addr: 8572, readable: true },
    { name: 'SIMULATE_BUTTON_EVENT', addr: 8259, readable: false },
    { name: 'SI_LA_LED_ENABLED', addr: 8363, readable: true },
    { name: 'SOFTWARE_INSTALLATION_STATE_PRECONDITIONS_STATE', addr: 8428, readable: true },
    { name: 'SOFTWARE_INSTALLATION_STATE_REQUESTED', addr: 8427, readable: true },
    { name: 'SOFTWARE_UPDATE_AVAILABLE_FOR_INSTALLATION', addr: 8418, readable: true },
    { name: 'SOFTWARE_UPDATE_DOWNLOADS_FINISHED', addr: 8390, readable: true },
    { name: 'SOFTWARE_UPDATE_STATUS', addr: 8420, readable: true },
    { name: 'SOFTWARE_VERSION', addr: 8299, readable: true },
    { name: 'SOUNDS_VOLUME_LEVEL', addr: 8839, readable: true },
    { name: 'STORED_BOOTLOADER_ERROR_STATES', addr: 8437, readable: true },
    { name: 'STORED_COMPONENT_UNEXPECTED_RESTART_ERROR_INFO', addr: 8441, readable: true },
    { name: 'STORED_CONTAINER_ERROR_INFO', addr: 8439, readable: true },
    { name: 'STORED_SOFTWARE_UPDATE_STATUS', addr: 8436, readable: true },
    { name: 'STORED_UPDATE_STUCK_ERROR_INFO', addr: 8442, readable: true },
    { name: 'STORE_CONFIGURATION_BACKUP_RECORD', addr: 8606, readable: false },
    { name: 'SYSTEM_LOCKED', addr: 8453, readable: true },
    { name: 'SYSTEM_LOCK_FEATURE_ENABLED', addr: 8455, readable: true },
    { name: 'THIRD_PARTY_SERVICE_MODE_ACTIVE', addr: 8573, readable: true },
    { name: 'TIME', addr: 8226, readable: true, writable: true },
    { name: 'TIME_FORMAT', addr: 8579, readable: true, writable: true },
    { name: 'TIME_ZONE', addr: 8225, readable: true },
    { name: 'UNITS', addr: 8578, readable: true, writable: true },
    { name: 'UPDATE_PLAN_INFO', addr: 8438, readable: true },
    { name: 'UPLOAD_READINESS', addr: 8897, readable: true },
    { name: 'UPLOAD_RESOURCE', addr: 8899, readable: false },
    { name: 'UPLOAD_RESOURCE_METADATA', addr: 8898, readable: false },
  ],
  MobileApp: [
    { name: 'UI_PRIORITY', addr: 16513, readable: true },
    { name: 'FEATURE_STREAMING_ALERT', addr: 16514, readable: true }, // Flow decompile, confidence: high — FeatureStreamingAlertNullable | fields: alertId:int32, alertTemplate:enum, shortStrings:repeated string, longStrings:repeated string, iconIds:repeated int32, primaryButton, secondaryButton, timeout:int32
    { name: 'FEATURE_STREAMING_ALERT_RESPONSE', addr: 16515, readable: true }, // Flow decompile, confidence: high — FeatureStreamingAlertResponse | fields: alertId:int32, responseType:enum(PRIMARY_BUTTON_PRESSED,SECONDARY_BUTTON_PRESSED,TIMEOUT,UNKNOWN_ERROR,TEMPLATE_ERROR,ICON_ERROR,TEXT_ERROR)
    { name: 'FEATURE_STREAMING_OPTION_RESPONSE', addr: 16516, readable: true }, // Flow decompile, confidence: high — OptionResponse | fields: optionGroupId:int32, optionId:int32
    { name: 'ALTITUDE', addr: 16517, readable: true },
    { name: 'MAXIMUM_ALTITUDE', addr: 16518, readable: true },
    { name: 'ASCENT', addr: 16519, readable: true },
    { name: 'DESCENT', addr: 16520, readable: true },
    { name: 'STATE_OF_CHARGE', addr: 16521, readable: true },
    { name: 'ROAD_SLOPE', addr: 16522, readable: true },
    { name: 'CURRENT_COUNTRY', addr: 16523, readable: true },
    { name: 'SOFTWARE_VERSION', addr: 16529, readable: true },
    { name: 'DATA_MODEL_VERSION', addr: 16530, readable: true },
    { name: 'MESSAGE_BUS_BUSINESS_LOGIC_VERSION', addr: 16531, readable: true },
    { name: 'HEART_RATE', addr: 16532, readable: true },
    { name: 'HEART_RATE_STATUS', addr: 16533, readable: true },
    { name: 'NAVIGATION_CURRENT_STATUS', addr: 16534, readable: true },
    { name: 'NAVIGATION_DISTANCE_TO_DESTINATION', addr: 16535, readable: true },
    { name: 'NAVIGATION_ETA', addr: 16536, readable: true },
    { name: 'NAVIGATION_TIME_TO_DESTINATION', addr: 16537, readable: true },
    { name: 'ALTITUDE_GRAPH_AVAILABLE_SAMPLES', addr: 16538, readable: true },
    { name: 'GET_ALTITUDE_GRAPH', addr: 16539, readable: true }, // Flow decompile, confidence: high — AltitudeGraphRequest | fields: sampleRange:enum(ALL,PAST,CUSTOM), sampleAmount:int32, sampleAmplitude:int32, firstSampleIndex:int32, lastSampleIndex:int32
    { name: 'UPDATE_ISSUE_VISUALIZATION', addr: 16540, readable: true }, // Flow decompile, confidence: high — IssueVisualizationEvent | fields: issueId:int32, issueType:enum(IM_INFORMATION,IM_WARNING,IM_ERROR,IM_CRITICAL_ERROR), description:int32, countermeasure:int32
    { name: 'VISUALIZABLE_ISSUE_TYPES', addr: 16541, readable: true },
    { name: 'MOBILE_APP_FEATURE_PROPERTIES_RELEASE4', addr: 16543, readable: true }, // Flow decompile, confidence: high — MobileAppFeaturePropertiesRelease4 | fields: centralInformationVisibility:bool, heartRate:bool
    { name: 'LOCATION', addr: 16544, readable: true }, // Flow decompile, confidence: high — Location | fields: latitude:int32, longitude:int32, altitude:int32, speed:int32, horizontalAccuracy:int32, altitudeAccuracy:int32, speedAccuracy:int32, timestamp
    { name: 'NAVIGATION_ADVICE', addr: 16545, readable: true }, // Flow decompile, confidence: high — NavigationAdvice; confirmed by TurnInstructionAdvice.java | fields: value:string, unit:string, iconId:enum
    { name: 'SYSTEM_STATE_OF_CHARGE_FOR_RIDER_AT_DESTINATION', addr: 16546, readable: true },
    { name: 'PHONE_CHARGING', addr: 16547, readable: true },
    { name: 'USER_INFO', addr: 16548, readable: true }, // Flow decompile, confidence: high — UserInfo | fields: userId:string, displayedUserName:string
    { name: 'SPEED', addr: 16552, readable: true }, // Flow decompile, confidence: medium — GnssSpeed; no direct usage site found to pin with certainty | fields: speed:int32, speedAccuracy:int32
    { name: 'STARTUP_STAGE', addr: 16553, readable: true },
    { name: 'MOBILE_APP_STATIC_FEATURE_PROPERTIES', addr: 16554, readable: true }, // Flow decompile, confidence: high — MobileAppStaticFeatureProperties | fields: ccfWithoutReboot:bool, rangeControl:bool, speed:bool, stagedStartup:bool
    { name: 'CCF_REBOOT_REQUIRED', addr: 16555, readable: true },
  ],
  CanTestNode: [
    { name: 'BATTERY1_AVAILABLE', addr: 10257, readable: true },
    { name: 'DRIVE_UNIT_AVAILABLE', addr: 10258, readable: true },
    { name: 'REMOTE_CONTROL_AVAILABLE', addr: 10259, readable: true },
    { name: 'BATTERY2_AVAILABLE', addr: 10260, readable: true },
  ],
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ALL_ADDRESSES };
} else if (typeof window !== 'undefined') {
  window.Bes3Addresses = { ALL_ADDRESSES };
}
