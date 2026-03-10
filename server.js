const express = require("express")
const fetch = require("node-fetch")
const cors = require("cors")

const calcularElite = require("./engine/professionalEngine")

const app = express()

app.use(cors())
app.use(express.json())

const BASE_URL = "https://v3.football.api-sports.io"
const API_KEY = process.env.API_FOOTBALL_KEY

const PORT = process.env.PORT || 8080

//////////////////////////////////////////////////////////
// CACHE MULTINÍVEL
//////////////////////////////////////////////////////////

const memoryCache = new Map()

function setCache(key,data,ttl=60000){

 memoryCache.set(key,{
  data,
  expire:Date.now()+ttl
 })

}

function getCache(key){

 const item = memoryCache.get(key)

 if(!item) return null

 if(Date.now()>item.expire){

  memoryCache.delete(key)
  return null

 }

 return item.data

}

//////////////////////////////////////////////////////////
// ODDS TRACKER (MOVIMENTO)
//////////////////////////////////////////////////////////

const oddsTracker = {}

function analyzeOddsMovement(gameId,market,odd){

 const key = gameId+"_"+market

 if(!oddsTracker[key]){

  oddsTracker[key]={
   firstOdd:odd,
   lastOdd:odd,
   drops:0
  }

  return null
 }

 const data = oddsTracker[key]

 if(odd < data.lastOdd){

  data.drops++

 }

 const diff = data.firstOdd - odd

 data.lastOdd = odd

 if(diff>0.20){

  return "🚨 QUEDA FORTE DE ODD"

 }

 if(data.drops>=3){

  return "💰 SHARP MONEY"

 }

 if(odd > data.firstOdd + 0.30){

  return "⚠️ POSSÍVEL TRAP"

 }

 return null

}

//////////////////////////////////////////////////////////
// SMART MONEY DETECTOR
//////////////////////////////////////////////////////////

function detectSharpMoney(prob,odd){

 const implied = 1/odd

 const diff = prob - implied

 if(diff > 0.07){

  return "💰 DINHEIRO PROFISSIONAL"

 }

 if(diff < -0.05){

  return "⚠️ POSSÍVEL ARMADILHA"

 }

 return null

}

//////////////////////////////////////////////////////////
// CALCULAR VALUE BET
//////////////////////////////////////////////////////////

function calcularEV(prob,odd){

 const ev = prob * odd - 1

 return ev

}

//////////////////////////////////////////////////////////
// KELLY
//////////////////////////////////////////////////////////

function kelly(prob,odd){

 const k = (prob*odd-1)/(odd-1)

 return Math.max(0,k)*0.25

}

//////////////////////////////////////////////////////////
// HISTÓRICO TIMES
//////////////////////////////////////////////////////////

const historyCache = {}

async function fetchHistory(team){

 if(historyCache[team]) return historyCache[team]

 const response = await fetch(
 `${BASE_URL}/fixtures?team=${team}&last=5&status=FT`,
 {headers:{"x-apisports-key":API_KEY}}
 )

 const data = await response.json()

 historyCache[team]=data.response || []

 return historyCache[team]

}

//////////////////////////////////////////////////////////
// MÉDIAS DE GOLS
//////////////////////////////////////////////////////////

function mediaGols(jogos,id){

 if(!jogos.length){

  return {feitos:1.35,sofridos:1.35}

 }

 let feitos=0
 let sofridos=0

 jogos.forEach(j=>{

 const home = j.teams.home.id===id

 feitos += home ? j.goals.home : j.goals.away
 sofridos += home ? j.goals.away : j.goals.home

 })

 return{

  feitos:feitos/jogos.length,
  sofridos:sofridos/jogos.length

 }

}

//////////////////////////////////////////////////////////
// SCANNER ULTRA RÁPIDO
//////////////////////////////////////////////////////////

