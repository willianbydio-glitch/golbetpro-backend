const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");
const calcularElite = require("./engine/professionalEngine");
const calcularPoisson = require("./engine/poisonEngine");

//////////////////////////////////////////////
// CONFIG API
//////////////////////////////////////////////

const BASE_URL = "https://v3.football.api-sports.io";
const API_KEY = process.env.API_FOOTBALL_KEY;

const app = express();

//////////////////////////////////////////////
// ROTA RAIZ (ADICIONADA)
//////////////////////////////////////////////

app.get("/", (req, res) => {
  res.send("GolBetPro Elite Backend Online 🚀");
});

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
// PROGNÓSTICO
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

  if (!jogos || jogos.length === 0) {
    return { feitos: 1.35, sofridos: 1.35 };
  }

  let golsFeitos = 0;
  let golsSofridos = 0;
  let validos = 0;

  jogos.forEach(jogo => {

    if (
      jogo.goals &&
      jogo.goals.home !== null &&
      jogo.goals.away !== null
    ) {

      validos++;

      if (jogo.teams.home.id == teamId) {
        golsFeitos += jogo.goals.home;
        golsSofridos += jogo.goals.away;
      } else {
        golsFeitos += jogo.goals.away;
        golsSofridos += jogo.goals.home;
      }

    }

  });

  if (validos === 0) {
    return { feitos: 1.35, sofridos: 1.35 };
  }

  return {
    feitos: golsFeitos / validos,
    sofridos: golsSofridos / validos
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
// PROGNÓSTICO ELITE PROFISSIONAL (CORRIGIDO)
//////////////////////////////////////////////

//////////////////////////////////////////////
// PROGNÓSTICO ELITE PROFISSIONAL (COM FORMA RECENTE 70/30)
//////////////////////////////////////////////

app.get("/api/prognostico-elite", async (req, res) => {

  const { home, away, league } = req.query;
  const season = 2025;

  try {

    //////////////////////////////////////////
    // BUSCAR HISTÓRICO TEMPORADA (10 JOGOS)
    //////////////////////////////////////////

    const homeResponse = await fetch(
      `${BASE_URL}/fixtures?team=${home}&last=10&status=FT`,
      { headers: { "x-apisports-key": API_KEY } }
    );

    const awayResponse = await fetch(
      `${BASE_URL}/fixtures?team=${away}&last=10&status=FT`,
      { headers: { "x-apisports-key": API_KEY } }
    );

    const homeData = await homeResponse.json();
    const awayData = await awayResponse.json();

    //////////////////////////////////////////
    // FORMA RECENTE (5 JOGOS)
    //////////////////////////////////////////

    const lastHomeResponse = await fetch(
      `${BASE_URL}/fixtures?team=${home}&last=5&status=FT`,
      { headers: { "x-apisports-key": API_KEY } }
    );

    const lastAwayResponse = await fetch(
      `${BASE_URL}/fixtures?team=${away}&last=5&status=FT`,
      { headers: { "x-apisports-key": API_KEY } }
    );

    const lastHomeData = await lastHomeResponse.json();
    const lastAwayData = await lastAwayResponse.json();

    //////////////////////////////////////////
    // BUSCAR MÉDIA REAL DA LIGA
    //////////////////////////////////////////

    let leagueAverage = 1.35;

    if (league) {

      const leagueResponse = await fetch(
        `${BASE_URL}/fixtures?league=${league}&season=${season}&last=100&status=FT`,
        { headers: { "x-apisports-key": API_KEY } }
      );

      const leagueData = await leagueResponse.json();

      let totalGols = 0;
      let totalJogos = 0;

      leagueData.response.forEach(jogo => {
        if (
          jogo.goals &&
          jogo.goals.home !== null &&
          jogo.goals.away !== null
        ) {
          totalGols += jogo.goals.home + jogo.goals.away;
          totalJogos++;
        }
      });

      if (totalJogos > 0) {
        leagueAverage = totalGols / totalJogos / 2;
      }
    }

    //////////////////////////////////////////
    // FUNÇÃO MÉDIA TEMPORADA
    //////////////////////////////////////////

    function calcularMedia(jogos, teamId) {

      if (!jogos || jogos.length === 0) {
        return { feitos: 1.35, sofridos: 1.35 };
      }

      let golsFeitos = 0;
      let golsSofridos = 0;
      let validos = 0;

      jogos.forEach(jogo => {

        if (
          jogo.goals &&
          jogo.goals.home !== null &&
          jogo.goals.away !== null
        ) {

          validos++;

          if (jogo.teams.home.id == teamId) {
            golsFeitos += jogo.goals.home;
            golsSofridos += jogo.goals.away;
          } else {
            golsFeitos += jogo.goals.away;
            golsSofridos += jogo.goals.home;
          }

        }

      });

      if (validos === 0) {
        return { feitos: 1.35, sofridos: 1.35 };
      }

      return {
        feitos: golsFeitos / validos,
        sofridos: golsSofridos / validos
      };
    }

    //////////////////////////////////////////
    // FUNÇÃO MÉDIA RECENTE
    //////////////////////////////////////////

    function calcularMediaRecente(jogos, teamId) {

      if (!jogos || jogos.length === 0) {
        return { feitos: 1.35, sofridos: 1.35 };
      }

      let feitos = 0;
      let sofridos = 0;

      jogos.forEach(jogo => {

        const isHome = jogo.teams.home.id === teamId;

        if (isHome) {
          feitos += jogo.goals.home;
          sofridos += jogo.goals.away;
        } else {
          feitos += jogo.goals.away;
          sofridos += jogo.goals.home;
        }

      });

      return {
        feitos: feitos / jogos.length || 1.35,
        sofridos: sofridos / jogos.length || 1.35
      };
    }

    //////////////////////////////////////////
    // CALCULAR MÉDIAS
    //////////////////////////////////////////

    const homeStats = calcularMedia(homeData.response, home);
    const awayStats = calcularMedia(awayData.response, away);

    const homeRecente = calcularMediaRecente(lastHomeData.response, home);
    const awayRecente = calcularMediaRecente(lastAwayData.response, away);

    //////////////////////////////////////////
    // PESO 70% TEMPORADA | 30% RECENTE
    //////////////////////////////////////////

    homeStats.feitos =
      (homeStats.feitos * 0.7) +
      (homeRecente.feitos * 0.3);

    homeStats.sofridos =
      (homeStats.sofridos * 0.7) +
      (homeRecente.sofridos * 0.3);

    awayStats.feitos =
      (awayStats.feitos * 0.7) +
      (awayRecente.feitos * 0.3);

    awayStats.sofridos =
      (awayStats.sofridos * 0.7) +
      (awayRecente.sofridos * 0.3);

    //////////////////////////////////////////
    // CHAMAR ENGINE ELITE
    //////////////////////////////////////////

    const resultadoElite = calcularElite(
      homeStats,
      awayStats,
      leagueAverage
    );
//////////////////////////////////////////
// CALCULAR ODDS JUSTAS
//////////////////////////////////////////

function oddJusta(prob) {
  const p = Number(prob) / 100;
  if (!p || p <= 0) return null;
  return Number((1 / p).toFixed(2));
}

const oddsJustas = {
  homeWin: oddJusta(resultadoElite.probability.homeWin),
  draw: oddJusta(resultadoElite.probability.draw),
  awayWin: oddJusta(resultadoElite.probability.awayWin),
  over25: oddJusta(resultadoElite.markets.over25),
  btts: oddJusta(resultadoElite.markets.btts)
};

//////////////////////////////////////////
// RESPOSTA FINAL
//////////////////////////////////////////

res.json({
  success: true,
  elite: resultadoElite,
  oddsJustas,
  leagueAverage: Number(leagueAverage.toFixed(2))
});

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false });
  }

});
//////////////////////////////////////////////
// START SERVER
//////////////////////////////////////////////

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Backend rodando na porta ${PORT}`);
});
