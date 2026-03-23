const express = require("express");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const cors = require("cors");
const multer = require("multer");

// Seus módulos locais
const findFiles = require("./modules/find");
const readFile = require("./modules/read");
const writeFiles = require("./modules/write");

const app = express();

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// --- HELPER ---
const getFileName = (baseName, eventId) => {
  const id = eventId || "default";
  if (id === "default") return baseName;
  const partes = baseName.split(".");
  const ext = partes.pop();
  const nome = partes.join(".");
  return `${nome}_${id}.${ext}`;
};

// --- ESTILO ---
const getStylePath = (eventId) =>
  path.join(__dirname, "uploads", getFileName("styleConfig.json", eventId));

const loadStyleConfig = (eventId) => {
  try {
    const p = getStylePath(eventId);
    if (fs.existsSync(p)) {
      const data = fs.readFileSync(p, "utf8");
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

app.get("/:eventId/style", (req, res) =>
  res.json(loadStyleConfig(req.params.eventId)),
);

app.post("/:eventId/style", (req, res) => {
  const p = getStylePath(req.params.eventId);
  fs.writeFileSync(p, JSON.stringify(req.body, null, 2), "utf8");
  res.json({ message: "Salvo" });
});

// --- VENCEDORES FIXOS (CONFIGURAÇÃO) ---
app.post("/:eventId/vencedores-fixos", async (req, res) => {
  const file = getFileName("vencedores_fixos.json", req.params.eventId);
  try {
    await writeFiles(file, req.body);
    res.json({ message: "Configuração salva!" });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

app.get("/:eventId/vencedores-fixos", async (req, res) => {
  const file = getFileName("vencedores_fixos.json", req.params.eventId);
  try {
    const conteudo = await readFile(file);
    res.json(JSON.parse(conteudo));
  } catch (error) {
    res.json([]);
  }
});

// --- STAFFS ---
app.get("/:eventId/staffs", async (req, res) => {
  try {
    const file = getFileName("staffs.txt", req.params.eventId);
    const conteudo = await readFile(file);
    res.json({ quantidade: conteudo.trim() || "0" });
  } catch (error) {
    res.json({ quantidade: "0" });
  }
});

app.post("/:eventId/staffs", async (req, res) => {
  try {
    const file = getFileName("staffs.txt", req.params.eventId);
    await writeFiles(file, String(req.body.quantidade));
    res.json({ message: "Staffs atualizados" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- BRINDES ---
app.post("/:eventId/escrever-brindes", async (req, res) => {
  try {
    const file = getFileName("brindes.json", req.params.eventId);
    const nomesNovos = req.body; // Array de strings vindo do frontend

    // 1. Lê os brindes que já existem para não perder o status 'disponivel: false'
    let brindesAntigos = [];
    try {
      const conteudoAntigo = await readFile(file);
      brindesAntigos = JSON.parse(conteudoAntigo);
    } catch (e) {
      brindesAntigos = [];
    }

    // 2. Monta a nova lista preservando quem já foi sorteado
    const brindesFormatados = nomesNovos.map((nomeBrinde, index) => {
      // Procura se esse brinde já existia ignorando letras maiúsculas/minúsculas e espaços
      const brindeJaExistia = brindesAntigos.find(
        (b) => b.nome.toLowerCase().trim() === nomeBrinde.toLowerCase().trim(),
      );

      return {
        id: index + 1,
        nome: nomeBrinde,
        // Se já existia, mantém o status dele. Se é novo, começa como true
        disponivel: brindeJaExistia ? brindeJaExistia.disponivel : true,
      };
    });

    await writeFiles(file, brindesFormatados);
    res.json({ mensagem: "Lista atualizada com sucesso" });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

app.get("/:eventId/lista-brindes", async (req, res) => {
  try {
    const file = getFileName("brindes.json", req.params.eventId);
    const conteudo = await readFile(file);
    const brindes = JSON.parse(conteudo);
    const nomes = brindes.map((b) => b.nome);
    res.json(nomes);
  } catch (error) {
    res.json([]);
  }
});

// --- ARQUIVOS E LISTAS ---
app.get("/:eventId/arquivo/:nome", async (req, res) => {
  try {
    const file = getFileName(req.params.nome, req.params.eventId);
    const conteudo = await readFile(file);
    res.json(JSON.parse(conteudo));
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

app.get("/:eventId/lista", async (req, res) => {
  try {
    const file = getFileName("lista.txt", req.params.eventId);
    const conteudo = await readFile(file);
    const linhas = conteudo.split("\n").filter(Boolean);
    res.json(linhas);
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

app.post("/:eventId/escrever/lista.txt", async (req, res) => {
  try {
    const file = getFileName("lista.txt", req.params.eventId);
    const dados = req.body;
    const textoOriginal = dados.join("\n");
    await writeFiles(file, textoOriginal);
    res.json("Lista salva");
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// --- RESET ---
app.get("/:eventId/reset", async (req, res) => {
  const eventId = req.params.eventId;
  try {
    const fileLista = getFileName("lista.txt", eventId);
    const fileNomes = getFileName("nomes.json", eventId);
    const fileFixos = getFileName("vencedores_fixos.json", eventId);

    const conteudo = await readFile(fileLista);
    const linhas = conteudo.split("\n").filter(Boolean);
    const nomesFormatados = linhas.map((nomeCompleto) => ({
      nome: nomeCompleto.trim(),
      list: false,
    }));
    await writeFiles(fileNomes, nomesFormatados);

    try {
      const fileBrindes = getFileName("brindes.json", eventId);
      const conteudoBrindes = await readFile(fileBrindes);
      const brindes = JSON.parse(conteudoBrindes);
      const brindesResetados = brindes.map((b) => ({ ...b, disponivel: true }));
      await writeFiles(fileBrindes, brindesResetados);
    } catch (e) {}

    const fileRelatorio = getFileName("nomes-sorteados.txt", eventId);
    await writeFiles(fileRelatorio, "");

    // Opcional: Limpar lista de vencedores fixos ao resetar
    // await writeFiles(fileFixos, []);

    res.json("Reset completo");
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// --- SORTEIO (LÓGICA HÍBRIDA CORRIGIDA) ---
app.get("/:eventId/sortear/:quantidade", async (req, res) => {
  const eventId = req.params.eventId;
  const quantidade = parseInt(req.params.quantidade, 10);

  const fileNomes = getFileName("nomes.json", eventId);
  const fileBrindes = getFileName("brindes.json", eventId);
  const fileFixos = getFileName("vencedores_fixos.json", eventId);
  const fileRelatorio = getFileName("nomes-sorteados.txt", eventId);

  try {
    const conteudoNomes = await readFile(fileNomes);
    const nomes = JSON.parse(conteudoNomes);

    // 1. Descobrir RODADA ATUAL
    let rodadaAtual = 1;
    try {
      const conteudoRelatorio = await readFile(fileRelatorio);
      const rodadasPassadas = conteudoRelatorio.split("--- RODADA").length - 1;
      rodadaAtual = rodadasPassadas + 1;
    } catch (e) {
      rodadaAtual = 1;
    }

    // 2. Verificar VENCEDORES FIXOS
    let fixosDestaRodada = [];
    let nomesTodosFixos = [];

    try {
      const cFixos = await readFile(fileFixos);
      const listaFixos = JSON.parse(cFixos);

      nomesTodosFixos = listaFixos.map((f) => f.nome.toLowerCase().trim());
      fixosDestaRodada = listaFixos.filter(
        (f) => parseInt(f.rodada) === rodadaAtual,
      );
    } catch (e) {}

    const resultadoStrings = [];
    const sorteados = [];

    // Carrega brindes
    let brindes = [];
    try {
      const conteudoBrindes = await readFile(fileBrindes);
      brindes = JSON.parse(conteudoBrindes);
    } catch (e) {
      brindes = [];
    }

    // --- PASSO A: PROCESSAR VENCEDOR(ES) FIXO(S) DA RODADA ---
    for (const fixo of fixosDestaRodada) {
      if (sorteados.length >= quantidade) break;

      const nomeFixoFormatado = fixo.nome.toLowerCase().trim();
      const ganhadorIndex = nomes.findIndex(
        (p) => p.nome.toLowerCase().trim() === nomeFixoFormatado,
      );

      // PROTEÇÃO: Se o ganhador fixo já foi sorteado antes (list === true), pula ele
      if (ganhadorIndex !== -1 && nomes[ganhadorIndex].list === true) {
        continue;
      }

      let ganhadorObj;
      if (ganhadorIndex !== -1) {
        ganhadorObj = nomes[ganhadorIndex];
        nomes[ganhadorIndex].list = true;
      } else {
        ganhadorObj = { nome: fixo.nome, list: true };
      }

      let premioNome = fixo.premio;

      const indexBrinde = brindes.findIndex(
        (b) =>
          b.nome.toLowerCase().trim() === premioNome.toLowerCase().trim() &&
          b.disponivel,
      );

      if (indexBrinde !== -1) {
        brindes[indexBrinde].disponivel = false;
      }

      sorteados.push(ganhadorObj);
      resultadoStrings.push(`${ganhadorObj.nome} - ${premioNome}`);
    }

    // --- PASSO B: COMPLETAR COM ALEATÓRIOS ---
    const candidatos = nomes.filter(
      (p) =>
        p.list === false &&
        !nomesTodosFixos.includes(p.nome.toLowerCase().trim()),
    );

    let brindesDisponiveis = brindes.filter((b) => b.disponivel === true);

    const candidatosEmbaralhados = candidatos.sort(() => Math.random() - 0.5);
    let idxCandidato = 0;

    while (
      sorteados.length < quantidade &&
      idxCandidato < candidatosEmbaralhados.length
    ) {
      const ganhador = candidatosEmbaralhados[idxCandidato];
      idxCandidato++;

      let premioNome = "Sem prêmio cadastrado";
      const premioDaVez = brindesDisponiveis.shift();

      if (premioDaVez) {
        premioNome = premioDaVez.nome;
        const indexOriginal = brindes.findIndex((b) => b.id === premioDaVez.id);
        if (indexOriginal !== -1) brindes[indexOriginal].disponivel = false;
      }

      sorteados.push(ganhador);
      resultadoStrings.push(`${ganhador.nome} - ${premioNome}`);
    }

    // --- PROTEÇÃO FINAL CONTRA NOMES REPETIDOS ---
    // Faz a comparação blindada ignorando espaços invisíveis e letras maiúsculas/minúsculas
    nomes.forEach((pessoa) => {
      const foiSorteado = sorteados.some(
        (s) => s.nome.toLowerCase().trim() === pessoa.nome.toLowerCase().trim(),
      );
      if (foiSorteado) {
        pessoa.list = true;
      }
    });

    await writeFiles(fileNomes, nomes);
    await writeFiles(fileBrindes, brindes);

    res.json({ mensagem: "Sucesso", sorteados: resultadoStrings });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// --- RELATÓRIO E LEITURA ---
app.post("/:eventId/relatorio/escrever", async (req, res) => {
  const file = getFileName("nomes-sorteados.txt", req.params.eventId);
  try {
    const { nomes, rodada } = req.body;
    let texto = `\n--- RODADA ${rodada} ---\n` + nomes.join("\n") + "\n";
    await fs.promises.appendFile(
      path.join(__dirname, "uploads", file),
      texto,
      "utf8",
    );
    res.json({ mensagem: "Salvo" });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

app.get("/:eventId/relatorio", async (req, res) => {
  const file = getFileName("nomes-sorteados.txt", req.params.eventId);
  try {
    const conteudo = await readFile(file);
    const linhas = conteudo.split("\n").filter(Boolean);
    res.json(linhas);
  } catch (error) {
    res.json([]);
  }
});

// --- PDF DOWNLOAD ---
app.get("/:eventId/relatorio/download", async (req, res) => {
  const eventId = req.params.eventId;
  const fileRelatorio = getFileName("nomes-sorteados.txt", eventId);
  const fileLista = getFileName("lista.txt", eventId);
  const fileStaffs = getFileName("staffs.txt", eventId);
  const txtFilePath = path.join(__dirname, "uploads", fileRelatorio);

  if (!fs.existsSync(txtFilePath))
    return res.status(404).send("Arquivo não encontrado");

  try {
    const content = await fs.promises.readFile(txtFilePath, "utf-8");
    const linhas = content.split("\n").filter((l) => l.trim() !== "");

    let nomesTotal = [];
    try {
      const cLista = await readFile(fileLista);
      nomesTotal = cLista.split("\n").filter(Boolean);
    } catch (e) {}

    let staffs = "0";
    try {
      staffs = await readFile(fileStaffs);
    } catch (e) {}

    const styleConfig = loadStyleConfig(eventId);
    const doc = new PDFDocument({ size: "A4", margin: 50 });

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=relatorio_${eventId}.pdf`,
    );
    res.setHeader("Content-Type", "application/pdf");

    doc.pipe(res);
    doc
      .fontSize(18)
      .font("Times-Bold")
      .text(styleConfig.title, { align: "center" });
    doc.moveDown(0.5);
    doc
      .fontSize(12)
      .font("Times-Roman")
      .text(`Total de Convidados: ${nomesTotal.length}`);
    const totalGanhadores = linhas.filter(
      (l) => !l.includes("--- RODADA"),
    ).length;
    doc.text(`Total de Staffs: ${staffs.trim()}`);
    doc.text(`Total de Sorteados: ${totalGanhadores}`);
    doc.moveDown(1);

    let contadorGanhadores = 1;
    linhas.forEach((linha) => {
      const textoLimpo = linha.trim();
      if (textoLimpo.startsWith("--- RODADA")) {
        doc.moveDown(1);
        doc
          .font("Times-Bold")
          .fontSize(14)
          .text(textoLimpo.replace(/---/g, "").trim(), { underline: true });
        doc.fontSize(12).font("Times-Roman");
      } else if (textoLimpo.includes(" - ")) {
        const [nome, premio] = textoLimpo.split(" - ");
        doc
          .font("Times-Bold")
          .text(`${contadorGanhadores}. ${nome}`, { continued: true });
        doc.font("Times-Roman").text(` ➔ Prêmio: ${premio}`);
        contadorGanhadores++;
      } else {
        doc.text(`${contadorGanhadores}. ${textoLimpo}`);
        contadorGanhadores++;
      }
      doc.moveDown(0.3);
    });

    doc.end();
  } catch (error) {
    res.status(500).send("Erro PDF: " + error.message);
  }
});

// Upload
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
