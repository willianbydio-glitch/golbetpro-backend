const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");
const calcularElite = require("./engine/professionalEngine");
const calcularPoisson = require("./engine/poisonEngine");
const oddsTracker = {};
const teamHistoryCache = {};

/////////////////////////////////////////////
// BANCO DE ODDS DO DIA (ELITE TRADER 5.0)
//////////////////////////////////////////////

let oddsDoDia = {};

async function carregarOddsDoDia(date){

  try{

    const fixturesResponse = await fetch(
      `${BASE_URL}/fixtures?date=${date}`,
      {
        headers: { "x-apisports-key": API_KEY }
      }
    );

    const fixturesData = await fixturesResponse.json();

    oddsDoDia = {};

    if(!fixturesData.response) return;

    // PEGAR IDS DOS JOGOS
    const fixtureIds = fixturesData.response.map(g => g.fixture.id);

    // BUSCAR TODAS ODDS EM PARALELO
    const oddsRequests = fixtureIds.map(async fixtureId => {

      try{

        const oddsResponse = await fetch(
          `${BASE_URL}/odds?fixture=${fixtureId}`,
          {
            headers: { "x-apisports-key": API_KEY }
          }
        );

        const oddsData = await oddsResponse.json();

        if(oddsData.response && oddsData.response.length > 0){

          oddsDoDia[fixtureId] = oddsData.response[0];

        }

      }catch(err){

        console.log("Erro odds fixture:", fixtureId);

      }

    });

    // AGUARDAR TODAS REQUISIÇÕES
    await Promise.all(oddsRequests);

    console.log("ODDS CARREGADAS:", Object.keys(oddsDoDia).length);

  }catch(err){

    console.log("Erro carregar odds:", err);

  }

}

/////////////////////////////////////////////
// SMART MONEY DETECTOR
//////////////////////////////////////////////

function smartMoneyDetector(probModelo, odd) {

  const probBook = 1 / odd;

  const diferenca = probModelo - probBook;

  let alerta = null;

  if (diferenca > 0.08) {
    alerta = "💰 DINHEIRO FORTE NO MERCADO";
  }

  if (diferenca < -0.05) {
    alerta = "⚠️ POSSÍVEL ARMADILHA DA CASA";
  }

  return alerta;

}

function ultraSharpDetector(probModelo, odd, ev, traderScore){

  if(
    probModelo > 0.60 &&
    odd >= 1.60 &&
    ev > 0.15 &&
    traderScore > 0.30
  ){
    return "💎 ULTRA SHARP BET";
  }

  return null;
}

function godModeDetector(probModelo, odd, ev, traderScore){

  if(
    probModelo > 0.68 &&
    odd >= 1.80 &&
    ev > 0.30 &&
    traderScore > 0.50
  ){
    return "👑 GOD MODE BET";
  }

  return null;
}

//////////////////////////////////////////////
// CONFIG API
//////////////////////////////////////////////

const BASE_URL = "https://v3.football.api-sports.io";
const API_KEY = process.env.API_FOOTBALL_KEY;

const app = express();

/////////////////////////////////////////////////
// CALCULO VALUE BET
/////////////////////////////////////////////////

function calcularValueBet(probModelo, odd){

 const prob = probModelo / 100;

 const probCasa = 1 / odd;

 const ev = (prob * odd) - 1;

 const edge = probModelo - (probCasa * 100);

 return {
  probCasa: probCasa * 100,
  ev: ev * 100,
  edge: edge
 };

}


/////////////////////////////////////////////////
// CLASSIFICADOR
/////////////////////////////////////////////////

