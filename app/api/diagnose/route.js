export async function POST(request) {
  try {
    const { vehicle, faultCodes } = await request.json();

    if (!vehicle || !faultCodes) {
      return Response.json({ error: "Fordon och felkoder krävs" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "GEMINI_API_KEY saknas" }, { status: 500 });
    }

    const LABOR_RATE = 700;

    const prompt = "Du är en expert bilmekaniker i Sverige. Fordon: " + vehicle.make + " " + vehicle.model + " " + vehicle.year + ", Motor: " + (vehicle.engine || "okänd") + ", Bränsle: " + (vehicle.fuel || "okänt") + ". Felkoder: " + faultCodes + ". Svara ENBART med ren JSON (ingen markdown, inga backticks). Format: {\"severity\":\"low|medium|high|critical\",\"systemAffected\":\"Systemnamn\",\"title\":\"Diagnostitel\",\"description\":\"2-3 meningar\",\"faultCodes\":[{\"code\":\"PXXXX\",\"meaning\":\"Beskrivning\"}],\"probableCauses\":[\"Orsak 1\",\"Orsak 2\"],\"parts\":[{\"name\":\"Delnamn\",\"partNumber\":\"nr\",\"price\":250,\"supplier\":\"Biltema\"}],\"laborHours\":2.5,\"laborRate\":" + LABOR_RATE + ",\"steps\":[{\"title\":\"Steg\",\"description\":\"Beskrivning\",\"minutes\":15,\"type\":\"inspection|test|repair|replace\"}],\"safetyWarnings\":[\"Varning\"],\"swedenTips\":[\"Tips om vinter/kyla/salt\"],\"youtubeSearch\":\"sökterm\"}";

    const r = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + apiKey,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 2000 },
        }),
      }
    );

    if (!r.ok) {
      return Response.json({ error: "Gemini API-fel: " + r.status }, { status: 502 });
    }

    const data = await r.json();
    const txt = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text) || "";

    const match = txt.match(/\{[\s\S]*\}/);
    if (!match) {
      return Response.json({ error: "AI returnerade inget giltigt svar" }, { status: 502 });
    }

    var parsed;
    try {
      parsed = JSON.parse(match[0]);
    } catch (e) {
      return Response.json({ error: "Kunde ej tolka AI-svaret" }, { status: 502 });
    }

    var result = {
      severity: parsed.severity || "medium",
      systemAffected: parsed.systemAffected || "Okänt",
      title: parsed.title || "Diagnostik",
      description: parsed.description || "",
      faultCodes: Array.isArray(parsed.faultCodes) ? parsed.faultCodes : [],
      probableCauses: Array.isArray(parsed.probableCauses) ? parsed.probableCauses : [],
      parts: Array.isArray(parsed.parts) ? parsed.parts : [],
      laborHours: Number(parsed.laborHours) || 0,
      laborRate: Number(parsed.laborRate) || LABOR_RATE,
      steps: Array.isArray(parsed.steps) ? parsed.steps : [],
      safetyWarnings: Array.isArray(parsed.safetyWarnings) ? parsed.safetyWarnings : [],
      swedenTips: Array.isArray(parsed.swedenTips) ? parsed.swedenTips : [],
      youtubeSearch: parsed.youtubeSearch || "",
    };

    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message || "Serverfel" }, { status: 500 });
  }
}
