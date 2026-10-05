// ============================================================
// CONEXÃO V7CYBER - BOT DE CURRÍCULOS
// Versão: V27
// ============================================================
//
// Este bot:
// 1. Recebe os dados do candidato pelo WhatsApp
// 2. Valida os dados informados
// 3. Calcula automaticamente a idade pela data de nascimento
// 4. Monta o currículo em formato de texto
// 5. Envia o currículo para um número fixo
// 6. Também salva e envia um arquivo TXT
//
// IMPORTANTE:
// - Não gera PDF
// - Não possui autenticação nas rotas
// - A reconexão foi mantida conforme o código original
// ============================================================


// ============================================================
// IMPORTAÇÃO DAS BIBLIOTECAS
// ============================================================

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys')

const express = require('express')
const qrcode = require('qrcode')
const fs = require('fs')
const path = require('path')


// ============================================================
// CONFIGURAÇÕES PRINCIPAIS
// ============================================================

const app = express()

// Porta usada pelo servidor Express
const PORT = process.env.PORT || 3000

// Número que receberá os currículos
const DESTINO = '5511942047248@s.whatsapp.net'

// Nome que aparece nos logs
const NOME_BOT = 'Conexão v7cyber'


// ============================================================
// VARIÁVEIS DE CONTROLE
// ============================================================

// Guarda as sessões dos usuários que estão preenchendo o currículo
const sessions = new Map()

// Armazena o QR Code atual
let qrAtual = null

// Indica se o WhatsApp está conectado
let isConnected = false

// Guarda os logs do sistema
const logs = []


// ============================================================
// FUNÇÃO DE LOG
// ============================================================
//
// Esta função registra mensagens no console e também guarda
// as últimas mensagens na memória para serem visualizadas
// pela rota /logs.
//

function log(msg) {

  const hora = new Date().toLocaleString('pt-BR')

  const mensagem = `[${hora}] ${msg}`

  console.log(mensagem)

  logs.push(mensagem)

  // Mantém somente os últimos 200 logs
  if (logs.length > 200) {
    logs.shift()
  }
}


// ============================================================
// FUNÇÃO PARA VALIDAR NOME
// ============================================================
//
// O nome precisa:
// - Ter somente letras e espaços
// - Permitir acentos
// - Ter pelo menos nome e sobrenome
// - Cada parte precisa ter pelo menos 2 letras
// - Ter no máximo 100 caracteres
//

function validarNome(valor) {

  // Remove espaços do começo/fim
  // e transforma vários espaços em apenas um
  const txt = valor
    .trim()
    .replace(/\s+/g, ' ')

  // Verifica se está vazio
  if (!txt) {
    return {
      ok: false,
      erro: 'Informe seu nome completo.'
    }
  }

  // Permite letras, inclusive letras acentuadas, e espaços
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ\s]+$/.test(txt)) {
    return {
      ok: false,
      erro: 'O nome deve conter somente letras e espaços.'
    }
  }

  // Divide o nome em partes
  const partes = txt.split(' ')

  // Exige pelo menos nome e sobrenome
  if (partes.length < 2) {
    return {
      ok: false,
      erro: 'Digite seu nome completo, incluindo sobrenome.'
    }
  }

  // Verifica se alguma parte tem apenas uma letra
  if (partes.some(parte => parte.length < 2)) {
    return {
      ok: false,
      erro: 'Cada parte do nome deve ter pelo menos 2 letras.'
    }
  }

  // Evita nomes exageradamente grandes
  if (txt.length > 100) {
    return {
      ok: false,
      erro: 'O nome é muito grande. Verifique se foi digitado corretamente.'
    }
  }

  return {
    ok: true,
    valor: txt
  }
}


// ============================================================
// FUNÇÃO PARA VALIDAR DATA DE NASCIMENTO
// ============================================================
//
// Formato aceito:
// DD/MM/AAAA
//
// Também verifica:
// - Se a data realmente existe
// - Se o ano está entre 1920 e 2026
// - Se a data não é futura
// - Se a idade está entre 12 e 100 anos
//
// A função também calcula automaticamente a idade.
//