function classificarAposta(probModelo, odd){

 const calc = calcularValueBet(probModelo, odd);

 const ev = calc.ev;

 let alerta = "";
 let rating = "Normal";
 let risco = "Médio";

 if(ev >= 15){
  alerta = "🔥 APOSTA MUITO FORTE";
  rating = "Elite";
  risco = "Baixo";
 }

 else if(ev >= 8){
  alerta = "🚨 VALUE BET";
  rating = "Muito Boa";
  risco = "Médio";
 }

 else if(ev >= 4){
  rating = "Boa";
 }

 return {
  ev: calc.ev,
  edge: calc.edge,
  alerta,
  rating,
  risco
};

}



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


async function fetchHistoryStats(teamId){

 if(teamHistoryCache[teamId]){
   return teamHistoryCache[teamId];
 }

 try{

   const response = await fetch(
     `${BASE_URL}/fixtures?team=${teamId}&last=5&status=FT`,
     { headers: { "x-apisports-key": API_KEY } }
   );

   const data = await response.json();

   teamHistoryCache[teamId] = data.response || [];

   return teamHistoryCache[teamId];

 }catch(err){
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
    console.log("TOTAL JOGOS:", data.response.length);
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

  const {
  home,
  away,
  league,
  oddCasaHome,
  oddCasaDraw,
  oddCasaAway,
  oddCasaOver25,
  oddCasaBtts
} = req.query;
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

    //////////////////////////////////////////
// NORMALIZAÇÃO PROFISSIONAL
//////////////////////////////////////////

const forcaAtaqueCasa = homeStats.feitos / leagueAverage;
const forcaDefesaCasa = homeStats.sofridos / leagueAverage;

const forcaAtaqueFora = awayStats.feitos / leagueAverage;
const forcaDefesaFora = awayStats.sofridos / leagueAverage;

const xgCasa =
  forcaAtaqueCasa *
  forcaDefesaFora *
  leagueAverage;

const xgFora =
  forcaAtaqueFora *
  forcaDefesaCasa *
  leagueAverage;

const resultadoElite = calcularElite(
  {
    feitos: xgCasa,
    sofridos: xgFora
  },
  {
    feitos: xgFora,
    sofridos: xgCasa
  },
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
// CALCULAR EV+
//////////////////////////////////////////

function calcularEV(probPercent, oddCasa) {
  if (!oddCasa) return null;

  const prob = Number(probPercent) / 100;
  const ev = (prob * Number(oddCasa)) - 1;

  return {
    ev: Number((ev * 100).toFixed(2)), // em %
    value: ev > 0
  };
}

const evAnalise = {
  homeWin: calcularEV(resultadoElite.probability.homeWin, oddCasaHome),
  draw: calcularEV(resultadoElite.probability.draw, oddCasaDraw),
  awayWin: calcularEV(resultadoElite.probability.awayWin, oddCasaAway),
  over25: calcularEV(resultadoElite.markets.over25, oddCasaOver25),
  btts: calcularEV(resultadoElite.markets.btts, oddCasaBtts)
};

//////////////////////////////////////////
// DETECTAR MELHOR VALUE BET
//////////////////////////////////////////

let melhorMercado = null;
let maiorEV = 0;

Object.entries(evAnalise).forEach(([mercado, dados]) => {
  if (dados && dados.value && dados.ev > maiorEV) {
    maiorEV = dados.ev;
    melhorMercado = mercado;
  }
});

const valueBet = melhorMercado
  ? {
      market: melhorMercado,
      ev: maiorEV
    }
  : null;

//////////////////////////////////////////
// RESPOSTA FINAL
//////////////////////////////////////////

res.json({
  success: true,
  elite: resultadoElite,
  oddsJustas,
  evAnalise,
  valueBet,
  leagueAverage: Number(leagueAverage.toFixed(2))
});

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false });
  }

}); // 👈 FECHA A ROTA ELITE



/////////////////////////////////////////////
// ELITE TRADER SCANNER - SUPER ELITE HARD PRO MAX
//////////////////////////////////////////////

