import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Upload, Video, X, Zap, Play, Pause } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { VideoResultsViewer } from "./VideoResultsViewer";

interface UploadedVideo {
  file: File;
  id: string;
}

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

export const VideoUploadSection = () => {
  const [uploadedVideos, setUploadedVideos] = useState<UploadedVideo[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [videoResults, setVideoResults] = useState<VideoResults | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleVideoSelect = (files: FileList | null) => {
    if (!files) return;
    const newVideos: UploadedVideo[] = [];

    Array.from(files).forEach((file) => {
      const isVideo = file.type.startsWith('video/');
      const allowedTypes = ['video/mp4', 'video/avi', 'video/mov', 'video/mkv', 'video/webm'];

      if (!isVideo || !allowedTypes.some(type => file.type === type || file.name.toLowerCase().endsWith(type.split('/')[1]))) {
        toast({
          title: "Invalid file type",
          description: "Please upload only MP4, AVI, MOV, MKV, or WebM video files",
          variant: "destructive"
        });
        return;
      }
      if (file.size > 500 * 1024 * 1024) { // 500MB limit
        toast({
          title: "File too large",
          description: "Video files must be under 500MB",
          variant: "destructive"
        });
        return;
      }
      const uploadedVideo: UploadedVideo = {
        file,
        id: Math.random().toString(36).substr(2, 9)
      };
      newVideos.push(uploadedVideo);
    });
    if (newVideos.length > 0) {
      setUploadedVideos(prev => [...prev, ...newVideos]);
      toast({
        title: "Videos uploaded successfully",
        description: `${newVideos.length} video(s) ready for processing`
      });
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleVideoSelect(e.dataTransfer.files);
  };

  const removeVideo = (id: string) => {
    setUploadedVideos(prev => prev.filter(v => v.id !== id));
  };

  const getPresignedUrl = async (videoFile: File) => {
    const serverUrl = localStorage.getItem('hailvision_endpoint');
    const apiKey = localStorage.getItem('hailvision_api_key');
    if (!serverUrl) {
      throw new Error("Backend not configured");
    }
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    const response = await fetch(`${serverUrl}/video/upload-url`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ filename: videoFile.name })
    });
    if (!response.ok) {
      throw new Error(`Failed to get upload URL: ${response.status} ${response.statusText}`);
    }
    return await response.json();
  };

  const uploadToS3 = async (presignedUrl: string, videoFile: File) => {
    const response = await fetch(presignedUrl, {
      method: 'PUT',
      body: videoFile,
      headers: {
        'Content-Type': videoFile.type
      }
    });
    return response.ok;
  };

  const processVideo = async (s3Key: string) => {
    const serverUrl = localStorage.getItem('hailvision_endpoint');
    const apiKey = localStorage.getItem('hailvision_api_key');
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    const response = await fetch(`${serverUrl}/video/process`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        s3_key: s3Key,
        frame_interval: 30 // Process 1 frame per second
      })
    });
    if (!response.ok) {
      throw new Error(`Video processing failed: ${response.status} ${response.statusText}`);
    }
    return await response.json();
  };

  const handleVideoUpload = async () => {
    if (uploadedVideos.length === 0) {
      toast({
        title: "No videos selected",
        description: "Please upload videos before processing",
        variant: "destructive"
      });
      return;
    }
    const serverUrl = localStorage.getItem('hailvision_endpoint');
    if (!serverUrl) {
      toast({
        title: "Backend not configured",
        description: "Please configure your backend server URL in Developer Settings",
        variant: "destructive"
      });
      return;
    }
    setIsProcessing(true);
    setUploadProgress(0);
    setVideoResults(null);
    try {
      const videoFile = uploadedVideos[0].file; // Process first video

      // Step 1: Get presigned URL
      setUploadStatus('Getting upload URL...');
      setUploadProgress(10);
      const { upload_url, s3_key } = await getPresignedUrl(videoFile);

      // Step 2: Upload to S3
      setUploadStatus('Uploading video...');
      setUploadProgress(30);
      const uploadSuccess = await uploadToS3(upload_url, videoFile);

      if (!uploadSuccess) {
        throw new Error("Failed to upload video to S3");
      }

      // Step 3: Process video (this now takes longer due to annotation)
      setUploadStatus('Processing video and creating annotations...');
      setUploadProgress(50);
      const results = await processVideo(s3_key);

      // DEBUG: Log the full response to see what we're getting
      console.log("🔍 FULL backend response:", results);
      console.log("🔍 Response keys:", Object.keys(results || {}));
      console.log("🔍 Has original_video_url?", !!results?.original_video_url);
      console.log("🔍 Has annotated_video_url?", !!results?.annotated_video_url);
      console.log("🔍 Original URL:", results?.original_video_url);
      console.log("🔍 Annotated URL:", results?.annotated_video_url);

      // Step 4: Display results
      setUploadProgress(100);
      setUploadStatus('Complete!');
      setVideoResults(results);

      // FIXED: Access nested results structure correctly
      const detectionSummary = results?.results?.detection_summary;
      if (detectionSummary) {
        toast({
          title: "Video analysis complete",
          description: `Found damage in ${detectionSummary.frames_with_damage || 0} frames (${(detectionSummary.damage_percentage || 0).toFixed(1)}% of video)`
        });
      } else {
        toast({
          title: "Video analysis complete",
          description: "Processing completed successfully"
        });
      }
    } catch (error) {
      console.error("Video processing error:", error);
      setUploadStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`);
      toast({
        title: "Video processing failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <section className="py-20 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-4 text-gradient">Video Analysis</h2>
          <p className="text-xl text-muted-foreground">
            Upload drone inspection videos for comprehensive hail damage analysis
          </p>
        </div>
        {/* Video Upload area */}
        <Card className={`p-8 border-2 border-dashed transition-all duration-300 ${
          isDragging ? 'border-vibranium bg-vibranium/5' : 'border-border'
        }`}>
          <div
            className="text-center"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <Video className="mx-auto h-12 w-12 text-vibranium mb-4" />
            <p className="text-lg font-medium mb-2">Drop video files here or click to browse</p>
            <p className="text-muted-foreground mb-6">
              Supports MP4, AVI, MOV, MKV, WebM files up to 500MB each
            </p>

            <Button
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              size="lg"
            >
              Choose Videos
            </Button>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="video/mp4,video/avi,video/mov,video/mkv,video/webm"
              onChange={(e) => handleVideoSelect(e.target.files)}
              className="hidden"
            />
          </div>
        </Card>
        {/* Video list */}
        {uploadedVideos.length > 0 && (
          <div className="mt-8">
            <h3 className="text-xl font-semibold mb-4">Uploaded Videos ({uploadedVideos.length})</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              {uploadedVideos.map((video) => (
                <Card key={video.id} className="p-4 relative group">
                  <button
                    onClick={() => removeVideo(video.id)}
                    className="absolute top-2 right-2 p-1 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-4 w-4" />
                  </button>

                  <div className="w-full h-32 bg-muted rounded mb-2 flex items-center justify-center">
                    <Video className="h-8 w-8 text-muted-foreground" />
                  </div>

                  <p className="text-sm font-medium truncate">{video.file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(video.file.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                </Card>
              ))}
            </div>
            <div className="text-center space-y-4">
              {isProcessing && (
                <div className="space-y-2">
                  <Progress value={uploadProgress} className="w-full" />
                  <p className="text-sm text-muted-foreground">{uploadStatus}</p>
                </div>
              )}

              <Button
                onClick={handleVideoUpload}
                disabled={isProcessing}
                size="lg"
                className="vibranium-glow"
              >
                <Zap className="mr-2 h-5 w-5" />
                {isProcessing ? "Processing..." : "Analyze Video for Hail Damage"}
              </Button>
            </div>
          </div>
        )}
        {/* Video Results Section */}
        {videoResults && (
          <div className="mt-16">
            <VideoResultsViewer videoResults={videoResults} />
          </div>
        )}
      </div>
    </section>
  );
};