function validarDataNascimento(valor) {

  const txt = valor.trim()

  // Verifica o formato DD/MM/AAAA
  const match = txt.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)

  if (!match) {
    return {
      ok: false,
      erro: 'Digite a data no formato DD/MM/AAAA. Exemplo: 15/08/1995.'
    }
  }

  const dia = Number(match[1])
  const mes = Number(match[2])
  const ano = Number(match[3])

  // Limita o ano
  if (ano < 1920 || ano > 2026) {
    return {
      ok: false,
      erro: 'Informe um ano de nascimento válido.'
    }
  }

  // Cria a data
  const data = new Date(ano, mes - 1, dia)

  // Verifica se a data realmente existe
  if (
    data.getFullYear() !== ano ||
    data.getMonth() !== mes - 1 ||
    data.getDate() !== dia
  ) {
    return {
      ok: false,
      erro: 'Essa data não é válida.'
    }
  }

  // Data atual
  const hoje = new Date()

  // Não permite nascimento no futuro
  if (data > hoje) {
    return {
      ok: false,
      erro: 'A data de nascimento não pode ser futura.'
    }
  }

  // Calcula a idade
  let idade = hoje.getFullYear() - ano

  // Verifica se a pessoa já fez aniversário este ano
  const aniversarioAindaNaoChegou =
    hoje.getMonth() < data.getMonth() ||
    (
      hoje.getMonth() === data.getMonth() &&
      hoje.getDate() < data.getDate()
    )

  if (aniversarioAindaNaoChegou) {
    idade--
  }

  // Limite de idade para o cadastro
  if (idade < 12 || idade > 100) {
    return {
      ok: false,
      erro: 'A idade calculada precisa estar entre 12 e 100 anos.'
    }
  }

  return {
    ok: true,
    valor: txt,
    idade: idade
  }
}


// ============================================================
// FUNÇÃO PARA VALIDAR ESTADO CIVIL
// ============================================================
//
// Aceita:
// 1 - Solteiro
// 2 - Casado
// 3 - Divorciado
// 4 - Viúvo
// 5 - Separado
// 6 - União Estável
//
// Também permite que o usuário digite o nome diretamente.
//

function validarEstadoCivil(valor) {

  // Remove acentos para facilitar a comparação
  const txt = valor
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  const estados = {

    '1': 'Solteiro(a)',
    'solteiro': 'Solteiro(a)',
    'solteira': 'Solteiro(a)',

    '2': 'Casado(a)',
    'casado': 'Casado(a)',
    'casada': 'Casado(a)',

    '3': 'Divorciado(a)',
    'divorciado': 'Divorciado(a)',
    'divorciada': 'Divorciado(a)',

    '4': 'Viúvo(a)',
    'viuvo': 'Viúvo(a)',
    'viuva': 'Viúvo(a)',

    '5': 'Separado(a)',
    'separado': 'Separado(a)',
    'separada': 'Separado(a)',

    '6': 'União Estável',
    'uniao estavel': 'União Estável'
  }

  if (!estados[txt]) {
    return {
      ok: false,
      erro:
        'Escolha uma opção válida:\n' +
        '1 - Solteiro(a)\n' +
        '2 - Casado(a)\n' +
        '3 - Divorciado(a)\n' +
        '4 - Viúvo(a)\n' +
        '5 - Separado(a)\n' +
        '6 - União Estável'
    }
  }

  return {
    ok: true,
    valor: estados[txt]
  }
}


// ============================================================
// FUNÇÃO PARA VALIDAR DATA DE EXPERIÊNCIA
// ============================================================

function validarDataExp(valor) {

  const txt = valor.trim()

  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(txt)) {
    return {
      ok: false,
      erro: 'Digite a data no formato DD/MM/AAAA.'
    }
  }

  return {
    ok: true,
    valor: txt
  }
}


// ============================================================
// FUNÇÃO PARA VALIDAR ANO
// ============================================================

function validarAno(valor) {

  const ano = valor.trim()

  if (!/^\d{4}$/.test(ano)) {
    return {
      ok: false,
      erro: 'Digite o ano com 4 números. Exemplo: 2024.'
    }
  }

  return {
    ok: true,
    valor: ano
  }
}


// ============================================================
// FUNÇÃO PARA FORMATAR CEP
// ============================================================
//
// Transforma:
// 09300000
//
// Em:
// 09300-000
//

