import { useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Play, Pause, SkipForward, SkipBack, AlertTriangle, Volume2, VolumeX } from "lucide-react";

interface VideoResults {
  success: boolean;
  s3_key: string;
  annotated_s3_key: string;  // NEW
  original_video_url: string;  // NEW
  annotated_video_url: string;  // NEW
  processing_params: {
    frame_interval: number;
  };
  results: {
    video_info: {
      total_frames: number;
      fps: number;
      duration: number;
      processed_frames: number;
    };
    detection_summary: {
      frames_with_damage: number;
      total_detections: number;
      damage_percentage: number;
    };
    frame_results: Array<{
      frame_number: number;
      timestamp: number;
      detections: Array<{
        class: number;
        confidence: number;
        bbox: [number, number, number, number];
      }>;
      detection_count: number;
    }>;
  };
}

interface VideoResultsViewerProps {
  videoResults: VideoResults;
}

export const VideoResultsViewer = ({ videoResults }: VideoResultsViewerProps) => {
  const [currentTimestamp, setCurrentTimestamp] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  // Video refs for synchronization
  const originalVideoRef = useRef<HTMLVideoElement>(null);
  const annotatedVideoRef = useRef<HTMLVideoElement>(null);

  // Destructure the nested results structure safely
  const { results } = videoResults || {};
  const {
    video_info = {} as any,
    detection_summary = {} as any,
    frame_results = [] as any[]
  } = results || {};

  // Sync video playback
  useEffect(() => {
    if (originalVideoRef.current && annotatedVideoRef.current) {
      const originalVideo = originalVideoRef.current;
      const annotatedVideo = annotatedVideoRef.current;

      // Set both videos to current timestamp
      originalVideo.currentTime = currentTimestamp;
      annotatedVideo.currentTime = currentTimestamp;

      // Sync play/pause state
      if (isPlaying) {
        originalVideo.play();
        annotatedVideo.play();
      } else {
        originalVideo.pause();
        annotatedVideo.pause();
      }
    }
  }, [currentTimestamp, isPlaying]);

  // Handle video time updates
  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    setCurrentTimestamp(video.currentTime);

    // Sync the other video
    if (video === originalVideoRef.current && annotatedVideoRef.current) {
      annotatedVideoRef.current.currentTime = video.currentTime;
    } else if (video === annotatedVideoRef.current && originalVideoRef.current) {
      originalVideoRef.current.currentTime = video.currentTime;
    }
  };

  // Toggle play/pause for both videos
  const togglePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  // Get frame at current timestamp
  const getCurrentFrame = () => {
    if (!frame_results || frame_results.length === 0) return null;
    return frame_results.find(frame =>
      Math.abs(frame.timestamp - currentTimestamp) < 0.5
    );
  };

  const jumpToNextDamage = () => {
    if (!frame_results || frame_results.length === 0) return;
    const nextDamageFrame = frame_results.find(frame =>
      frame.timestamp > currentTimestamp && frame.detection_count > 0
    );
    if (nextDamageFrame) {
      setCurrentTimestamp(nextDamageFrame.timestamp);
    }
  };

  const jumpToPreviousDamage = () => {
    if (!frame_results || frame_results.length === 0) return;
    const previousDamageFrame = [...frame_results]
      .reverse()
      .find(frame =>
        frame.timestamp < currentTimestamp && frame.detection_count > 0
      );
    if (previousDamageFrame) {
      setCurrentTimestamp(previousDamageFrame.timestamp);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getHailSize = (classId: number) => {
    const sizes = ['Pea', 'Marble', 'Quarter', 'Half Dollar', 'Ping Pong', 'Golf Ball', 'Tennis Ball', 'Baseball'];
    return sizes[classId] || 'Unknown';
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (originalVideoRef.current && annotatedVideoRef.current) {
      originalVideoRef.current.muted = !isMuted;
      annotatedVideoRef.current.muted = true; // Keep annotated video always muted
    }
  };

  const currentFrame = getCurrentFrame();

  return (
    <div className="space-y-8">
      {/* Summary Stats */}
      <Card className="p-6">
        <h3 className="text-2xl font-bold mb-6 text-gradient">Analysis Results</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-vibranium">{detection_summary.damage_percentage?.toFixed(1) || '0'}%</div>
            <div className="text-sm text-muted-foreground">Video with Damage</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-vibranium">{detection_summary.frames_with_damage || 0}</div>
            <div className="text-sm text-muted-foreground">Frames with Damage</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-vibranium">{detection_summary.total_detections || 0}</div>
            <div className="text-sm text-muted-foreground">Total Detections</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-vibranium">{formatTime(video_info.duration || 0)}</div>
            <div className="text-sm text-muted-foreground">Video Duration</div>
          </div>
        </div>
      </Card>

      {/* Side-by-Side Video Display */}
      <Card className="p-6">
        <h4 className="text-xl font-semibold mb-4">Video Comparison</h4>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Original Video */}
          <div className="space-y-2">
            <h5 className="font-medium text-sm text-muted-foreground">Original Video</h5>
            <div className="relative bg-black rounded-lg overflow-hidden">
              <video
                ref={originalVideoRef}
                src={videoResults.original_video_url}
                className="w-full h-auto"
                onTimeUpdate={handleTimeUpdate}
                muted={isMuted}
                playsInline
              />
            </div>
          </div>

          {/* Annotated Video with Detections */}
          <div className="space-y-2">
            <h5 className="font-medium text-sm text-muted-foreground">Detected Hail Damage</h5>
            <div className="relative bg-black rounded-lg overflow-hidden">
              <video
                ref={annotatedVideoRef}
                src={videoResults.annotated_video_url}
                className="w-full h-auto"
                onTimeUpdate={handleTimeUpdate}
                muted={true} // Always muted to avoid audio overlap
                playsInline
              />
            </div>
          </div>
        </div>

        {/* Synchronized Controls */}
        <div className="space-y-4">
          <div className="relative">
            <Slider
              value={[currentTimestamp]}
              onValueChange={(value) => setCurrentTimestamp(value[0])}
              max={video_info.duration || 100}
              step={0.1}
              className="w-full"
            />
            {/* Damage markers on timeline */}
            <div className="absolute top-0 w-full h-6 pointer-events-none">
              {frame_results && frame_results.map((frame, index) => (
                frame.detection_count > 0 && (
                  <div
                    key={index}
                    className="absolute top-0 w-1 h-6 bg-destructive"
                    style={{
                      left: `${(frame.timestamp / (video_info.duration || 1)) * 100}%`
                    }}
                  />
                )
              ))}
            </div>
          </div>

          {/* Playback Controls */}
          <div className="flex items-center justify-center space-x-4">
            <Button
              variant="outline"
              size="sm"
              onClick={jumpToPreviousDamage}
            >
              <SkipBack className="h-4 w-4" />
              Previous Damage
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={togglePlayPause}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {isPlaying ? 'Pause' : 'Play'}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={toggleMute}
            >
              {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={jumpToNextDamage}
            >
              Next Damage
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>

          {/* Current timestamp */}
          <div className="text-center text-sm text-muted-foreground">
            {formatTime(currentTimestamp)} / {formatTime(video_info.duration || 0)}
          </div>
        </div>
      </Card>

      {/* Current Frame Details */}
      {currentFrame && (
        <Card className="p-6">
          <h4 className="text-xl font-semibold mb-4 flex items-center">
            <AlertTriangle className="h-5 w-5 text-destructive mr-2" />
            Frame Analysis - {formatTime(currentFrame.timestamp)}
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h5 className="font-semibold mb-2">Detection Summary</h5>
              <p className="text-sm text-muted-foreground mb-4">
                Found {currentFrame.detection_count} hail damage area(s) in this frame
              </p>
              <div className="space-y-2">
                {currentFrame.detections.map((detection, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                    <div className="flex items-center space-x-2">
                      <Badge variant="destructive">{getHailSize(detection.class)}</Badge>
                      <span className="text-sm">
                        {(detection.confidence * 100).toFixed(0)}% confidence
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      [{detection.bbox.map(b => Math.round(b)).join(', ')}]
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h5 className="font-semibold mb-2">Frame Info</h5>
              <div className="space-y-1 text-sm">
                <p><span className="font-medium">Frame:</span> {currentFrame.frame_number} / {video_info.total_frames || 0}</p>
                <p><span className="font-medium">Timestamp:</span> {formatTime(currentFrame.timestamp)}</p>
                <p><span className="font-medium">Detections:</span> {currentFrame.detection_count}</p>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* All Damaged Frames List */}
      <Card className="p-6">
        <h4 className="text-xl font-semibold mb-4">All Damaged Frames ({detection_summary.frames_with_damage || 0})</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-64 overflow-y-auto">
          {frame_results && frame_results
            .filter(frame => frame.detection_count > 0)
            .map((frame, index) => (
              <Button
                key={index}
                variant="outline"
                className="p-4 h-auto flex flex-col items-start space-y-2"
                onClick={() => setCurrentTimestamp(frame.timestamp)}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-medium">{formatTime(frame.timestamp)}</span>
                  <Badge variant="destructive">{frame.detection_count}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  Frame {frame.frame_number}
                </div>
              </Button>
            ))}
        </div>
      </Card>
    </div>
  );
};