app.get("/api/elite-trader", async (req, res) => {

  const { date, league } = req.query;
  await carregarOddsDoDia(date);
  console.log("TOTAL ODDS CARREGADAS:", Object.keys(oddsDoDia).length);

  try {

    const resultado = await adaptiveEngine(
      `elite_trader_${date}_${league || "all"}`,
      async () => {

        //////////////////////////////////////////////////
        // BUSCAR JOGOS DO DIA
        //////////////////////////////////////////////////

        let url = `${BASE_URL}/fixtures?date=${date}`;

        if (league) {
          url += `&league=${league}&season=2025`;
        }

        const response = await fetch(url, {
          headers: { "x-apisports-key": API_KEY }
        });

        const data = await response.json();

        if (!data.response) return { success: true, total: 0, elitePicks: [] };

        let oportunidades = [];

        //////////////////////////////////////////////////
        // LOOP EM TODOS OS JOGOS
        //////////////////////////////////////////////////

        for (let game of data.response) {

          if (game.fixture.status.short !== "NS") continue;

          
          async function carregarOddsDoDia(date){

  try{

    const fixturesResponse = await fetch(
      `${BASE_URL}/fixtures?date=${date}`,
      {
        headers: { "x-apisports-key": API_KEY }
      }
    );

    const fixturesData = await fixturesResponse.json();

    oddsDoDia = {};

    if(!fixturesData.response) return;

    // PEGAR IDS DOS JOGOS
    const fixtureIds = fixturesData.response.map(g => g.fixture.id);

    // BUSCAR TODAS ODDS EM PARALELO
    const oddsRequests = fixtureIds.map(async fixtureId => {

      try{

        const oddsResponse = await fetch(
          `${BASE_URL}/odds?fixture=${fixtureId}`,
          {
            headers: { "x-apisports-key": API_KEY }
          }
        );

        const oddsData = await oddsResponse.json();

        if(oddsData.response && oddsData.response.length > 0){

          oddsDoDia[fixtureId] = oddsData.response[0];

        }

      }catch(err){

        console.log("Erro odds fixture:", fixtureId);

      }

    });

    // AGUARDAR TODAS REQUISIÇÕES
    await Promise.all(oddsRequests);

    console.log("ODDS CARREGADAS:", Object.keys(oddsDoDia).length);

  }catch(err){

    console.log("Erro carregar odds:", err);

  }

}
          
          const fixtureId = game.fixture.id;
          const homeId = game.teams.home.id;
          const awayId = game.teams.away.id;

          //////////////////////////////////////////////////
          // BUSCAR ODDSS
          //////////////////////////////////////////////////

          const oddsData = oddsDoDia[fixtureId];
          
          if(!oddsData) continue;
          
          const bookmakers = oddsData.bookmakers;
          
          if(!bookmakers || bookmakers.length === 0) continue;
          
          const bookmaker = bookmakers[0];
          
          const markets = bookmaker.bets;
          console.log("ODDS CARREGADAS:", Object.keys(oddsDoDia).length);

          function pegarOdd(nomeMercado, valor) {
            const mercado = markets.find(m => m.name === nomeMercado);
            if (!mercado) return null;
            const opcao = mercado.values.find(v => v.value === valor);
            return opcao ? Number(opcao.odd) : null;
          }

          const oddHome = pegarOdd("Match Winner", "Home");
          const oddDraw = pegarOdd("Match Winner", "Draw");
          const oddAway = pegarOdd("Match Winner", "Away");
          const oddOver25 = pegarOdd("Goals Over/Under", "Over 2.5");
          const oddBTTS = pegarOdd("Both Teams Score", "Yes");

          if (!oddHome && !oddOver25) continue;

          //////////////////////////////////////////////////
          // BUSCAR MÉDIAS DOS TIMES
          //////////////////////////////////////////////////

          
          const homeHistory = await fetchHistoryStats(homeId);
          const awayHistory = await fetchHistoryStats(awayId);

          function media(jogos, id) {
            if (!jogos || jogos.length === 0)
              return { feitos: 1.35, sofridos: 1.35 };

            let feitos = 0;
            let sofridos = 0;

            jogos.forEach(j => {
              const isHome = j.teams.home.id === id;
              feitos += isHome ? j.goals.home : j.goals.away;
              sofridos += isHome ? j.goals.away : j.goals.home;
            });

            return {
              feitos: feitos / jogos.length,
              sofridos: sofridos / jogos.length
            };
          }

          const homeStats = media(homeHistory, homeId);
          const awayStats = media(awayHistory, awayId);

          const leagueAverage = 1.35;

          const xgCasa =
            (homeStats.feitos / leagueAverage) *
            (awayStats.sofridos / leagueAverage) *
            leagueAverage;

          const xgFora =
            (awayStats.feitos / leagueAverage) *
            (homeStats.sofridos / leagueAverage) *
            leagueAverage;

          const elite = calcularElite(
            { feitos: xgCasa, sofridos: xgFora },
            { feitos: xgFora, sofridos: xgCasa },
            leagueAverage
          );

          //////////////////////////////////////////////////
          // ANALISAR MERCADOS
          //////////////////////////////////////////////////

          const mercados = [
            { nome: "Home Win", prob: elite.probability.homeWin, odd: oddHome },
            { nome: "Away Win", prob: elite.probability.awayWin, odd: oddAway },
            { nome: "Over 2.5", prob: elite.markets.over25, odd: oddOver25 },
            { nome: "BTTS", prob: elite.markets.btts, odd: oddBTTS }
          ];

          for (let m of mercados) {

            if (!m.odd) continue;

            const probModelo = Number(m.prob) / 100;
            const analise = classificarAposta(probModelo * 100, m.odd);
            const alertaSmart = smartMoneyDetector(probModelo, m.odd);
            const oddsMovimento = analyzeOddsMovement(game.fixture.id, m.nome, m.odd);
            const probImplicita = 1 / m.odd;
            const ev = (probModelo * m.odd) - 1;
            const edge = probModelo - probImplicita;
            if(edge < 0.005) continue;
            const traderScore =
              (ev * 0.5) +
              (probModelo * 0.3) +
              (edge * 0.2);
            
            // Filtros mais flexíveis
            if (ev < 0.01) continue;
            if (m.odd < 1.20 || m.odd > 6.00) continue;


            
            
            const ultraSharp = ultraSharpDetector(probModelo, m.odd, ev, traderScore);
            const godMode = godModeDetector(probModelo, m.odd, ev, traderScore);

            //////////////////////////////////////////////////
            // CLASSIFICAÇÃO
            //////////////////////////////////////////////////

            let rating = "VALUE";

            if (ev > 0.08) rating = "🔥 SUPER VALUE";
            else if (ev > 0.05) rating = "⭐ ELITE PICK";
            else if (ev > 0.02) rating = "✅ VALUE BET";

            //////////////////////////////////////////////////
            // KELLY 25%
            //////////////////////////////////////////////////

            let kelly = ((probModelo * m.odd - 1) / (m.odd - 1));
            kelly = Math.max(0, kelly) * 0.25;

            //////////////////////////////////////////////////
            // RISCO
            //////////////////////////////////////////////////

            let risco = "Médio";
            if (m.odd < 1.70) risco = "Baixo";
            if (m.odd > 2.30) risco = "Alto";

            //////////////////////////////////////////////////
            // ALERTA ULTRA VALUE
            //////////////////////////////////////////////////

            let alerta = null;
            if (ev > 0.08 && probModelo > 0.60 && edge > 0.05) {
              alerta = "🔥 ULTRA VALUE";
            }
            
            oportunidades.push({
              jogo: `${game.teams.home.name} x ${game.teams.away.name}`,
              liga: game.league.name,
              mercado: m.nome,
              odd: m.odd,
              probModelo: (probModelo * 100).toFixed(2),
              ev: analise.ev,
              edge: analise.edge,
              traderScore: traderScore.toFixed(4),
              rating: analise.rating,
              stakeRecomendada: (kelly * 100).toFixed(2) + "%",
              risco: analise.risco,
              alerta: analise.alerta,
              smartMoney: alertaSmart,
              oddsMovimento,
              ultraSharp,
              godMode,
            });

          }

        }

        oportunidades.sort((a, b) => b.traderScore - a.traderScore);

        const top3IA = oportunidades.slice(0,3);
        return {
          success: true,
          total: oportunidades.length,
          elitePicks: oportunidades.slice(0, 15),
          picksIA: top3IA
        };

      },
      120000
    );

    res.json(resultado);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro no Elite Trader Scanner" });
  }

});




