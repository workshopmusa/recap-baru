export interface UploadedImage {
  id: string;
  name: string;
  previewUrl: string;
  base64: string; // Base64 data string (excluding the MIME prefix for sending to AI, or full data URL depending on API requirements)
  mimeType: string;
  status: 'pending' | 'processing' | 'success' | 'failed';
  naskah?: string;
  error?: string;
}

export interface ProcessingBatch {
  id: string;
  indices: number[]; // Index array of images included in this batch
  status: 'idle' | 'processing' | 'success' | 'failed';
  error?: string;
}

export interface Settings {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface MangaProject {
  id: string;
  name: string;
  createdAt: string;
  initialContext: string;
  images: UploadedImage[];
}
