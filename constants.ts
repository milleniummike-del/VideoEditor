

export const TIMELINE_HEIGHT = 200;
export const TRACK_HEIGHT = 80;
export const PIXELS_PER_SECOND_DEFAULT = 20;
export const DEFAULT_FPS = 25;

export const RESOLUTIONS = [
  { name: 'Landscape (1080p)', width: 1920, height: 1080 },
  { name: 'Portrait (1080p)', width: 1080, height: 1920 },
  { name: 'Square (1:1)', width: 1080, height: 1080 },
  { name: 'Landscape (720p)', width: 1280, height: 720 },
  { name: 'Cinema (21:9)', width: 2560, height: 1080 },
];

export const FRAME_RATES = [24, 25, 30, 50, 60];

export const STOCK_CLIPS: { name: string; url: string; duration: number }[] = [];

export const INITIAL_TRACKS = [
  { id: 0, name: "Video Track 1", type: "video" as const, isMuted: false, isLocked: false },
  { id: 1, name: "Audio Track 1", type: "audio" as const, isMuted: false, isLocked: false },
  { id: 2, name: "Text Track", type: "text" as const, isMuted: false, isLocked: false },
];