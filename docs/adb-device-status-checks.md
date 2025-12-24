# ADB Device Status Commands - Check Power State & Current Activity

## Overview

Use ADB commands to check:
1. **Screen State** - Is the TV actually on (not in doze/idle mode)?
2. **Current Activity** - Is Plex currently running in the foreground?

Home Assistant's `adb_command` service sets `adb_output` with the command output, allowing you to parse responses and determine actual device state without relying on HA's slow state updates.

## Check Screen/Power State

### Best Method: mWakefulness (Most Reliable)

```bash
adb shell dumpsys power | grep mWakefulness=
```

**Response**:
- `mWakefulness=Awake` → Screen **ON**
- `mWakefulness=Dozing` → Screen **OFF** (in idle/sleep)

**Why this works**: Works reliably across Android versions including when Home Assistant puts the device in sleep mode after power button press.

### Alternative Method: mHoldingDisplaySuspendBlocker

```bash
adb shell dumpsys power | grep mHoldingDisplaySuspendBlocker
```

**Response**:
- `mHoldingDisplaySuspendBlocker=true` → Screen **ON**
- `mHoldingDisplaySuspendBlocker=false` → Screen **OFF**

## Check Current Activity

### Best Method: mCurrentFocus (Simplest)

```bash
adb shell dumpsys window windows | grep mCurrentFocus=
```

**Response** (example):
```
mCurrentFocus=Window{abc123def u0 com.plexapp.android/com.plexapp.activities.MainActivity}
```

Extract package name: `com.plexapp.android`

### Alternative Method: ResumedActivity (For Android 10+)

```bash
adb shell dumpsys activity activities | grep ResumedActivity
```

**Response** (example):
```
mResumedActivity=ActivityRecord{abc123 u0 com.plexapp.android/com.plexapp.activities.MainActivity}
```

## TypeScript Implementation

### Check if Screen is On

```typescript
const checkScreenPower = async (
  haConn: Connection,
  entityId: string
): Promise<boolean> => {
  try {
    const result = await callService(
      haConn,
      'androidtv',
      'adb_command',
      {
        command: 'dumpsys power | grep mWakefulness='
      },
      {
        entity_id: entityId
      }
    );

    // Parse adb_output from the result
    const output = result.adb_output || '';
    
    // Check if screen is awake
    if (output.includes('mWakefulness=Awake')) {
      return true;
    } else if (output.includes('mWakefulness=Dozing')) {
      return false;
    }
    
    // If unable to determine, return null/false
    console.warn('Unable to determine screen state:', output);
    return false;
  } catch (err) {
    console.error('Failed to check screen power:', err.message);
    return false;
  }
};
```

**Usage**:
```typescript
const isOn = await checkScreenPower(haConn, 'media_player.living_room_tv');
if (isOn) {
  console.log('✓ TV is on');
} else {
  console.log('✗ TV is off, turning on...');
  await turnOnTV(haConn, 'media_player.living_room_tv');
}
```

### Check if Plex is Current Activity

```typescript
interface ActivityCheckResult {
  isPlexRunning: boolean;
  packageName: string;
  activityName: string;
}

const checkCurrentActivity = async (
  haConn: Connection,
  entityId: string
): Promise<ActivityCheckResult> => {
  try {
    const result = await callService(
      haConn,
      'androidtv',
      'adb_command',
      {
        command: 'dumpsys window windows | grep mCurrentFocus='
      },
      {
        entity_id: entityId
      }
    );

    const output = result.adb_output || '';
    
    // Parse: mCurrentFocus=Window{... u0 com.plexapp.android/com.plexapp.activities.MainActivity}
    const focusMatch = output.match(
      /mCurrentFocus=Window\{[^}]*\s+u0\s+([^/]+)\/([^\}]+)\}/
    );

    if (!focusMatch) {
      console.warn('Could not parse activity:', output);
      return {
        isPlexRunning: false,
        packageName: '',
        activityName: ''
      };
    }

    const packageName = focusMatch[1];
    const activityName = focusMatch[2];
    const isPlexRunning = packageName === 'com.plexapp.android';

    return {
      isPlexRunning,
      packageName,
      activityName
    };
  } catch (err) {
    console.error('Failed to check current activity:', err.message);
    return {
      isPlexRunning: false,
      packageName: '',
      activityName: ''
    };
  }
};
```