function formatarCEP(valor) {

  const numeros = valor.replace(/\D/g, '')

  if (numeros.length !== 8) {
    return valor
  }

  return numeros.replace(
    /^(\d{5})(\d{3})$/,
    '$1-$2'
  )
}


// ============================================================
// FUNÇÃO PARA VALIDAR CEP
// ============================================================

function validarCEP(valor) {

  const numeros = valor.replace(/\D/g, '')

  if (numeros.length !== 8) {
    return {
      ok: false,
      erro: 'Digite um CEP válido com 8 números.'
    }
  }

  return {
    ok: true,
    valor: formatarCEP(valor)
  }
}


// ============================================================
// FUNÇÃO PARA FORMATAR TELEFONE
// ============================================================
//
// Aceita números digitados com ou sem máscara.
//

function formatarTelefone(valor) {

  const numeros = valor.replace(/\D/g, '')

  if (numeros.length === 11) {

    return numeros.replace(
      /^(\d{2})(\d{5})(\d{4})$/,
      '($1) $2-$3'
    )
  }

  if (numeros.length === 10) {

    return numeros.replace(
      /^(\d{2})(\d{4})(\d{4})$/,
      '($1) $2-$3'
    )
  }

  return valor
}


// ============================================================
// FUNÇÃO PARA VALIDAR TELEFONE
// ============================================================

function validarTelefoneFormatado(valor) {

  const numeros = valor.replace(/\D/g, '')

  if (numeros.length !== 10 && numeros.length !== 11) {
    return {
      ok: false,
      erro: 'Digite um telefone válido com DDD.'
    }
  }

  return {
    ok: true,
    valor: formatarTelefone(valor)
  }
}


// ============================================================
// FUNÇÃO PARA VALIDAR E-MAIL
// ============================================================

function validarEmail(valor) {

  const email = valor.trim().toLowerCase()

  const regex =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  if (!regex.test(email)) {
    return {
      ok: false,
      erro: 'Digite um e-mail válido.'
    }
  }

  return {
    ok: true,
    valor: email
  }
}


// ============================================================
// FUNÇÃO PRINCIPAL DO WHATSAPP
// ============================================================
//
// Esta função inicia a conexão do bot com o WhatsApp.
//

