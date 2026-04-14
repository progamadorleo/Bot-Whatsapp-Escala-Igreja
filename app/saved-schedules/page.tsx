"use client"

import { useState, useEffect } from "react"
import { db } from "@/lib/firebase"
import { collection, getDocs, deleteDoc, doc } from "firebase/firestore"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ArrowLeft, Trash2, Calendar, Download } from "lucide-react"
import Link from "next/link"
import type { SavedSchedule } from "@/lib/types"
import { jsPDF } from "jspdf"

function parseLocalDate(dateString: string): Date {
  const [year, month, day] = dateString.split("-")
  return new Date(Number.parseInt(year), Number.parseInt(month) - 1, Number.parseInt(day))
}

export default function SavedSchedulesPage() {
  const [schedules, setSchedules] = useState<SavedSchedule[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadSchedules()
  }, [])

  async function loadSchedules() {
    try {
      const snapshot = await getDocs(collection(db, "savedSchedules"))
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as SavedSchedule[]

      setSchedules(data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()))
    } catch (error) {
      console.error("Erro ao carregar escalas salvas:", error)
    } finally {
      setIsLoading(false)
    }
  }

  async function deleteSchedule(id: string) {
    if (!confirm("Tem certeza que deseja excluir esta escala?")) return

    try {
      await deleteDoc(doc(db, "savedSchedules", id))
      await loadSchedules()
    } catch (error) {
      console.error("Erro ao excluir escala:", error)
      alert("Erro ao excluir escala.")
    }
  }

  function exportScheduleToPDF(schedule: SavedSchedule) {
    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    })

    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 10
    const cardWidth = 55
    const cardHeight = 35
    const gap = 5
    const cardsPerRow = 5
    const cardsPerPage = 15

    const colors = [
      { bg: [200, 230, 201], text: [27, 94, 32] },
      { bg: [255, 224, 178], text: [230, 81, 0] },
      { bg: [255, 205, 210], text: [183, 28, 28] },
      { bg: [179, 229, 252], text: [1, 87, 155] },
      { bg: [209, 196, 233], text: [74, 20, 140] },
      { bg: [255, 249, 196], text: [245, 127, 23] },
      { bg: [178, 223, 219], text: [0, 77, 64] },
      { bg: [197, 202, 233], text: [40, 53, 147] },
    ]

    let currentPage = 0
    let cardIndex = 0

    schedule.events.forEach((event, index) => {
      if (cardIndex > 0 && cardIndex % cardsPerPage === 0) {
        pdf.addPage()
        currentPage++
        cardIndex = 0
      }

      const row = Math.floor(cardIndex / cardsPerRow)
      const col = cardIndex % cardsPerRow
      const x = margin + col * (cardWidth + gap)
      const y = margin + row * (cardHeight + gap)

      const colorIndex = index % colors.length
      const color = colors[colorIndex]

      pdf.setFillColor(color.bg[0], color.bg[1], color.bg[2])
      pdf.rect(x, y, cardWidth, cardHeight, "F")

      pdf.setDrawColor(color.text[0], color.text[1], color.text[2])
      pdf.setLineWidth(0.5)
      pdf.rect(x, y, cardWidth, cardHeight, "S")

      pdf.setTextColor(color.text[0], color.text[1], color.text[2])
      pdf.setFontSize(9)
      pdf.setFont("helvetica", "bold")

      const eventDate = parseLocalDate(event.eventDate)
      const dateStr = `Dia - ${eventDate.getDate().toString().padStart(2, "0")}/${(eventDate.getMonth() + 1).toString().padStart(2, "0")}`

      const title = event.eventTitle.length > 25 ? event.eventTitle.substring(0, 22) + "..." : event.eventTitle
      pdf.text(`[ ${title} ]`, x + cardWidth / 2, y + 5, { align: "center" })
      pdf.text(dateStr, x + cardWidth / 2, y + 9, { align: "center" })

      pdf.setFontSize(7)
      pdf.setFont("helvetica", "normal")
      let lineY = y + 15

      const fotografos = event.assignedMembers.filter((m) => m.role === "fotografo")
      const editores = event.assignedMembers.filter((m) => m.role === "editor")

      fotografos.forEach((member) => {
        const memberName = member.name.length > 20 ? member.name.substring(0, 17) + "..." : member.name
        pdf.text(`FOTOS: ${memberName}`, x + 2, lineY)
        lineY += 4
      })

      editores.forEach((member) => {
        const memberName = member.name.length > 20 ? member.name.substring(0, 17) + "..." : member.name
        pdf.text(`EDIÇÃO: ${memberName}`, x + 2, lineY)
        lineY += 4
      })

      cardIndex++
    })

    pdf.save(`${schedule.name}.pdf`)
  }

  function formatDate(dateString: string) {
    const date = new Date(dateString)
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  function formatMonth(yearMonth: string) {
    if (yearMonth === "all") return "Todos os meses"
    const [year, month] = yearMonth.split("-")
    const date = new Date(Number.parseInt(year), Number.parseInt(month) - 1)
    return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
  }

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
            <h1 className="text-4xl font-bold text-foreground">Escalas Salvas</h1>
            <p className="text-muted-foreground mt-1">Histórico de escalas geradas</p>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
            <p className="mt-4 text-muted-foreground">Carregando escalas salvas...</p>
          </div>
        ) : schedules.length === 0 ? (
          <Card className="p-12 text-center">
            <p className="text-muted-foreground text-lg mb-4">Nenhuma escala salva ainda.</p>
            <Link href="/schedule">
              <Button>Gerar Nova Escala</Button>
            </Link>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {schedules.map((schedule) => (
              <Card key={schedule.id} className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg mb-2">{schedule.name}</h3>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                      <Calendar className="h-4 w-4" />
                      <span className="capitalize">{formatMonth(schedule.month)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Criado em {formatDate(schedule.createdAt)}</p>
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  <p className="text-sm">
                    <span className="font-medium">{schedule.events.length}</span> cultos
                  </p>
                  <p className="text-sm">
                    <span className="font-medium">
                      {schedule.events.reduce((acc, e) => acc + e.assignedMembers.length, 0)}
                    </span>{" "}
                    membros escalados
                  </p>
                </div>

                <div className="flex gap-2 pt-4 border-t">
                  <Button onClick={() => exportScheduleToPDF(schedule)} variant="outline" className="flex-1">
                    <Download className="mr-2 h-4 w-4" />
                    PDF
                  </Button>
                  <Button onClick={() => deleteSchedule(schedule.id)} variant="outline" size="icon">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
