function fatorial(n) {
  if (n === 0 || n === 1) return 1;
  return n * fatorial(n - 1);
}

function poisson(lambda, k) {
  return (Math.pow(Math.E, -lambda) * Math.pow(lambda, k)) / fatorial(k);
}

function calcularProbabilidadesAvancadas(teamA, teamB, mediaLiga = 2.6) {
  const ataqueA = teamA.golsMarcados / mediaLiga;
  const defesaA = teamA.golsSofridos / mediaLiga;

  const ataqueB = teamB.golsMarcados / mediaLiga;
  const defesaB = teamB.golsSofridos / mediaLiga;

  const xG_A = ataqueA * defesaB * mediaLiga;
  const xG_B = ataqueB * defesaA * mediaLiga;

  let probA = 0;
  let probEmpate = 0;
  let probB = 0;
  let probBTTS = 0;
  let probOver = 0;

  for (let i = 0; i <= 5; i++) {
    for (let j = 0; j <= 5; j++) {
      const p = poisson(xG_A, i) * poisson(xG_B, j);

      if (i > j) probA += p;
      if (i === j) probEmpate += p;
      if (j > i) probB += p;

      if (i > 0 && j > 0) probBTTS += p;
      if (i + j >= 3) probOver += p;
    }
  }

  return {
    vitoriaA: (probA * 100).toFixed(0),
    empate: (probEmpate * 100).toFixed(0),
    vitoriaB: (probB * 100).toFixed(0),
    bttsSim: (probBTTS * 100).toFixed(0),
    bttsNao: (100 - probBTTS * 100).toFixed(0),
    over25: (probOver * 100).toFixed(0),
    under25: (100 - probOver * 100).toFixed(0)
  };
}

module.exports = calcularProbabilidadesAvancadas;
