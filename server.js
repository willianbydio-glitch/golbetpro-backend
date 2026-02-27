const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");
const calcularElite = require("./engine/eliteEngine");
const calcularPoisson = require("./engine/poisonEngine");

//////////////////////////////////////////////
// CONFIG API
//////////////////////////////////////////////

const BASE_URL = "https://v3.football.api-sports.io";
const API_KEY = process.env.API_FOOTBALL_KEY;

const app = express();

app.use(cors());
app.use(express.json());

//////////////////////////////////////////////
// CACHE ADAPTATIVO
//////////////////////////////////////////////

const cache = new Map();

async function adaptiveEngine(key, callback, ttl = 60000) {
  const now = Date.now();

  if (cache.has(key)) {
    const cached = cache.get(key);
    if (now - cached.timestamp < ttl) {
      return cached.data;
    }
  }

  const data = await callback();

  cache.set(key, {
    data,
    timestamp: now
  });

  return data;
}

//////////////////////////////////////////////
// HISTÓRICO
//////////////////////////////////////////////

async function fetchHistoryStats(teamId) {
  try {

    if (!teamId) return [];

    let response = await fetch(
      `${BASE_URL}/fixtures?team=${teamId}&last=5&status=FT`,
      { headers: { "x-apisports-key": API_KEY } }
    );

    let data = await response.json();

    if (data.response && data.response.length >= 3) {
      return data.response;
    }

    response = await fetch(
      `${BASE_URL}/fixtures?team=${teamId}&last=10`,
      { headers: { "x-apisports-key": API_KEY } }
    );

    data = await response.json();

    if (data.response && data.response.length > 0) {
      return data.response;
    }

    return [];

  } catch (err) {
    console.error("Erro fetchHistoryStats:", err);
    return [];
  }
}

//////////////////////////////////////////////
// PROGNÓSTICO ESTATÍSTICO
//////////////////////////////////////////////

function calculateStatisticalPrognosis(homeHistory, awayHistory, h2h) {

  let homeScore = 50;
  let awayScore = 50;

  if (Array.isArray(homeHistory)) {
    homeHistory.forEach(game => {
      if (game?.teams?.home?.winner) homeScore += 1.5;
      if (game?.teams?.away?.winner) awayScore += 1.5;
    });
  }

  if (Array.isArray(awayHistory)) {
    awayHistory.forEach(game => {
      if (game?.teams?.away?.winner) awayScore += 1.5;
      if (game?.teams?.home?.winner) homeScore += 1.5;
    });
  }

  const total = homeScore + awayScore;

  const probabilityHome = (homeScore / total) * 100;
  const probabilityAway = (awayScore / total) * 100;
  const probabilityDraw = Math.max(0, 100 - probabilityHome - probabilityAway);

  const avgHomeGoals =
    homeHistory.length
      ? homeHistory.reduce((s, g) => s + (g.goals?.home || 0), 0) / homeHistory.length
      : 1;

  const avgAwayGoals =
    awayHistory.length
      ? awayHistory.reduce((s, g) => s + (g.goals?.away || 0), 0) / awayHistory.length
      : 1;

  const expectedGoals = (avgHomeGoals + avgAwayGoals) / 2;

  return {
    probability: {
      homeWin: Number(probabilityHome.toFixed(2)),
      awayWin: Number(probabilityAway.toFixed(2)),
      draw: Number(probabilityDraw.toFixed(2))
    },
    prognosis: {
      expectedGoals: Number(expectedGoals.toFixed(2))
    }
  };
}

//////////////////////////////////////////////
// ENDPOINT PRINCIPAL (AGRUPADO POR LIGA)
//////////////////////////////////////////////