async function startBot() {

  log('Iniciando conexão com WhatsApp...')

  // Cria/recupera os arquivos de autenticação
  const {
    state,
    saveCreds
  } = await useMultiFileAuthState('./auth')

  // Busca a versão atual do Baileys
  let version

  try {

    const result =
      await fetchLatestBaileysVersion()

    version = result.version

  } catch (erro) {

    log('Não foi possível buscar a versão do Baileys.')

    // Versão alternativa
    version = [2, 3000, 1015901307]
  }


  // Cria a conexão com o WhatsApp
  const sock = makeWASocket({

    version,

    auth: state,

    browser: [
      'Conexão v7cyber',
      'Chrome',
      '122'
    ],

    printQRInTerminal: false
  })


  // ==========================================================
  // EVENTO DE ATUALIZAÇÃO DA CONEXÃO
  // ==========================================================

  sock.ev.on(
    'connection.update',
    async u => {

      const {
        connection,
        lastDisconnect,
        qr
      } = u


      // Se o WhatsApp gerar um QR Code,
      // guardamos para mostrar na página /qr
      if (qr) {

        qrAtual = qr

        log('Novo QR Code disponível.')
      }


      // Quando conectar
      if (connection === 'open') {

        isConnected = true

        qrAtual = null

        log('WhatsApp conectado com sucesso!')
      }


      // Quando desconectar
      //
      // IMPORTANTE:
      // Esta lógica foi mantida conforme o código original.
      //
      if (connection === 'close') {

        isConnected = false

        log(
          'Desconectado - reconectando em 5s'
        )

        setTimeout(
          startBot,
          5000
        )
      }

    }
  )


  // ==========================================================
  // SALVAR CREDENCIAIS
  // ==========================================================
  //
  // Sempre que o Baileys atualizar as credenciais,
  // elas são salvas na pasta ./auth.
  //

  sock.ev.on(
    'creds.update',
    saveCreds
  )


  // ==========================================================
  // RECEBIMENTO DE MENSAGENS
  // ==========================================================

  sock.ev.on(
    'messages.upsert',
    async ({ messages }) => {

      try {

        const msg = messages[0]

        // Ignora mensagens enviadas pelo próprio bot
        if (!msg || msg.key.fromMe) {
          return
        }

        // Identifica quem enviou
        const jid = msg.key.remoteJid

        // Obtém o texto da mensagem
        const txt =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          ''

        if (!txt) {
          return
        }


        // ======================================================
        // NORMALIZAÇÃO DO TEXTO
        // ======================================================

        const texto = txt.trim()


        // ======================================================
        // COMANDO CANCELAR
        // ======================================================

        if (
          texto.toLowerCase() === 'cancelar'
        ) {

          sessions.delete(jid)

          await sock.sendMessage(
            jid,
            {
              text:
                '❌ Cadastro cancelado.\n\n' +
                'Se quiser começar novamente, envie "oi".'
            }
          )

          return
        }


        // ======================================================
        // CRIAÇÃO DA SESSÃO
        // ======================================================
        //
        // Cada pessoa possui uma sessão própria.
        // Assim, vários candidatos podem preencher
        // o currículo ao mesmo tempo.
        //

        if (!sessions.has(jid)) {

          sessions.set(
            jid,
            {
              step: 'nome',
              data: {}
            }
          )

          await sock.sendMessage(
            jid,
            {
              text:
                '👋 Olá! Sou o bot de cadastro de currículos.\n\n' +
                'Vamos preencher seu currículo.\n\n' +
                'Digite seu *nome completo*.\n\n' +
                'Digite "cancelar" a qualquer momento para interromper.'
            }
          )

          return
        }


        // Recupera a sessão atual
        const sessao = sessions.get(jid)

        // Dados do candidato
        const d = sessao.data


        // ======================================================
        // ETAPA 1 - NOME
        // ======================================================

        if (sessao.step === 'nome') {

          const v = validarNome(texto)

          if (!v.ok) {

            await sock.sendMessage(
              jid,
              {
                text: `❌ ${v.erro}`
              }
            )

            return
          }

          d.nome = v.valor

          sessao.step = 'nascimento'

          await sock.sendMessage(
            jid,
            {
              text:
                '📅 Agora informe sua *data de nascimento*.\n\n' +
                'Digite no formato DD/MM/AAAA.\n\n' +
                'Exemplo: 15/08/1995'
            }
          )

          return
        }


        // ======================================================
        // ETAPA 2 - DATA DE NASCIMENTO
        // ======================================================

        if (sessao.step === 'nascimento') {

          const v =
            validarDataNascimento(texto)

          if (!v.ok) {

            await sock.sendMessage(
              jid,
              {
                text: `❌ ${v.erro}`
              }
            )

            return
          }

          // Salva a data
          d.dataNascimento = v.valor

          // A idade é calculada automaticamente
          d.idade = v.idade

          sessao.step = 'nacionalidade'

          await sock.sendMessage(
            jid,
            {
              text:
                '🌎 Qual é sua nacionalidade?\n\n' +
                'Exemplo: Brasileira'
            }
          )

          return
        }


        // ======================================================
        // ETAPA 3 - NACIONALIDADE
        // ======================================================

        if (sessao.step === 'nacionalidade') {

          d.nacionalidade = texto

          sessao.step = 'estadoCivil'

          await sock.sendMessage(
            jid,
            {
              text:
                '💍 Qual é o seu estado civil?\n\n' +
                '1 - Solteiro(a)\n' +
                '2 - Casado(a)\n' +
                '3 - Divorciado(a)\n' +
                '4 - Viúvo(a)\n' +
                '5 - Separado(a)\n' +
                '6 - União Estável'
            }
          )

          return
        }


        // ======================================================
        // ETAPA 4 - ESTADO CIVIL
        // ======================================================

        if (sessao.step === 'estadoCivil') {

          const v =
            validarEstadoCivil(texto)

          if (!v.ok) {

            await sock.sendMessage(
              jid,
              {
                text: `❌ ${v.erro}`
              }
            )

            return
          }

          d.estadoCivil = v.valor

          sessao.step = 'rua'

          await sock.sendMessage(
            jid,
            {
              text:
                '🏠 Informe o nome da sua rua.'
            }
          )

          return
        }


        // ======================================================
        // ETAPA 5 - RUA
        // ======================================================

        if (sessao.step === 'rua') {

          d.rua = texto

          sessao.step = 'numero'

          await sock.sendMessage(
            jid,
            {
              text:
                '🔢 Informe o número da residência.'
            }
          )

          return
        }


        // ======================================================
        // ETAPA 6 - NÚMERO
        // ======================================================

        if (sessao.step === 'numero') {

          d.numero = texto

          sessao.step = 'bairro'

          await sock.sendMessage(
            jid,
            {
              text:
                '🏘️ Informe o bairro.'
            }
          )

          return
        }


        // ======================================================
        // ETAPA 7 - BAIRRO
        // ======================================================

        if (sessao.step === 'bairro') {

          d.bairro = texto

          sessao.step = 'cidade'

          await sock.sendMessage(
            jid,
            {
              text:
                '🏙️ Informe sua cidade.'
            }
          )

          return
        }


        // ======================================================
        // ETAPA 8 - CIDADE
        // ======================================================

        if (sessao.step === 'cidade') {

          d.cidade = texto

          sessao.step = 'estado'

          await sock.sendMessage(
            jid,
            {
              text:
                '📍 Informe a sigla do seu estado.\n\n' +
                'Exemplo: SP'
            }
          )

          return
        }


        // ======================================================
        // ETAPA 9 - ESTADO
        // ======================================================

        if (sessao.step === 'estado') {

          const uf = texto
            .trim()
            .toUpperCase()

          if (!/^[A-Z]{2}$/.test(uf)) {

            await sock.sendMessage(
              jid,
              {
                text:
                  '❌ Informe a sigla do estado com 2 letras.\n\n' +
                  'Exemplo: SP'
              }
            )

            return
          }

          d.estado = uf

          sessao.step = 'cep'

          await sock.sendMessage(
            jid,
            {
              text:
                '📮 Informe seu CEP.\n\n' +
                'Exemplo: 09300-000'
            }
          )

          return
        }


        // ======================================================
        // ETAPA 10 - CEP
        // ======================================================

        if (sessao.step === 'cep') {

          const v = validarCEP(texto)

          if (!v.ok) {

            await sock.sendMessage(
              jid,
              {
                text: `❌ ${v.erro}`
              }
            )

            return
          }

          d.cep = v.valor

          sessao.step = 'telefone'

          await sock.sendMessage(
            jid,
            {
              text:
                '📱 Informe seu telefone com DDD.\n\n' +
                'Exemplo: (11) 99999-9999'
            }
          )

          return
        }


        // ======================================================
        // ETAPA 11 - TELEFONE
        // ======================================================

        if (sessao.step === 'telefone') {

          const v =
            validarTelefoneFormatado(texto)

          if (!v.ok) {

            await sock.sendMessage(
              jid,
              {
                text: `❌ ${v.erro}`
              }
            )

            return
          }

          d.telefone = v.valor

          sessao.step = 'email'

          await sock.sendMessage(
            jid,
            {
              text:
                '📧 Informe seu e-mail.'
            }
          )

          return
        }


        // ======================================================
        // ETAPA 12 - E-MAIL
        // ======================================================

        if (sessao.step === 'email') {

          const v = validarEmail(texto)

          if (!v.ok) {

            await sock.sendMessage(
              jid,
              {
                text: `❌ ${v.erro}`
              }
            )

            return
          }

          d.email = v.valor

          sessao.step = 'objetivo'

          await sock.sendMessage(
            jid,
            {
              text:
                '🎯 Qual é o seu objetivo profissional?\n\n' +
                'Exemplo: Busco uma oportunidade na área administrativa.'
            }
          )

          return
        }


        // ======================================================
        // ETAPA 13 - OBJETIVO PROFISSIONAL
        // ======================================================

        if (sessao.step === 'objetivo') {

          d.objetivo = texto

          sessao.step = 'experiencia'

          await sock.sendMessage(
            jid,
            {
              text:
                '💼 Informe sua experiência profissional.\n\n' +
                'Coloque empresa, cargo e período trabalhado.'
            }
          )

          return
        }


        // ======================================================
        // ETAPA 14 - EXPERIÊNCIA
        // ======================================================

        if (sessao.step === 'experiencia') {

          d.experiencia = texto

          sessao.step = 'escolaridade'

          await sock.sendMessage(
            jid,
            {
              text:
                '🎓 Informe sua escolaridade.'
            }
          )

          return
        }


        // ======================================================
        // ETAPA 15 - ESCOLARIDADE
        // ======================================================

        if (sessao.step === 'escolaridade') {

          d.escolaridade = texto

          sessao.step = 'cursos'

          await sock.sendMessage(
            jid,
            {
              text:
                '📚 Possui cursos ou qualificações?\n\n' +
                'Se não possuir, digite "Não".'
            }
          )

          return
        }


        // ======================================================
        // ETAPA 16 - CURSOS
        // ======================================================

        if (sessao.step === 'cursos') {

          d.cursos = texto

          sessao.step = 'habilidades'

          await sock.sendMessage(
            jid,
            {
              text:
                '⭐ Informe suas principais habilidades.'
            }
          )

          return
        }


        // ======================================================
        // ETAPA 17 - HABILIDADES
        // ======================================================

        if (sessao.step === 'habilidades') {

          d.habilidades = texto

          sessao.step = 'resumo'

          await sock.sendMessage(
            jid,
            {
              text:
                '📝 Faça um pequeno resumo profissional sobre você.'
            }
          )

          return
        }


        // ======================================================
        // ETAPA 18 - RESUMO
        // ======================================================

        if (sessao.step === 'resumo') {

          d.resumo = texto

          // Quando chega aqui, o cadastro terminou
          await finalizarCadastro(
            sock,
            jid,
            d
          )

          // Remove a sessão do usuário
          sessions.delete(jid)

          return
        }

      } catch (erro) {

        // Evita que um erro em uma mensagem derrube o bot
        console.error(
          'Erro ao processar mensagem:',
          erro
        )

        log(
          `Erro ao processar mensagem: ${erro.message}`
        )
      }

    }
  )

}


