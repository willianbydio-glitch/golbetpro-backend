const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");
const calcularElite = require("./engine/professionalEngine");
const calcularPoisson = require("./engine/poisonEngine");
const oddsTracker = {};
const teamHistoryCache = {};

/////////////////////////////////////////////
// BANCO DE ODDS DO DIA (FIX DE VELOCIDADE)
//////////////////////////////////////////////

let oddsDoDia = {};

async function carregarOddsDoDia(date) {
  try {
    const fixturesResponse = await fetch(
      `${BASE_URL}/fixtures?date=${date}`,
      { headers: { "x-apisports-key": API_KEY } }
    );
    const fixturesData = await fixturesResponse.json();
    oddsDoDia = {};

    if (!fixturesData.response) return;

    const fixtureIds = fixturesData.response.map(g => g.fixture.id);

    // O PULO DO GATO: Processar em lotes de 10 para ser rápido e não ser bloqueado
    const chunkSize = 10;
    for (let i = 0; i < fixtureIds.length; i += chunkSize) {
      const lote = fixtureIds.slice(i, i + chunkSize);
      
      await Promise.all(lote.map(async (fixtureId) => {
        try {
          const oddsResponse = await fetch(
            `${BASE_URL}/odds?fixture=${fixtureId}`,
            { headers: { "x-apisports-key": API_KEY } }
          );
          const oddsData = await oddsResponse.json();
          if (oddsData.response && oddsData.response.length > 0) {
            oddsDoDia[fixtureId] = oddsData.response[0];
          }
        } catch (err) {
          console.log("Erro odds fixture:", fixtureId);
        }
      }));
      // Pequena pausa para a API respirar
      await new Promise(r => setTimeout(r, 100));
    }

    console.log("ODDS CARREGADAS COM SUCESSO:", Object.keys(oddsDoDia).length);
  } catch (err) {
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
  if(probModelo > 0.60 && odd >= 1.60 && ev > 0.15 && traderScore > 0.30){
    return "💎 ULTRA SHARP BET";
  }
  return null;
}

function godModeDetector(probModelo, odd, ev, traderScore){
  if(probModelo > 0.68 && odd >= 1.80 && ev > 0.30 && traderScore > 0.50){
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
app.use(cors());
app.use(express.json());

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

app.get("/", (req, res) => {
  res.send("GolBetPro Elite Backend Online 🚀");
});

//////////////////////////////////////////////
// CACHE ADAPTATIVO
//////////////////////////////////////////////

const cache = new Map();
async function adaptiveEngine(key, callback, ttl = 60000) {
  const now = Date.now();
  if (cache.has(key)) {
    const cached = cache.get(key);
    if (now - cached.timestamp < ttl) return cached.data;
  }
  const data = await callback();
  cache.set(key, { data, timestamp: now });
  return data;
}

//////////////////////////////////////////////
// HISTÓRICO
//////////////////////////////////////////////

async function fetchHistoryStats(teamId){
 if(teamHistoryCache[teamId]) return teamHistoryCache[teamId];
 try{
   const response = await fetch(
     `${BASE_URL}/fixtures?team=${teamId}&last=5&status=FT`,
     { headers: { "x-apisports-key": API_KEY } }
   );
   const data = await response.json();
   teamHistoryCache[teamId] = data.response || [];
   return teamHistoryCache[teamId];
 }catch(err){ return []; }
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

  const avgHomeGoals = homeHistory.length ? homeHistory.reduce((s, g) => s + (g.goals?.home || 0), 0) / homeHistory.length : 1;
  const avgAwayGoals = awayHistory.length ? awayHistory.reduce((s, g) => s + (g.goals?.away || 0), 0) / awayHistory.length : 1;
  const expectedGoals = (avgHomeGoals + avgAwayGoals) / 2;

  return {
    probability: {
      homeWin: Number(probabilityHome.toFixed(2)),
      awayWin: Number(probabilityAway.toFixed(2)),
      draw: Number(probabilityDraw.toFixed(2))
    },
    prognosis: { expectedGoals: Number(expectedGoals.toFixed(2)) }
  };
}

//////////////////////////////////////////////
// ENDPOINT PRINCIPAL (AGRUPADO POR LIGA)
//////////////////////////////////////////////

app.get("/api/jogos", async (req, res) => {
  const { date } = req.query;
  try {
    const resultadoFinal = await adaptiveEngine(`jogos_${date}`, async () => {
        const response = await fetch(`${BASE_URL}/fixtures?date=${date}`, { headers: { "x-apisports-key": API_KEY } });
        const data = await response.json();
        const jogosProcessados = await Promise.all(
          data.response.map(async game => {
            const homeHistory = await fetchHistoryStats(game.teams?.home?.id);
            const awayHistory = await fetchHistoryStats(game.teams?.away?.id);
            const prediction = calculateStatisticalPrognosis(homeHistory, awayHistory, []);
            return { ...game, prediction };
          })
        );
        const jogosPorCampeonato = {};
        jogosProcessados.forEach(game => {
          const leagueId = game.league.id;
          if (!jogosPorCampeonato[leagueId]) {
            jogosPorCampeonato[leagueId] = {
              league: { id: game.league.id, name: game.league.name, logo: game.league.logo, country: game.league.country },
              games: []
            };
          }
          jogosPorCampeonato[leagueId].games.push(game);
        });
        return { success: true, response: jogosPorCampeonato };
      }, 60000);
    res.json(resultadoFinal);
  } catch (error) {
    res.status(500).json({ error: "Erro ao buscar jogos" });
  }
});

//////////////////////////////////////////////
// PROGNÓSTICO UNITÁRIO
//////////////////////////////////////////////

app.get("/api/prognostico", async (req, res) => {
  const { home, away } = req.query;
  try {
    const homeResponse = await fetch(`${BASE_URL}/fixtures?team=${home}&last=10`, { headers: { "x-apisports-key": API_KEY } });
    const awayResponse = await fetch(`${BASE_URL}/fixtures?team=${away}&last=10`, { headers: { "x-apisports-key": API_KEY } });
    const homeData = await homeResponse.json();
    const awayData = await awayResponse.json();

    function calcularMedia(jogos, teamId) {
      if (!jogos || jogos.length === 0) return { feitos: 1.35, sofridos: 1.35 };
      let golsFeitos = 0, golsSofridos = 0, validos = 0;
      jogos.forEach(jogo => {
        if (jogo.goals && jogo.goals.home !== null && jogo.goals.away !== null) {
          validos++;
          if (jogo.teams.home.id == teamId) { golsFeitos += jogo.goals.home; golsSofridos += jogo.goals.away; }
          else { golsFeitos += jogo.goals.away; golsSofridos += jogo.goals.home; }
        }
      });
      return validos === 0 ? { feitos: 1.35, sofridos: 1.35 } : { feitos: golsFeitos / validos, sofridos: golsSofridos / validos };
    }

    const homeStats = calcularMedia(homeData.response, home);
    const awayStats = calcularMedia(awayData.response, away);
    const expCasa = (homeStats.feitos + awayStats.sofridos) / 2;
    const expFora = (awayStats.feitos + homeStats.sofridos) / 2;
    const mediaGols = expCasa + expFora;
    const total = expCasa + expFora;
    const casa = (expCasa / total) * 100;
    const fora = (expFora / total) * 100;
    const empate = 100 - casa - fora;

    res.json({
      success: true,
      mediaGols: mediaGols.toFixed(2),
      over15: Math.min(95, (mediaGols/2)*100).toFixed(1),
      over25: Math.min(95, (mediaGols/3)*100).toFixed(1),
      casa: casa.toFixed(1), empate: empate.toFixed(1), fora: fora.toFixed(1)
    });
  } catch (error) { res.status(500).json({ success: false }); }
});

//////////////////////////////////////////////
// ELITE TRADER SCANNER (TOTALMENTE RESTAURADO)
//////////////////////////////////////////////

app.get("/api/elite-trader", async (req, res) => {
  const { date, league } = req.query;
  await carregarOddsDoDia(date);

  try {
    const resultado = await adaptiveEngine(`elite_trader_${date}_${league || "all"}`, async () => {
        let url = `${BASE_URL}/fixtures?date=${date}`;
        if (league) url += `&league=${league}&season=2025`;

        const response = await fetch(url, { headers: { "x-apisports-key": API_KEY } });
        const data = await response.json();
        if (!data.response) return { success: true, total: 0, elitePicks: [] };

        let oportunidades = [];

        for (let game of data.response) {
          if (game.fixture.status.short !== "NS") continue;
          
          const fixtureId = game.fixture.id;
          const oddsData = oddsDoDia[fixtureId];
          if(!oddsData || !oddsData.bookmakers) continue;
          
          const markets = oddsData.bookmakers[0].bets;

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

          const homeHistory = await fetchHistoryStats(game.teams.home.id);
          const awayHistory = await fetchHistoryStats(game.teams.away.id);

          const leagueAverage = 1.35;
          const xgCasa = ( (homeHistory.reduce((a,b)=>a+(b.goals.home||0),0)/5) / leagueAverage) * leagueAverage;
          const xgFora = ( (awayHistory.reduce((a,b)=>a+(b.goals.away||0),0)/5) / leagueAverage) * leagueAverage;

          const elite = calcularElite({ feitos: xgCasa, sofridos: xgFora }, { feitos: xgFora, sofridos: xgCasa }, leagueAverage);

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
            const ev = (probModelo * m.odd) - 1;
            if(ev < 0.01) continue;

            const traderScore = (ev * 0.5) + (probModelo * 0.3);
            
            oportunidades.push({
              jogo: `${game.teams.home.name} x ${game.teams.away.name}`,
              liga: game.league.name,
              mercado: m.nome,
              odd: m.odd,
              probModelo: (probModelo * 100).toFixed(2),
              ev: analise.ev,
              traderScore: traderScore,
              rating: analise.rating,
              alerta: analise.alerta,
              smartMoney: smartMoneyDetector(probModelo, m.odd)
            });
          }
        }

        oportunidades.sort((a, b) => b.traderScore - a.traderScore);
        return { success: true, total: oportunidades.length, elitePicks: oportunidades.slice(0, 15) };
      }, 120000);
    res.json(resultado);
  } catch (error) { res.status(500).json({ error: "Erro no Scanner" }); }
});

//////////////////////////////////////////////
// SUPER PICKS IA E OUTRAS ROTAS
//////////////////////////////////////////////

app.get("/api/super-picks", async (req, res) => {
  const { date } = req.query;
  try {
    const traderResponse = await fetch(`http://localhost:${PORT}/api/elite-trader?date=${date}`);
    const data = await traderResponse.json();
    res.json({ success: true, superPicks: data.elitePicks || [] });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.get("/api/picks-ia", async (req, res) => {
  const { date } = req.query;
  try {
    const response = await fetch(`http://localhost:${PORT}/api/elite-trader?date=${date}`);
    const data = await response.json();
    res.json({ success: true, picks: (data.elitePicks || []).slice(0,3) });
  } catch (err) { res.status(500).json({ success: false }); }
});

function analyzeOddsMovement(gameId, market, oddAtual){
  const key = gameId + "_" + market;
  if(!oddsTracker[key]){
    oddsTracker[key] = { firstOdd: oddAtual, lastOdd: oddAtual, drops: 0 };
    return null;
  }
  const data = oddsTracker[key];
  if(oddAtual < data.lastOdd) data.drops++;
  data.lastOdd = oddAtual;
  return data.drops >= 3 ? "💰 DINHEIRO PROFISSIONAL" : null;
}

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
 console.log("Backend rodando na porta " + PORT);
});
