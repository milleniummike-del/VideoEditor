
export interface LibraryClip {
  name: string;
  url: string;
  duration: number;
  type: 'video' | 'audio';
}

export interface Clip {
  id: string;
  name: string;
  url: string;
  duration: number; // Total duration of source
  start: number;    // Start time within source
  end: number;      // End time within source
  offset: number;   // Start time on timeline
  track: number;    // Track index
  type: 'video' | 'audio' | 'text';
  fadeIn?: number;  // Duration in seconds
  fadeOut?: number; // Duration in seconds
  // Text specific properties
  textContent?: string;
  fontSize?: number;
  fontColor?: string;
  x?: number;
  y?: number;
}

export interface Track {
  id: number;
  name: string;
  type: 'video' | 'audio' | 'text';
  isMuted: boolean;
  isLocked: boolean;
}

export interface ProjectState {
  name?: string;
  library: LibraryClip[];
  clips: Clip[];
  tracks: Track[];
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  isLooping: boolean; // Added loop state
  inPoint: number | null; // Added In Marker
  outPoint: number | null; // Added Out Marker
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