async function scanGames(date){

 const cacheKey = "scan_"+date

 const cached = getCache(cacheKey)

 if(cached) return cached

 const fixturesRes = await fetch(
 `${BASE_URL}/fixtures?date=${date}`,
 {headers:{"x-apisports-key":API_KEY}}
 )

 const fixturesData = await fixturesRes.json()

 const fixtures = fixturesData.response || []

 const results = []

 await Promise.all(fixtures.map(async game=>{

 if(game.fixture.status.short!=="NS") return

 const fixtureId = game.fixture.id

 const oddsRes = await fetch(
 `${BASE_URL}/odds?fixture=${fixtureId}`,
 {headers:{"x-apisports-key":API_KEY}}
 )

 const oddsData = await oddsRes.json()

 if(!oddsData.response?.length) return

 const bookmaker = oddsData.response[0].bookmakers[0]

 const markets = bookmaker.bets

 function getOdd(name,val){

 const m = markets.find(x=>x.name===name)

 if(!m) return null

 const o = m.values.find(v=>v.value===val)

 return o ? Number(o.odd) : null

 }

 const oddHome = getOdd("Match Winner","Home")
 const oddOver = getOdd("Goals Over/Under","Over 2.5")

 if(!oddHome && !oddOver) return

 const homeId = game.teams.home.id
 const awayId = game.teams.away.id

 const homeHist = await fetchHistory(homeId)
 const awayHist = await fetchHistory(awayId)

 const homeStats = mediaGols(homeHist,homeId)
 const awayStats = mediaGols(awayHist,awayId)

 const leagueAvg = 1.35

 const xgHome =
 (homeStats.feitos/leagueAvg)*
 (awayStats.sofridos/leagueAvg)*
 leagueAvg

 const xgAway =
 (awayStats.feitos/leagueAvg)*
 (homeStats.sofridos/leagueAvg)*
 leagueAvg

 const elite = calcularElite(
 {feitos:xgHome,sofridos:xgAway},
 {feitos:xgAway,sofridos:xgHome},
 leagueAvg
 )

 const prob = elite.probability.homeWin/100

 if(!oddHome) return

 const ev = calcularEV(prob,oddHome)

 if(ev<0.02) return

 const edge = prob - (1/oddHome)

 const sharp = detectSharpMoney(prob,oddHome)

 const movimento = analyzeOddsMovement(fixtureId,"home",oddHome)

 const stake = kelly(prob,oddHome)

 const score =
 (ev*0.5)+
 (prob*0.3)+
 (edge*0.2)

 results.push({

 jogo:`${game.teams.home.name} x ${game.teams.away.name}`,

 liga:game.league.name,

 mercado:"Home Win",

 odd:oddHome,

 prob:(prob*100).toFixed(2),

 ev:(ev*100).toFixed(2),

 edge:(edge*100).toFixed(2),

 traderScore:score.toFixed(4),

 stake:(stake*100).toFixed(2)+"%",

 sharp,

 movimento

 })

 }))

 results.sort((a,b)=>b.traderScore-a.traderScore)

 setCache(cacheKey,results,120000)

 return results

}

//////////////////////////////////////////////////////////
// API ELITE TRADER
//////////////////////////////////////////////////////////

app.get("/api/elite-trader",async(req,res)=>{

 try{

 const {date} = req.query

 const data = await scanGames(date)

 res.json({

  success:true,
  total:data.length,
  elitePicks:data.slice(0,20),
  picksIA:data.slice(0,3)

 })

 }catch(err){

 console.log(err)

 res.status(500).json({error:"scanner error"})

 }

})

//////////////////////////////////////////////////////////
// ROOT
//////////////////////////////////////////////////////////

app.get("/",(req,res)=>{

 res.send("GolBetPro Elite Trader 7.0 Online 🚀")

})

//////////////////////////////////////////////////////////
// START
//////////////////////////////////////////////////////////

app.listen(PORT,()=>{

 console.log("Servidor rodando "+PORT)

})
