import fs from "fs";
import path from "path";

export default async function handler(req: any, res: any) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    const { filename, content } = req.body;
    if (!filename || !content) {
      return res.status(400).json({ error: "Filename and content are required" });
    }

    try {
      const outputDir = path.join(process.cwd(), "saved_scripts");
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const cleanName = path.basename(filename).replace(/\.[^/.]+$/, "") + ".txt";
      const filePath = path.join(outputDir, cleanName);

      fs.writeFileSync(filePath, content, "utf8");
      return res.status(200).json({ success: true, path: filePath, info: "Saved successfully (ephemeral on Serverless)" });
    } catch (writeErr: any) {
      return res.status(200).json({ success: true, info: "Proceeded without local disk write (Serverless limitation) " + writeErr.message });
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to process save-script" });
  }
}