//////////////////////////////////////////////
// SUPER PICKS IA
//////////////////////////////////////////////

app.get("/api/super-picks", async (req, res) => {

  const { date } = req.query;

  try {

    const trader = await fetch(
      `http://localhost:${PORT}/api/elite-trader?date=${date}`
    );

    const data = await trader.json();

    if (!data.elitePicks) {
      return res.json({ success: true, picks: [] });
    }

    let picks = data.elitePicks.map(p => {

      const score = Number(p.traderScore);

      let tier = "VALUE";

      if (score > 0.16) tier = "🔥 SUPER VALUE";
      else if (score > 0.12) tier = "⭐ ELITE PICK";

      return {
        ...p,
        tier
      };

    });

    picks.sort((a, b) => b.traderScore - a.traderScore);

    const top3IA = picks.slice(0,3);
    res.json({
      success:true,
      total:picks.length,
      superPicks:picks,
      picksIA:top3IA
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      success: false
    });

  }

});

function analyzeOddsMovement(gameId, market, oddAtual){

  const key = gameId + "_" + market;

  if(!oddsTracker[key]){
    oddsTracker[key] = {
      firstOdd: oddAtual,
      lastOdd: oddAtual,
      drops: 0
    };
    return null;
  }

  const data = oddsTracker[key];

  if(oddAtual < data.lastOdd){
    data.drops++;
  }

  const diff = data.firstOdd - oddAtual;

  data.lastOdd = oddAtual;

  if(diff > 0.20){
    return "🚨 QUEDA FORTE DE ODD (SHARP MONEY)";
  }

  if(data.drops >= 3){
    return "💰 DINHEIRO PROFISSIONAL ENTRANDO";
  }

  if(oddAtual > data.firstOdd + 0.30){
    return "⚠️ POSSÍVEL ARMADILHA DA CASA";
  }

  return null;
}


