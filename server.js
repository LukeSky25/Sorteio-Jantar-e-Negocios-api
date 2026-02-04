const express = require("express");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const cors = require("cors");
const multer = require("multer");

// Importe dos Módulos Locais
const findFiles = require("./modules/find");
const readFile = require("./modules/read");
const writeFiles = require("./modules/write");

const app = express();

// --- 1. CONFIGURAÇÕES ---

const STYLE_CONFIG_PATH = path.join(__dirname, "uploads", "styleConfig.json");

const loadStyleConfig = () => {
  try {
    if (fs.existsSync(STYLE_CONFIG_PATH)) {
      const data = fs.readFileSync(STYLE_CONFIG_PATH, "utf8");
      return JSON.parse(data);
    }
    return {
      title: "Evento",
      color: "#000000",
      logo: "",
      backgroundType: "color",
      backgroundValue: "#40e0d0",
    };
  } catch (err) {
    return { title: "Evento", color: "#000000" };
  }
};

const saveStyleConfig = (config) => {
  fs.writeFileSync(STYLE_CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
};

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/favicon.ico", (req, res) => res.status(204).end());
app.get("/", async (req, res) => res.json("API Online"));

// --- 2. ROTAS GERAIS ---

app.get("/files", async (req, res) => {
  try {
    const arquivos = await findFiles();
    res.json(arquivos);
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// --- LÓGICA DE STAFFS (NOVO) ---
// Lê o numero de staffs
app.get("/staffs", async (req, res) => {
  try {
    const conteudo = await readFile("staffs.txt");
    // Se estiver vazio, retorna "0"
    res.json({ quantidade: conteudo.trim() || "0" });
  } catch (error) {
    // Se arquivo não existir, retorna 0
    res.json({ quantidade: "0" });
  }
});

// Salva o numero de staffs
app.post("/staffs", async (req, res) => {
  try {
    const { quantidade } = req.body;
    await writeFiles("staffs.txt", String(quantidade));
    res.json({ message: "Staffs atualizados" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- LÓGICA DE BRINDES ---

app.post("/escrever-brindes", async (req, res) => {
  try {
    const dados = req.body;
    const brindesFormatados = dados.map((brinde, index) => ({
      id: index + 1,
      nome: brinde,
      disponivel: true,
    }));
    const arquivoFinal = await writeFiles("brindes.json", brindesFormatados);
    res.json({ mensagem: "Lista salva", arquivoFinal });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

app.get("/lista-brindes", async (req, res) => {
  try {
    let conteudo;
    try {
      conteudo = await readFile("brindes.json");
    } catch (e) {
      return res.json([]);
    }
    const brindes = JSON.parse(conteudo);
    const nomes = brindes.map((b) => b.nome);
    res.json(nomes);
  } catch (error) {
    res.json([]);
  }
});

// --- LÓGICA DE ARQUIVOS ---

app.get("/arquivo/:nome", async (req, res) => {
  try {
    const nomeArquivo = req.params.nome;
    const conteudo = await readFile(nomeArquivo);
    const Json_data = JSON.parse(conteudo);
    res.json(Json_data);
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

app.get("/reset/:nome", async (req, res) => {
  try {
    // Reset Nomes
    const conteudo = await readFile("lista.txt");
    const linhas = conteudo.split("\n").filter(Boolean);
    const nomesFormatados = linhas.map((nomeCompleto) => ({
      nome: nomeCompleto.trim(),
      list: false,
    }));
    await writeFiles("nomes.json", nomesFormatados);

    // Reset Brindes
    try {
      const conteudoBrindes = await readFile("brindes.json");
      const brindes = JSON.parse(conteudoBrindes);
      const brindesResetados = brindes.map((b) => ({ ...b, disponivel: true }));
      await writeFiles("brindes.json", brindesResetados);
    } catch (e) {}

    // Reset Relatório
    await writeFiles("nomes-sorteados.txt", "");

    res.json("Reset completo");
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

app.post("/escrever/:nome", async (req, res) => {
  try {
    const nomeArquivo = req.params.nome;
    const dados = req.body;
    const textoOriginal = dados.join("\n");
    const arquivoFinal = await writeFiles(nomeArquivo, textoOriginal);
    res.json("Lista salva", arquivoFinal);
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

app.get("/lista", async (req, res) => {
  try {
    const conteudo = await readFile("lista.txt");
    const linhas = conteudo.split("\n").filter(Boolean);
    res.json(linhas);
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// --- SORTEIO ---

app.get("/sortear/:nome/:quantidade", async (req, res) => {
  try {
    const nomeArquivo = req.params.nome;
    const quantidade = parseInt(req.params.quantidade, 10);

    const conteudoNomes = await readFile(nomeArquivo);
    const nomes = JSON.parse(conteudoNomes);
    const candidatos = nomes.filter((p) => p.list === false);

    if (candidatos.length === 0)
      return res.status(400).json({ mensagem: "Nenhum nome disponível." });

    let brindes = [];
    try {
      const conteudoBrindes = await readFile("brindes.json");
      brindes = JSON.parse(conteudoBrindes);
    } catch (e) {
      brindes = [];
    }

    const brindesDisponiveis = brindes.filter((b) => b.disponivel === true);
    const sorteados = [];
    const usados = new Set();
    const resultadoStrings = [];

    while (sorteados.length < quantidade && usados.size < candidatos.length) {
      const i = Math.floor(Math.random() * candidatos.length);
      if (!usados.has(i)) {
        usados.add(i);
        const ganhador = candidatos[i];

        let premioNome = "Sem prêmio cadastrado";
        const premioDaVez = brindesDisponiveis[sorteados.length];

        if (premioDaVez) {
          premioNome = premioDaVez.nome;
          const indexOriginal = brindes.findIndex(
            (b) => b.id === premioDaVez.id,
          );
          if (indexOriginal !== -1) brindes[indexOriginal].disponivel = false;
        }

        sorteados.push(ganhador);
        resultadoStrings.push(`${ganhador.nome} - ${premioNome}`);
      }
    }

    nomes.forEach((pessoa) => {
      if (sorteados.some((s) => s.nome === pessoa.nome)) pessoa.list = true;
    });

    await writeFiles(nomeArquivo, nomes);
    await writeFiles("brindes.json", brindes);

    res.json({ mensagem: "Sucesso", sorteados: resultadoStrings });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

app.post("/relatorio/escrever", async (req, res) => {
  try {
    const { nomes, rodada } = req.body;
    if (!Array.isArray(nomes))
      return res.status(400).json({ erro: "Array inválido" });

    let texto = `\n--- RODADA ${rodada} ---\n`;
    texto += nomes.join("\n") + "\n";

    await fs.promises.appendFile(
      path.join(__dirname, "uploads", "nomes-sorteados.txt"),
      texto,
      "utf8",
    );
    res.json({ mensagem: "Salvo" });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

app.get("/relatorio", async (req, res) => {
  try {
    const conteudo = await readFile("nomes-sorteados.txt");
    const linhas = conteudo.split("\n").filter(Boolean);
    res.json(linhas);
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// --- PDF GENERATOR (ATUALIZADO PARA LER STAFFS DO ARQUIVO) ---
app.get("/relatorio/download", async (req, res) => {
  const txtFilePath = path.join(__dirname, "uploads", "nomes-sorteados.txt");
  if (!fs.existsSync(txtFilePath))
    return res.status(404).send("Arquivo não encontrado");

  try {
    const content = await fs.promises.readFile(txtFilePath, "utf-8");
    const linhas = content.split("\n").filter((linha) => linha.trim() !== "");

    const conteudoLista = await readFile("lista.txt");
    const nomesTotal = conteudoLista.split("\n").filter(Boolean);

    // ATUALIZADO: Ler staffs do arquivo
    let staffs = "0";
    try {
      staffs = await readFile("staffs.txt");
    } catch (e) {}

    const data = new Date();
    const dataHora = data.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const styleConfig = loadStyleConfig();
    const doc = new PDFDocument({ size: "A4", margin: 50 });

    res.setHeader("Content-Disposition", "attachment; filename=relatorio.pdf");
    res.setHeader("Content-Type", "application/pdf");

    doc.pipe(res);

    if (linhas.length === 0) {
      doc.fontSize(16).text("Arquivo vazio", { align: "center" });
    } else {
      doc
        .fontSize(18)
        .font("Times-Bold")
        .text(styleConfig.title, { align: "center" });
      doc.moveDown(0.5);
      doc.fontSize(12).font("Times-Italic").text(dataHora, { align: "center" });

      doc.moveDown(1);
      doc.font("Times-Roman").text(`Total de Convidados: ${nomesTotal.length}`);
      const totalGanhadores = linhas.filter(
        (l) => !l.includes("--- RODADA"),
      ).length;

      doc.text(`Total de Staffs: ${staffs.trim()}`);
      doc.text(`Total de Sorteados: ${totalGanhadores}`);

      doc.moveDown(1);
      doc.font("Times-Roman");
      let contadorGanhadores = 1;

      linhas.forEach((linha) => {
        const textoLimpo = linha.trim();
        if (textoLimpo.startsWith("--- RODADA")) {
          doc.moveDown(1);
          const titulo = textoLimpo.replace(/---/g, "").trim();
          doc.font("Times-Bold").fontSize(14).text(titulo, { underline: true });
          doc.fontSize(12).font("Times-Roman");
          doc.moveDown(0.5);
        } else if (textoLimpo.includes(" - ")) {
          const [nome, premio] = textoLimpo.split(" - ");
          doc
            .font("Times-Bold")
            .text(`${contadorGanhadores}. ${nome}`, { continued: true });
          doc.font("Times-Roman").text(`  ➔  Prêmio: ${premio}`);
          doc.moveDown(0.3);
          contadorGanhadores++;
        } else {
          doc.text(`${contadorGanhadores}. ${textoLimpo}`);
          doc.moveDown(0.3);
          contadorGanhadores++;
        }
      });
    }
    doc.end();
  } catch (error) {
    res.status(500).send("Erro PDF");
  }
});

// --- ESTILO E UPLOAD ---
app.get("/style", (req, res) => res.json(loadStyleConfig()));
app.post("/style", (req, res) => {
  saveStyleConfig(req.body);
  res.json({ message: "Salvo" });
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/images"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });
app.post("/upload", upload.single("file"), (req, res) =>
  res.json({ filePath: `/uploads/images/${req.file.filename}` }),
);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log("API rodando na 3001"));
