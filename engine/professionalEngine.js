//////////////////////////////////////////////
// GOLBETPRO ELITE ENGINE 2.0 PROFISSIONAL
//////////////////////////////////////////////

function factorial(n) {
  if (n === 0) return 1;
  let r = 1;
  for (let i = 1; i <= n; i++) r *= i;
  return r;
}

function poisson(lambda, x) {
  return (Math.exp(-lambda) * Math.pow(lambda, x)) / factorial(x);
}

function safeNumber(n, fallback = 1) {
  if (!n || isNaN(n) || !isFinite(n)) return fallback;
  return n;
}

function calcularElite(homeStats, awayStats, leagueAverage = 1.35) {

  // MÉDIA PADRÃO DA LIGA (fallback seguro)
  const leagueAverage = 1.35;

  // PROTEÇÃO CONTRA HISTÓRICO VAZIO
  const homeFeitos = safeNumber(homeStats?.feitos, leagueAverage);
  const homeSofridos = safeNumber(homeStats?.sofridos, leagueAverage);
  const awayFeitos = safeNumber(awayStats?.feitos, leagueAverage);
  const awaySofridos = safeNumber(awayStats?.sofridos, leagueAverage);

  // FORÇAS
  const attackHome = homeFeitos / leagueAverage;
  const attackAway = awayFeitos / leagueAverage;

  const defenseHome = homeSofridos / leagueAverage;
  const defenseAway = awaySofridos / leagueAverage;

  // FATOR CASA REALISTA
  const homeFactor = 1.12;

  // LAMBDAS COM LIMITE MÍNIMO
  let lambdaHome =
    leagueAverage * attackHome * defenseAway * homeFactor;

  let lambdaAway =
    leagueAverage * attackAway * defenseHome;

  lambdaHome = Math.max(0.2, safeNumber(lambdaHome, leagueAverage));
  lambdaAway = Math.max(0.2, safeNumber(lambdaAway, leagueAverage));

  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  let over25 = 0;
  let btts = 0;

  let matrix = [];

  // MATRIZ 0-6 GOLS
  for (let i = 0; i <= 6; i++) {
    for (let j = 0; j <= 6; j++) {

      const p =
        poisson(lambdaHome, i) *
        poisson(lambdaAway, j);

      matrix.push({
        score: `${i}x${j}`,
        probability: p
      });

      if (i > j) homeWin += p;
      if (i === j) draw += p;
      if (i < j) awayWin += p;

      if (i + j >= 3) over25 += p;
      if (i >= 1 && j >= 1) btts += p;
    }
  }

  // NORMALIZAÇÃO (garante 100%)
  const total1x2 = homeWin + draw + awayWin;

  homeWin /= total1x2;
  draw /= total1x2;
  awayWin /= total1x2;

  over25 = safeNumber(over25);
  btts = safeNumber(btts);

  matrix.sort((a, b) => b.probability - a.probability);

  return {
    expectedGoals: (lambdaHome + lambdaAway).toFixed(2),
    probability: {
      homeWin: (homeWin * 100).toFixed(2),
      draw: (draw * 100).toFixed(2),
      awayWin: (awayWin * 100).toFixed(2)
    },
    markets: {
      over25: (over25 * 100).toFixed(2),
      under25: ((1 - over25) * 100).toFixed(2),
      btts: (btts * 100).toFixed(2)
    },
    topScores: matrix.slice(0, 3)
  };
}

module.exports = calcularElite;
