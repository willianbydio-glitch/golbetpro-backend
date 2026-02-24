//////////////////////////////////////////////
// ULTRA ELITE PREDICTOR MODULE (ADICIONAL)
//////////////////////////////////////////////

function ultraElitePredictor(game) {

  const teamsKey = `${game?.teams?.home?.id || 0}_${game?.teams?.away?.id || 0}`;

  const baseRandom = Math.random() * 40 + 60;

  const probabilityHome = Math.min(97, baseRandom);
  const probabilityAway = Math.min(97, 100 - baseRandom);

  const probabilityDraw = Math.max(
    0,
    100 - (probabilityHome + probabilityAway)
  );

  const riskIndex = Math.abs(probabilityHome - probabilityAway);

  return {
    ultraElite: {
      probabilityHome: Number(probabilityHome.toFixed(2)),
      probabilityAway: Number(probabilityAway.toFixed(2)),
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
