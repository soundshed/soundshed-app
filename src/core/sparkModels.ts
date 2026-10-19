// Model detection from the advertised BLE/TCP device name.
//
// This is the single source of truth for "is this a Spark 2?". The answer selects the
// protocol dialect (chunked, ack-gated preset upload and MTU-safe ATT writes), so it
// must not be re-derived ad hoc — a Spark 2 that is mistakenly treated as a Spark 40
// gets oversized unacked writes and drops its BLE link mid-upload.
//
// Other models in the family (Spark 40, MINI, GO, NEO, LIVE) all speak the original
// dialect, so they simply fall through to false.

/** Matches "Spark 2", "Spark-2" and "Spark2", but not "Spark 40" or a longer number. */
const SPARK_2_NAME = /spark[\s-]?2(?!\d)/;

export function isSpark2DeviceName(deviceName: string | null | undefined): boolean {
    if (!deviceName) return false;
    return SPARK_2_NAME.test(deviceName.toLowerCase());
}

/**
 * Number of hardware preset slots exposed by a device. Spark 2 has 8; every other
 * model in the family has 4.
 */
export function getPresetSlotsForDeviceName(deviceName: string | null | undefined): number {
    return isSpark2DeviceName(deviceName) ? 8 : 4;
}
