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

    var prompt = "Du är en expert bilmekaniker i Sverige. ";
    prompt += "Fordon: " + vehicle.make + " " + vehicle.model + " " + vehicle.year;
    prompt += ", Motor: " + (vehicle.engine || "okänd");
    prompt += ", Bränsle: " + (vehicle.fuel || "okänt");
    prompt += ". Felkoder: " + faultCodes + ". ";
    prompt += "Ge en professionell diagnos på svenska. ";
    prompt += 'Svara med JSON: {"severity":"low|medium|high|critical","systemAffected":"Systemnamn",';
    prompt += '"title":"Diagnostitel","description":"2-3 meningar",';
    prompt += '"faultCodes":[{"code":"PXXXX","meaning":"Beskrivning"}],';
    prompt += '"probableCauses":["Orsak 1","Orsak 2"],';
    prompt += '"parts":[{"name":"Delnamn","partNumber":"nr","price":250,"supplier":"Biltema"}],';
    prompt += '"laborHours":2.5,"laborRate":' + LABOR_RATE + ',';
    prompt += '"steps":[{"title":"Steg","description":"Beskrivning","minutes":15,"type":"inspection"}],';
    prompt += '"safetyWarnings":["Varning"],';
    prompt += '"swedenTips":["Tips om vinter/kyla/salt"],';
    prompt += '"youtubeSearch":"sökterm"}';

    var apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + apiKey;

    var r = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2000,
          responseMimeType: "application/json"
        }
      })
    });

    if (!r.ok) {
      var errBody = await r.text().catch(function() { return ""; });
      return Response.json({ error: "Gemini API-fel: " + r.status + " " + errBody.substring(0, 200) }, { status: 502 });
    }

    var data = await r.json();

    var txt = "";
    var candidates = data.candidates || [];
    if (candidates.length > 0 && candidates[0].content && candidates[0].content.parts) {
      var parts = candidates[0].content.parts;
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].text) {
          txt += parts[i].text;
        }
      }
    }

    if (!txt) {
      return Response.json({ error: "Tomt svar från AI" }, { status: 502 });
    }

    txt = txt.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

    var parsed;
    try { parsed = JSON.parse(txt); } catch(e) { /* fall through to regex */ }

    if (!parsed) {
      var match = txt.match(/\{[\s\S]*\}/);
      if (!match) {
        return Response.json({ error: "Inget JSON i svar: " + txt.substring(0, 100) }, { status: 502 });
      }

      try {
        parsed = JSON.parse(match[0]);
      } catch (e) {
        return Response.json({ error: "JSON-parse: " + e.message + " | " + match[0].substring(0, 100) }, { status: 502 });
      }
    }

    var result = {
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
      youtubeSearch: parsed.youtubeSearch || ""
    };

    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message || "Serverfel" }, { status: 500 });
  }
}
