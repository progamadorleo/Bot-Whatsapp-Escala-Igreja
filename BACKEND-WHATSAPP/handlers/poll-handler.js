const { getAggregateVotesInPollMessage } = require("@itsukichan/baileys")
const { collection, addDoc, getDocs, query, where } = require("firebase/firestore")
const { db } = require("../config/firebase-config")

// Armazena informações sobre enquetes ativas
const activePollsStore = new Map()

const activePollTimers = new Map()

let getMessageFunction = null

function setGetMessageFunction(fn) {
  getMessageFunction = fn
}

async function getMessage(key) {
  if (getMessageFunction) {
    return await getMessageFunction(key)
  }
  return null
}

/**
 * Cria e envia uma enquete para o grupo perguntando sobre indisponibilidade
 * @param {Object} sock - Socket do WhatsApp
 * @param {string} groupId - ID do grupo
 * @param {Array} events - Lista de eventos/cultos do mês
 * @param {string} monthName - Nome do mês (ex: "DEZEMBRO")
 */
async function sendUnavailabilityPoll(sock, groupId, events, monthName) {
  try {
    const MAX_OPTIONS = 12
    const eventChunks = []

    for (let i = 0; i < events.length; i += MAX_OPTIONS) {
      eventChunks.push(events.slice(i, i + MAX_OPTIONS))
    }

    const totalParts = eventChunks.length
    console.log(`[v0] Criando ${totalParts} enquete(s) para ${events.length} cultos em ${monthName}`)

    const sentMessages = []

    for (let partIndex = 0; partIndex < totalParts; partIndex++) {
      const chunk = eventChunks[partIndex]
      const partNumber = partIndex + 1

      // Formatar as opções da enquete com data e título do culto
      const pollOptions = chunk.map((event) => {
        const date = new Date(event.date)
        const day = date.getDate()
        const formattedDate = `${day.toString().padStart(2, "0")}/${monthName.substring(0, 3)}`
        return `${formattedDate} - ${event.title}`
      })

      // Criar nome da enquete com indicação de parte se houver múltiplas
      const pollName =
        totalParts > 1
          ? `🗓️ ${monthName} - Parte ${partNumber}/${totalParts}\nQuais dias você NÃO poderá servir?`
          : `🗓️ Quais dias você NÃO poderá servir em ${monthName}?`

      // Criar a enquete
      const pollMessage = {
        name: pollName,
        values: pollOptions,
        selectableCount: 0, // 0 = múltipla escolha
      }

      // Enviar a enquete para o grupo
      const sentMsg = await sock.sendMessage(groupId, {
        poll: pollMessage,
      })

      console.log(`[v0] Enquete ${partNumber}/${totalParts} enviada com ${pollOptions.length} opções`)
      console.log(`[v0] Key da mensagem enviada:`, JSON.stringify(sentMsg.key))

      activePollsStore.set(sentMsg.key.id, {
        messageKey: null,
        events: chunk, // Apenas os eventos deste chunk
        monthName: monthName,
        createdAt: new Date().toISOString(),
        groupId: groupId,
        pollId: sentMsg.key.id,
        partNumber: partNumber,
        totalParts: totalParts,
      })

      sentMessages.push(sentMsg)

      // Aguardar 1 segundo entre enquetes para evitar problemas
      if (partIndex < totalParts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }

    console.log(`[v0] ⏱️ Timer de 30 segundos iniciado para ${totalParts} enquete(s)`)
    await sock.sendMessage(groupId, {
      text: `⏱️ Você tem 30 segundos para votar em ${totalParts > 1 ? "todas as enquetes" : "a enquete"}!`,
    })

    const timer = setTimeout(async () => {
      console.log(`[v0] ⏰ Timer expirado! Processando votos de ${totalParts} enquete(s)...`)

      // Processar todas as partes
      for (const sentMsg of sentMessages) {
        await finalizePoll(sock, sentMsg.key.id, groupId, totalParts > 1)
      }

      if (totalParts > 1) {
        await sendConsolidatedResults(sock, groupId, monthName)
      }
    }, 30000)

    for (const sentMsg of sentMessages) {
      activePollTimers.set(sentMsg.key.id, timer)
    }

    return sentMessages
  } catch (error) {
    console.error("[v0] Erro ao enviar enquete:", error)
    throw error
  }
}

/**
 * Registra a chave real da mensagem de enquete quando ela chega no messages.upsert
 * @param {string} pollId - ID da enquete
 * @param {Object} messageKey - Chave correta da mensagem
 */
function registerPollMessage(pollId, messageKey) {
  const pollInfo = activePollsStore.get(pollId)
  if (pollInfo) {
    pollInfo.messageKey = messageKey
    console.log(`[v0] ✓ Chave da enquete ${pollId} registrada:`, JSON.stringify(messageKey))
  }
}

/**
 * Processa atualizações de votos em enquetes
 * @param {Object} sock - Socket do WhatsApp
 * @param {Function} getMessageFn - Função para carregar mensagem do store
 * @param {Object} updateData - Objeto contendo key e update
 */
async function handlePollUpdate(sock, getMessageFn, updateData) {
  try {
    setGetMessageFunction(getMessageFn)

    const { key, update } = updateData

    if (!update.pollUpdates) {
      return
    }

    console.log(`[v0] 🔍 Processando votos da enquete ${key.id}`)

    const pollInfo = activePollsStore.get(key.id)
    if (!pollInfo) {
      console.log("[v0] ⚠️ Informações da enquete não encontradas no cache")
      return
    }

    const pollMessage = await getMessageFn(key)
    if (!pollMessage) {
      console.log("[v0] ⚠️ Não foi possível carregar mensagem da enquete")
      return
    }

    console.log(`[v0] Descriptografando votos...`)

    // Decrypt poll votes
    const aggregatedVotes = await getAggregateVotesInPollMessage({
      message: pollMessage,
      pollUpdates: update.pollUpdates,
    })

    console.log(`[v0] ✓ ${aggregatedVotes.length} opções processadas`)

    // Mapear participants para números reais
    const participantMap = new Map()
    for (const pollUpdate of update.pollUpdates) {
      if (pollUpdate.pollUpdateMessageKey) {
        const participant = pollUpdate.pollUpdateMessageKey.participant
        const participantAlt = pollUpdate.pollUpdateMessageKey.participantAlt

        if (participant && participantAlt) {
          // Extrair número antes dos dois pontos (556292692170:2@... -> 556292692170)
          const phoneMatch = participantAlt.match(/^(\d+):/)
          const realPhone = phoneMatch ? phoneMatch[1] : participantAlt.split("@")[0]
          participantMap.set(participant, realPhone)
          console.log(`[v0] 📞 Mapeado: ${participant} -> ${realPhone}`)
        }
      }
    }

    if (!pollVotesCache.has(key.id)) {
      pollVotesCache.set(key.id, new Map())
    }
    const votesByParticipant = pollVotesCache.get(key.id)

    for (const voteOption of aggregatedVotes) {
      console.log(`[v0] ✓ "${voteOption.name}": ${voteOption.voters.length} voto(s)`)

      for (const voterJid of voteOption.voters) {
        let realPhone = participantMap.get(voterJid)

        if (!realPhone) {
          // Fallback: extrair do próprio voterJid
          realPhone = voterJid.split("@")[0]
          console.log(`[v0] ⚠️ Usando fallback para ${voterJid}: ${realPhone}`)
        } else {
          console.log(`[v0] ✓ Usando número mapeado para ${voterJid}: ${realPhone}`)
        }

        if (!votesByParticipant.has(realPhone)) {
          votesByParticipant.set(realPhone, new Set())
        }
        votesByParticipant.get(realPhone).add(voteOption.name)
      }
    }

    // For each participant in this update, check if their votes in cache match current votes
    const currentParticipants = new Set()
    for (const voteOption of aggregatedVotes) {
      for (const voterJid of voteOption.voters) {
        const realPhone = participantMap.get(voterJid) || voterJid.split("@")[0]
        currentParticipants.add(realPhone)
      }
    }

    for (const [phone, votedOptions] of votesByParticipant.entries()) {
      if (currentParticipants.has(phone)) {
        // This participant sent an update - rebuild their votes from scratch
        const newVotes = new Set()
        for (const voteOption of aggregatedVotes) {
          for (const voterJid of voteOption.voters) {
            const realPhone = participantMap.get(voterJid) || voterJid.split("@")[0]
            if (realPhone === phone) {
              newVotes.add(voteOption.name)
            }
          }
        }
        votesByParticipant.set(phone, newVotes)
        console.log(`[v0] 🔄 Atualizado votos de ${phone}: ${newVotes.size} opções`)
      }
    }

    let totalVotes = 0
    for (const votes of votesByParticipant.values()) {
      totalVotes += votes.size
    }

    console.log(`[v0] ✅ Total de votos armazenados: ${totalVotes} (${votesByParticipant.size} participantes)`)
  } catch (error) {
    console.error("[v0] ❌ Erro ao processar voto:", error)
  }
}

const pollVotesCache = new Map() // pollId -> Map(participantPhone -> Set(optionNames))

/**
 * Processa a indisponibilidade de um membro baseado em seu voto
 * @param {string} voterPhone - Número de telefone do votante
 * @param {string} optionName - Nome da opção votada
 * @param {Array} events - Lista de eventos
 * @param {string} monthName - Nome do mês
 * @returns {boolean} - true se salvou com sucesso
 */
async function processVoterUnavailability(voterPhone, optionName, events, monthName) {
  try {
    console.log(`[v0] Processando voto de ${voterPhone} para opção: ${optionName}`)

    // Encontrar o membro no Firebase pelo telefone
    const membersRef = collection(db, "members")
    const q = query(membersRef, where("phone", "==", voterPhone))
    const querySnapshot = await getDocs(q)

    if (querySnapshot.empty) {
      console.log(`[v0] Membro com telefone ${voterPhone} não encontrado no Firebase`)
      return false
    }

    const memberDoc = querySnapshot.docs[0]
    const memberData = { id: memberDoc.id, ...memberDoc.data() }

    // Encontrar qual evento corresponde à opção votada
    const event = findEventByOptionName(optionName, events)
    if (!event) {
      console.log(`[v0] Evento não encontrado para a opção: ${optionName}`)
      return false
    }

    // Verificar se já existe uma indisponibilidade cadastrada
    const unavailabilityRef = collection(db, "unavailability")
    const existingQuery = query(
      unavailabilityRef,
      where("memberId", "==", memberData.id),
      where("date", "==", event.date),
      where("eventTitle", "==", event.title),
    )
    const existingSnapshot = await getDocs(existingQuery)

    if (!existingSnapshot.empty) {
      console.log(`[v0] Indisponibilidade já cadastrada para ${memberData.name} em ${event.date} (${event.title})`)
      return false
    }

    // Adicionar nova indisponibilidade no Firebase
    await addDoc(unavailabilityRef, {
      memberId: memberData.id,
      memberName: memberData.name,
      memberPhone: memberData.phone,
      date: event.date,
      eventTitle: event.title,
      createdAt: new Date().toISOString(),
      source: "whatsapp-poll", // Para rastrear origem
    })

    console.log(`[v0] ✅ Indisponibilidade cadastrada: ${memberData.name} - ${event.date} (${event.title})`)
    return true
  } catch (error) {
    console.error("[v0] Erro ao processar indisponibilidade do votante:", error)
    return false
  }
}

/**
 * Encontra um evento baseado no nome da opção da enquete
 * @param {string} optionName - Nome da opção (ex: "15/DEZ - Culto de Celebração")
 * @param {Array} events - Lista de eventos
 * @returns {Object|null} - Evento encontrado ou null
 */
function findEventByOptionName(optionName, events) {
  // Extrair título após o " - " (ex: "15/DEZ - CULTO 1" -> "CULTO 1")
  const titleMatch = optionName.match(/^\d{1,2}\/\w+ - (.+)$/)
  if (!titleMatch) return null

  const optionTitle = titleMatch[1]

  // Procurar evento com título correspondente
  return events.find((event) => event.title === optionTitle)
}

/**
 * Limpa informações de enquetes antigas (executar periodicamente)
 */
function cleanupOldPolls() {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

  for (const [pollId, pollInfo] of activePollsStore.entries()) {
    const createdAt = new Date(pollInfo.createdAt)
    if (createdAt < oneDayAgo) {
      activePollsStore.delete(pollId)
      console.log(`[v0] Enquete antiga removida do cache: ${pollId}`)
    }
  }
}

// Limpar enquetes antigas a cada 6 horas
setInterval(cleanupOldPolls, 6 * 60 * 60 * 1000)

/**
 * Envia resultados consolidados de múltiplas enquetes
 * @param {Object} sock - Socket do WhatsApp
 * @param {string} groupId - ID do grupo
 * @param {string} monthName - Nome do mês
 */
async function sendConsolidatedResults(sock, groupId, monthName) {
  try {
    const unavailabilityRef = collection(db, "unavailability")
    const recentQuery = query(unavailabilityRef, where("source", "==", "whatsapp-poll"))
    const snapshot = await getDocs(recentQuery)

    const uniqueVoters = new Set()
    let totalIndisponibilidades = 0

    snapshot.forEach((doc) => {
      const data = doc.data()
      uniqueVoters.add(data.memberPhone)
      totalIndisponibilidades++
    })

    await sock.sendMessage(groupId, {
      text: `✅ Todas as enquetes finalizadas!\n\n📊 Resultados consolidados de ${monthName}:\n• ${uniqueVoters.size} pessoa(s) votou/votaram\n• ${totalIndisponibilidades} indisponibilidade(s) registrada(s)\n\n🌐 Acesse o painel web para ver os detalhes!`,
    })
  } catch (error) {
    console.error("[v0] Erro ao enviar resultados consolidados:", error)
  }
}

/**
 * Finaliza a enquete e processa todos os votos
 * @param {Object} sock - Socket do WhatsApp
 * @param {string} pollId - ID da enquete
 * @param {string} groupId - ID do grupo
 * @param {boolean} isMultiPart - Se faz parte de múltiplas enquetes
 */
async function finalizePoll(sock, pollId, groupId, isMultiPart = false) {
  try {
    const pollInfo = activePollsStore.get(pollId)
    if (!pollInfo) {
      console.log("[v0] ⚠️ Enquete não encontrada para finalizar")
      return
    }

    console.log(
      `[v0] 🏁 Finalizando enquete parte ${pollInfo.partNumber}/${pollInfo.totalParts}: ${pollInfo.monthName}`,
    )

    if (!pollInfo.messageKey) {
      console.log("[v0] ⚠️ Chave da mensagem ainda não foi registrada")

      if (!isMultiPart) {
        await sock.sendMessage(groupId, {
          text: `⏰ Tempo esgotado!\n\n❌ Não foi possível processar os votos. Por favor, tente novamente.`,
        })
      }

      // Limpar timer e cache
      const timer = activePollTimers.get(pollId)
      if (timer) {
        clearTimeout(timer)
        activePollTimers.delete(pollId)
      }
      activePollsStore.delete(pollId)
      return
    }

    const keyToUse = pollInfo.messageKey
    console.log(`[v0] Buscando mensagem com key:`, JSON.stringify(keyToUse))
    const pollMessage = await getMessage(keyToUse)

    if (!pollMessage) {
      console.log("[v0] ⚠️ Mensagem da enquete não encontrada no store")

      if (!isMultiPart) {
        await sock.sendMessage(groupId, {
          text: `⏰ Tempo esgotado!\n\n❌ Não foi possível processar os votos. Por favor, tente novamente.`,
        })
      }

      // Limpar timer e cache
      const timer = activePollTimers.get(pollId)
      if (timer) {
        clearTimeout(timer)
        activePollTimers.delete(pollId)
      }
      activePollsStore.delete(pollId)
      pollVotesCache.delete(pollId)
      return
    }

    console.log(`[v0] ✓ Mensagem da enquete carregada do store`)

    const votesByParticipant = pollVotesCache.get(pollId)
    if (!votesByParticipant || votesByParticipant.size === 0) {
      console.log(`[v0] Nenhum voto registrado na parte ${pollInfo.partNumber}`)

      // Limpar timer e cache
      const timer = activePollTimers.get(pollId)
      if (timer) {
        clearTimeout(timer)
        activePollTimers.delete(pollId)
      }
      activePollsStore.delete(pollId)
      pollVotesCache.delete(pollId)
      return
    }

    console.log(`[v0] Total de participantes na parte ${pollInfo.partNumber}: ${votesByParticipant.size}`)

    let totalIndisponibilidades = 0

    for (const [voterPhone, votedOptions] of votesByParticipant.entries()) {
      console.log(`[v0] Processando ${votedOptions.size} votos de ${voterPhone}`)

      for (const optionName of votedOptions) {
        const saved = await processVoterUnavailability(voterPhone, optionName, pollInfo.events, pollInfo.monthName)
        if (saved) totalIndisponibilidades++
      }
    }

    console.log(
      `[v0] ✅ Parte ${pollInfo.partNumber}/${pollInfo.totalParts} processada: ${votesByParticipant.size} votantes, ${totalIndisponibilidades} indisponibilidades`,
    )

    if (!isMultiPart) {
      await sock.sendMessage(groupId, {
        text: `✅ Enquete finalizada!\n\n📊 Resultados:\n• ${votesByParticipant.size} pessoa(s) votou/votaram\n• ${totalIndisponibilidades} indisponibilidade(s) registrada(s)\n\n🌐 Acesse o painel web para ver os detalhes!`,
      })
    }

    // Limpar timer e cache
    const timer = activePollTimers.get(pollId)
    if (timer) {
      clearTimeout(timer)
      activePollTimers.delete(pollId)
    }

    activePollsStore.delete(pollId)
    pollVotesCache.delete(pollId)

    console.log(`[v0] ✅ Enquete parte ${pollInfo.partNumber} finalizada com sucesso!`)
  } catch (error) {
    console.error("[v0] ❌ Erro ao finalizar enquete:", error)
  }
}

module.exports = {
  sendUnavailabilityPoll,
  handlePollUpdate,
  registerPollMessage,
  activePollsStore,
}
