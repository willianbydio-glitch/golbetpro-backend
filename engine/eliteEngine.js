function calcularElite(teamA, teamB) {
  const jogosA = teamA.jogos;
  const jogosB = teamB.jogos;

  if (!jogosA.length || !jogosB.length) {
    return { error: "Dados insuficientes" };
  }

  function mediaGolsMarcados(jogos) {
    return jogos.reduce((s, j) => s + j.golsMarcados, 0) / jogos.length;
  }

  function mediaGolsSofridos(jogos) {
    return jogos.reduce((s, j) => s + j.golsSofridos, 0) / jogos.length;
  }

  function taxaBTTS(jogos) {
    const count = jogos.filter(j => j.golsMarcados > 0 && j.golsSofridos > 0).length;
    return (count / jogos.length) * 100;
  }

  function taxaOver25(jogos) {
    const count = jogos.filter(j => (j.golsMarcados + j.golsSofridos) > 2.5).length;
    return (count / jogos.length) * 100;
  }

  const ataqueA = mediaGolsMarcados(jogosA);
  const defesaA = mediaGolsSofridos(jogosA);

  const ataqueB = mediaGolsMarcados(jogosB);
  const defesaB = mediaGolsSofridos(jogosB);

  const expectativaGolsA = (ataqueA + defesaB) / 2;
  const expectativaGolsB = (ataqueB + defesaA) / 2;

  const totalEsperado = expectativaGolsA + expectativaGolsB;

  const forcaA = ataqueA - defesaA;
  const forcaB = ataqueB - defesaB;

  const somaForcas = Math.abs(forcaA) + Math.abs(forcaB);

  const probA = ((forcaA + somaForcas) / (2 * somaForcas)) * 100;
  const probB = ((forcaB + somaForcas) / (2 * somaForcas)) * 100;

  const empate = Math.max(0, 100 - (probA + probB));

  const btts = (taxaBTTS(jogosA) + taxaBTTS(jogosB)) / 2;
  const over25 = (taxaOver25(jogosA) + taxaOver25(jogosB)) / 2;
  const under25 = 100 - over25;

  const dominancia = Math.abs(probA - probB);

  let risco;
  if (dominancia > 40) risco = "Muito baixo";
  else if (dominancia > 25) risco = "Moderado";
  else risco = "Alto";

  return {
    eliteAbsurda: {
      expectativaGolsCasa: expectativaGolsA.toFixed(2),
      expectativaGolsFora: expectativaGolsB.toFixed(2),
      totalGolsEsperado: totalEsperado.toFixed(2),

      probabilidadeCasa: probA.toFixed(1),
      probabilidadeEmpate: empate.toFixed(1),
      probabilidadeFora: probB.toFixed(1),

      btts: btts.toFixed(1),
      over25: over25.toFixed(1),
      under25: under25.toFixed(1),

      indiceDominancia: dominancia.toFixed(1),
      nivelRisco: risco
    }
  };
}

module.exports = calcularElite;
