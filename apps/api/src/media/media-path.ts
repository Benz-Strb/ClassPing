// path ของกล้องใน MediaMTX
export const cameraPath = (cameraId: string) => `cam/${cameraId}`;
export const CAMERA_PATH = /^cam\/([0-9a-f-]{36})$/;
