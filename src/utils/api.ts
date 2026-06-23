import { UploadedImage, Settings } from '../types';
import { getInitialBatchPrompt, getSubsequentBatchPrompt } from './prompts';

/**
 * Converts a File object to a Base64 data URL string.
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
}

interface KieAiResult {
  filename: string;
  naskah: string;
}

interface ApiResponse {
  results: KieAiResult[];
}

/**
 * Cleans and parses a JSON string returned by the LLM, handling markdown code block formats safely.
 */
export function parseLlmJsonResponse(rawText: string): ApiResponse {
  let cleaned = rawText.trim();
  
  // Remove markdown code block if present (e.g. ```json ... ```)
  const codeBlockRegex = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;
  const match = cleaned.match(codeBlockRegex);
  if (match && match[1]) {
    cleaned = match[1].trim();
  }

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    console.error("Failed to parse clean JSON. Raw text was:", rawText);
    
    // Fallback: If JSON parsing fails, we'll try to find a JSON-like substring containing "results"
    try {
      const startJsonIdx = cleaned.indexOf('{');
      const endJsonIdx = cleaned.lastIndexOf('}');
      if (startJsonIdx !== -1 && endJsonIdx !== -1 && endJsonIdx > startJsonIdx) {
        const structuralSubstring = cleaned.substring(startJsonIdx, endJsonIdx + 1);
        return JSON.parse(structuralSubstring);
      }
    } catch (e) {
      console.error("Fallback substring parsing also failed:", e);
    }

    throw new Error("Format respon AI tidak valid atau bukan bentuk JSON yang benar. Silakan coba generate kembali.");
  }
}

/**
 * Sends a batch of images to the Kie AI endpoint for manga analysis.
 */
export async function analyzeMangaBatch(
  batchImages: UploadedImage[],
  settings: Settings,
  previousContext?: string,
  isFirstBatch: boolean = true
): Promise<KieAiResult[]> {
  const { apiKey, baseUrl, model } = settings;

  // Build list of files in the batch
  const listDetails = batchImages.map((img, i) => `Gambar #${i + 1}: Nama File = "${img.name}"`).join('\n');
  
  // Get prompt template based on whether this is the first batch or subsequent batches of the run
  const systemInstructions = isFirstBatch 
    ? getInitialBatchPrompt(previousContext)
    : getSubsequentBatchPrompt(previousContext || '');

  const userMessageContent: any[] = [
    {
      type: "text",
      text: `${systemInstructions}\n\nBerikut adalah rangkaian gambar halaman manga yang harus Anda analisis secara berurutan:\n\n${listDetails}\n\nSilakan berikan naskah cerita recap Anda dalam format JSON di atas.`
    }
  ];

  // Append images in their sorted order
  batchImages.forEach((img, idx) => {
    userMessageContent.push({
      type: "text",
      text: `--- GAMBAR KE-${idx + 1} (Nama File: "${img.name}") ---`
    });
    userMessageContent.push({
      type: "image_url",
      image_url: {
        url: img.previewUrl // Contains full "data:image/png;base64,..."
      }
    });
  });

  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      apiKey,
      baseUrl,
      model,
      messages: [
        {
          role: "user",
          content: userMessageContent
        }
      ],
      temperature: 0.3,
      max_tokens: 4000,
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    let parsedErr = errorText;
    try {
      parsedErr = JSON.parse(errorText).error?.message || errorText;
    } catch (_) {}
    throw new Error(`API Error (${response.status}): ${parsedErr}`);
  }

  const responseData = await response.json();
  const content = responseData.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Respon API kosong atau tidak memiliki konten pilihan.");
  }

  const parsed = parseLlmJsonResponse(content);
  if (!parsed.results || !Array.isArray(parsed.results)) {
    throw new Error("Respon JSON AI tidak mengandung array objek di properti 'results'.");
  }

  return parsed.results;
}
