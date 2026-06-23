import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Set higher limits for large chunk image payloads (base64)
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

      // API proxy route for Kie AI to completely bypass CORS issues
  app.post("/api/chat", async (req, res) => {
    try {
      const { apiKey, baseUrl, model, messages, temperature, max_tokens, response_format } = req.body;

      if (!apiKey) {
        return res.status(400).json({ error: { message: "API Key is required" } });
      }

      // Handle any trailing slashes and ensure "/chat/completions" is not duplicated
      let cleanBaseUrl = (baseUrl || "https://api.kie.ai/gemini-3-flash/v1").trim();
      if (cleanBaseUrl.endsWith("/")) {
        cleanBaseUrl = cleanBaseUrl.slice(0, -1);
      }

      const targetUrl = cleanBaseUrl.endsWith("/chat/completions") 
        ? cleanBaseUrl 
        : `${cleanBaseUrl}/chat/completions`;

      console.log(`[Proxy] Forwarding request to: ${targetUrl} with model: ${model}`);

      const response = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens,
          response_format
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Proxy Error] target returned status ${response.status}:`, errorText);
        return res.status(response.status).send(errorText);
      }

      const responseData = await response.json();
      return res.json(responseData);
    } catch (err: any) {
      console.error("[Proxy Exception]:", err);
      return res.status(500).json({
        error: {
          message: err.message || "Failed to communicate with proxy endpoint"
        }
      });
    }
  });

  // API Route to automatically save the generated naskah script to the project folder
  app.post("/api/save-script", (req, res) => {
    try {
      const { filename, content } = req.body;
      if (!filename || !content) {
        return res.status(400).json({ error: "Filename and content are required" });
      }

      // Create saved_scripts directory if it doesn't exist
      const outputDir = path.join(process.cwd(), "saved_scripts");
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Safeguard filename to be just the text file name
      const cleanName = path.basename(filename).replace(/\.[^/.]+$/, "") + ".txt";
      const filePath = path.join(outputDir, cleanName);

      fs.writeFileSync(filePath, content, "utf8");
      console.log(`[Save Script] Automatically saved script to: ${filePath}`);

      return res.json({ success: true, path: filePath });
    } catch (err: any) {
      console.error("[Save Script Exception]:", err);
      return res.status(500).json({ error: err.message || "Failed to save script to project folder" });
    }
  });

  // Serve static files / mount Vite dev server
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("[Server Error on Boot]:", err);
});
