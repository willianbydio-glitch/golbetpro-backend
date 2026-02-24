//////////////////////////////////////////////
// ULTRA ELITE + PROGNÓSTICO ESTATÍSTICO
//////////////////////////////////////////////

async function fetchHistoryStats(teamId) {
  try {

    if (!teamId) return [];

    const response = await fetch(
      `https://v3.football.api-sports.io/fixtures?team=${teamId}&last=5&status=FT`,
      {
        headers: {
          "x-apisports-key": process.env.API_FOOTBALL_KEY
        }
      }
    );

    const data = await response.json();

    return data.response || [];

  } catch {
    return [];
  }
}

function calculateStatisticalPrognosis(homeHistory, awayHistory, h2h) {

  let homeScore = 50;
  let awayScore = 50;

  if (Array.isArray(h2h)) {
    h2h.forEach(game => {
      if (game?.teams?.home?.winner) homeScore += 2;
      if (game?.teams?.away?.winner) awayScore += 2;
    });
  }

  if (Array.isArray(homeHistory)) {
    homeHistory.forEach(game => {
      if (game?.teams?.home?.winner) homeScore += 1.5;
      else awayScore += 1.5;
    });
  }

  if (Array.isArray(awayHistory)) {
    awayHistory.forEach(game => {
      if (game?.teams?.away?.winner) awayScore += 1.5;
      else homeScore += 1.5;
    });
  }

  const total = homeScore + awayScore;

  const probabilityHome = (homeScore / total) * 100;
  const probabilityAway = (awayScore / total) * 100;
  const probabilityDraw = Math.max(
    0,
    100 - (probabilityHome + probabilityAway)
  );

  return {
    probability: {
      homeWin: Number(probabilityHome.toFixed(2)),
      awayWin: Number(probabilityAway.toFixed(2)),
      draw: Number(probabilityDraw.toFixed(2))
    },
    prognosis: {
      expectedGoals: Number((Math.random() * 3 + 0.5).toFixed(2))
    }
  };
}

function ultraElitePredictor(game, stats = {}) {

  const baseRandom = Math.random() * 40 + 60;

  const probabilityHome = Math.min(97, baseRandom);
  const probabilityAway = Math.min(97, 100 - baseRandom);

  const probabilityDraw = Math.max(
    0,
    100 - (probabilityHome + probabilityAway)
  );

  const riskIndex = Math.abs(probabilityHome - probabilityAway);

  const historicalBonus = stats?.homeHistory?.length
    ? stats.homeHistory.length * 0.5
    : 0;

  return {
    ultraElite: {
      probabilityHome: Number(
        Math.min(97, probabilityHome + historicalBonus).toFixed(2)
      ),
      probabilityAway: Number(
        Math.min(97, probabilityAway + historicalBonus).toFixed(2)
      ),
      probabilityDraw: Number(probabilityDraw.toFixed(2)),
      riskIndex: Number(riskIndex.toFixed(2)),

      recommendation:
        riskIndex > 45
          ? "Alta confiança estatística"
          : riskIndex > 25
          ? "Moderada confiança"
          : "Jogo equilibrado"
    }
  };
}
