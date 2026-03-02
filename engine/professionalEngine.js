//////////////////////////////////////////////
// PROFESSIONAL ENGINE - GOLBETPRO ELITE
//////////////////////////////////////////////

function factorial(n) {
  if (n === 0) return 1;
  let result = 1;
  for (let i = 1; i <= n; i++) result *= i;
  return result;
}

function poisson(lambda, x) {
  return (Math.exp(-lambda) * Math.pow(lambda, x)) / factorial(x);
}

function calcularElite(homeStats, awayStats, leagueAverage = 1.4) {

  // FORÇA OFENSIVA
  const attackHome = homeStats.feitos / leagueAverage;
  const attackAway = awayStats.feitos / leagueAverage;

  // FORÇA DEFENSIVA
  const defenseHome = homeStats.sofridos / leagueAverage;
  const defenseAway = awayStats.sofridos / leagueAverage;

  // FATOR CASA
  const homeFactor = 1.10;

  // LAMBDAS
  const lambdaHome =
    leagueAverage * attackHome * defenseAway * homeFactor;

  const lambdaAway =
    leagueAverage * attackAway * defenseHome;

  // MATRIZ DE PLACARES
  let matrix = [];
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  let over25 = 0;
  let btts = 0;

  for (let i = 0; i <= 6; i++) {
    for (let j = 0; j <= 6; j++) {

      const prob =
        poisson(lambdaHome, i) *
        poisson(lambdaAway, j);

      matrix.push({
        score: `${i}x${j}`,
        probability: prob
      });

      if (i > j) homeWin += prob;
      if (i === j) draw += prob;
      if (i < j) awayWin += prob;

      if (i + j >= 3) over25 += prob;
      if (i >= 1 && j >= 1) btts += prob;
    }
  }

  matrix.sort((a, b) => b.probability - a.probability);

  return {
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
    expectedGoals: (lambdaHome + lambdaAway).toFixed(2),
    topScores: matrix.slice(0, 3)
  };
}

module.exports = calcularElite;
