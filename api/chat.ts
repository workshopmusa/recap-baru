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
    const { apiKey, baseUrl, model, messages, temperature, max_tokens, response_format } = req.body;

    const finalApiKey = process.env.KIE_API_KEY || process.env.GEMINI_API_KEY || apiKey;

    if (!finalApiKey) {
      return res.status(400).json({ 
        error: { 
          message: "API Key tidak ditemukan. Harap tambahkan KIE_API_KEY atau GEMINI_API_KEY sebagai Environment Variable di Dashboard Vercel Anda." 
        } 
      });
    }

    let cleanBaseUrl = (baseUrl || "https://api.kie.ai/gemini-3-flash/v1").trim();
    if (cleanBaseUrl.endsWith("/")) {
      cleanBaseUrl = cleanBaseUrl.slice(0, -1);
    }

    const targetUrl = cleanBaseUrl.endsWith("/chat/completions") 
      ? cleanBaseUrl 
      : `${cleanBaseUrl}/chat/completions`;

    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${finalApiKey}`
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
      return res.status(response.status).send(errorText);
    }

    const responseData = await response.json();
    return res.status(200).json(responseData);
  } catch (err: any) {
    return res.status(500).json({
      error: {
        message: err.message || "Failed to communicate with proxy endpoint"
      }
    });
  }
}
