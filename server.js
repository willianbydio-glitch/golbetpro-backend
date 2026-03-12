const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");
const calcularElite = require("./engine/professionalEngine");
const calcularPoisson = require("./engine/poisonEngine");
const oddsTracker = {};
const teamHistoryCache = {};
const app = express();



/////////////////////////////////////////////////
// RATING SIMPLES DOS TIMES
/////////////////////////////////////////////////

function ratingTime(nome){

  const elite = [
    "Real Madrid","Manchester City","Bayern","Barcelona",
    "Liverpool","PSG","Inter","Juventus","Arsenal","Chelsea"
  ];

  const fortes = [
    "Flamengo","Palmeiras","Atletico-MG","Corinthians",
    "Napoli","Roma","Sevilla","Dortmund","Milan"
  ];

  const medios = [
    "Internacional","Fluminense","Villarreal",
    "Real Sociedad","Lazio"
  ];

  if(elite.some(t => nome.includes(t))) return 90;

  if(fortes.some(t => nome.includes(t))) return 82;

  if(medios.some(t => nome.includes(t))) return 75;

  return 68;

}

function leagueStrength(leagueName){

  const top = [
    "Premier League",
    "Champions League",
    "La Liga",
    "Serie A",
    "Bundesliga"
  ];

  const media = [
    "Brasileirão",
    "Liga Profesional",
    "MLS"
  ];

  if(top.some(l => leagueName.includes(l))){
    return 1.15;
  }

  if(media.some(l => leagueName.includes(l))){
    return 1.07;
  }

  return 1;

}



function probOdd(odd){
  return (1 / odd) * 100;
}

let oddsDoDia = {};

