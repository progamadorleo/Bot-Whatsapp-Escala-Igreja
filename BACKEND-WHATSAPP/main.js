require("dotenv").config()
const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState: initAuthState,
  makeInMemoryStore,
} = require("@itsukichan/baileys")
const { Boom } = require("@hapi/boom")
const pino = require("pino")
const { handlePrivateChatMessage, startNameCollection } = require("./handlers/private-chat-handler")
const { handlePollUpdate, registerPollMessage } = require("./handlers/poll-handler")
const { startMonthlyScheduler, testMonthlyPoll } = require("./handlers/scheduler")

const { db } = require("./config/firebase-config")

const logger = pino({ timestamp: () => `,"time":"${new Date().toJSON()}"` }).child({ class: "WhatsAppBot" })
logger.level = "fatal" // Apenas erros críticos no console

const store = makeInMemoryStore({ logger })
store.readFromFile("./baileys_store.json")

// Salvar o store em arquivo a cada 10 segundos
setInterval(() => {
  store.writeToFile("./baileys_store.json")
}, 10_000)

// WhatsApp connection state
let sock
let state
let saveCreds

let targetGroupId = null

async function initializeAuth() {
  const result = await initAuthState("auth_info_baileys")
  state = result.state
  saveCreds = result.saveCreds
}

async function getMessage(key) {
  if (store) {
    console.log(`[v0] Tentando carregar mensagem do store com key:`, key)
    const msg = await store.loadMessage(key.remoteJid, key.id)
    console.log(`[v0] Mensagem carregada:`, msg ? "SIM" : "NÃO")
    return msg?.message || null
  }
  return null
}

initializeAuth().then(() => {
  connectToWhatsApp()
})

async function connectToWhatsApp() {
  sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    logger,
    getMessage: getMessage, // Required for decrypting poll votes
  })

  store.bind(sock.ev)

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error instanceof Boom
          ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
          : true

      console.log("connection closed due to ", lastDisconnect?.error, ", reconnecting ", shouldReconnect)

      if (shouldReconnect) {
        connectToWhatsApp()
      }
    } else if (connection === "open") {
      console.log("✅ WhatsApp Bot conectado com sucesso!")
      console.log("Bot está pronto para uso.")
      console.log("\n📋 Comandos disponíveis:")
      console.log("  !coletar - Inicia coleta de nomes dos membros do grupo")
      console.log("  !enquete - Testa envio de enquete mensal (admin)")

      if (targetGroupId) {
        startMonthlyScheduler(sock, targetGroupId)
      }
    }
  })

  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("messages.update", async (updates) => {
    for (const chatUpdate of updates) {
      const { key, update } = chatUpdate

      console.log(`[v0] messages.update recebido:`, JSON.stringify({ key, update }, null, 2))

      if (update.pollUpdates) {
        console.log(`[v0] 📊 Voto recebido na enquete ${key.id}`)
        await handlePollUpdate(sock, getMessage, { key, update })
      }
    }
  })

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message) return

    const from = msg.key.remoteJid
    const isGroup = from.endsWith("@g.us")
    const messageText = msg.message.conversation || msg.message.extendedTextMessage?.text || ""
    const participant = msg.key.participant || from

    console.log(`[v0] 📨 Mensagem recebida:`)
    console.log(`   De: ${from}`)
    console.log(`   É grupo: ${isGroup}`)
    console.log(`   Texto: ${messageText}`)
    console.log(`   fromMe: ${msg.key.fromMe}`)
    console.log(`   Participant: ${participant}`)

    if (msg.message.pollCreationMessage) {
      console.log(`[v0] 📊 Mensagem de enquete detectada com key:`, JSON.stringify(msg.key))
      registerPollMessage(msg.key.id, msg.key)
    }

    // Ignore messages from the bot itself
    if (msg.key.fromMe) {
      console.log(`[v0] ⏭️  Ignorando mensagem própria do bot`)
      return
    }

    // Handle private chat messages (name and role collection)
    if (!isGroup) {
      console.log(`[v0] 💬 Processando mensagem privada de ${participant}`)
      const handled = await handlePrivateChatMessage(sock, db, msg, participant, messageText)
      console.log(`[v0] Mensagem privada foi tratada: ${handled}`)
      if (handled) return
    }

    // Handle group commands
    if (isGroup) {
      const groupName = await getGroupName(from)

      if (messageText === "!coletar" && groupName === "ESCALA DE TESTE") {
        // Armazenar ID do grupo para uso futuro
        if (!targetGroupId) {
          targetGroupId = from
          console.log(`[v0] Grupo alvo definido: ${groupName} (${from})`)
          startMonthlyScheduler(sock, targetGroupId)
        }

        await startNameCollection(sock, from)
      }

      if (messageText === "!enquete" && groupName === "ESCALA DE TESTE") {
        console.log(`[v0] Comando !enquete recebido no grupo ${groupName}`)
        await testMonthlyPoll(sock, from)
      }
    }
  })

  async function getGroupName(groupId) {
    try {
      const groupMetadata = await sock.groupMetadata(groupId)
      return groupMetadata.subject
    } catch (error) {
      console.error("[v0] Erro ao obter nome do grupo:", error)
      return ""
    }
  }
}

// Handle process termination
process.on("SIGINT", () => {
  console.log("\n🛑 Bot sendo encerrado...")
  store.writeToFile("./baileys_store.json")
  process.exit(0)
})
