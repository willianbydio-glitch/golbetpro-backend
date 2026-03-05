//////////////////////////////////////////////
// GOLBETPRO ELITE ENGINE 2.3 PROFISSIONAL
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

  ///////////////////////////////////////////////////////
  // homeStats.feitos e awayStats.feitos já são xG
  ///////////////////////////////////////////////////////

  let lambdaHome = safeNumber(homeStats?.feitos, leagueAverage);
  let lambdaAway = safeNumber(awayStats?.feitos, leagueAverage);

  lambdaHome = Math.max(0.2, lambdaHome);
  lambdaAway = Math.max(0.2, lambdaAway);

  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  let over25 = 0;
  let btts = 0;

  let matrix = [];

  //////////////////////////////////////////
  // MATRIZ EXPANDIDA 0-8 GOLS
  //////////////////////////////////////////

  for (let i = 0; i <= 8; i++) {
    for (let j = 0; j <= 8; j++) {

      const p =
        poisson(lambdaHome, i) *
        poisson(lambdaAway, j);

      matrix.push({
        score: `${i}x${j}`,
        probability: p
      });
    }
  }

  //////////////////////////////////////////
  // RENORMALIZAÇÃO TOTAL
  //////////////////////////////////////////

  const totalProb = matrix.reduce((sum, item) => sum + item.probability, 0);

  matrix = matrix.map(item => ({
    ...item,
    probability: item.probability / totalProb
  }));

  //////////////////////////////////////////
  // RECÁLCULO DOS MERCADOS
  //////////////////////////////////////////

  for (let item of matrix) {
    const [i, j] = item.score.split('x').map(Number);
    const p = item.probability;

    if (i > j) homeWin += p;
    if (i === j) draw += p;
    if (i < j) awayWin += p;

    if (i + j >= 3) over25 += p;
    if (i >= 1 && j >= 1) btts += p;
  }

  //////////////////////////////////////////
  // NORMALIZAÇÃO 1X2
  //////////////////////////////////////////

  const total1x2 = homeWin + draw + awayWin;

  homeWin /= total1x2;
  draw /= total1x2;
  awayWin /= total1x2;

  over25 = safeNumber(over25);
  btts = safeNumber(btts);

  matrix.sort((a, b) => b.probability - a.probability);

  //////////////////////////////////////////
  // RETORNO FINAL
  //////////////////////////////////////////

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
