#!/usr/bin/env node
// ONE-TIME pass (feature/declarative-registry): adds `ui` blocks to every address that
// currently feeds some part of the dashboard, mechanically transcribed from app.js's real
// kvRow(...)/displayOf(...) call sites — not auto-parsed (too fragile to trust for this), by
// hand from a direct audit of renderDashboard().
//
// `ui.row` is present only for entries rendered as a plain kv-grid row (candidates for the
// Phase 3 generic renderCard()); entries that feed a dedicated widget (photo, headline, SoC bar,
// cert button, tuning-detection's semantic-color block, write-experiments gating) get `ui.card`
// with NO `row` — they still count for priority-read purposes, but the generic renderer skips
// them (dedicated code keeps handling them).
//
// Known, deliberate deviation from "pure refactor": RemoteControl.PRODUCT_CODE/PRODUCT_NAME feed
// the Remote card's headline+photo today but were never priority-flagged in addresses.js (an
// oversight from when that feature was added) - tagged here too, which means they'll now read
// earlier than before. Everything else preserves today's exact priority set.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const jsonPath = path.join(root, 'src/address-registry.json');

const registry = JSON.parse(readFileSync(jsonPath, 'utf8'));
const byKey = new Map(registry.addresses.map((a) => [`${a.component}.${a.name}`, a]));

function ui(key, block) {
  const entry = byKey.get(key);
  if (!entry) throw new Error(`No registry entry for ${key} - check component/name spelling`);
  entry.ui = block;
}

// ---------- BIKE card ----------
ui('DriveUnit.OEM_BRAND_NAME', { card: 'bike', row: 10, label: 'Brand' });
ui('DriveUnit.BIKE_ID', { card: 'bike', row: 20, label: 'Bike ID' });
ui('DriveUnit.OEM_BIKE_ID', { card: 'bike', row: 30, label: 'OEM bike ID' });
ui('DriveUnit.SERIAL_NUMBER', { card: 'bike', row: 40, label: 'Serial' });
ui('DriveUnit.BIKE_CATEGORY', { card: 'bike', row: 50, label: 'Category', technical: true });
ui('DriveUnit.OEM_BIKE_MODEL_ID', { card: 'bike' }); // feeds catalog photo/headline lookup, dedicated code
ui('DriveUnit.PRODUCT_NAME', { card: 'bike' }); // bikeName fallback text, dedicated code

// ---------- BATTERY card ----------
ui('Battery.PRODUCT_NAME', { card: 'battery' }); // headline text, dedicated code
ui('Battery.PRODUCT_CODE', { card: 'battery', row: 10, label: 'Product code' });
ui('Battery.DEVICE_CERTIFICATE', { card: 'battery' }); // gates cert button, dedicated code
ui('Battery.STATE_OF_CHARGE', { card: 'battery' }); // SoC bar widget, dedicated code
ui('Battery.STATE_OF_HEALTH', { card: 'battery' }); // stats widget, dedicated code
ui('Battery.NUMBER_OF_FULL_CHARGE_CYCLES', { card: 'battery' });
ui('Battery.REMAINING_ENERGY', { card: 'battery' });
ui('Battery.PRESENT_PACK_TEMPERATURE', { card: 'battery' });
ui('Battery.DELIVERED_AH_OVER_LIFETIME', { card: 'battery', row: 20, label: 'Delivered Ah (lifetime)' });
ui('Battery.DELIVERED_WH_OVER_LIFETIME', { card: 'battery', row: 30, label: 'Delivered Wh (lifetime)' });
ui('Battery.DURATION_IN_THERMAL_PROTECTION', { card: 'battery', row: 40, label: 'Thermal protection' });
ui('Battery.PRESENT_CELL_VOLTAGE', { card: 'battery', row: 50, label: 'Present cell voltage' });
ui('Battery.PRESENT_FET_TEMPERATURE', { card: 'battery', row: 60, label: 'Present FET temp' });
ui('Battery.MINIMUM_PACK_TEMPERATURE', { card: 'battery', row: 70, label: 'Min pack temp' });
ui('Battery.MAXIMUM_PACK_TEMPERATURE', { card: 'battery', row: 80, label: 'Max pack temp' });
ui('Battery.LAST_END_OF_CHARGE_VOLTAGE', { card: 'battery', row: 90, label: 'Last end-of-charge V' });
ui('Battery.MAXIMUM_CHARGING_CURRENT', { card: 'battery', row: 100, label: 'Max charging current' });
ui('Battery.SELF_DISCHARGING_RATE', { card: 'battery', row: 110, label: 'Self-discharge rate' });
ui('Battery.SO_C_LOWER_LIMIT', {
  card: 'battery', row: 120, label: 'SoC limits', writable: true,
  formatter: 'socRange', combinesWith: ['SO_C_UPPER_LIMIT'],
});
ui('Battery.SO_C_UPPER_LIMIT', { card: 'battery' }); // absorbed into SO_C_LOWER_LIMIT's row
ui('Battery.COMPONENT_DEACTIVATION_PROOF', { card: 'battery', row: 130, label: 'Deactivation' });