//////////////////////////////////////////////
// PICKS IA (TOP 3 DO DIA)
//////////////////////////////////////////////

app.get("/api/picks-ia", async (req, res) => {

  const { date } = req.query;

  try {

    const trader = await fetch(
      `https://keen-grace-production.up.railway.app/api/elite-trader?date=${date}`
    );

    const data = await trader.json();

    if (!data.elitePicks) {
      return res.json({ success: true, picks: [] });
    }

    const picks = data.elitePicks
      .sort((a,b) => b.traderScore - a.traderScore)
      .slice(0,3);

    res.json({
      success: true,
      total: picks.length,
      picks
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      success:false
    });

  }

});

function detectarApostaForte(pick){

 const prob = pick.probModelo;
 const odd = pick.odd;

 // Valor esperado
 const ev = (prob/100 * odd - 1) * 100;

 let alerta = "NORMAL";

 if(prob >= 75 && ev >= 10){
  alerta = "🔥 APOSTA MUITO FORTE";
 }
 else if(prob >= 65 && ev >= 5){
  alerta = "🚨 APOSTA DE VALOR";
 }

 return {
  ...pick,
  ev: ev.toFixed(2),
  alerta
 };

}


//////////////////////////////////////////////
// START SERVER
//////////////////////////////////////////////

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
 console.log("Backend rodando na porta " + PORT);
});
