function fatorial(n) {
  if (n <= 1) return 1;
  return n * fatorial(n - 1);
}

function poisson(lambda, k) {
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / fatorial(k);
}

// Ajuste Dixon-Coles simplificado
function dixonColesAdjustment(i, j, lambda, mu, rho = -0.1) {
  if (i === 0 && j === 0) return 1 - (lambda * mu * rho);
  if (i === 0 && j === 1) return 1 + (lambda * rho);
  if (i === 1 && j === 0) return 1 + (mu * rho);
  if (i === 1 && j === 1) return 1 - rho;
  return 1;
}

function pesoForma(jogos) {
  let totalGols = 0;
  let totalSofridos = 0;

  jogos.forEach((jogo, index) => {
    const peso = index < 5 ? 1.5 : 1; // últimos 5 valem mais
    totalGols += jogo.golsMarcados * peso;
    totalSofridos += jogo.golsSofridos * peso;
  });

  return {
    mediaMarcados: totalGols / jogos.length,
    mediaSofridos: totalSofridos / jogos.length
  };
}

function calcularElite(teamA, teamB, mediaLiga = 2.6) {
  const statsA = pesoForma(teamA.jogos);
  const statsB = pesoForma(teamB.jogos);

  const ataqueA = statsA.mediaMarcados / mediaLiga;
  const defesaA = statsA.mediaSofridos / mediaLiga;

  const ataqueB = statsB.mediaMarcados / mediaLiga;
  const defesaB = statsB.mediaSofridos / mediaLiga;

  const xG_A = ataqueA * defesaB * mediaLiga;
  const xG_B = ataqueB * defesaA * mediaLiga;

  let probA = 0;
  let probEmpate = 0;
  let probB = 0;
  let probBTTS = 0;
  let probOver = 0;

  for (let i = 0; i <= 6; i++) {
    for (let j = 0; j <= 6; j++) {
      let p = poisson(xG_A, i) * poisson(xG_B, j);

      p *= dixonColesAdjustment(i, j, xG_A, xG_B);

      if (i > j) probA += p;
      if (i === j) probEmpate += p;
      if (j > i) probB += p;

      if (i > 0 && j > 0) probBTTS += p;
      if (i + j >= 3) probOver += p;
    }
  }

  const total = probA + probEmpate + probB;

  return {
    vitoriaA: ((probA / total) * 100).toFixed(0),
    empate: ((probEmpate / total) * 100).toFixed(0),
    vitoriaB: ((probB / total) * 100).toFixed(0),
    bttsSim: (probBTTS * 100).toFixed(0),
    bttsNao: (100 - probBTTS * 100).toFixed(0),
    over25: (probOver * 100).toFixed(0),
    under25: (100 - probOver * 100).toFixed(0),
    xG_A: xG_A.toFixed(2),
    xG_B: xG_B.toFixed(2)
  };
}

module.exports = calcularElite;
