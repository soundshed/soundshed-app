export type SparkModelId = "spark-40" | "spark-mini" | "spark-go" | "spark-neo" | "spark-2";

export interface SparkModelProfile {
    id: SparkModelId;
    displayName: string;
    bleName: string;
    bleServiceUuid: string;
    bleCommandCharacteristicUuid: string;
    bleNotifyCharacteristicUuid: string;
    presetSlots: number;
    uploadChunkAckCmd: number;
    uploadFinalAckCmd: number;
    supportsLiveSync: boolean;
}

export const SPARK_MODEL_PROFILES: Record<SparkModelId, SparkModelProfile> = {
    "spark-40": {
        id: "spark-40",
        displayName: "Spark 40",
        bleName: "Spark 40 BLE",
        bleServiceUuid: "ffc0",
        bleCommandCharacteristicUuid: "ffc1",
        bleNotifyCharacteristicUuid: "ffc2",
        presetSlots: 4,
        uploadChunkAckCmd: 0x04,
        uploadFinalAckCmd: 0x04,
        supportsLiveSync: false
    },
    "spark-mini": {
        id: "spark-mini",
        displayName: "Spark MINI",
        bleName: "Spark MINI BLE",
        bleServiceUuid: "ffc0",
        bleCommandCharacteristicUuid: "ffc1",
        bleNotifyCharacteristicUuid: "ffc2",
        presetSlots: 4,
        uploadChunkAckCmd: 0x04,
        uploadFinalAckCmd: 0x04,
        supportsLiveSync: false
    },
    "spark-go": {
        id: "spark-go",
        displayName: "Spark GO",
        bleName: "Spark GO BLE",
        bleServiceUuid: "ffc0",
        bleCommandCharacteristicUuid: "ffc1",
        bleNotifyCharacteristicUuid: "ffc2",
        presetSlots: 4,
        uploadChunkAckCmd: 0x04,
        uploadFinalAckCmd: 0x04,
        supportsLiveSync: false
    },
    "spark-neo": {
        id: "spark-neo",
        displayName: "Spark NEO",
        bleName: "Spark NEO BLE",
        bleServiceUuid: "ffc0",
        bleCommandCharacteristicUuid: "ffc1",
        bleNotifyCharacteristicUuid: "ffc2",
        presetSlots: 4,
        uploadChunkAckCmd: 0x04,
        uploadFinalAckCmd: 0x04,
        supportsLiveSync: false
    },
    "spark-2": {
        id: "spark-2",
        displayName: "Spark 2",
        bleName: "Spark 2 BLE",
        bleServiceUuid: "ffc8",
        bleCommandCharacteristicUuid: "ffc9",
        bleNotifyCharacteristicUuid: "ffca",
        presetSlots: 8,
        uploadChunkAckCmd: 0x05,
        uploadFinalAckCmd: 0x04,
        supportsLiveSync: true
    }
};

export function getModelProfile(modelId: string): SparkModelProfile {
    if (!Object.prototype.hasOwnProperty.call(SPARK_MODEL_PROFILES, modelId)) {
        throw new Error(`Unknown model '${modelId}'. Supported models: ${Object.keys(SPARK_MODEL_PROFILES).join(", ")}`);
    }

    return SPARK_MODEL_PROFILES[modelId as SparkModelId];
}
