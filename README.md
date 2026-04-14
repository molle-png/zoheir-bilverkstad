# Zoheir Bilverkstad — AI-diagnostik

AI-driven fordonsdiagnostik för svenska bilar. Ange registreringsnummer eller VIN, få felkodsanalys med reservdelar, reparationsguide och kostnadsuppskattning.

## Features

- 🔍 Automatisk fordonsuppslagning via registreringsnummer (RegCheck API)
- 🔧 VIN-avkodning via NHTSA (gratis)
- ⚡ AI-diagnostik via Claude API
- 🛒 Reservdelar med Biltema-länkar
- 📋 Steg-för-steg reparationsguide med YouTube/Google/Biltema-knappar
- ❄️ Svenska verkstadstips (vinter, kyla, salt)
- 📄 Exportera till PDF
- 📱 Mobilanpassad

## Deploy to Vercel

### 1. Push to GitHub

```bash
cd zoheir-bilverkstad
git init
git add .
git commit -m "Initial commit"
gh repo create zoheir-bilverkstad --public --push
```

### 2. Deploy on Vercel

1. Go to [vercel.com](https://vercel.com)
2. Import your GitHub repository
3. Add environment variable: `ANTHROPIC_API_KEY` = your Claude API key
4. Deploy

### 3. Done!

Your app is live at `https://zoheir-bilverkstad.vercel.app`

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Your Anthropic API key from console.anthropic.com |

## Architecture

- **Frontend**: Next.js 14 (React)
- **Reg.nr lookup**: Supabase Edge Function → RegCheck API
- **VIN decode**: NHTSA vPIC API (free, no key needed)
- **Diagnosis**: Claude API (via `/api/diagnose` server route)
- **Parts**: Links to Biltema.se search