async function carregarOddsDoDia(date) {
  try {
    const fixturesResponse = await fetch(`${BASE_URL}/fixtures?date=${date}`, {
      headers: { "x-apisports-key": API_KEY }
    });
    const fixturesData = await fixturesResponse.json();
    
    oddsDoDia = {};
    if (!fixturesData.response || fixturesData.response.length === 0) return;

    const fixtureIds = fixturesData.response.map(g => g.fixture.id);

    // Função para processar em lotes (evita bloqueio da API)
    const chunkArray = (array, size) => {
      const result = [];
      for (let i = 0; i < array.length; i += size) result.push(array.slice(i, i + size));
      return result;
    };

    const lotes = chunkArray(fixtureIds, 10); // Lotes de 10 jogos por vez

    for (const lote of lotes) {
      await Promise.all(lote.map(async (fixtureId) => {
        try {
          const oddsResponse = await fetch(`${BASE_URL}/odds?fixture=${fixtureId}`, {
            headers: { "x-apisports-key": API_KEY }
          });
          const oddsData = await oddsResponse.json();
          if (oddsData.response?.length > 0) {
            oddsDoDia[fixtureId] = oddsData.response[0];
          }
        } catch (err) {
          console.log("Erro no jogo:", fixtureId);
        }
      }));
      // Pequena pausa de 200ms entre lotes para manter a conexão estável
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log("✅ ODDS CARREGADAS COM SUCESSO:", Object.keys(oddsDoDia).length);
  } catch (err) {
    console.log("Erro crítico ao carregar odds:", err);
  }
}

app.get("/api/aposta-dia", async (req,res)=>{

  try{

    const date = new Date().toISOString().split("T")[0];

    const response = await fetch(
      `https://keen-grace-production.up.railway.app/api/elite-trader?date=${date}`
    );

    const data = await response.json();

    if(!data.elitePicks || data.elitePicks.length === 0){
      return res.json({success:false});
    }

    const melhor = data.elitePicks
      .filter(p => p.ev > 12)
      .sort((a,b)=>b.traderScore-a.traderScore)[0];

    res.json({
      success:true,
      pick:melhor
    });

  }catch(e){
    res.json({success:false});
  }

});


function detectarSharpMoney(oddInicial, oddAtual){

  if(!oddInicial || !oddAtual) return null;

  const movimento = oddInicial - oddAtual;

  if(movimento > 0.15){

    return "💰 SHARP MONEY DETECTADO";

  }

  return null;

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

    function detectarMovimentoOdds(oddInicial, oddAtual){

  if(!oddInicial || !oddAtual) return null;

  const diff = oddInicial - oddAtual;

  if(diff > 0.20){
    return "📉 Odds caindo forte";
  }

  if(diff < -0.20){
    return "📈 Odds subindo";
  }

  return null;

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

  let { date, league } = req.query;
  
  if(!date){
    date = new Date().toISOString().split("T")[0];
  }
  if(Object.keys(oddsDoDia).length === 0){
    await carregarOddsDoDia(date);
  }
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

        const historyCache = {};
        await Promise.all(data.response.map(async (game) => {
          
          const status = game.fixture.status.short;
          if(
            status !== "NS" &&
            status !== "LIVE" &&
            status !== "1H" &&
            status !== "2H" &&
            status !== "HT"
          ) return;
          
          const fixtureId = game.fixture.id;
          const homeId = game.teams.home.id;
          const awayId = game.teams.away.id;

          const homeName = game.teams.home.name;
          const awayName = game.teams.away.name;

          const ratingHome = ratingTime(homeName);
          const ratingAway = ratingTime(awayName);

          const diffRating = ratingHome - ratingAway;
          
          const oddsData = oddsDoDia[fixtureId];
          
          if(!oddsData) return
            
          const bookmakers = oddsData.bookmakers;
          if(!bookmakers || bookmakers.length === 0) return;
          const bookmaker = bookmakers[0];
          const markets = bookmaker.bets;
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
          
          const ligaPeso = leagueStrength(game.league.name);
          
          if (!oddHome && !oddOver25) return;

  //////////////////////////////////////////////////
  // BUSCAR MÉDIAS DOS TIMES
  //////////////////////////////////////////////////
          if(!historyCache[homeId]){
            historyCache[homeId] = fetchHistoryStats(homeId);
          }
          if(!historyCache[awayId]){
            historyCache[awayId] = fetchHistoryStats(awayId);
          }
          const homeHistory = await historyCache[homeId];
          const awayHistory = await historyCache[awayId];

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
            let probModelo = Number(m.prob);
            const mercadoResultado =
              m.nome === "Home Win" ||
              m.nome === "Away Win" ||
              m.nome === "Draw";
            
            const mercadoGols =
              m.nome.includes("Over") ||
              m.nome.includes("Under") ||
              m.nome.includes("BTTS");



            // filtros específicos

            if(mercadoResultado){
              if(m.odd > 6) continue;
              if(probModelo < 20) continue;
            }
            if(mercadoGols){
              if(m.odd > 4) continue;
              if(probModelo < 35) continue;
            }
            if(!m.odd || m.odd <= 1) continue;
            
            


            const probMercado = (1 / m.odd) * 100;
            // mistura modelo + mercado

            probModelo = (probModelo * 0.70) + (probMercado * 0.30);

            if(probModelo > 40){
              console.log("ANALISANDO:", game.teams.home.name, "x", game.teams.away.name, m.nome, m.odd, probModelo);
            }

            // limites realistas
            if(probModelo > 75) probModelo = 75;
            if(probModelo < 5) probModelo = 5;

  // ajuste força do time apenas para resultado
            if(mercadoResultado){
              if(m.nome === "Home Win"){
                probModelo += diffRating * 0.06;
              }
              if(m.nome === "Away Win"){
                probModelo -= diffRating * 0.06;
              }
            }

  // bloqueio zebra absurda
            // bloqueio zebra absurda
            if(mercadoResultado &&
               m.nome === "Away Win" &&
               diffRating > 12 &&
               m.odd > 6
            ){
              continue;
            }
            // bloquear underdog improvável
            if(mercadoResultado &&
               m.nome === "Away Win" &&
               diffRating > 8 &&  
               probModelo < probMercado
            ){
              continue;
            }

            // favorito não pode ter odd absurda
            if(mercadoResultado &&
               m.nome === "Home Win" &&
               diffRating > 12 &&
               m.odd > 3.5
            ){
              continue;
            }

            if(m.odd > 4){
              probModelo *= 0.90;
            }
            if(m.odd > 6){ 
              probModelo *= 0.75;
            }
  // força da liga
            probModelo = probModelo * (1 + (ligaPeso - 1) * 0.5);

  // filtros odds irreais
            // filtro odds irreais

            if(m.odd > 10 && probModelo > 20) continue;
            if(m.odd > 6 && probModelo > 35) continue;
            if(m.odd > 6 && probModelo > 60) continue;

  
            const analise = classificarAposta(probModelo, m.odd);
            const alertaSmart = smartMoneyDetector(probModelo, m.odd);
            const sharp = detectarSharpMoney(oddsTracker[fixtureId]?.firstOdd,m.odd);
            const oddsMovimento = analyzeOddsMovement(game.fixture.id, m.nome, m.odd);
            const probImplicita = 1 / m.odd;
            const prob = probModelo / 100;
            const ev = ((prob * m.odd) - 1) * 100;
            // EV máximo realista
            // limite EV irreal
            if(ev > 120) continue;
            if(ev < -5) continue;
            
            const edge = prob - probImplicita;
            if(edge < -0.25) continue;
            const traderScore =
              (ev * 0.50) +
              ((probModelo/100) * 0.25) +
              (edge * 0.20) +
              (diffRating * 0.01);

            if(edge > 0.35) continue;
            
            // Filtros mais flexíveis
            if (ev < -0.10) continue;
            if (m.odd < 1.10 || m.odd > 15.00) continue;


            
            
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
// KELLY CORRIGIDO
//////////////////////////////////////////////////
            const probDecimal = probModelo / 100;
            
            let kelly = ((probDecimal * m.odd) - 1) / (m.odd - 1);
            
            kelly = Math.max(0, kelly) * 0.25;

// limitar stake
            if(kelly > 0.05) kelly = 0.05;
            if(kelly < 0.01) kelly = 0.01;
            
            
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

            // evitar picks ruins
            if(probModelo < 18) continue;
            
            if(oportunidades.filter(o => o.jogo === `${game.teams.home.name} x ${game.teams.away.name}`).length >= 1){
              continue;
            }
            console.log("PICK ENCONTRADA:", game.teams.home.name, "x", game.teams.away.name, m.nome);
            oportunidades.push({
              jogo: `${game.teams.home.name} x ${game.teams.away.name}`,
              liga: game.league.name,
              mercado: m.nome,
              odd: m.odd,
              probModelo: probModelo.toFixed(2),
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
              sharpMoney: sharp,
            });

          }

        })),

        oportunidades.sort((a, b) => b.traderScore - a.traderScore);

        if(oportunidades.length === 0){

          console.log("⚠️ Nenhuma aposta passou filtros — liberando fallback");
          if(oportunidades.length === 0){
  
            console.log("⚠️ Nenhuma aposta passou filtros — liberando fallback");

            return {  
              success:true,  
              total:0,  
              elitePicks:[]
            };
          }

          const fallback = [];

          for(let m of mercados){

            if(!m.odd) continue;
            const prob = Number(m.prob)/100;
            const ev = (prob * m.odd - 1) * 100;
            fallback.push({
              jogo: `${homeName} x ${awayName}`,      
              liga: game.league.name,      
              mercado: m.nome,      
              odd: m.odd,      
              probModelo: (prob*100).toFixed(2),      
              ev: ev.toFixed(2),      
              edge: 0,     
              traderScore: ev,      
              rating: "Fallback",      
              stakeRecomendada: "1%",    
              risco: "Alto"    
            }); 
          }

          fallback.sort((a,b)=>b.traderScore-a.traderScore);

          if(fallback[0]){
            oportunidades.push(fallback[0]);
          }
        }

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
      `https://keen-grace-production.up.railway.app/api/elite-trader?date=${date}`
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
// TOP APOSTAS DO DIA
//////////////////////////////////////////////

app.get("/api/apostas-do-dia", async (req, res) => {

 const { date } = req.query;

 try{

  const response = await fetch(
   `https://keen-grace-production.up.railway.app/api/elite-trader?date=${date}`
  );

  const data = await response.json();

  if(!data.elitePicks){
   return res.json({success:true,picks:[]});
  }

  //////////////////////////////////////////////////
  // FILTRAR APOSTAS MAIS SEGURAS
  //////////////////////////////////////////////////

  let picks = data.elitePicks.filter(p => {

   const prob = Number(p.probModelo);
   const odd = Number(p.odd);

   if(prob < 60) return false;
   if(odd < 1.40 || odd > 3.50) return false;

   return true;

  });

  //////////////////////////////////////////////////
  // RANKING
  //////////////////////////////////////////////////

  picks.sort((a,b) => {

   const scoreA =
    (Number(a.probModelo) * 0.6) +
    (Number(a.ev) * 0.3) +
    (Number(a.traderScore) * 100 * 0.1);

   const scoreB =
    (Number(b.probModelo) * 0.6) +
    (Number(b.ev) * 0.3) +
    (Number(b.traderScore) * 100 * 0.1);

   return scoreB - scoreA;

  });

  //////////////////////////////////////////////////
  // TOP 10
  //////////////////////////////////////////////////

  const top10 = picks.slice(0,10);

  res.json({
   success:true,
   total:top10.length,
   picks:top10
  });

 }catch(err){

  console.error(err);

  res.status(500).json({
   success:false
  });

 }

});

//////////////////////////////////////////////
// TOP APOSTAS DO DIA
//////////////////////////////////////////////

app.get("/api/top-apostas", async (req, res) => {

  try{

    const date = new Date().toISOString().split("T")[0];

    const trader = await fetch(
      `https://keen-grace-production.up.railway.app/api/elite-trader?date=${date}`
    );

    const data = await trader.json();

    if(!data.elitePicks){
      return res.json({
        success:true,
        total:0,
        picks:[]
      });
    }

    // ordenar pelas melhores
    const melhores = data.elitePicks
      .sort((a,b)=>b.traderScore-a.traderScore)
      .slice(0,10);

    res.json({
      success:true,
      total:melhores.length,
      picks:melhores
    });

  }catch(e){

    res.json({
      success:false,
      erro:e.message
    });

  }

});

//////////////////////////////////////////////
// START SERVER
//////////////////////////////////////////////

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
 console.log("Backend rodando na porta " + PORT);
});