// ---------- DRIVE UNIT card ----------
ui('DriveUnit.PRODUCT_LINE', { card: 'driveUnit' }); // headline text, dedicated code
ui('DriveUnit.PRODUCT_CODE', { card: 'driveUnit', row: 10, label: 'Product code' });
ui('DriveUnit.PART_NUMBER', { card: 'driveUnit', row: 20, label: 'Part number' });
ui('DriveUnit.HARDWARE_VERSION', { card: 'driveUnit', row: 30, label: 'Hardware' });
ui('DriveUnit.SOFTWARE_VERSION', { card: 'driveUnit', row: 40, label: 'Software' });
ui('DriveUnit.BOOTLOADER_SOFTWARE_VERSION', { card: 'driveUnit', row: 50, label: 'Bootloader' });
ui('DriveUnit.MANUFACTURING_DATE', { card: 'driveUnit', row: 60, label: 'Manufacturing date' });
ui('DriveUnit.PRESENT_PCB_TEMPERATURE', { card: 'driveUnit', row: 70, label: 'PCB temp' });

// ---------- DRIVETRAIN card ----------
ui('DriveUnit.GEARING_SYSTEM', { card: 'drivetrain', row: 10, label: 'Gearing' });
ui('DriveUnit.MAXIMUM_LEGAL_BIKE_SPEED', { card: 'drivetrain', row: 20, label: 'Max legal speed' });
ui('DriveUnit.MAXIMUM_ASSISTANCE_SPEED', { card: 'drivetrain', row: 30, label: 'Max assist speed' });
ui('DriveUnit.REAR_WHEEL_CIRCUMFERENCE_OEM', { card: 'drivetrain', row: 40, label: 'Wheel circ. (OEM)' });
ui('DriveUnit.REAR_WHEEL_CIRCUMFERENCE_USER', { card: 'drivetrain', row: 50, label: 'Wheel circ. (user)' });
ui('DriveUnit.MAXIMUM_AVAILABLE_MOTOR_TORQUE', { card: 'drivetrain', row: 60, label: 'Max motor torque' });
ui('DriveUnit.BIKE_LIGHT', { card: 'drivetrain', row: 70, label: 'Light', writable: true });
ui('DriveUnit.BIKE_LIGHT_AVAILABLE', { card: 'drivetrain', row: 80, label: 'Light available', writable: true });
ui('DriveUnit.REGIO_SPEED_CONFIGURATION', { card: 'drivetrain', row: 90, label: 'Region / speed class', technical: true });
ui('DriveUnit.START_ASSIST_MODE_CONFIGURATION', { card: 'drivetrain', row: 100, label: 'Start mode', technical: true });
ui('DriveUnit.TUNING_DETECTION', { card: 'drivetrain' }); // custom flag+counter -> semantic-color block, dedicated code
ui('DriveUnit.DISTRACTED_RIDING_ALERT', { card: 'drivetrain' }); // semantic-color block, dedicated code
ui('DriveUnit.START_ASSIST_MODE_CONFIGURATION_OEM', { card: 'drivetrain' }); // write-experiments gating only, dedicated code

// ---------- USAGE card (stays fully hand-written per plan - interleaved computed rows) ----------
ui('DriveUnit.ODOMETER', { card: 'usage' });
ui('DriveUnit.POWER_ON_TIME', { card: 'usage' });
ui('DriveUnit.POWER_ON_TIME_WITH_MOTOR_SUPPORT', { card: 'usage' });

// ---------- REMOTE card ----------
// PRODUCT_CODE/PRODUCT_NAME: deliberate fix, see file header note - not in today's priority set.
ui('RemoteControl.PRODUCT_NAME', { card: 'remote' });
ui('RemoteControl.PRODUCT_CODE', { card: 'remote', row: 10, label: 'Product code' });
ui('RemoteControl.BIKE_NAME', { card: 'remote', row: 20, label: 'Bike name' });
ui('RemoteControl.LANGUAGE', { card: 'remote', row: 30, label: 'Language', writable: true });
ui('RemoteControl.UNITS', { card: 'remote', row: 40, label: 'Units', writable: true, technical: true });
ui('RemoteControl.TIME_FORMAT', { card: 'remote', row: 50, label: 'Time format', writable: true, technical: true });
ui('RemoteControl.TIME', { card: 'remote', row: 60, label: 'Time (bike clock)', writable: true });
ui('RemoteControl.LED_COLORS', { card: 'remote', row: 70, label: 'LED colors', writable: true });
ui('RemoteControl.SERVICE_DUE', { card: 'remote', row: 80, label: 'Service due', writable: true });

writeFileSync(jsonPath, JSON.stringify(registry, null, 2) + '\n');
const tagged = registry.addresses.filter((a) => a.ui).length;
const withRow = registry.addresses.filter((a) => a.ui && a.ui.row !== undefined).length;
console.log(`Tagged ${tagged} addresses with a ui block (${withRow} with a row, ${tagged - withRow} widget-only).`);
