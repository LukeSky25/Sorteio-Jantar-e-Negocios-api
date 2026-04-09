const express = require("express");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const cors = require("cors");
const multer = require("multer");

const findFiles = require("./modules/find");
const readFile = require("./modules/read");
const writeFiles = require("./modules/write");

const app = express();

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// --- ESTILO ---
const getStylePath = () => path.join(__dirname, "uploads", "styleConfig.json");

const loadStyleConfig = () => {
  const fallbackStyle = {
    title: "Evento",
    color: "#000000",
    logo: "",
    backgroundType: "color",
    backgroundValue: "#40e0d0",
  };

  try {
    const p = getStylePath();
    if (fs.existsSync(p)) {
      const data = fs.readFileSync(p, "utf8");
      const parsedData = JSON.parse(data);
      return { ...fallbackStyle, ...parsedData };
    }
    return fallbackStyle;
  } catch (err) {
    console.error("Erro ao ler o styleConfig.json:", err);
    return fallbackStyle;
  }
};

app.get("/style", (req, res) => res.json(loadStyleConfig()));

app.post("/style", (req, res) => {
  const p = getStylePath();
  fs.writeFileSync(p, JSON.stringify(req.body, null, 2), "utf8");
  res.json({ message: "Salvo" });
});

// --- VENCEDORES FIXOS ---
app.post("/vencedores-fixos", async (req, res) => {
  const file = "vencedores_fixos.json";
  try {
    await writeFiles(file, req.body);
    res.json({ message: "Configuração salva!" });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

app.get("/vencedores-fixos", async (req, res) => {
  const file = "vencedores_fixos.json";
  try {
    const conteudo = await readFile(file);
    res.json(JSON.parse(conteudo));
  } catch (error) {
    res.json([]);
  }
});

// --- STAFFS ---
app.get("/staffs", async (req, res) => {
  try {
    const file = "staffs.txt";
    const conteudo = await readFile(file);
    res.json({ quantidade: conteudo.trim() || "0" });
  } catch (error) {
    res.json({ quantidade: "0" });
  }
});

app.post("/staffs", async (req, res) => {
  try {
    const file = "staffs.txt";
    await writeFiles(file, String(req.body.quantidade));
    res.json({ message: "Staffs atualizados" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- BRINDES (CORRIGIDO DUPLICADOS) ---
app.post("/escrever-brindes", async (req, res) => {
  try {
    const file = "brindes.json";
    const nomesNovos = req.body;

    let brindesAntigos = [];
    try {
      const conteudoAntigo = await readFile(file);
      brindesAntigos = JSON.parse(conteudoAntigo);
    } catch (e) {
      brindesAntigos = [];
    }

    let antigosDisponiveis = [...brindesAntigos];

    const brindesFormatados = nomesNovos.map((nomeBrinde, index) => {
      const indexAntigo = antigosDisponiveis.findIndex(
        (b) => b.nome.toLowerCase().trim() === nomeBrinde.toLowerCase().trim(),
      );

      let statusDisponivel = true;

      if (indexAntigo !== -1) {
        statusDisponivel = antigosDisponiveis[indexAntigo].disponivel;
        antigosDisponiveis.splice(indexAntigo, 1);
      }

      return {
        id: index + 1,
        nome: nomeBrinde,
        disponivel: statusDisponivel,
      };
    });

    await writeFiles(file, brindesFormatados);
    res.json({ mensagem: "Lista atualizada com sucesso" });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

app.get("/lista-brindes", async (req, res) => {
  try {
    const file = "brindes.json";
    const conteudo = await readFile(file);
    const brindes = JSON.parse(conteudo);
    const nomes = brindes.map((b) => b.nome);
    res.json(nomes);
  } catch (error) {
    res.json([]);
  }
});

// --- ARQUIVOS E LISTAS ---
app.get("/arquivo/:nome", async (req, res) => {
  try {
    const file = req.params.nome;
    const conteudo = await readFile(file);
    res.json(JSON.parse(conteudo));
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

app.get("/lista", async (req, res) => {
  try {
    const file = "lista.txt";
    const conteudo = await readFile(file);
    const linhas = conteudo.split("\n").filter(Boolean);
    res.json(linhas);
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

app.post("/escrever/lista.txt", async (req, res) => {
  try {
    const file = "lista.txt";
    const dados = req.body;
    const textoOriginal = dados.join("\n");
    await writeFiles(file, textoOriginal);
    res.json("Lista salva");
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// --- RESET ---
app.get("/reset", async (req, res) => {
  try {
    const fileLista = "lista.txt";
    const fileNomes = "nomes.json";

    const conteudo = await readFile(fileLista);
    const linhas = conteudo.split("\n").filter(Boolean);
    const nomesFormatados = linhas.map((nomeCompleto) => ({
      nome: nomeCompleto.trim(),
      list: false,
    }));
    await writeFiles(fileNomes, nomesFormatados);

    try {
      const fileBrindes = "brindes.json";
      const conteudoBrindes = await readFile(fileBrindes);
      const brindes = JSON.parse(conteudoBrindes);
      const brindesResetados = brindes.map((b) => ({ ...b, disponivel: true }));
      await writeFiles(fileBrindes, brindesResetados);
    } catch (e) {}

    const fileRelatorio = "nomes-sorteados.txt";
    await writeFiles(fileRelatorio, "");

    res.json("Reset completo");
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// --- SORTEIO PRINCIPAL (FISHER-YATES + ORDEM DOS PRÊMIOS MANTIDA) ---
app.get("/sortear/:quantidade", async (req, res) => {
  const quantidade = parseInt(req.params.quantidade, 10);

  const fileNomes = "nomes.json";
  const fileBrindes = "brindes.json";
  const fileFixos = "vencedores_fixos.json";
  const fileRelatorio = "nomes-sorteados.txt";

  try {
    const conteudoNomes = await readFile(fileNomes);
    const nomes = JSON.parse(conteudoNomes);

    let rodadaAtual = 1;
    try {
      const conteudoRelatorio = await readFile(fileRelatorio);
      const rodadasPassadas = conteudoRelatorio.split("--- RODADA").length - 1;
      rodadaAtual = rodadasPassadas + 1;
    } catch (e) {
      rodadaAtual = 1;
    }

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

    let brindes = [];
    try {
      const conteudoBrindes = await readFile(fileBrindes);
      brindes = JSON.parse(conteudoBrindes);
    } catch (e) {
      brindes = [];
    }

    let brindesDisponiveis = brindes.filter((b) => b.disponivel === true);

    let premiosDestaRodada = [];
    let countPremios = 0;

    for (let i = 0; i < brindesDisponiveis.length; i++) {
      if (countPremios >= quantidade) break;
      const b = brindesDisponiveis[i];
      if (!b.nome.startsWith("-") && !b.nome.startsWith("=")) {
        premiosDestaRodada.push(b);
        countPremios++;
      }
    }

    while (premiosDestaRodada.length < quantidade) {
      premiosDestaRodada.push({
        id: null,
        nome: "Sem prêmio cadastrado",
        disponivel: true,
      });
    }

    const candidatos = nomes.filter(
      (p) =>
        p.list === false &&
        !nomesTodosFixos.includes(p.nome.toLowerCase().trim()),
    );

    const candidatosEmbaralhados = [...candidatos];
    for (let i = candidatosEmbaralhados.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidatosEmbaralhados[i], candidatosEmbaralhados[j]] = [
        candidatosEmbaralhados[j],
        candidatosEmbaralhados[i],
      ];
    }

    const resultadoStrings = [];
    const sorteados = [];
    let idxCandidato = 0;

    for (let i = 0; i < quantidade; i++) {
      const premioAtual = premiosDestaRodada[i];

      const fixoIndex = fixosDestaRodada.findIndex(
        (f) =>
          f.premio.toLowerCase().trim() ===
          premioAtual.nome.toLowerCase().trim(),
      );

      let ganhadorObj;

      if (fixoIndex !== -1) {
        const fixoParaEstePremio = fixosDestaRodada[fixoIndex];
        fixosDestaRodada.splice(fixoIndex, 1);

        const nomeFixoFormatado = fixoParaEstePremio.nome.toLowerCase().trim();
        const ganhadorIndex = nomes.findIndex(
          (p) => p.nome.toLowerCase().trim() === nomeFixoFormatado,
        );

        if (ganhadorIndex !== -1) {
          ganhadorObj = nomes[ganhadorIndex];
          nomes[ganhadorIndex].list = true;
        } else {
          ganhadorObj = { nome: fixoParaEstePremio.nome, list: true };
        }
      } else {
        if (idxCandidato < candidatosEmbaralhados.length) {
          ganhadorObj = candidatosEmbaralhados[idxCandidato];
          idxCandidato++;
        } else {
          ganhadorObj = { nome: "Faltam convidados", list: true };
        }
      }

      if (premioAtual.id !== null) {
        const indexOriginal = brindes.findIndex((b) => b.id === premioAtual.id);
        if (indexOriginal !== -1) brindes[indexOriginal].disponivel = false;
      }

      sorteados.push(ganhadorObj);
      resultadoStrings.push(`${ganhadorObj.nome} - ${premioAtual.nome}`);
    }

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

// --- RESSORTEAR UMA PESSOA AUSENTE ---
app.post("/ressortear", async (req, res) => {
  const { textoAntigo } = req.body;
  const partes = textoAntigo.split(" - ");
  const nomeAntigo = partes[0].trim();
  const premio = partes[1] ? partes[1].trim() : "Sem prêmio";

  const fileNomes = "nomes.json";
  const fileRelatorio = "nomes-sorteados.txt";

  try {
    const conteudoNomes = await readFile(fileNomes);
    const nomes = JSON.parse(conteudoNomes);

    const indexAntigo = nomes.findIndex(
      (n) => n.nome.toLowerCase().trim() === nomeAntigo.toLowerCase(),
    );
    if (indexAntigo !== -1) nomes[indexAntigo].list = false;

    const fileFixos = "vencedores_fixos.json";
    let nomesTodosFixos = [];
    try {
      const cFixos = await readFile(fileFixos);
      nomesTodosFixos = JSON.parse(cFixos).map((f) =>
        f.nome.toLowerCase().trim(),
      );
    } catch (e) {}

    const candidatos = nomes.filter(
      (p) =>
        p.list === false &&
        !nomesTodosFixos.includes(p.nome.toLowerCase().trim()),
    );

    if (candidatos.length === 0) {
      return res
        .status(400)
        .json({ mensagem: "Não há mais pessoas na lista para ressortear!" });
    }

    const novoGanhador =
      candidatos[Math.floor(Math.random() * candidatos.length)];
    const indexNovo = nomes.findIndex((n) => n.nome === novoGanhador.nome);
    nomes[indexNovo].list = true;

    const novoTexto = `${novoGanhador.nome} - ${premio}`;

    await writeFiles(fileNomes, nomes);

    try {
      let relatorio = await readFile(fileRelatorio);
      relatorio = relatorio.replace(textoAntigo, novoTexto);
      await writeFiles(fileRelatorio, relatorio);
    } catch (e) {}

    res.json({ novoTexto });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// --- RELATÓRIO E LEITURA ---
app.post("/relatorio/escrever", async (req, res) => {
  const file = "nomes-sorteados.txt";
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

app.get("/relatorio", async (req, res) => {
  const file = "nomes-sorteados.txt";
  try {
    const conteudo = await readFile(file);
    const linhas = conteudo.split("\n").filter(Boolean);
    res.json(linhas);
  } catch (error) {
    res.json([]);
  }
});

// --- PDF DOWNLOAD (VERSÃO ESTILIZADA E PROFISSIONAL) ---
app.get("/relatorio/download", async (req, res) => {
  const fileRelatorio = "nomes-sorteados.txt";
  const fileLista = "lista.txt";
  const fileStaffs = "staffs.txt";
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

    const styleConfig = loadStyleConfig();

    // Habilitamos o bufferPages para podermos colocar número de página no rodapé depois
    const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=Relatorio_Sorteio.pdf`,
    );
    res.setHeader("Content-Type", "application/pdf");

    doc.pipe(res);

    // Cores padrão do layout
    const primaryColor = "#374667"; // Azul do painel
    const textColor = "#333333";
    const lightGray = "#f4f6f9";
    const darkGray = "#888888";

    // --- CABEÇALHO ---
    doc
      .fillColor(primaryColor)
      .fontSize(22)
      .font("Helvetica-Bold")
      .text(styleConfig.title || "Relatório de Sorteio", { align: "center" });

    doc.moveDown(0.2);

    doc
      .fillColor(darkGray)
      .fontSize(10)
      .font("Helvetica")
      .text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, {
        align: "center",
      });

    doc.moveDown(1.5);

    // Linha Divisória
    doc
      .moveTo(50, doc.y)
      .lineTo(545, doc.y)
      .strokeColor("#e0e0e0")
      .lineWidth(1)
      .stroke();
    doc.moveDown(1);

    // --- BLOCO DE RESUMO ---
    const totalGanhadores = linhas.filter(
      (l) => !l.includes("--- RODADA"),
    ).length;

    doc
      .fillColor(primaryColor)
      .fontSize(14)
      .font("Helvetica-Bold")
      .text("Resumo Numérico");
    doc.moveDown(0.5);

    // Alinhamento em colunas falsas para o resumo
    doc.fillColor(textColor).fontSize(11).font("Helvetica-Bold");
    doc
      .text("Convidados:", 50, doc.y, { continued: true })
      .font("Helvetica")
      .text(`  ${nomesTotal.length}`);
    doc
      .font("Helvetica-Bold")
      .text("Staffs:", 50, doc.y, { continued: true })
      .font("Helvetica")
      .text(`  ${staffs.trim()}`);
    doc
      .font("Helvetica-Bold")
      .text("Total Sorteados:", 50, doc.y, { continued: true })
      .font("Helvetica")
      .text(`  ${totalGanhadores}`);

    doc.moveDown(1);

    // Linha Divisória
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#e0e0e0").stroke();
    doc.moveDown(1.5);

    // --- LISTA DE GANHADORES ---
    let contadorGanhadores = 1;

    linhas.forEach((linha) => {
      const textoLimpo = linha.trim();

      if (textoLimpo.startsWith("--- RODADA")) {
        // Se a página estiver muito no final, pula para a próxima para não cortar a rodada
        if (doc.y > 700) doc.addPage();
        else doc.moveDown(1);

        const startY = doc.y;

        // Desenha um retângulo cinza claro de fundo para o título da rodada
        doc.rect(50, startY, 495, 25).fill(lightGray);

        // Escreve o texto centralizado dentro do retângulo
        doc
          .fillColor(primaryColor)
          .font("Helvetica-Bold")
          .fontSize(12)
          .text(textoLimpo.replace(/---/g, "").trim(), 50, startY + 7, {
            align: "center",
            width: 495,
          });

        // Volta a margem Y para baixo do retângulo
        doc.y = startY + 35;
      } else if (textoLimpo.includes(" - ")) {
        const [nome, premio] = textoLimpo.split(" - ");

        // Nome em negrito, prêmio em fonte normal e cinza escuro
        doc
          .fillColor(textColor)
          .font("Helvetica-Bold")
          .fontSize(11)
          .text(`${contadorGanhadores}. ${nome}`, 50, doc.y, {
            continued: true,
          });

        doc
          .fillColor(darkGray)
          .font("Helvetica")
          .text(`   ➔   Prêmio: ${premio}`);

        contadorGanhadores++;
        doc.moveDown(0.3);
      } else {
        doc
          .fillColor(textColor)
          .font("Helvetica")
          .fontSize(11)
          .text(`${contadorGanhadores}. ${textoLimpo}`, 50, doc.y);

        contadorGanhadores++;
        doc.moveDown(0.3);
      }
    });

    // --- RODAPÉ (NUMERAÇÃO DE PÁGINAS CORRIGIDA) ---
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);

      // SALVAÇÃO: Desliga a margem inferior para o PDFKit não criar uma nova página em branco
      let oldBottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;

      doc
        .fontSize(9)
        .fillColor("#aaaaaa")
        .text(
          `Página ${i + 1} de ${range.count}`,
          50,
          doc.page.height - 30, // Posição exata do rodapé
          { align: "center", width: 495, lineBreak: false },
        );

      // Devolve a margem ao normal
      doc.page.margins.bottom = oldBottomMargin;
    }

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
