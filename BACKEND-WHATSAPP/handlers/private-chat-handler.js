const { collection, addDoc, query, where, getDocs } = require("firebase/firestore")

// Maps to track user registration state
const awaitingResponse = new Map() // Users awaiting name response
const awaitingRoleSelection = new Map() // Users awaiting role selection
const lidToPhoneMap = new Map() // Maps @lid IDs to phone numbers

/**
 * Handles private chat messages for user registration flow
 * @param {Object} sock - WhatsApp socket connection
 * @param {Object} db - Firestore database instance
 * @param {Object} msg - Incoming message object
 * @param {string} participant - Participant JID
 * @param {string} messageText - Message text content
 */
async function handlePrivateChatMessage(sock, db, msg, participant, messageText) {
  console.log(`[v0] 🔍 handlePrivateChatMessage chamado:`)
  console.log(`   Participant: ${participant}`)
  console.log(`   Texto: ${messageText}`)

  let resolvedParticipant = participant
  if (participant.includes("@lid")) {
    const phone = lidToPhoneMap.get(participant)
    if (phone) {
      resolvedParticipant = phone
      console.log(`   🔄 Resolved ${participant} to ${resolvedParticipant}`)
    }
  }

  console.log(`   Aguardando função: ${awaitingRoleSelection.has(resolvedParticipant)}`)
  console.log(`   Aguardando nome: ${awaitingResponse.has(resolvedParticipant)}`)

  // Handle role selection response
  if (awaitingRoleSelection.has(resolvedParticipant)) {
    console.log(`[v0] ➡️  Processando seleção de função`)
    await handleRoleSelection(sock, db, resolvedParticipant, messageText)
    return true
  }

  // Handle name response
  if (awaitingResponse.has(resolvedParticipant)) {
    console.log(`[v0] ➡️  Processando resposta de nome`)
    await handleNameResponse(sock, resolvedParticipant, messageText)
    return true
  }

  console.log(`[v0] ⚠️  Usuário não está em nenhum fluxo de registro`)
  return false
}

/**
 * Handles name response from user
 */
async function handleNameResponse(sock, participant, messageText) {
  const userName = messageText.trim()

  if (userName && userName.length > 0) {
    console.log(`📝 Nome recebido de ${participant}: ${userName}`)

    // Store user data and ask for role
    awaitingRoleSelection.set(participant, { name: userName })
    awaitingResponse.delete(participant)

    await sock.sendMessage(participant, {
      text: `Obrigado, ${userName}! 👏\n\nAgora me diga, qual é sua área de atuação?\n\n1️⃣ - Fotógrafo\n2️⃣ - Editor\n3️⃣ - Ambos\n\nResponda com o número da opção:`,
    })
  } else {
    await sock.sendMessage(participant, {
      text: "❌ Nome inválido. Por favor, envie seu nome completo novamente:",
    })
  }
}

/**
 * Handles role selection response from user
 */
async function handleRoleSelection(sock, db, participant, messageText) {
  const roleChoice = messageText.trim().toLowerCase()
  const userData = awaitingRoleSelection.get(participant)

  const roles = {
    fotografo: false,
    editor: false,
  }

  if (roleChoice === "1" || roleChoice.includes("fotograf")) {
    roles.fotografo = true
  } else if (roleChoice === "2" || roleChoice.includes("editor")) {
    roles.editor = true
  } else if (roleChoice === "3" || roleChoice.includes("ambos")) {
    roles.fotografo = true
    roles.editor = true
  } else {
    await sock.sendMessage(participant, {
      text: "❌ Opção inválida. Por favor, escolha:\n\n1️⃣ - Fotógrafo\n2️⃣ - Editor\n3️⃣ - Ambos",
    })
    return
  }

  console.log(`🎯 Função selecionada por ${participant}:`, roles)
  await addMemberToFirebase(db, participant, userData.name, roles)
  awaitingRoleSelection.delete(participant)

  await sock.sendMessage(participant, {
    text: `✅ Perfeito, ${userData.name}! Você foi cadastrado com sucesso na escala do ministério de mídia. 🎉`,
  })
}

