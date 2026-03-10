const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");
const calcularElite = require("./engine/professionalEngine");

const app = express();
const BASE_URL = "https://v3.football.api-sports.io";
const API_KEY = process.env.API_FOOTBALL_KEY;

// Caches e Memória
let oddsDoDia = {};
const teamHistoryCache = {};
const cache = new Map();

app.use(cors());
app.use(express.json());

/////////////////////////////////////////////
// MOTOR DE ODDS (SUPER RÁPIDO)
//////////////////////////////////////////////

async function carregarOddsDoDia(date) {
  try {
    const res = await fetch(`${BASE_URL}/fixtures?date=${date}`, { headers: { "x-apisports-key": API_KEY } });
    const data = await res.json();
    oddsDoDia = {};
    if (!data.response) return;

    const ids = data.response.map(g => g.fixture.id);
    const chunkSize = 15; // Processa 15 por vez

    for (let i = 0; i < ids.length; i += chunkSize) {
      const lote = ids.slice(i, i + chunkSize);
      await Promise.all(lote.map(async (id) => {
        const oRes = await fetch(`${BASE_URL}/odds?fixture=${id}`, { headers: { "x-apisports-key": API_KEY } });
        const oData = await oRes.json();
        if (oData.response?.length > 0) oddsDoDia[id] = oData.response[0];
      }));
    }
    console.log(`✅ Odds Sincronizadas: ${Object.keys(oddsDoDia).length}`);
  } catch (e) { console.log("Erro ao sincronizar odds."); }
}

/////////////////////////////////////////////
// FUNÇÕES DE APOIO
//////////////////////////////////////////////

async function getStats(teamId) {
  if (teamHistoryCache[teamId]) return teamHistoryCache[teamId];
  const res = await fetch(`${BASE_URL}/fixtures?team=${teamId}&last=8&status=FT`, { headers: { "x-apisports-key": API_KEY } });
  const data = await res.json();
  teamHistoryCache[teamId] = data.response || [];
  return teamHistoryCache[teamId];
}

/////////////////////////////////////////////
// ROTA: LISTA DE JOGOS (O QUE O SEU APP USA)
//////////////////////////////////////////////

app.get("/api/jogos", async (req, res) => {
  const { date } = req.query;
  try {
    const response = await fetch(`${BASE_URL}/fixtures?date=${date}`, { headers: { "x-apisports-key": API_KEY } });
    const data = await response.json();
    
    // Agrupa por liga para o seu Frontend mostrar bonitinho
    const jogosPorLiga = {};
    data.response.forEach(item => {
      const lid = item.league.id;
      if (!jogosPorLiga[lid]) {
        jogosPorLiga[lid] = { league: item.league, games: [] };
      }
      jogosPorLiga[lid].games.push(item);
    });

    res.json({ success: true, response: jogosPorLiga });
  } catch (err) {
    res.status(500).json({ success: false, error: "Erro ao buscar jogos" });
  }
});

/////////////////////////////////////////////
// ROTA: ELITE TRADER (PROCESSAMENTO IA)
//////////////////////////////////////////////

app.get("/api/elite-trader", async (req, res) => {
  const { date } = req.query;
  await carregarOddsDoDia(date);

  try {
    const response = await fetch(`${BASE_URL}/fixtures?date=${date}`, { headers: { "x-apisports-key": API_KEY } });
    const data = await response.json();
    let picks = [];

    for (let g of data.response) {
      const oddData = oddsDoDia[g.fixture.id];
      if (!oddData) continue;

      // Lógica simplificada de valor para teste
      const homeOdd = oddData.bookmakers[0]?.bets.find(b => b.name === "Match Winner")?.values.find(v => v.value === "Home")?.odd;

      if (homeOdd) {
        picks.push({
          jogo: `${g.teams.home.name} x ${g.teams.away.name}`,
          liga: g.league.name,
          mercado: "Vitória Casa",
          odd: Number(homeOdd),
          traderScore: Math.random(), // Aqui entra sua engine calcularElite depois
          rating: "ELITE PICK"
        });
      }
    }

    res.json({ success: true, elitePicks: picks.sort((a,b) => b.traderScore - a.traderScore).slice(0, 15) });
  } catch (err) {
    res.status(500).json({ error: "Erro no scanner" });
  }
});

// Fallback para a rota que seu print mostra: "SUPER PICKS IA"
app.get("/api/super-picks", async (req, res) => {
    // Redireciona internamente para economizar código
    const { date } = req.query;
    res.redirect(`/api/elite-trader?date=${date}`);
});

app.get("/", (req, res) => res.send("GolBetPro Online 🚀"));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Rodando na porta ${PORT}`));
