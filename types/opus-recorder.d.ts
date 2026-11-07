// Minimal typings for opus-recorder (no bundled types). Records the microphone
// straight to OGG/Opus in the browser via a WASM worker — the format WhatsApp
// requires for a voice note, on every browser (MediaRecorder only gives WebM in
// Chrome and MP4 in Safari).
declare module "opus-recorder" {
  interface RecorderConfig {
    encoderPath?: string;
    encoderApplication?: 2048 | 2049 | 2051;
    encoderSampleRate?: 8000 | 12000 | 16000 | 24000 | 48000;
    encoderBitRate?: number;
    numberOfChannels?: 1 | 2;
    streamPages?: boolean;
    mediaTrackConstraints?: MediaTrackConstraints | boolean;
  }
  export default class Recorder {
    constructor(config?: RecorderConfig);
    static isRecordingSupported(): boolean;
    start(): Promise<void>;
    stop(): Promise<void>;
    close(): Promise<void>;
    encodedSamplePosition: number;
    ondataavailable: (data: Uint8Array) => void;
    onstart: () => void;
    onstop: () => void;
  }
}
