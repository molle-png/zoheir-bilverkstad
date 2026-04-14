// POST /api/diagnose
// Proxies diagnosis requests to Claude API, keeping the API key server-side
// Set ANTHROPIC_API_KEY in Vercel environment variables

export async function POST(request) {
  try {
    const { vehicle, faultCodes } = await request.json();

    if (!vehicle || !faultCodes) {
      return Response.json({ error: "Fordon och felkoder krävs" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "ANTHROPIC_API_KEY saknas i servermiljön" }, { status: 500 });
    }

    const LABOR_RATE = 700;

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        system: `Du är en expert bilmekaniker. Svara ENBART med ren JSON (ingen markdown, inga backticks). Priser i SEK. Arbetskostnad ${LABOR_RATE} SEK/timme.`,
        messages: [{
          role: "user",
          content: `Fordon: ${vehicle.make} ${vehicle.model} ${vehicle.year}, Motor: ${vehicle.engine || "okänd"}, Bränsle: ${vehicle.fuel || "okänt"}
Felkoder: ${faultCodes}

Svara med exakt denna JSON-struktur:
{"severity":"low|medium|high|critical","systemAffected":"Systemnamn","title":"Diagnostitel på svenska","description":"2-3 meningar","faultCodes":[{"code":"PXXXX","meaning":"Beskrivning"}],"probableCauses":["Orsak 1","Orsak 2","Orsak 3"],"parts":[{"name":"Delnamn","partNumber":"artikelnr","price":250,"supplier":"Biltema"}],"laborHours":2.5,"laborRate":${LABOR_RATE},"steps":[{"title":"Steg","description":"Beskrivning","minutes":15,"type":"inspection|test|repair|replace"}],"safetyWarnings":["Varning 1","Varning 2"],"swedenTips":["Tips om kyla, snö, vägsalt, vinterförhållanden"],"youtubeSearch":"sökterm för YouTube"}`,
        }],
      }),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      console.error("Anthropic API error:", r.status, errText);
      return Response.json({ error: `Claude API-fel: ${r.status}` }, { status: 502 });
    }

    const data = await r.json();
    const txt = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    const match = txt.match(/\{[\s\S]*\}/);
    if (!match) {
      return Response.json({ error: "AI returnerade inget giltigt svar" }, { status: 502 });
    }

    let parsed;
    try { parsed = JSON.parse(match[0]); } catch { 
      return Response.json({ error: "Kunde ej tolka AI-svaret" }, { status: 502 });
    }

    // Normalize all fields
    const result = {
      severity: parsed.severity || "medium",
      systemAffected: parsed.systemAffected || "Okänt system",
      title: parsed.title || "Diagnostikresultat",
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
    console.error("Diagnose error:", error);
    return Response.json({ error: error.message || "Serverfel" }, { status: 500 });
  }
}
