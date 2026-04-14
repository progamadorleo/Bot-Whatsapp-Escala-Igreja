const { collection, getDocs } = require("firebase/firestore")
const { db } = require("../config/firebase-config")
const { sendUnavailabilityPoll } = require("./poll-handler")

/**
 * Verifica se hoje é o último dia do mês
 * @returns {boolean}
 */
function isLastDayOfMonth() {
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  return today.getMonth() !== tomorrow.getMonth()
}

/**
 * Obtém cultos do próximo mês
 * @returns {Promise<Array>}
 */
async function getNextMonthEvents() {
  try {
    const today = new Date()
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1)
    const monthAfter = new Date(today.getFullYear(), today.getMonth() + 2, 1)

    console.log(`[v0] Buscando cultos entre ${nextMonth.toISOString()} e ${monthAfter.toISOString()}`)

    // Buscar todos os cultos
    const eventsSnapshot = await getDocs(collection(db, "events"))
    const allEvents = eventsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))

    // Filtrar cultos do próximo mês
    const nextMonthEvents = allEvents.filter((event) => {
      const eventDate = new Date(event.date)
      return eventDate >= nextMonth && eventDate < monthAfter
    })

    // Ordenar por data
    nextMonthEvents.sort((a, b) => new Date(a.date) - new Date(b.date))

    console.log(`[v0] Encontrados ${nextMonthEvents.length} cultos para o próximo mês`)
    return nextMonthEvents
  } catch (error) {
    console.error("[v0] Erro ao buscar cultos do próximo mês:", error)
    return []
  }
}

/**
 * Obtém o nome do próximo mês em português
 * @returns {string}
 */
function getNextMonthName() {
  const months = [
    "JANEIRO",
    "FEVEREIRO",
    "MARÇO",
    "ABRIL",
    "MAIO",
    "JUNHO",
    "JULHO",
    "AGOSTO",
    "SETEMBRO",
    "OUTUBRO",
    "NOVEMBRO",
    "DEZEMBRO",
  ]

  const today = new Date()
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1)

  return months[nextMonth.getMonth()]
}

/**
 * Executa a tarefa de envio de enquete mensal
 * @param {Object} sock - Socket do WhatsApp
 * @param {string} groupId - ID do grupo
 */
async function runMonthlyPollTask(sock, groupId) {
  try {
    console.log("[v0] Executando tarefa mensal de enquete...")

    // Buscar cultos do próximo mês
    const nextMonthEvents = await getNextMonthEvents()

    if (nextMonthEvents.length === 0) {
      console.log("[v0] ⚠️ Nenhum culto cadastrado para o próximo mês. Enquete não enviada.")
      return
    }

    const monthName = getNextMonthName()

    // Enviar enquete para o grupo
    await sendUnavailabilityPoll(sock, groupId, nextMonthEvents, monthName)

    console.log(`[v0] ✅ Enquete mensal enviada com sucesso! (${nextMonthEvents.length} cultos em ${monthName})`)
  } catch (error) {
    console.error("[v0] Erro ao executar tarefa mensal de enquete:", error)
  }
}

/**
 * Inicia o agendamento automático de enquetes mensais
 * @param {Object} sock - Socket do WhatsApp
 * @param {string} groupId - ID do grupo
 */
function startMonthlyScheduler(sock, groupId) {
  console.log("[v0] Iniciando agendador mensal de enquetes...")

  // Verificar a cada hora se é o último dia do mês
  setInterval(
    async () => {
      const now = new Date()
      const hour = now.getHours()

      // Executar apenas às 20h do último dia do mês
      if (isLastDayOfMonth() && hour === 20) {
        console.log("[v0] 🗓️ Último dia do mês detectado às 20h! Enviando enquete...")
        await runMonthlyPollTask(sock, groupId)
      }
    },
    60 * 60 * 1000,
  ) // Verificar a cada hora

  console.log("[v0] ✅ Agendador configurado: enquete será enviada todo último dia do mês às 20h")
}

/**
 * Comando manual para testar o envio da enquete
 * @param {Object} sock - Socket do WhatsApp
 * @param {string} groupId - ID do grupo
 */
async function testMonthlyPoll(sock, groupId) {
  console.log("[v0] 🧪 Testando envio de enquete mensal...")
  await runMonthlyPollTask(sock, groupId)
}

module.exports = {
  startMonthlyScheduler,
  testMonthlyPoll,
  getNextMonthEvents,
  isLastDayOfMonth,
}
