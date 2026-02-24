const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/jogos", async (req, res) => {

  const { date } = req.query;
  const API_KEY = process.env.API_FOOTBALL_KEY;

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

    res.json({
      success: true,
      response: data.response
    });

  } catch (error) {
    res.status(500).json({ error: "Erro ao buscar jogos" });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Servidor rodando na porta " + PORT);
});