// ============================================================
// FUNÇÃO PARA FINALIZAR O CADASTRO
// ============================================================
//
// Esta função:
// 1. Monta o currículo
// 2. Cria o arquivo TXT
// 3. Envia o texto para o destino
// 4. Envia o arquivo TXT
// 5. Confirma ao candidato
//

async function finalizarCadastro(
  sock,
  jid,
  d
) {

  // ==========================================================
  // MODELO DO CURRÍCULO EM TEXTO
  // ==========================================================

  const textoModelo =

`==============================
       CURRÍCULO
==============================

DADOS PESSOAIS

Nome: ${d.nome}
Data de Nascimento: ${d.dataNascimento}
Idade: ${d.idade} anos
Nacionalidade: ${d.nacionalidade}
Estado Civil: ${d.estadoCivil}

ENDEREÇO

Rua: ${d.rua}
Número: ${d.numero}
Bairro: ${d.bairro}
Cidade: ${d.cidade}
Estado: ${d.estado}
CEP: ${d.cep}

CONTATO

Telefone: ${d.telefone}
E-mail: ${d.email}

OBJETIVO PROFISSIONAL

${d.objetivo}

EXPERIÊNCIA PROFISSIONAL

${d.experiencia}

ESCOLARIDADE

${d.escolaridade}

CURSOS E QUALIFICAÇÕES

${d.cursos}

HABILIDADES

${d.habilidades}

RESUMO PROFISSIONAL

${d.resumo}

==============================
      FIM DO CURRÍCULO
==============================
`


  // ==========================================================
  // NOME DO ARQUIVO TXT
  // ==========================================================

  // Remove caracteres que poderiam causar problemas
  // no nome do arquivo
  const nomeArquivo = d.nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  const arquivo =
    path.join(
      __dirname,
      `${nomeArquivo}_curriculo.txt`
    )


  // ==========================================================
  // SALVA O ARQUIVO TXT
  // ==========================================================

  fs.writeFileSync(
    arquivo,
    textoModelo,
    'utf8'
  )


  // ==========================================================
  // ENVIA O TEXTO PARA O NÚMERO DESTINO
  // ==========================================================

  await sock.sendMessage(
    DESTINO,
    {
      text: textoModelo
    }
  )


  // ==========================================================
  // ENVIA O ARQUIVO TXT
  // ==========================================================

  await sock.sendMessage(
    DESTINO,
    {
      document: {
        url: arquivo
      },

      mimetype: 'text/plain',

      fileName:
        `${nomeArquivo}_curriculo.txt`,

      caption:
        `📄 Currículo de ${d.nome}`
    }
  )


  // ==========================================================
  // AVISA O CANDIDATO
  // ==========================================================

  await sock.sendMessage(
    jid,
    {
      text:
        '✅ Seu cadastro foi concluído!\n\n' +
        '📄 Seu currículo foi enviado em formato de texto.\n\n' +
        'Obrigado!'
    }
  )


  // Registra no log
  log(
    `Currículo recebido: ${d.nome}`
  )
}