**Usage**:
```typescript
const activity = await checkCurrentActivity(haConn, 'media_player.living_room_tv');

if (activity.isPlexRunning) {
  console.log(`✓ Plex is running: ${activity.activityName}`);
} else {
  console.log(`✗ Current app is: ${activity.packageName}`);
  console.log('  Need to launch Plex...');
}
```

## Combined Power & Activity Check

```typescript
interface DeviceStateCheck {
  screenOn: boolean;
  plexRunning: boolean;
  currentPackage: string;
  needsTurnOn: boolean;
  needsPlexLaunch: boolean;
}

const checkDeviceState = async (
  haConn: Connection,
  entityId: string
): Promise<DeviceStateCheck> => {
  const screenOn = await checkScreenPower(haConn, entityId);
  const activity = await checkCurrentActivity(haConn, entityId);

  return {
    screenOn,
    plexRunning: activity.isPlexRunning,
    currentPackage: activity.packageName,
    needsTurnOn: !screenOn,
    needsPlexLaunch: screenOn && !activity.isPlexRunning
  };
};

// Usage in playback flow:
const state = await checkDeviceState(haConn, 'media_player.living_room_tv');

if (state.needsTurnOn) {
  console.log('Turning on TV...');
  await turnOnDevice(haConn, 'media_player.living_room_tv');
  
  // Wait for device to wake
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Check again
  const newState = await checkDeviceState(haConn, 'media_player.living_room_tv');
  if (!newState.screenOn) {
    throw new Error('TV failed to turn on');
  }
}

if (state.needsPlexLaunch || state.needsTurnOn) {
  console.log('Launching Plex...');
  await launchPlex(haConn, 'media_player.living_room_tv');
  
  // Wait for app to launch
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // Verify Plex is now running
  const finalState = await checkDeviceState(haConn, 'media_player.living_room_tv');
  if (!finalState.plexRunning) {
    throw new Error('Failed to launch Plex');
  }
}

console.log('✓ Device ready, playing media...');
await playMediaViaHomeAssistant(haConn, deviceConfig, media);
```

## Integrating into playPlexMedia

Update the main function to check state before playing:

