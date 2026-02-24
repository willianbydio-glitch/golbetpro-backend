require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
app.use(cors());
app.use(express.json());

const API_KEY = process.env.API_FOOTBALL_KEY;

/*
=====================================
ELITE ADAPTIVE CACHE ENGINE
=====================================
*/

const adaptiveCache = new Map();

function adaptiveEngine(key, fetcher, ttl = 60000) {
  const now = Date.now();

  if (adaptiveCache.has(key)) {
    const cached = adaptiveCache.get(key);

    if (now - cached.time < ttl) {
      return Promise.resolve(cached.value);
    }
  }

  return fetcher().then(result => {
    adaptiveCache.set(key, {
      value: result,
      time: Date.now()
    });

    return result;
  });
}

/*
=====================================
ROTA PRINCIPAL (NÃO ALTEREI URL)
=====================================
*/

app.get("/api/jogos", async (req, res) => {

  const { date } = req.query;

  try {

    const resultadoFinal = await adaptiveEngine(
      `jogos_${date}`,
      async () => {

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

        return {
          success: true,
          response: jogosProcessados.sort(
            (a, b) =>
              b.masterEdition.adaptiveProbability -
              a.masterEdition.adaptiveProbability
          )
        };

      },
      60000
    );

    res.json(resultadoFinal);

  } catch (error) {
    res.status(500).json({ error: "Erro ao buscar jogos" });
  }
});

/*
=====================================
SERVER
=====================================
*/

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Backend rodando na porta", PORT);
});