// ============================================================
// ROTAS DO SERVIDOR
// ============================================================


// ------------------------------------------------------------
// ROTA PRINCIPAL
// ------------------------------------------------------------

app.get('/', (req, res) => {

  res.send(`
    <h1>${NOME_BOT}</h1>

    <p>Status:
      <strong>
        ${isConnected ? '🟢 Conectado' : '🔴 Desconectado'}
      </strong>
    </p>

    <p>
      <a href="/whatsapp">WhatsApp</a>
    </p>

    <p>
      <a href="/qr">QR Code</a>
    </p>

    <p>
      <a href="/status">Status</a>
    </p>

    <p>
      <a href="/logs">Logs</a>
    </p>

    <p>
      <a href="/clear">Limpar sessão</a>
    </p>
  `)
})


// ------------------------------------------------------------
// ROTA WHATSAPP
// ------------------------------------------------------------

app.get('/whatsapp', (req, res) => {

  res.send(`
    <h2>Conexão WhatsApp</h2>

    <p>
      Status:
      ${isConnected ? '🟢 Conectado' : '🔴 Desconectado'}
    </p>

    <p>
      ${qrAtual
        ? 'QR Code disponível em /qr'
        : 'Nenhum QR Code disponível no momento.'
      }
    </p>
  `)
})