app.get("/api/jogos", async (req, res) => {

  const { date } = req.query;

  try {

    const resultadoFinal = await adaptiveEngine(
      `jogos_${date}`,
      async () => {

        const response = await fetch(
          `${BASE_URL}/fixtures?date=${date}`,
          { headers: { "x-apisports-key": API_KEY } }
        );

        const data = await response.json();

        const jogosProcessados = await Promise.all(
          data.response.map(async game => {

            const homeHistory = await fetchHistoryStats(game.teams?.home?.id);
            const awayHistory = await fetchHistoryStats(game.teams?.away?.id);

            const prediction = calculateStatisticalPrognosis(
              homeHistory,
              awayHistory,
              []
            );

            return {
              ...game,
              prediction
            };

          })
        );

        const jogosPorCampeonato = {};

        jogosProcessados.forEach(game => {
          const leagueId = game.league.id;

          if (!jogosPorCampeonato[leagueId]) {
            jogosPorCampeonato[leagueId] = {
              league: {
                id: game.league.id,
                name: game.league.name,
                logo: game.league.logo,
                country: game.league.country
              },
              games: []
            };
          }

          jogosPorCampeonato[leagueId].games.push(game);
        });

        return {
          success: true,
          response: jogosPorCampeonato
        };

      },
      60000
    );

    res.json(resultadoFinal);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar jogos" });
  }

});

//////////////////////////////////////////////
// NOVO PROGNÓSTICO BASEADO EM HISTÓRICO
//////////////////////////////////////////////

app.get("/api/prognostico", async (req, res) => {

  const { home, away } = req.query;

  try {

    const homeResponse = await fetch(
      `${BASE_URL}/fixtures?team=${home}&last=10`,
      { headers: { "x-apisports-key": API_KEY } }
    );

    const awayResponse = await fetch(
      `${BASE_URL}/fixtures?team=${away}&last=10`,
      { headers: { "x-apisports-key": API_KEY } }
    );

    const homeData = await homeResponse.json();
    const awayData = await awayResponse.json();

    function calcularMedia(jogos, teamId) {
      let golsFeitos = 0;
      let golsSofridos = 0;

      jogos.forEach(jogo => {
        if (jogo.teams.home.id == teamId) {
          golsFeitos += jogo.goals.home;
          golsSofridos += jogo.goals.away;
        } else {
          golsFeitos += jogo.goals.away;
          golsSofridos += jogo.goals.home;
        }
      });

      return {
        feitos: golsFeitos / jogos.length,
        sofridos: golsSofridos / jogos.length
      };
    }

    const homeStats = calcularMedia(homeData.response, home);
    const awayStats = calcularMedia(awayData.response, away);

    const expectativaCasa = (homeStats.feitos + awayStats.sofridos) / 2;
    const expectativaFora = (awayStats.feitos + homeStats.sofridos) / 2;

    const mediaGols = expectativaCasa + expectativaFora;

    const over15 = Math.min(95, (mediaGols / 2) * 100);
    const over25 = Math.min(95, (mediaGols / 3) * 100);
    const over35 = Math.min(95, (mediaGols / 4) * 100);
    const over45 = Math.min(95, (mediaGols / 5) * 100);

    const total = expectativaCasa + expectativaFora;

    const casa = (expectativaCasa / total) * 100;
    const fora = (expectativaFora / total) * 100;
    const empate = 100 - casa - fora;

    let sugestao = "Jogo equilibrado";

    if (over25 > 65) sugestao = "Over 2.5";
    if (casa > 55) sugestao = "Vitória Casa";
    if (fora > 55) sugestao = "Vitória Visitante";

    res.json({
      success: true,
      mediaGols: mediaGols.toFixed(2),
      over15: over15.toFixed(1),
      over25: over25.toFixed(1),
      over35: over35.toFixed(1),
      over45: over45.toFixed(1),
      casa: casa.toFixed(1),
      empate: empate.toFixed(1),
      fora: fora.toFixed(1),
      sugestao
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false });
  }

});

//////////////////////////////////////////////
// ESTATÍSTICAS
//////////////////////////////////////////////

app.get("/api/estatisticas", async (req, res) => {
  const { fixture } = req.query;

  try {
    const response = await fetch(
      `${BASE_URL}/fixtures/statistics?fixture=${fixture}`,
      { headers: { "x-apisports-key": API_KEY } }
    );

    const data = await response.json();
    res.json(data);

  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar estatísticas" });
  }
});

//////////////////////////////////////////////
// START SERVER
//////////////////////////////////////////////

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Backend rodando na porta ${PORT}`);
});
