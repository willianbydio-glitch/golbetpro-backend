const express = require("express");
const fetch = require("node-fetch");
const calcularElite = require("./engine/eliteEngine");
const calcularPoisson = require("./engine/poisonEngine");

const app = express();
app.use(express.json());

//////////////////////////////////////////////
// CACHE ADAPTATIVO (CORREÇÃO 4)
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
// HISTÓRICO (COM FALLBACK INTELIGENTE)
//////////////////////////////////////////////

async function fetchHistoryStats(teamId) {
  try {

    if (!teamId) return [];

    let response = await fetch(
      `https://v3.football.api-sports.io/fixtures?team=${teamId}&last=5&status=FT`,
      {
        headers: {
          "x-apisports-key": process.env.API_FOOTBALL_KEY
        }
      }
    );

    let data = await response.json();

    if (data.response && data.response.length >= 3) {
      return data.response;
    }

    response = await fetch(
      `https://v3.football.api-sports.io/fixtures?team=${teamId}&last=10`,
      {
        headers: {
          "x-apisports-key": process.env.API_FOOTBALL_KEY
        }
      }
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
// PROGNÓSTICO ESTATÍSTICO (SEM RANDOM)
//////////////////////////////////////////////

function calculateStatisticalPrognosis(homeHistory, awayHistory, h2h) {

  let homeScore = 50;
  let awayScore = 50;

  if (Array.isArray(h2h)) {
    h2h.forEach(game => {
      if (game?.teams?.home?.winner) homeScore += 2;
      if (game?.teams?.away?.winner) awayScore += 2;
    });
  }

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
  const probabilityDraw = Math.max(
    0,
    100 - (probabilityHome + probabilityAway)
  );

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
// ULTRA ELITE (SEM RANDOM)
//////////////////////////////////////////////

function ultraElitePredictor(game, stats = {}) {

  const homeWins = stats.homeHistory.filter(
    g => g?.teams?.home?.winner
  ).length;

  const awayWins = stats.awayHistory.filter(
    g => g?.teams?.away?.winner
  ).length;

  const totalHome = stats.homeHistory.length || 1;
  const totalAway = stats.awayHistory.length || 1;

  const probabilityHome = (homeWins / totalHome) * 100;
  const probabilityAway = (awayWins / totalAway) * 100;
  const probabilityDraw = Math.max(
    0,
    100 - (probabilityHome + probabilityAway)
  );

  const riskIndex = Math.abs(probabilityHome - probabilityAway);

  return {
    ultraElite: {
      probabilityHome: Number(probabilityHome.toFixed(2)),
      probabilityAway: Number(probabilityAway.toFixed(2)),
      probabilityDraw: Number(probabilityDraw.toFixed(2)),
      riskIndex: Number(riskIndex.toFixed(2)),
      recommendation:
        riskIndex > 40
          ? "Alta confiança estatística"
          : riskIndex > 20
          ? "Moderada confiança"
          : "Jogo equilibrado"
    }
  };
}

//////////////////////////////////////////////
// BUSCAR ÚLTIMOS JOGOS
//////////////////////////////////////////////

async function buscarUltimosJogos(teamId) {
  try {

    if (!teamId) return [];

    const response = await fetch(
      `https://v3.football.api-sports.io/fixtures?team=${teamId}&last=10&status=FT`,
      {
        headers: {
          "x-apisports-key": process.env.API_FOOTBALL_KEY
        }
      }
    );

    const data = await response.json();

    if (!data.response || !Array.isArray(data.response)) {
      return [];
    }

    return data.response.map(jogo => {
      const isHome = jogo.teams.home.id == teamId;

      return {
        golsMarcados: isHome
          ? jogo.goals.home
          : jogo.goals.away,
        golsSofridos: isHome
          ? jogo.goals.away
          : jogo.goals.home
      };
    });

  } catch (err) {
    console.error("Erro buscarUltimosJogos:", err);
    return [];
  }
}

//////////////////////////////////////////////
// ENDPOINT ELITE
//////////////////////////////////////////////

app.get("/api/elite-prob", async (req, res) => {
  const { teamA, teamB } = req.query;

  try {

    const jogosA = await buscarUltimosJogos(teamA);
    const jogosB = await buscarUltimosJogos(teamB);

    if (!jogosA.length || !jogosB.length) {
      return res.json({ error: "Histórico insuficiente" });
    }

    const elite = calcularElite(
      { jogos: jogosA },
      { jogos: jogosB }
    );

    const mediaA = {
      golsMarcados:
        jogosA.reduce((s, j) => s + j.golsMarcados, 0) / jogosA.length,
      golsSofridos:
        jogosA.reduce((s, j) => s + j.golsSofridos, 0) / jogosA.length
    };

    const mediaB = {
      golsMarcados:
        jogosB.reduce((s, j) => s + j.golsMarcados, 0) / jogosB.length,
      golsSofridos:
        jogosB.reduce((s, j) => s + j.golsSofridos, 0) / jogosB.length
    };

    const poisson = calcularPoisson(mediaA, mediaB);

    res.json({
      elite,
      poisson
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao calcular probabilidades" });
  }
});

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
          `https://v3.football.api-sports.io/fixtures?date=${date}`,
          {
            headers: {
              "x-apisports-key": process.env.API_FOOTBALL_KEY
            }
          }
        );

        const data = await response.json();

        const jogosProcessados = await Promise.all(
          data.response.map(async game => {

            const homeHistory = await fetchHistoryStats(
              game.teams?.home?.id
            );

            const awayHistory = await fetchHistoryStats(
              game.teams?.away?.id
            );

            const h2h = [];

            const stats = {
              homeHistory,
              awayHistory,
              h2h
            };

            const prediction = ultraElitePredictor(game, stats);
            const prognosis = calculateStatisticalPrognosis(
              homeHistory,
              awayHistory,
              h2h
            );

            return {
              ...game,
              prediction,
              prognosis
            };

          })
        );

        // ✅ AGRUPAR POR CAMPEONATO
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

  } catch {
    res.status(500).json({
      error: "Erro ao buscar jogos"
    });
  }

});

//////////////////////////////////////////////
// START SERVER
//////////////////////////////////////////////

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Backend rodando na porta ${PORT}`);
});
