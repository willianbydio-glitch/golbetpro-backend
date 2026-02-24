const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
app.use(cors());
app.use(express.json());

const API_KEY = process.env.API_FOOTBALL_KEY;

let cache = {
  data: null,
  timestamp: 0
};

const CACHE_TIME = 60 * 1000;

app.get("/api/jogos", async (req, res) => {

  const { date } = req.query;

  if (cache.data && Date.now() - cache.timestamp < CACHE_TIME) {
    return res.json(cache.data);
  }

  try {

    const response = await fetch(
      `https://v3.football.api-sports.io/fixtures?date=${date}`,
      {
        headers: {
          "x-apisports-key": API_KEY
        }
      }
    );

    const data = await response.json();

    const jogosProcessados = data.response.map(game => {

      const momentum = Math.random() * 100;
      const adaptiveProbability = Math.min(95, momentum);

      return {
        ...game,
        masterEdition: {
          momentum,
          adaptiveProbability,
          zebra: adaptiveProbability < 40 ? "Possível Zebra" : "Normal"
        }
      };
    });

    const resultadoFinal = {
      success: true,
      response: jogosProcessados.sort(
        (a, b) =>
          b.masterEdition.adaptiveProbability -
          a.masterEdition.adaptiveProbability
      )
    };

    cache.data = resultadoFinal;
    cache.timestamp = Date.now();

    res.json(resultadoFinal);

  } catch (error) {
    res.status(500).json({ error: "Erro ao buscar jogos" });
  }
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Backend rodando na porta ${PORT}`);
});