```typescript
const playPlexMedia = async (
  locationId: string,
  mediaQuery: string,
  options?: PlayOptions
): Promise<PlayPlexResult> => {
  // ... existing search/rank logic ...

  const deviceConfig = toolConfig.deviceMapping[locationId];

  // =========== NEW STEP: Check Device State ===========
  console.log(`Checking device state for ${deviceConfig.deviceName}...`);
  const deviceState = await checkDeviceState(
    toolConfig.haConn,
    deviceConfig.haEntityId
  );

  // Turn on if needed
  if (deviceState.needsTurnOn) {
    console.log(`${deviceConfig.deviceName} is off, turning on...`);
    await callService(
      toolConfig.haConn,
      'androidtv',
      'adb_command',
      { command: 'input keyevent 224' },  // Wake/power on
      { entity_id: deviceConfig.haEntityId }
    );

    // Wait and verify
    await new Promise(resolve => setTimeout(resolve, 2000));
    const verifyState = await checkScreenPower(
      toolConfig.haConn,
      deviceConfig.haEntityId
    );
    
    if (!verifyState) {
      const error = new Error(
        `Failed to turn on ${deviceConfig.deviceName}`
      ) as PlayPlexError;
      error.code = 'DEVICE_POWER_FAILED';
      throw error;
    }
  }

  // Launch Plex if needed
  if (!deviceState.plexRunning) {
    console.log(`Launching Plex on ${deviceConfig.deviceName}...`);
    await callService(
      toolConfig.haConn,
      'androidtv',
      'adb_command',
      {
        command: 'am start -n com.plexapp.android/.MainActivity'
      },
      { entity_id: deviceConfig.haEntityId }
    );

    // Wait for app launch
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Verify
    const activity = await checkCurrentActivity(
      toolConfig.haConn,
      deviceConfig.haEntityId
    );

    if (!activity.isPlexRunning) {
      const error = new Error(
        `Failed to launch Plex on ${deviceConfig.deviceName}`
      ) as PlayPlexError;
      error.code = 'PLEX_LAUNCH_FAILED';
      throw error;
    }
  }

  // =========== STEP: Play Media ===========
  if (autoPlay) {
    try {
      await playMediaViaHomeAssistant(
        toolConfig.haConn,
        deviceConfig,
        bestMatch,
        {
          useResume: useResumeFeature && !options?.forceNewFromBeginning,
          offsetSeconds: options?.specificOffset
        }
      );
    } catch (err) {
      // ... error handling ...
    }
  }

  return {
    success: true,
    mediaTitle: bestMatch.title,
    mediaType: bestMatch.type === 'movie' ? 'movie' : 'show',
    deviceName: deviceConfig.deviceName,
    plexAppLaunched: true,
    message: `Playing "${bestMatch.title}" on ${deviceConfig.deviceName}`
  };
};
```

## ADB Wake Commands

```bash
# Turn screen ON (wake from sleep)
adb shell input keyevent 224

# Turn screen OFF (sleep/lock)
adb shell input keyevent 223

# Wake AND unlock
adb shell input keyevent 82  # KEYCODE_MENU (acts like unlock on some devices)
```

## Error Handling Patterns

```typescript
interface DeviceCheckOptions {
  maxRetries?: number;
  retryDelayMs?: number;
}

const waitForScreenOn = async (
  haConn: Connection,
  entityId: string,
  options?: DeviceCheckOptions
): Promise<boolean> => {
  const maxRetries = options?.maxRetries ?? 5;
  const retryDelayMs = options?.retryDelayMs ?? 1000;

  for (let i = 0; i < maxRetries; i++) {
    const isOn = await checkScreenPower(haConn, entityId);
    if (isOn) return true;

    console.log(`Waiting for screen... (attempt ${i + 1}/${maxRetries})`);
    await new Promise(resolve => setTimeout(resolve, retryDelayMs));
  }

  return false;
};

// Usage:
try {
  const screenOn = await waitForScreenOn(haConn, entityId, {
    maxRetries: 10,
    retryDelayMs: 500
  });

  if (!screenOn) {
    throw new Error('Device failed to wake after 5 seconds');
  }
} catch (err) {
  voiceAssistant.speak(
    `I tried to turn on the device but it didn't respond. ` +
    `Is it unplugged or broken?`
  );
}
```

## Testing Commands

Run these directly to test on your device:

```bash
# Check screen state
adb shell dumpsys power | grep mWakefulness=

# Check current activity
adb shell dumpsys window windows | grep mCurrentFocus=

# Parse just the activity package
adb shell dumpsys window windows | grep mCurrentFocus | grep -oP 'com\.\w+\.\w+'

# Turn device on
adb shell input keyevent 224

# Launch Plex and verify
adb shell am start -n com.plexapp.android/.MainActivity && sleep 2 && adb shell dumpsys window windows | grep mCurrentFocus=
```

## Notes

- **Timing**: ADB commands execute quickly (~100-300ms each), but device responses may lag
- **Parsing**: Regex patterns are Android version dependent; use multiple patterns if needed
- **Reliability**: `mWakefulness` is more reliable than `mHoldingDisplaySuspendBlocker` across Android versions
- **Home Assistant Delays**: Direct ADB checks are **much faster** than waiting for HA state updates (which can take 10+ seconds)
