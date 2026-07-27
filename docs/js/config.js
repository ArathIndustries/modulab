/**
 * Application configuration — single source for every constant the
 * transports and firmware share. The BLE UUIDs are the contract with
 * firmware/modulab_ble/modulab_ble.ino; change them in both places or not at all.
 */
export const CONFIG = {
    APP_NAME: 'modulab',
    APP_VERSION: '0.1.0',
    REPO_URL: 'https://github.com/ArathIndustries/modulab',

    SERIAL_BAUD: 9600,
    BLE_SERVICE_UUID: '6d0d0001-a11b-4c28-b8e5-0d0d1ab5e001',
    BLE_FRAME_CHAR_UUID: '6d0d0002-a11b-4c28-b8e5-0d0d1ab5e002',

    CHART_SECONDS: 12,      // strip-chart window
    UI_TEXT_HZ: 10,         // live-number DOM update rate
    CONSOLE_MAX_FRAMES: 40, // protocol console scrollback
};
