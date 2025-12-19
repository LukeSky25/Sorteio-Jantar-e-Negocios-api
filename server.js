const express = require("express");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const cors = require("cors");
const multer = require("multer");

// Importe dos Módulos

const findFiles = require("./modules/find");
const readFile = require("./modules/read");
const writeFiles = require("./modules/write");

const app = express();

// Variável de estilo padrão

let StyleConfig = {
  title: "Edição Nº - Restaurante: ",
  color: "#000000",
  logo: "/uploads/logo.png",
  backgroundType: "color",
  backgroundValue: "#40e0d0",
};

/* Implementação do CORS, um mecanismo de segurança implementado pelos navegadores
para controlar as solicitações HTTP de diferentes origens (domínios) */

app.use(cors());

// Implementação da utilização de envio de imagens via jsoncom limit de 20mb

app.use(express.json({ limit: "20mb" }));

// Rota que mostra os arquivos de upload

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Rota para resolver erros de falta de favicon.ico

app.get("/favicon.ico", (req, res) => res.status(204).end());

// Rota de "Olá Mundo" que demonstra que o servidor está de pé

app.get("/", async (req, res) => res.json("Olá Mundo"));

// Mostra todos os arquivos em /uploads

app.get("/files", async (req, res) => {
  try {
    const arquivos = await findFiles();

    res.json(arquivos);
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// Mostra todos os nomes dentro da lista de brindes

app.get("/lista-brindes", async (req, res) => {
  try {
    const conteudo = await readFile("brindes.txt");

    const linhas = conteudo.split("\n").filter(Boolean);

    res.json(linhas);
  } catch (error) {
    res.json([]);
    res.status(500).json({ erro: error.message });
    console.log(error);
  }
});

// Lê o arquivo apartir do nome dentro da pasta /uploads e retorna um json do conteúdo

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

// Salva a lista de brindes

app.post("/escrever-brindes", async (req, res) => {
  try {
    const dados = req.body;
    const textoOriginal = dados.join("\n");

    const arquivoFinal = await writeFiles("brindes.txt", textoOriginal);
    res.json({ mensagem: "Lista de brindes salva", arquivoFinal });
  } catch (error) {
    res.status(500).json({ erro: error.message });
  }
});

// Reseta a lista de participantes

app.get("/reset/:nome", async (req, res) => {
  try {
    const nomeArquivo = req.params.nome;
    const conteudo = await readFile(nomeArquivo);
    const linhas = conteudo.split("\n").filter(Boolean);

    const nomesFormatados = linhas.map((nomeCompleto) => ({
      nome: nomeCompleto.trim(),
      list: false,
    }));

    const arquivoFinal = await writeFiles("nomes.json", nomesFormatados);

    const nomesZerados = await writeFiles("nomes-sorteados.txt", "");

    res.json("Arquivo criado com sucesso", arquivoFinal);
  } catch (error) {
    res.status(500).json({ erro: error.message });
    console.log(error);
  }
});

// Escreve texto ou json em arquivo, apartir do nome do arquivo dentro da pasta /uploads

app.post("/escrever/:nome", async (req, res) => {
  try {
    const nomeArquivo = req.params.nome;
    const dados = req.body;

    const textoOriginal = dados.join("\n");

    const arquivoFinal = await writeFiles(nomeArquivo, textoOriginal);

    res.json("Lista feita com sucesso", arquivoFinal);
  } catch (error) {
    res.status(500).json({ erro: error.message });
    console.log(error);
  }
});

// Mostra todos os nomes dentro da lista de participantes

app.get("/lista", async (req, res) => {
  try {
    const conteudo = await readFile("lista.txt");

    const linhas = conteudo.split("\n").filter(Boolean);

    res.json(linhas);
  } catch (error) {
    res.status(500).json({ erro: error.message });
    console.log(error);
  }
});

// Sortea os nomes apartir do nome da lista (dentro de /uploads) com a quantidade recebida pelos parametros

app.get("/sortear/:nome/:quantidade", async (req, res) => {
  try {
    // Recebe os parametros enviados pela url

    const nomeArquivo = req.params.nome;
    const quantidade = parseInt(req.params.quantidade, 10);

    // Lê o conteúdo do arquivo recebido

    const conteudo = await readFile(nomeArquivo);

    // Separa os nomes do arquivo

    const nomes = JSON.parse(conteudo);

    // Faz um filtro para separar apenas os participantes com list = false

    const candidatos = nomes.filter((p) => p.list === false);

    // Verifica se á nomes para o sorteio

    if (candidatos.length === 0) {
      return res.status(400).json({
        mensagem: "Nenhum nome disponível para sorteio.",
      });
    }

    // Realiza o sorteio

    const sorteados = [];
    const usados = new Set();

    while (sorteados.length < quantidade && usados.size < candidatos.length) {
      const i = Math.floor(Math.random() * candidatos.length);
      if (!usados.has(i)) {
        usados.add(i);
        sorteados.push(candidatos[i]);
      }
    }

    // Para cada pessoa sorteada adiciona list = true, para não repetir nome no sorteio

    nomes.forEach((pessoa) => {
      if (sorteados.includes(pessoa)) {
        pessoa.list = true;
      }
    });

    // Escreve os list no arquivo recebido

    await writeFiles(nomeArquivo, nomes);

    // Retorna para o usuario

    res.json({
      mensagem: "Sorteio realizado com sucesso",
      sorteados: sorteados.map((p) => p.nome),
    });
  } catch (error) {
    // Em caso de erro retorna para o usuário
    res.status(500).json({ erro: error.message });
  }
});

// Escreve os nomes sorteados no arquivo "nomes-sorteados.txt"

app.post("/relatorio/escrever", async (req, res) => {
  try {
    // Recebe o parametro enviados pela url

    const nomes = req.body;

    // Nome do arquivo para a escrita dos nomes sorteados

    const nomeArquivo = "nomes-sorteados.txt";

    // Verifica se os nomes recebidos são arrays e se não são nulos

    if (!Array.isArray(nomes) || nomes.length === 0) {
      return res
        .status(400)
        .json({ erro: "Envie um array de nomes no corpo da requisição" });
    }

    // Junta os nomes com uma quebra de linha

    const texto = nomes.join("\n") + "\n";

    // Resolve o caminho do arquivo para a escrita

    const caminhoArquivo = path.join(
      __dirname,
      "uploads",
      nomeArquivo.endsWith(".txt") ? nomeArquivo : `${nomeArquivo}.txt`
    );

    // Adiciona os nomes no arquivo "nomes-sorteados.txt"

    await fs.promises.appendFile(caminhoArquivo, texto, "utf8");

    // Retorna para o usuario

    res.json({
      mensagem: "Nomes adicionados com sucesso!",
      arquivo: caminhoArquivo,
    });
  } catch (error) {
    // Em caso de erro dá um log e retorna para o usuário
    console.error("Erro ao escrever nomes:", error);
    res.status(500).json({ erro: error.message });
  }
});

// Retorna os nomes sorteados do arquivo "nomes-sorteados.txt"

app.get("/relatorio", async (req, res) => {
  try {
    const conteudo = await readFile("nomes-sorteados.txt");

    const linhas = conteudo.split("\n").filter(Boolean);

    res.json(linhas);
  } catch (error) {
    res.status(500).json({ erro: error.message });
    console.log(error);
  }
});

// Cria e faz o envio do download do relatório

app.get("/relatorio/download", async (req, res) => {
  // Resolve o caminho do arquivo com os nomes sorteados

  const txtFilePath = path.join(__dirname, "uploads", "nomes-sorteados.txt");

  // Verifica se o arquivo existe

  if (!fs.existsSync(txtFilePath)) {
    return res.status(404).send("Arquivo não encontrado");
  }

  try {
    // Pega o conteudo do arquivo "nomes-sorteados.txt"
    const content = await fs.promises.readFile(txtFilePath, "utf-8");

    // Separa os nomes das linhas

    const linhas = content.split("\n").filter(Boolean);

    // Pega o conteudo do arquivo "lista.txt"

    const conteudo = await readFile("lista.txt");

    // Separa os nomes das linhas

    const nomes = conteudo.split("\n").filter(Boolean);

    // Quantidade de staffs

    const staffs = 21;

    // Pega a data do dia e a adequa para dd/mm/yyyy, pt-BR

    const data = new Date();
    const dataHora = data.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    // Lê o styleConfig antes de gerar o PDF

    const styleConfig = loadStyleConfig();

    // Extrai o nome do restaurante do título

    // let restaurante = "Restaurante Desconhecido"; // valor padrão
    // const match = styleConfig.title.match(/Restaurante:\s*(.*)/);
    // if (match && match[1]) {
    //   restaurante = match[1].trim();
    // }

    const restaurante = styleConfig.title;

    // Cria o documento .pdf

    const doc = new PDFDocument({ size: "A4", margin: 50 });

    // Adiciona headers no arquivo

    res.setHeader("Content-Disposition", "attachment; filename=relatorio.pdf");
    res.setHeader("Content-Type", "application/pdf");

    // Começa o arquivo

    doc.pipe(res);

    // Se não tiver nome de sorteados retorna Arquivo vazio

    if (linhas.length === 0) {
      doc.fontSize(16).text("Arquivo vazio", { align: "center" });
    } else {
      // Define as linhas do arquivo

      // 1. Título

      doc
        .fontSize(18)
        .font("Times-Bold")
        .text(restaurante, { align: "center" });

      // 2. Data e hora

      if (linhas[1]) {
        doc.moveDown(0.5);
        doc
          .fontSize(12)
          .font("Times-Italic")
          .text(dataHora, { align: "center" });
      }

      // 3. Totais

      if (linhas[2]) {
        doc.moveDown(1);
        doc.font("Times-Roman").text(`Total de Convidados: ${nomes.length}`);
      }

      if (linhas[3]) {
        doc.text(`Total de Staffs: ${staffs}`);
      }

      if (linhas[4]) {
        doc.text(`Total de Sorteados: ${linhas.length}`);
      }

      if (linhas[5]) {
        doc.text("Nomes Sorteados: ");
        doc.moveDown(0.5);
      }

      // 4. Nomes sorteados

      let iniciouLista = false;
      for (let i = 0; i !== linhas.length; i++) {
        const linha = linhas[i].trim();
        if (!iniciouLista && linha.toLowerCase().includes("nomes sorteados")) {
          doc.moveDown();
          doc.font("Times-Bold").text(linha, { underline: true });
          doc.moveDown(0.5);
          iniciouLista = true;
        } else {
          doc.font("Times-Roman").text(`${i + 1}. ${linha}`);
        }
      }
    }

    // Termina o arquivo

    doc.end();
  } catch (error) {
    // Em caso de erro dá um log e retorna para o usuário

    console.error("Erro ao gerar PDF:", error);
    res.status(500).send("Erro ao gerar PDF");
  }
});

// Configurações de Estilo

const STYLE_CONFIG_PATH = path.join(__dirname, "uploads", "styleConfig.json");

// Função para ler styleConfig do arquivo

const loadStyleConfig = () => {
  try {
    const data = fs.readFileSync(STYLE_CONFIG_PATH, "utf8");
    return JSON.parse(data);
  } catch (err) {
    console.error("Erro ao ler styleConfig:", err);
    return {
      title: "Edição Nº - Restaurante: ",
      color: "#000000",
      logo: "",
      backgroundType: "color",
      backgroundValue: "#40e0d0",
    };
  }
};

// Função para salvar styleConfig no arquivo

const saveStyleConfig = (config) => {
  fs.writeFileSync(STYLE_CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
};

// GET atualiza o valor do StyleConfig lendo do arquivo

app.get("/style", (req, res) => {
  const style = loadStyleConfig();
  res.json(style);
});

// POST salva o novo styleConfig no arquivo

app.post("/style", (req, res) => {
  const newStyle = req.body;
  saveStyleConfig(newStyle);
  res.json({ message: "Configuração de estilo salva com sucesso!" });
});

// Armazena as imagens em /uploads/imagens

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/images"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});

const upload = multer({ storage });

app.post("/upload", upload.single("file"), (req, res) => {
  res.json({ filePath: `/uploads/images/${req.file.filename}` });
});

// Configuração ds porta para subir a API

const PORT = process.env.PORT || 3001;

// Subir a API

app.listen(PORT, () => {
  console.log("API rodando em http://localhost:3001");
});