/**
 * Starts the name collection process for a group
 */
async function startNameCollection(sock, groupJid) {
  try {
    console.log(`Iniciando coleta de nomes do grupo: ${groupJid}`)

    // Get group metadata
    const groupMetadata = await sock.groupMetadata(groupJid)
    const groupName = groupMetadata.subject

    console.log(`Nome do grupo: ${groupName}`)

    // Check if this is the correct group
    if (groupName !== "ESCALA DE TESTE") {
      await sock.sendMessage(groupJid, {
        text: '❌ Este comando só funciona no grupo "ESCALA DE TESTE".',
      })
      return
    }

    // Get all group participants
    const participants = groupMetadata.participants
    console.log(`Total de participantes: ${participants.length}`)

    // Send message to the group
    await sock.sendMessage(groupJid, {
      text: "📋 *COLETA DE NOMES INICIADA*\n\nPor favor, cada membro envie seu nome completo para ser cadastrado na escala do ministério de mídia.",
    })

    // Send individual message to each participant
    for (const participant of participants) {
      const participantJid = participant.id

      // Skip bot
      if (participantJid === sock.user.id) continue

      // The participant.lid contains the @lid version if available
      if (participant.lid) {
        lidToPhoneMap.set(participant.lid, participantJid)
        console.log(`[v0] 🔗 Mapeamento criado: ${participant.lid} -> ${participantJid}`)
      }

      // Mark this participant as awaiting name response
      awaitingResponse.set(participantJid, {
        groupJid: groupJid,
        timestamp: Date.now(),
      })

      // Send individual message
      try {
        await sock.sendMessage(participantJid, {
          text: "👋 Olá! Por favor, envie seu nome completo para ser cadastrado na escala do ministério de mídia:",
        })

        console.log(`Mensagem enviada para: ${participantJid}`)

        // Wait a bit to avoid spam detection
        await new Promise((resolve) => setTimeout(resolve, 1000))
      } catch (error) {
        console.error(`❌ Erro ao enviar mensagem para ${participantJid}:`, error)
      }
    }

    console.log(`✅ Coleta de nomes iniciada! Aguardando respostas...`)
  } catch (error) {
    console.error("❌ Erro ao iniciar coleta de nomes:", error)
  }
}

/**
 * Adds a member to Firebase
 */
async function addMemberToFirebase(db, participantId, name, roles) {
  try {
    // Extract phone number from participant ID
    const phone = participantId.replace("@s.whatsapp.net", "")

    console.log(`\n🔍 Tentando adicionar membro ao Firebase...`)
    console.log(`   Nome: ${name}`)
    console.log(`   Telefone: ${phone}`)
    console.log(`   Participant ID: ${participantId}`)
    console.log(`   Funções:`, roles)

    console.log(`📊 Verificando se membro já existe...`)
    const membersRef = collection(db, "members")
    const q = query(membersRef, where("phone", "==", phone))
    const existingMember = await getDocs(q)

    if (!existingMember.empty) {
      console.log(`⚠️  Membro ${name} já existe no Firebase com telefone ${phone}`)
      return
    }

    console.log(`➕ Adicionando novo membro...`)
    const docRef = await addDoc(membersRef, {
      name: name,
      phone: phone,
      participantId: participantId,
      stars: 3, // Default stars
      roles: roles,
      createdAt: new Date().toISOString(),
      addedViaWhatsApp: true,
    })

    console.log(`✅ Membro ${name} adicionado ao Firebase com sucesso! Doc ID: ${docRef.id}\n`)
  } catch (error) {
    console.error(`\n❌ Erro ao adicionar membro ao Firebase:`)
    console.error(`   Mensagem: ${error.message}`)
    console.error(`   Código: ${error.code}`)
    if (error.details) console.error(`   Detalhes: ${error.details}`)
    console.error(`   Stack:`, error.stack)
    console.error(`\n`)
  }
}

module.exports = {
  handlePrivateChatMessage,
  startNameCollection,
}
