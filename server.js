const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");
const calcularElite = require("./engine/professionalEngine");
const calcularPoisson = require("./engine/poisonEngine");

// Configuração e Cache
const BASE_URL = "https://v3.football.api-sports.io";
const API_KEY = process.env.API_FOOTBALL_KEY;
const oddsTracker = {};
const teamHistoryCache = {};
let oddsDoDia = {};
const cache = new Map();

const app = express();
app.use(cors());
app.use(express.json());

/////////////////////////////////////////////
// CARREGAMENTO DE ODDS OTIMIZADO (BATCH)
//////////////////////////////////////////////

async function carregarOddsDoDia(date) {
    try {
        const fixturesResponse = await fetch(`${BASE_URL}/fixtures?date=${date}`, {
            headers: { "x-apisports-key": API_KEY }
        });
        const fixturesData = await fixturesResponse.json();
        oddsDoDia = {};

        if (!fixturesData.response) return;

        const fixtureIds = fixturesData.response.map(g => g.fixture.id);
        
        // Processa em lotes de 10 para ser 10x mais rápido sem travar a API
        const chunkSize = 10;
        for (let i = 0; i < fixtureIds.length; i += chunkSize) {
            const lote = fixtureIds.slice(i, i + chunkSize);
            await Promise.all(lote.map(async (id) => {
                try {
                    const res = await fetch(`${BASE_URL}/odds?fixture=${id}`, {
                        headers: { "x-apisports-key": API_KEY }
                    });
                    const data = await res.json();
                    if (data.response?.length > 0) {
                        oddsDoDia[id] = data.response[0];
                    }
                } catch (e) { console.log("Erro odd:", id); }
            }));
        }
        console.log("✅ ODDS CARREGADAS:", Object.keys(oddsDoDia).length);
    } catch (err) {
        console.log("Erro ao carregar odds:", err);
    }
}

/////////////////////////////////////////////
// DETECTORES E AUXILIARES
//////////////////////////////////////////////

function smartMoneyDetector(probModelo, odd) {
    const probBook = 1 / odd;
    const diferenca = probModelo - probBook;
    if (diferenca > 0.08) return "💰 DINHEIRO FORTE";
    if (diferenca < -0.05) return "⚠️ POSSÍVEL ARMADILHA";
    return null;
}

function analyzeOddsMovement(gameId, market, oddAtual) {
    const key = `${gameId}_${market}`;
    if (!oddsTracker[key]) {
        oddsTracker[key] = { firstOdd: oddAtual, lastOdd: oddAtual, drops: 0 };
        return null;
    }
    const data = oddsTracker[key];
    if (oddAtual < data.lastOdd) data.drops++;
    const diff = data.firstOdd - oddAtual;
    data.lastOdd = oddAtual;

    if (diff > 0.20) return "🚨 QUEDA FORTE (SHARP)";
    if (data.drops >= 3) return "💰 ENTRADA PROFISSIONAL";
    return null;
}

async function fetchHistoryStats(teamId) {
    if (teamHistoryCache[teamId]) return teamHistoryCache[teamId];
    try {
        const response = await fetch(`${BASE_URL}/fixtures?team=${teamId}&last=8&status=FT`, {
            headers: { "x-apisports-key": API_KEY }
        });
        const data = await response.json();
        teamHistoryCache[teamId] = data.response || [];
        return teamHistoryCache[teamId];
    } catch (err) { return []; }
}

//////////////////////////////////////////////
// ROTA ELITE TRADER (CORRIGIDA)
//////////////////////////////////////////////

app.get("/api/elite-trader", async (req, res) => {
    const { date, league } = req.query;
    
    // 1. Carrega Odds primeiro
    await carregarOddsDoDia(date);

    try {
        let url = `${BASE_URL}/fixtures?date=${date}`;
        if (league) url += `&league=${league}&season=2025`;

        const response = await fetch(url, { headers: { "x-apisports-key": API_KEY } });
        const data = await response.json();

        if (!data.response) return res.json({ success: true, elitePicks: [] });

        let oportunidades = [];

        for (let game of data.response) {
            const fixtureId = game.fixture.id;
            const oddsData = oddsDoDia[fixtureId];

            if (!oddsData || !oddsData.bookmakers?.length) continue;

            const markets = oddsData.bookmakers[0].bets;
            const getOdd = (mName, val) => {
                const m = markets.find(x => x.name === mName);
                return m ? m.values.find(v => v.value === val)?.odd : null;
            };

            const odds = {
                home: Number(getOdd("Match Winner", "Home")),
                over25: Number(getOdd("Goals Over/Under", "Over 2.5")),
                btts: Number(getOdd("Both Teams Score", "Yes"))
            };

            if (!odds.home) continue;

            // Stats e Cálculos
            const homeH = await fetchHistoryStats(game.teams.home.id);
            const awayH = await fetchHistoryStats(game.teams.away.id);

            // Simplificação de XG para o Scanner
            const calcMed = (h) => h.reduce((a, b) => a + (b.goals.home + b.goals.away), 0) / (h.length || 1);
            const xg = (calcMed(homeH) + calcMed(awayH)) / 4;

            const elite = calcularElite({ feitos: xg, sofridos: xg }, { feitos: xg, sofridos: xg }, 1.35);

            // Validação de Valor (Value Bet)
            const prob = elite.probability.homeWin / 100;
            const ev = (prob * odds.home) - 1;

            if (ev > 0.05) {
                oportunidades.push({
                    jogo: `${game.teams.home.name} x ${game.teams.away.name}`,
                    liga: game.league.name,
                    mercado: "Home Win",
                    odd: odds.home,
                    ev: (ev * 100).toFixed(2),
                    smartMoney: smartMoneyDetector(prob, odds.home),
                    movimento: analyzeOddsMovement(fixtureId, "Home", odds.home)
                });
            }
        }

        res.json({ success: true, total: oportunidades.length, elitePicks: oportunidades });

    } catch (error) {
        res.status(500).json({ error: "Erro interno no Scanner" });
    }
});

app.get("/", (req, res) => res.send("GolBetPro Backend Online 🚀"));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("Servidor em: " + PORT));
