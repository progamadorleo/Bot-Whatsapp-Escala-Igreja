"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { db } from "@/lib/firebase"
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc } from "firebase/firestore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Calendar, Trash2, Edit2, Plus, ArrowLeft, Star, Clock, Camera, Pencil } from "lucide-react"
import Link from "next/link"
import type { Event } from "@/lib/types"

function parseLocalDate(dateString: string): Date {
  const [year, month, day] = dateString.split("-")
  return new Date(Number.parseInt(year), Number.parseInt(month) - 1, Number.parseInt(day))
}

export default function CultosPage() {
  const [events, setEvents] = useState<Event[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingEvent, setEditingEvent] = useState<Event | null>(null)

  const currentDate = new Date()
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth())
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear())

  const [formData, setFormData] = useState({
    title: "",
    date: "",
    time: "",
    requiredStars: 3,
    description: "" as string | undefined,
    needsFotografos: 1,
    needsEditores: 1,
  })

  useEffect(() => {
    loadEvents()
  }, [])

  async function loadEvents() {
    try {
      const querySnapshot = await getDocs(collection(db, "events"))
      const eventsData = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Event[]
      setEvents(eventsData.sort((a, b) => parseLocalDate(a.date).getTime() - parseLocalDate(b.date).getTime()))
    } catch (error) {
      console.error("Erro ao carregar cultos:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const filteredEvents = events.filter((event) => {
    const eventDate = parseLocalDate(event.date)
    return eventDate.getMonth() === selectedMonth && eventDate.getFullYear() === selectedYear
  })

  function formatDate(dateString: string) {
    const date = parseLocalDate(dateString)
    return date.toLocaleDateString("pt-BR", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  }

  const months = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ]

  const years = Array.from({ length: 7 }, (_, i) => 2024 + i)

  function openFormWithDefaultDate() {
    const defaultDate = new Date().toISOString().split("T")[0]
    setFormData({
      title: "",
      date: defaultDate,
      time: "",
      requiredStars: 3,
      description: "",
      needsFotografos: 1,
      needsEditores: 1,
    })
    setShowForm(true)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      if (editingEvent) {
        await updateDoc(doc(db, "events", editingEvent.id), formData)
        setEditingEvent(null)
      } else {
        await addDoc(collection(db, "events"), formData)
      }
      setShowForm(false)
      loadEvents()
    } catch (error) {
      console.error("Erro ao salvar culto:", error)
    }
  }

  function cancelForm() {
    setShowForm(false)
    setEditingEvent(null)
  }

  function handleEdit(event: Event) {
    setFormData({
      title: event.title,
      date: event.date,
      time: event.time,
      requiredStars: event.requiredStars,
      description: event.description || "",
      needsFotografos: event.needsFotografos || 1,
      needsEditores: event.needsEditores || 1,
    })
    setEditingEvent(event)
    setShowForm(true)
  }

  async function handleDelete(eventId: string) {
    try {
      await deleteDoc(doc(db, "events", eventId))
      loadEvents()
    } catch (error) {
      console.error("Erro ao deletar culto:", error)
    }
  }

  const importanceLabels: Record<number, { label: string; color: string }> = {
    5: { label: "Culto Especial", color: "text-yellow-600 bg-yellow-50 border-yellow-200" },
    4: { label: "Alta Importância", color: "text-orange-600 bg-orange-50 border-orange-200" },
    3: { label: "Importância Média", color: "text-blue-600 bg-blue-50 border-blue-200" },
    2: { label: "Baixa Importância", color: "text-green-600 bg-green-50 border-green-200" },
    1: { label: "Básico", color: "text-gray-600 bg-gray-50 border-gray-200" },
  }

  function getImportanceLabel(stars: number) {
    return importanceLabels[stars] || importanceLabels[1]
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="outline" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-4xl font-bold text-foreground">Cultos</h1>
              <p className="text-muted-foreground mt-1">Gerencie os cultos e eventos do mês</p>
            </div>
          </div>

          {!showForm && (
            <Button onClick={openFormWithDefaultDate} size="lg">
              <Plus className="mr-2 h-5 w-5" />
              Novo Culto
            </Button>
          )}
        </div>

        <Card className="p-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              <span className="font-medium">Filtrar por:</span>
            </div>

            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="px-4 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {months.map((month, index) => (
                <option key={index} value={index}>
                  {month}
                </option>
              ))}
            </select>

            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="px-4 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>

            <div className="ml-auto text-sm text-muted-foreground">
              {filteredEvents.length} culto(s) em {months[selectedMonth]} de {selectedYear}
            </div>
          </div>
        </Card>

        {/* Form */}
        {showForm && (
          <Card className="p-6 mb-8 border-2">
            <h2 className="text-2xl font-semibold mb-6">{editingEvent ? "Editar Culto" : "Novo Culto"}</h2>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2">Título do Culto</label>
                <Input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Ex: Culto de Celebração"
                  required
                  className="text-base"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Data</label>
                  <Input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    required
                    className="text-base"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Horário</label>
                  <Input
                    type="time"
                    value={formData.time}
                    onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                    required
                    className="text-base"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Descrição (Opcional)</label>
                <Input
                  type="text"
                  value={formData.description || ""}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Ex: Culto especial com batismo"
                  className="text-base"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                    <Camera className="h-4 w-4 text-primary" />
                    Fotógrafos Necessários
                  </label>
                  <Input
                    type="number"
                    min="0"
                    max="10"
                    value={formData.needsFotografos}
                    onChange={(e) =>
                      setFormData({ ...formData, needsFotografos: Number.parseInt(e.target.value) || 0 })
                    }
                    className="text-base"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                    <Pencil className="h-4 w-4 text-primary" />
                    Editores Necessários
                  </label>
                  <Input
                    type="number"
                    min="0"
                    max="10"
                    value={formData.needsEditores}
                    onChange={(e) => setFormData({ ...formData, needsEditores: Number.parseInt(e.target.value) || 0 })}
                    className="text-base"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Nível de Importância</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setFormData({ ...formData, requiredStars: star })}
                      className="transition-transform hover:scale-110"
                    >
                      <Star
                        className={`h-10 w-10 ${
                          star <= formData.requiredStars ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
                        }`}
                      />
                    </button>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  {formData.requiredStars === 5 && "★★★★★ Culto Especial - Requer membros especialistas"}
                  {formData.requiredStars === 4 && "★★★★☆ Alta Importância - Membros experientes"}
                  {formData.requiredStars === 3 && "★★★☆☆ Importância Média - Culto regular"}
                  {formData.requiredStars === 2 && "★★☆☆☆ Baixa Importância - Membros iniciantes OK"}
                  {formData.requiredStars === 1 && "★☆☆☆☆ Básico - Qualquer membro"}
                </p>
              </div>

              <div className="flex gap-3">
                <Button type="submit" className="flex-1">
                  {editingEvent ? "Atualizar" : "Cadastrar"}
                </Button>
                <Button type="button" variant="outline" onClick={cancelForm} className="flex-1 bg-transparent">
                  Cancelar
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* Events List */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
            <p className="mt-4 text-muted-foreground">Carregando cultos...</p>
          </div>
        ) : filteredEvents.length === 0 ? (
          <Card className="p-12 text-center">
            <p className="text-muted-foreground text-lg">
              Nenhum culto cadastrado em {months[selectedMonth]} de {selectedYear}.
            </p>
            <Button onClick={openFormWithDefaultDate} className="mt-4">
              Cadastrar Culto
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredEvents.map((event) => {
              const importance = getImportanceLabel(event.requiredStars)
              return (
                <Card key={event.id} className="p-6 hover:shadow-lg transition-shadow">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <h3 className="font-semibold text-xl text-foreground">{event.title}</h3>
                        <span className={`text-xs px-3 py-1 rounded-full border ${importance.color}`}>
                          {importance.label}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-3">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          <span className="capitalize">{formatDate(event.date)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          <span>{event.time}</span>
                        </div>
                      </div>

                      {event.description && <p className="text-sm text-muted-foreground mb-3">{event.description}</p>}

                      <div className="flex gap-4 mb-3 text-sm">
                        <div className="flex items-center gap-1">
                          <Camera className="h-4 w-4 text-blue-600" />
                          <span className="text-muted-foreground">{event.needsFotografos || 0} fotógrafo(s)</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Pencil className="h-4 w-4 text-purple-600" />
                          <span className="text-muted-foreground">{event.needsEditores || 0} editor(es)</span>
                        </div>
                      </div>

                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`h-4 w-4 ${
                              star <= event.requiredStars ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
                            }`}
                          />
                        ))}
                        <span className="text-xs text-muted-foreground ml-2">
                          Requer membros com {event.requiredStars}+ estrelas
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-1 ml-4">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(event)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(event.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
