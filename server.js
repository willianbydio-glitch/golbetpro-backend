const express = require("express");
const fetch = require("node-fetch");
const calcularElite = require("./engine/eliteEngine");
const calcularPoisson = require("./engine/poisonEngine");

const app = express();
app.use(express.json());

//////////////////////////////////////////////
// ULTRA ELITE + PROGNÓSTICO ESTATÍSTICO
//////////////////////////////////////////////

async function fetchHistoryStats(teamId) {
  try {

    if (!teamId) return [];

    const response = await fetch(
      `https://v3.football.api-sports.io/fixtures?team=${teamId}&last=5&status=FT`,
      {
        headers: {
          "x-apisports-key": process.env.API_FOOTBALL_KEY
        }
      }
    );

    const data = await response.json();

    return data.response || [];

  } catch {
    return [];
  }
}

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
      else awayScore += 1.5;
    });
  }

  if (Array.isArray(awayHistory)) {
    awayHistory.forEach(game => {
      if (game?.teams?.away?.winner) awayScore += 1.5;
      else homeScore += 1.5;
    });
  }

  const total = homeScore + awayScore;

  const probabilityHome = (homeScore / total) * 100;
  const probabilityAway = (awayScore / total) * 100;
  const probabilityDraw = Math.max(
    0,
    100 - (probabilityHome + probabilityAway)
  );

  return {
    probability: {
      homeWin: Number(probabilityHome.toFixed(2)),
      awayWin: Number(probabilityAway.toFixed(2)),
      draw: Number(probabilityDraw.toFixed(2))
    },
    prognosis: {
      expectedGoals: Number((Math.random() * 3 + 0.5).toFixed(2))
    }
  };
}

function calcularProbabilidades(teamA, teamB) {
  const vitoriaA = (teamA.win + teamB.loss) / 2;
  const vitoriaB = (teamB.win + teamA.loss) / 2;
  const empate = (teamA.draw + teamB.draw) / 2;

  const total = vitoriaA + vitoriaB + empate;

  const resultadoA = (vitoriaA / total) * 100;
  const resultadoB = (vitoriaB / total) * 100;
  const resultadoEmpate = (empate / total) * 100;

  const btts = (teamA.btts + teamB.btts) / 2;
  const over = (teamA.over25 + teamB.over25) / 2;
  const under = 100 - over;

  return {
    vitoriaA: resultadoA.toFixed(0),
    empate: resultadoEmpate.toFixed(0),
    vitoriaB: resultadoB.toFixed(0),
    btts: btts.toFixed(0),
    underBtts: (100 - btts).toFixed(0),
    over25: over.toFixed(0),
    under25: under.toFixed(0)
  };
}

function ultraElitePredictor(game, stats = {}) {

  const baseRandom = Math.random() * 40 + 60;

  const probabilityHome = Math.min(97, baseRandom);
  const probabilityAway = Math.min(97, 100 - baseRandom);

  const probabilityDraw = Math.max(
    0,
    100 - (probabilityHome + probabilityAway)
  );

  const riskIndex = Math.abs(probabilityHome - probabilityAway);

  const historicalBonus = stats?.homeHistory?.length
    ? stats.homeHistory.length * 0.5
    : 0;

  return {
    ultraElite: {
      probabilityHome: Number(
        Math.min(97, probabilityHome + historicalBonus).toFixed(2)
      ),
      probabilityAway: Number(
        Math.min(97, probabilityAway + historicalBonus).toFixed(2)
      ),
      probabilityDraw: Number(probabilityDraw.toFixed(2)),
      riskIndex: Number(riskIndex.toFixed(2)),

      recommendation:
        riskIndex > 45
          ? "Alta confiança estatística"
          : riskIndex > 25
          ? "Moderada confiança"
          : "Jogo equilibrado"
    }
  };
}

//////////////////////////////////////////////
// FUNÇÃO CORRIGIDA E PROTEGIDA
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
// ENDPOINT ELITE ATUALIZADO
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
// ENDPOINT PRINCIPAL (MANTIDO IGUAL)
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

        return {
          success: true,
          response: jogosProcessados
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
