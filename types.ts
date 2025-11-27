export interface Clip {
  id: string;
  name: string;
  url: string;
  duration: number; // Total duration of source
  start: number;    // Start time within source
  end: number;      // End time within source
  offset: number;   // Start time on timeline
  track: number;    // Track index
  type: 'video' | 'audio';
}

export interface Track {
  id: number;
  name: string;
  type: 'video' | 'audio';
  isMuted: boolean;
  isLocked: boolean;
}

export interface ProjectState {
  clips: Clip[];
  tracks: Track[];
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  selectedClipId: string | null;
  zoom: number; // Pixels per second
  width: number; // Project Resolution Width
  height: number; // Project Resolution Height
}

export interface GeminiAnalysis {
  title: string;
  description: string;
  tags: string[];
}