// ------------------------------------------------------------
// ROTA DO QR CODE
// ------------------------------------------------------------
//
// Converte o QR Code recebido do Baileys em uma imagem PNG.
//

app.get('/qr', async (req, res) => {

  if (!qrAtual) {

    return res.send(`
      <h2>QR Code</h2>
      <p>Nenhum QR Code disponível.</p>
    `)
  }

  try {

    const imagem =
      await qrcode.toDataURL(qrAtual)

    res.send(`
      <html>

        <head>
          <title>QR Code WhatsApp</title>
        </head>

        <body>

          <h2>Escaneie o QR Code</h2>

          <img
            src="${imagem}"
            width="300"
          >

        </body>

      </html>
    `)

  } catch (erro) {

    res.status(500).send(
      'Erro ao gerar QR Code.'
    )
  }
})


// ------------------------------------------------------------
// ROTA DE STATUS
// ------------------------------------------------------------

app.get('/status', (req, res) => {

  res.json({

    bot: NOME_BOT,

    whatsapp: isConnected
      ? 'conectado'
      : 'desconectado',

    sessoesAtivas:
      sessions.size,

    destino:
      DESTINO

  })
})


// ------------------------------------------------------------
// ROTA DE LOGS
// ------------------------------------------------------------

app.get('/logs', (req, res) => {

  res.type('text').send(
    logs.join('\n')
  )
})


// ------------------------------------------------------------
// ROTA PARA LIMPAR SESSÕES
// ------------------------------------------------------------

app.get('/clear', (req, res) => {

  sessions.clear()

  res.send(
    'Sessões limpas com sucesso.'
  )

  log(
    'Sessões limpas manualmente.'
  )
})


// ============================================================
// INICIALIZAÇÃO DO SERVIDOR
// ============================================================

app.listen(
  PORT,
  () => {

    log(
      `Servidor iniciado na porta ${PORT}`
    )

  }
)


// ============================================================
// INICIA O BOT DO WHATSAPP
// ============================================================

startBot()
  .catch(erro => {

    console.error(
      'Erro ao iniciar o bot:',
      erro
    )

    log(
      `Erro ao iniciar bot: ${erro.message}`
    )

  })