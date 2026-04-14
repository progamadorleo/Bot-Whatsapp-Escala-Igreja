"use client"

import { useState, useEffect } from "react"
import { db } from "@/lib/firebase"
import { collection, getDocs, updateDoc, doc, addDoc } from "firebase/firestore"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Calendar, Star, ArrowLeft, Sparkles, X, Camera, Pencil, Plus, UserX, Download, Save } from "lucide-react"
import Link from "next/link"
import type { Event, Member, Unavailability } from "@/lib/types"
import { Input } from "@/components/ui/input"

function parseLocalDate(dateString: string): Date {
  const [year, month, day] = dateString.split("-")
  return new Date(Number.parseInt(year), Number.parseInt(month) - 1, Number.parseInt(day))
}

export default function SchedulePage() {
  const [events, setEvents] = useState<Event[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [unavailabilities, setUnavailabilities] = useState<Unavailability[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [showManualModal, setShowManualModal] = useState(false)
  const [manualSelectedMembers, setManualSelectedMembers] = useState<{
    fotografos: string[]
    editores: string[]
  }>({ fotografos: [], editores: [] })
  const [selectedMonth, setSelectedMonth] = useState<string>("")
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [scheduleName, setScheduleName] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (events.length > 0 && !selectedMonth) {
      const now = new Date()
      const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
      setSelectedMonth(currentYearMonth)
    }
  }, [events, selectedMonth])

  async function loadData() {
    try {
      const [eventsSnapshot, membersSnapshot, unavailabilitySnapshot] = await Promise.all([
        getDocs(collection(db, "events")),
        getDocs(collection(db, "members")),
        getDocs(collection(db, "unavailability")),
      ])

      const eventsData = eventsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Event[]

      const membersData = membersSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Member[]

      const unavailabilityData = unavailabilitySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Unavailability[]

      setEvents(eventsData.sort((a, b) => parseLocalDate(a.date).getTime() - parseLocalDate(b.date).getTime()))
      setMembers(membersData)
      setUnavailabilities(unavailabilityData)
    } catch (error) {
      console.error("Erro ao carregar dados:", error)
    } finally {
      setIsLoading(false)
    }
  }

  function getAvailableMonths() {
    const months = new Set<string>()
    events.forEach((event) => {
      const date = parseLocalDate(event.date)
      const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
      months.add(yearMonth)
    })
    return Array.from(months).sort()
  }

  function getFilteredEvents() {
    if (!selectedMonth) return events
    return events.filter((event) => {
      const date = parseLocalDate(event.date)
      const eventYearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
      return eventYearMonth === selectedMonth
    })
  }

  function formatMonth(yearMonth: string) {
    const [year, month] = yearMonth.split("-")
    const date = new Date(Number.parseInt(year), Number.parseInt(month) - 1)
    return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
  }

  function isMemberUnavailable(memberId: string, eventDate: string): boolean {
    return unavailabilities.some((unavail) => unavail.memberId === memberId && unavail.date === eventDate)
  }

  function findClosestMembers(
    members: Member[],
    requiredStars: number,
    role: "fotografo" | "editor",
    eventDate: string,
  ) {
    const eligibleMembers = members.filter((m) => m.roles?.[role] && !isMemberUnavailable(m.id, eventDate))

    const exactMatch = eligibleMembers.filter((m) => m.stars === requiredStars)
    if (exactMatch.length > 0) return exactMatch

    const higher = eligibleMembers.filter((m) => m.stars > requiredStars).sort((a, b) => a.stars - b.stars)
    const lower = eligibleMembers.filter((m) => m.stars < requiredStars).sort((a, b) => b.stars - a.stars)

    return [...higher, ...lower]
  }

  async function generateAutoSchedule() {
    const monthText = selectedMonth ? ` do mês de ${formatMonth(selectedMonth)}` : " de TODOS os meses"
    if (!confirm(`Isso irá gerar a escala automaticamente para todos os cultos${monthText}. Continuar?`)) return

    setIsGenerating(true)

    try {
      const memberUsageCount = new Map<string, number>()
      members.forEach((m) => memberUsageCount.set(m.id, 0))

      const filteredEvents = getFilteredEvents()
      const sortedEvents = [...filteredEvents].sort(
        (a, b) => parseLocalDate(a.date).getTime() - parseLocalDate(b.date).getTime(),
      )

      for (const event of sortedEvents) {
        const assignedMembers: any[] = []
        const usedInThisEvent = new Set<string>()

        const fotografos = findClosestMembers(members, event.requiredStars, "fotografo", event.date)
        const editores = findClosestMembers(members, event.requiredStars, "editor", event.date)

        const sortByUsage = (a: Member, b: Member) => {
          const usageA = memberUsageCount.get(a.id) || 0
          const usageB = memberUsageCount.get(b.id) || 0
          if (usageA !== usageB) return usageA - usageB
          return b.stars - a.stars
        }

        const sortedFotografos = [...fotografos].sort(sortByUsage)
        for (let i = 0; i < Math.min(event.needsFotografos || 0, sortedFotografos.length); i++) {
          const member = sortedFotografos[i]
          if (!usedInThisEvent.has(member.id)) {
            assignedMembers.push({
              id: member.id,
              name: member.name,
              phone: member.phone,
              stars: member.stars,
              role: "fotografo" as const,
            })
            usedInThisEvent.add(member.id)
            memberUsageCount.set(member.id, (memberUsageCount.get(member.id) || 0) + 1)
          }
        }

        const sortedEditores = [...editores].sort(sortByUsage)
        for (let i = 0; i < Math.min(event.needsEditores || 0, sortedEditores.length); i++) {
          const member = sortedEditores[i]
          if (!usedInThisEvent.has(member.id)) {
            assignedMembers.push({
              id: member.id,
              name: member.name,
              phone: member.phone,
              stars: member.stars,
              role: "editor" as const,
            })
            usedInThisEvent.add(member.id)
            memberUsageCount.set(member.id, (memberUsageCount.get(member.id) || 0) + 1)
          }
        }

        const eventRef = doc(db, "events", event.id)
        await updateDoc(eventRef, {
          assignedMembers: assignedMembers,
        })
      }

      await loadData()
      alert("Escala gerada com sucesso! Membros indisponíveis foram automaticamente excluídos.")
    } catch (error) {
      console.error("Erro ao gerar escala:", error)
      alert("Erro ao gerar escala. Tente novamente.")
    } finally {
      setIsGenerating(false)
    }
  }

  async function autoAssignMembers(event: Event) {
    const needsFotografos = event.needsFotografos ?? 1
    const needsEditores = event.needsEditores ?? 1

    const assignedMembers: any[] = []
    const usedMemberIds = new Set<string>()

    const fotografos = findClosestMembers(members, event.requiredStars, "fotografo", event.date)
    const editores = findClosestMembers(members, event.requiredStars, "editor", event.date)

    const shuffledFotografos = [...fotografos].sort(() => Math.random() - 0.5)
    const shuffledEditores = [...editores].sort(() => Math.random() - 0.5)

    for (let i = 0; i < Math.min(needsFotografos, shuffledFotografos.length); i++) {
      const member = shuffledFotografos[i]
      if (!usedMemberIds.has(member.id)) {
        assignedMembers.push({
          id: member.id,
          name: member.name,
          phone: member.phone,
          stars: member.stars,
          role: "fotografo" as const,
        })
        usedMemberIds.add(member.id)
      }
    }

    for (let i = 0; i < Math.min(needsEditores, shuffledEditores.length); i++) {
      const member = shuffledEditores[i]
      if (!usedMemberIds.has(member.id)) {
        assignedMembers.push({
          id: member.id,
          name: member.name,
          phone: member.phone,
          stars: member.stars,
          role: "editor" as const,
        })
        usedMemberIds.add(member.id)
      }
    }

    try {
      const eventRef = doc(db, "events", event.id)
      await updateDoc(eventRef, {
        assignedMembers: assignedMembers,
      })
      await loadData()
    } catch (error) {
      console.error("Erro ao atribuir membros:", error)
    }
  }

  async function removeAssignment(eventId: string) {
    if (!confirm("Tem certeza que deseja remover toda a escala deste culto?")) return

    try {
      const eventRef = doc(db, "events", eventId)
      await updateDoc(eventRef, {
        assignedMembers: [],
      })
      await loadData()
    } catch (error) {
      console.error("Erro ao remover escala:", error)
    }
  }

  function openManualAssignment(event: Event) {
    setSelectedEvent(event)
    const currentFotografos = event.assignedMembers?.filter((m) => m.role === "fotografo").map((m) => m.id) || []
    const currentEditores = event.assignedMembers?.filter((m) => m.role === "editor").map((m) => m.id) || []
    setManualSelectedMembers({
      fotografos: currentFotografos,
      editores: currentEditores,
    })
    setShowManualModal(true)
  }

  function toggleMemberSelection(memberId: string, role: "fotografo" | "editor") {
    setManualSelectedMembers((prev) => {
      const currentList = prev[role === "fotografo" ? "fotografos" : "editores"]
      if (currentList.includes(memberId)) {
        return {
          ...prev,
          [role === "fotografo" ? "fotografos" : "editores"]: currentList.filter((id) => id !== memberId),
        }
      } else {
        return {
          ...prev,
          [role === "fotografo" ? "fotografos" : "editores"]: [...currentList, memberId],
        }
      }
    })
  }

  async function saveManualAssignment() {
    if (!selectedEvent) return

    const assignedMembers: any[] = []

    manualSelectedMembers.fotografos.forEach((memberId) => {
      const member = members.find((m) => m.id === memberId)
      if (member) {
        assignedMembers.push({
          id: member.id,
          name: member.name,
          phone: member.phone,
          stars: member.stars,
          role: "fotografo" as const,
        })
      }
    })

    manualSelectedMembers.editores.forEach((memberId) => {
      const member = members.find((m) => m.id === memberId)
      if (member) {
        assignedMembers.push({
          id: member.id,
          name: member.name,
          phone: member.phone,
          stars: member.stars,
          role: "editor" as const,
        })
      }
    })

    try {
      const eventRef = doc(db, "events", selectedEvent.id)
      await updateDoc(eventRef, {
        assignedMembers: assignedMembers,
      })
      await loadData()
      setShowManualModal(false)
      setSelectedEvent(null)
    } catch (error) {
      console.error("Erro ao salvar escala manual:", error)
      alert("Erro ao salvar. Tente novamente.")
    }
  }

  function formatDate(dateString: string) {
    const date = parseLocalDate(dateString)
    return date.toLocaleDateString("pt-BR", {
      weekday: "short",
      day: "2-digit",
      month: "short",
    })
  }

  function getUnavailableMembersForMonth() {
    const filteredEvents = getFilteredEvents()
    const memberUnavailability = new Map<string, { name: string; phone: string; dates: string[] }>()

    console.log("[v0] Filtered Events:", filteredEvents.length)
    console.log("[v0] Total Unavailabilities:", unavailabilities.length)
    console.log("[v0] Selected Month:", selectedMonth)

    unavailabilities.forEach((unavail) => {
      const isInFilteredMonth = filteredEvents.some((event) => event.date === unavail.date)
      if (!isInFilteredMonth && selectedMonth) return

      const member = members.find((m) => m.id === unavail.memberId)
      if (!member) return

      const existing = memberUnavailability.get(member.id)
      const event = events.find((e) => e.date === unavail.date)
      const formattedDate = event ? formatDate(event.date) : unavail.date

      if (existing) {
        existing.dates.push(formattedDate)
      } else {
        memberUnavailability.set(member.id, {
          name: member.name,
          phone: member.phone,
          dates: [formattedDate],
        })
      }
    })

    const result = Array.from(memberUnavailability.values())
    console.log("[v0] Unavailable Members Found:", result.length, result)
    return result
  }

  function exportScheduleToPDF() {
    const filteredEvents = getFilteredEvents().filter((e) => e.assignedMembers && e.assignedMembers.length > 0)

    if (filteredEvents.length === 0) {
      alert("Nenhuma escala gerada para exportar.")
      return
    }

    const monthText = selectedMonth ? formatMonth(selectedMonth).toUpperCase() : "TODAS AS ESCALAS"

    const element = document.createElement("div")
    element.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:210mm;visibility:hidden;background:#677EEA;"

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: Arial, Helvetica, sans-serif;
              background: #677EEA;
              padding: 40px;
              color: #1A202C;
            }
            .container { max-width: 1400px; margin: 0 auto; }
            .header {
              text-align: center;
              margin-bottom: 50px;
              padding: 30px;
              background: #FFFFFF;
              border-radius: 20px;
              box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            }
            .header h1 {
              font-size: 42px;
              font-weight: bold;
              color: #677EEA;
              margin-bottom: 10px;
              letter-spacing: -1px;
            }
            .header .camera-icon { font-size: 48px; margin-bottom: 15px; }
            .header p { font-size: 18px; color: #718096; font-weight: 500; }
            .grid {
              display: grid;
              grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
              gap: 25px;
              margin-bottom: 30px;
            }
            .card {
              background: #FFFFFF;
              border-radius: 16px;
              padding: 24px;
              box-shadow: 0 10px 30px rgba(0,0,0,0.2);
              position: relative;
              overflow: hidden;
            }
            .card::before {
              content: '';
              position: absolute;
              top: 0;
              left: 0;
              right: 0;
              height: 4px;
              background: #677EEA;
            }
            .card-header {
              margin-bottom: 20px;
              padding-bottom: 16px;
              border-bottom: 2px solid #E2E8F0;
            }
            .card-title {
              font-size: 20px;
              font-weight: bold;
              color: #2D3748;
              margin-bottom: 8px;
              display: flex;
              align-items: center;
              gap: 8px;
            }
            .card-date {
              font-size: 14px;
              color: #718096;
              font-weight: 600;
              display: flex;
              align-items: center;
              gap: 6px;
            }
            .members-section { margin-top: 16px; }
            .member-item {
              display: flex;
              align-items: center;
              gap: 12px;
              padding: 12px;
              margin-bottom: 10px;
              border-radius: 10px;
              border-left: 3px solid;
            }
            .member-item.fotografo {
              border-left-color: #677EEA;
              background: #EDF2FF;
            }
            .member-item.editor {
              border-left-color: #764BA2;
              background: #FAF5FF;
            }
            .member-icon { font-size: 20px; min-width: 24px; }
            .member-info { flex: 1; }
            .member-name {
              font-size: 15px;
              font-weight: 600;
              color: #2D3748;
              margin-bottom: 2px;
            }
            .member-role {
              font-size: 12px;
              color: #718096;
              text-transform: uppercase;
              font-weight: 600;
              letter-spacing: 0.5px;
            }
            .footer {
              text-align: center;
              margin-top: 40px;
              padding: 20px;
              background: #FFFFFF;
              border-radius: 12px;
              font-size: 14px;
              color: #718096;
            }
            @media print {
              body { padding: 20px; }
              .card { break-inside: avoid; page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="camera-icon">📸</div>
              <h1>ESCALA DE MÍDIA</h1>
              <p>${monthText}</p>
            </div>
            <div class="grid">
              ${filteredEvents
                .map((event) => {
                  const eventDate = parseLocalDate(event.date)
                  const dateStr = eventDate.toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })
                  const fotografos = event.assignedMembers?.filter((m) => m.role === "fotografo") || []
                  const editores = event.assignedMembers?.filter((m) => m.role === "editor") || []

                  return `
                  <div class="card">
                    <div class="card-header">
                      <div class="card-title">🎬 ${event.title}</div>
                      <div class="card-date">📅 ${dateStr} • ${event.time}</div>
                    </div>
                    <div class="members-section">
                      ${fotografos
                        .map(
                          (member) => `
                        <div class="member-item fotografo">
                          <div class="member-icon">📷</div>
                          <div class="member-info">
                            <div class="member-name">${member.name}</div>
                            <div class="member-role">Fotógrafo</div>
                          </div>
                        </div>
                      `,
                        )
                        .join("")}
                      ${editores
                        .map(
                          (member) => `
                        <div class="member-item editor">
                          <div class="member-icon">✂️</div>
                          <div class="member-info">
                            <div class="member-name">${member.name}</div>
                            <div class="member-role">Editor</div>
                          </div>
                        </div>
                      `,
                        )
                        .join("")}
                    </div>
                  </div>
                `
                })
                .join("")}
            </div>
            <div class="footer">
              Gerado automaticamente pelo Sistema de Escala • ${new Date().toLocaleDateString("pt-BR")}
            </div>
          </div>
        </body>
      </html>
    `

    element.innerHTML = htmlContent
    document.body.appendChild(element)

    import("html2pdf.js")
      .then((html2pdf) => {
        const opt = {
          margin: 10,
          filename: `Escala-${monthText.replace(/\s+/g, "-")}.pdf`,
          image: { type: "jpeg" as const, quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, letterRendering: true },
          jsPDF: { unit: "mm" as const, format: "a4" as const, orientation: "portrait" as const },
        }
        return html2pdf.default().set(opt).from(element).save()
      })
      .then(() => {
        if (element && element.parentNode) {
          document.body.removeChild(element)
        }
      })
      .catch((error) => {
        console.error("[v0] Erro ao gerar PDF:", error)
        if (element && element.parentNode) {
          document.body.removeChild(element)
        }
        alert("Erro ao gerar PDF. Tente novamente.")
      })
  }

  async function saveSchedule() {
    if (!scheduleName.trim()) {
      alert("Por favor, digite um nome para a escala.")
      return
    }

    const filteredEvents = getFilteredEvents().filter((e) => e.assignedMembers && e.assignedMembers.length > 0)

    if (filteredEvents.length === 0) {
      alert("Nenhuma escala gerada para salvar.")
      return
    }

    setIsSaving(true)

    try {
      const scheduleData = {
        name: scheduleName,
        month: selectedMonth || "all",
        events: filteredEvents.map((event) => ({
          eventId: event.id,
          eventTitle: event.title,
          eventDate: event.date,
          eventTime: event.time,
          assignedMembers: event.assignedMembers || [],
        })),
        createdAt: new Date().toISOString(),
      }

      await addDoc(collection(db, "savedSchedules"), scheduleData)

      alert("Escala salva com sucesso!")
      setShowSaveModal(false)
      setScheduleName("")
    } catch (error) {
      console.error("Erro ao salvar escala:", error)
      alert("Erro ao salvar escala. Tente novamente.")
    } finally {
      setIsSaving(false)
    }
  }

  const filteredEvents = getFilteredEvents()
  const availableMonths = getAvailableMonths()
  const unavailableMembers = getUnavailableMembersForMonth()
  const hasAssignedEvents = filteredEvents.some((e) => e.assignedMembers && e.assignedMembers.length > 0)

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-4xl font-bold text-foreground">Escala do Mês</h1>
            <p className="text-muted-foreground mt-1">Distribuição automática inteligente de membros</p>
          </div>
          <div className="flex gap-2">
            {hasAssignedEvents && (
              <>
                <Button onClick={() => setShowSaveModal(true)} variant="outline" size="lg">
                  <Save className="mr-2 h-5 w-5" />
                  Salvar Escala
                </Button>
                <Button onClick={exportScheduleToPDF} variant="outline" size="lg">
                  <Download className="mr-2 h-5 w-5" />
                  Exportar PDF
                </Button>
              </>
            )}
            {events.length > 0 && members.length > 0 && (
              <Button
                onClick={generateAutoSchedule}
                size="lg"
                disabled={isGenerating}
                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
              >
                <Sparkles className="mr-2 h-5 w-5" />
                {isGenerating ? "Gerando..." : "Gerar Escala Automática"}
              </Button>
            )}
          </div>
        </div>

        {availableMonths.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-muted-foreground">Filtrar por mês:</span>
              {availableMonths.map((month) => (
                <Button
                  key={month}
                  variant={selectedMonth === month ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedMonth(month)}
                  className="capitalize"
                >
                  {formatMonth(month)}
                </Button>
              ))}
              {selectedMonth && (
                <Button variant="ghost" size="sm" onClick={() => setSelectedMonth("")}>
                  Mostrar todos
                </Button>
              )}
            </div>
          </div>
        )}

        {!isLoading && unavailableMembers.length > 0 && (
          <Card className="p-6 mb-6 bg-gradient-to-r from-red-50 to-orange-50 border-red-200">
            <div className="flex items-center gap-3 mb-4">
              <UserX className="h-6 w-6 text-red-600" />
              <div>
                <h3 className="font-semibold text-lg text-red-900">Membros Indisponíveis</h3>
                <p className="text-sm text-red-700">
                  {selectedMonth ? `Para o mês de ${formatMonth(selectedMonth)}` : "Para todos os cultos cadastrados"}
                </p>
              </div>
            </div>
            <div className="space-y-3">
              {unavailableMembers.map((member, index) => (
                <div key={index} className="bg-white p-4 rounded-lg border border-red-200">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-semibold text-foreground">{member.name}</p>
                      <p className="text-sm text-muted-foreground">{member.phone}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-red-700 mb-1">Não pode servir em:</p>
                      <p className="text-sm text-muted-foreground capitalize">{member.dates.join(", ")}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {isLoading ? (
          <div className="text-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
            <p className="mt-4 text-muted-foreground">Carregando escala...</p>
          </div>
        ) : events.length === 0 ? (
          <Card className="p-12 text-center">
            <p className="text-muted-foreground text-lg mb-4">Nenhum culto cadastrado ainda.</p>
            <Link href="/cultos">
              <Button>Cadastrar Cultos</Button>
            </Link>
          </Card>
        ) : members.length === 0 ? (
          <Card className="p-12 text-center">
            <p className="text-muted-foreground text-lg mb-4">Nenhum membro cadastrado ainda.</p>
            <Link href="/members">
              <Button>Cadastrar Membros</Button>
            </Link>
          </Card>
        ) : filteredEvents.length === 0 ? (
          <Card className="p-12 text-center">
            <p className="text-muted-foreground text-lg mb-4">
              Nenhum culto encontrado para {formatMonth(selectedMonth)}.
            </p>
            <Button variant="outline" onClick={() => setSelectedMonth("")}>
              Mostrar todos os meses
            </Button>
          </Card>
        ) : (
          <div className="space-y-6">
            {filteredEvents.map((event) => {
              const assignedFotografos = event.assignedMembers?.filter((m) => m.role === "fotografo").length || 0
              const assignedEditores = event.assignedMembers?.filter((m) => m.role === "editor").length || 0
              const isFullyAssigned =
                assignedFotografos >= (event.needsFotografos || 0) && assignedEditores >= (event.needsEditores || 0)

              return (
                <Card key={event.id} className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Calendar className="h-5 w-5 text-primary" />
                        <h3 className="font-semibold text-xl text-foreground">{event.title}</h3>
                        {isFullyAssigned && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Completo</span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                        <span className="capitalize">{formatDate(event.date)}</span>
                        <span>{event.time}</span>
                        <div className="flex items-center gap-1">
                          <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                          <span>Requer {event.requiredStars}+ estrelas</span>
                        </div>
                      </div>

                      <div className="flex gap-4 text-sm">
                        <div className="flex items-center gap-1">
                          <Camera className="h-4 w-4 text-blue-600" />
                          <span
                            className={
                              assignedFotografos >= (event.needsFotografos || 0)
                                ? "text-green-600 font-medium"
                                : "text-muted-foreground"
                            }
                          >
                            {assignedFotografos}/{event.needsFotografos || 0} fotografo(s)
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Pencil className="h-4 w-4 text-purple-600" />
                          <span
                            className={
                              assignedEditores >= (event.needsEditores || 0)
                                ? "text-green-600 font-medium"
                                : "text-muted-foreground"
                            }
                          >
                            {assignedEditores}/{event.needsEditores || 0} editor(es)
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button onClick={() => openManualAssignment(event)} variant="outline">
                        <Plus className="mr-2 h-4 w-4" />
                        Adicionar Manualmente
                      </Button>
                      <Button onClick={() => autoAssignMembers(event)}>
                        <Sparkles className="mr-2 h-4 w-4" />
                        {event.assignedMembers?.length ? "Realocar" : "Auto"}
                      </Button>
                      {event.assignedMembers && event.assignedMembers.length > 0 && (
                        <Button variant="outline" onClick={() => removeAssignment(event.id)}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {event.assignedMembers && event.assignedMembers.length > 0 && (
                    <div className="mt-4 pt-4 border-t space-y-4">
                      {event.assignedMembers.some((m) => m.role === "fotografo") && (
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <Camera className="h-4 w-4 text-blue-600" />
                            <span className="text-sm font-medium">Fotografos:</span>
                          </div>
                          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                            {event.assignedMembers
                              .filter((m) => m.role === "fotografo")
                              .map((member: any) => (
                                <div
                                  key={member.id}
                                  className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg"
                                >
                                  <div>
                                    <p className="font-medium text-sm">{member.name}</p>
                                    <p className="text-xs text-muted-foreground">{member.phone}</p>
                                  </div>
                                  <div className="flex gap-0.5">
                                    {[1, 2, 3, 4, 5].map((star) => (
                                      <Star
                                        key={star}
                                        className={`h-3 w-3 ${
                                          star <= member.stars ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
                                        }`}
                                      />
                                    ))}
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}

                      {event.assignedMembers.some((m) => m.role === "editor") && (
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <Pencil className="h-4 w-4 text-purple-600" />
                            <span className="text-sm font-medium">Editores:</span>
                          </div>
                          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                            {event.assignedMembers
                              .filter((m) => m.role === "editor")
                              .map((member: any) => (
                                <div
                                  key={member.id}
                                  className="flex items-center justify-between p-3 bg-purple-50 border border-purple-200 rounded-lg"
                                >
                                  <div>
                                    <p className="font-medium text-sm">{member.name}</p>
                                    <p className="text-xs text-muted-foreground">{member.phone}</p>
                                  </div>
                                  <div className="flex gap-0.5">
                                    {[1, 2, 3, 4, 5].map((star) => (
                                      <Star
                                        key={star}
                                        className={`h-3 w-3 ${
                                          star <= member.stars ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
                                        }`}
                                      />
                                    ))}
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {showSaveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold">Salvar Escala</h2>
                <Button variant="ghost" size="icon" onClick={() => setShowSaveModal(false)}>
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Nome da Escala</label>
                  <Input
                    placeholder="Ex: Escala de Dezembro 2025"
                    value={scheduleName}
                    onChange={(e) => setScheduleName(e.target.value)}
                  />
                </div>

                <div className="text-sm text-muted-foreground">
                  {selectedMonth ? (
                    <p>Salvando escala do mês de {formatMonth(selectedMonth)}</p>
                  ) : (
                    <p>Salvando escala de todos os meses</p>
                  )}
                  <p className="mt-1">
                    Total de cultos:{" "}
                    {filteredEvents.filter((e) => e.assignedMembers && e.assignedMembers.length > 0).length}
                  </p>
                </div>
              </div>

              <div className="flex gap-3 mt-6 pt-6 border-t">
                <Button variant="outline" onClick={() => setShowSaveModal(false)} className="flex-1">
                  Cancelar
                </Button>
                <Button onClick={saveSchedule} disabled={isSaving} className="flex-1">
                  {isSaving ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
