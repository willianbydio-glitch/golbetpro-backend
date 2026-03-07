//////////////////////////////////////////////
// GOLBETPRO ELITE ENGINE 3.0
// MONTE CARLO + POISSON HYBRID
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

function randomPoisson(lambda) {
  let L = Math.exp(-lambda);
  let k = 0;
  let p = 1;

  do {
    k++;
    p *= Math.random();
  } while (p > L);

  return k - 1;
}

function safeNumber(n, fallback = 1.2) {
  if (!n || isNaN(n) || !isFinite(n)) return fallback;
  return n;
}

function calcularElite(homeStats, awayStats, leagueAverage = 1.35) {

  let lambdaHome = safeNumber(homeStats?.feitos, leagueAverage);
  let lambdaAway = safeNumber(awayStats?.feitos, leagueAverage);

  lambdaHome = Math.max(0.2, lambdaHome);
  lambdaAway = Math.max(0.2, lambdaAway);

  //////////////////////////////////////////
  // MATRIZ POISSON (BASE)
  //////////////////////////////////////////

  let matrix = [];

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

  const totalProb = matrix.reduce((s, m) => s + m.probability, 0);

  matrix = matrix.map(m => ({
    ...m,
    probability: m.probability / totalProb
  }));

  //////////////////////////////////////////
  // MONTE CARLO SIMULATION
  //////////////////////////////////////////

  const SIMULATIONS = 10000;

  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  let over25 = 0;
  let btts = 0;

  for (let i = 0; i < SIMULATIONS; i++) {

    const homeGoals = randomPoisson(lambdaHome);
    const awayGoals = randomPoisson(lambdaAway);

    if (homeGoals > awayGoals) homeWin++;
    if (homeGoals === awayGoals) draw++;
    if (awayGoals > homeGoals) awayWin++;

    if (homeGoals + awayGoals >= 3) over25++;
    if (homeGoals > 0 && awayGoals > 0) btts++;

  }

  const probHome = homeWin / SIMULATIONS;
  const probDraw = draw / SIMULATIONS;
  const probAway = awayWin / SIMULATIONS;

  const probOver = over25 / SIMULATIONS;
  const probBTTS = btts / SIMULATIONS;

  matrix.sort((a, b) => b.probability - a.probability);

  //////////////////////////////////////////
  // RESULTADO FINAL
  //////////////////////////////////////////

  return {

    expectedGoals: (lambdaHome + lambdaAway).toFixed(2),

    probability: {
      homeWin: (probHome * 100).toFixed(2),
      draw: (probDraw * 100).toFixed(2),
      awayWin: (probAway * 100).toFixed(2)
    },

    markets: {
      over25: (probOver * 100).toFixed(2),
      under25: ((1 - probOver) * 100).toFixed(2),
      btts: (probBTTS * 100).toFixed(2)
    },

    topScores: matrix.slice(0, 5)

  };

}

module.exports = calcularElite;
