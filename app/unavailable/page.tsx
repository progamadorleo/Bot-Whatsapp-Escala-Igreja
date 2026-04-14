"use client"

import { useState, useEffect } from "react"
import { db } from "@/lib/firebase"
import { collection, getDocs } from "firebase/firestore"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { UserX, ArrowLeft, Calendar } from "lucide-react"
import Link from "next/link"
import type { Unavailability, Event } from "@/lib/types"

function parseLocalDate(dateString: string): Date {
  const [year, month, day] = dateString.split("-")
  return new Date(Number.parseInt(year), Number.parseInt(month) - 1, Number.parseInt(day))
}

export default function UnavailablePage() {
  const [unavailabilities, setUnavailabilities] = useState<Unavailability[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState<string>("")

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
      const [unavailabilitySnapshot, eventsSnapshot] = await Promise.all([
        getDocs(collection(db, "unavailability")),
        getDocs(collection(db, "events")),
      ])

      const unavailabilityData = unavailabilitySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Unavailability[]

      const eventsData = eventsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Event[]

      setUnavailabilities(unavailabilityData)
      setEvents(eventsData.sort((a, b) => parseLocalDate(a.date).getTime() - parseLocalDate(b.date).getTime()))
    } catch (error) {
      console.error("Erro ao carregar indisponibilidades:", error)
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

  function formatMonth(yearMonth: string) {
    const [year, month] = yearMonth.split("-")
    const date = new Date(Number.parseInt(year), Number.parseInt(month) - 1)
    return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
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
    const filteredEvents = selectedMonth
      ? events.filter((event) => {
          const date = parseLocalDate(event.date)
          const eventYearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
          return eventYearMonth === selectedMonth
        })
      : events

    const memberUnavailability = new Map<string, { name: string; phone: string; dates: string[] }>()

    unavailabilities.forEach((unavail) => {
      const isInFilteredMonth = filteredEvents.some((event) => event.date === unavail.date)
      if (!isInFilteredMonth && selectedMonth) return

      const existing = memberUnavailability.get(unavail.memberId)
      const event = events.find((e) => e.date === unavail.date)
      const formattedDate = event ? formatDate(event.date) : unavail.date

      if (existing) {
        existing.dates.push(formattedDate)
      } else {
        memberUnavailability.set(unavail.memberId, {
          name: unavail.memberName,
          phone: unavail.memberPhone,
          dates: [formattedDate],
        })
      }
    })

    return Array.from(memberUnavailability.values())
  }

  const availableMonths = getAvailableMonths()
  const unavailableMembers = getUnavailableMembersForMonth()

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-red-50">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-4xl font-bold text-foreground">Indisponibilidades</h1>
            <p className="text-muted-foreground mt-1">Membros que não poderão servir nos cultos cadastrados</p>
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

        {isLoading ? (
          <div className="text-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
            <p className="mt-4 text-muted-foreground">Carregando indisponibilidades...</p>
          </div>
        ) : unavailableMembers.length === 0 ? (
          <Card className="p-12 text-center">
            <UserX className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground text-lg mb-2">Nenhuma indisponibilidade registrada</p>
            <p className="text-sm text-muted-foreground">
              {selectedMonth ? `Para o mês de ${formatMonth(selectedMonth)}` : "Para os cultos cadastrados"}
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            <Card className="p-6 bg-gradient-to-r from-red-50 to-orange-50 border-red-200">
              <div className="flex items-center gap-3 mb-4">
                <UserX className="h-6 w-6 text-red-600" />
                <div>
                  <h3 className="font-semibold text-lg text-red-900">
                    {unavailableMembers.length} membro(s) com indisponibilidade
                  </h3>
                  <p className="text-sm text-red-700">
                    {selectedMonth ? `Para o mês de ${formatMonth(selectedMonth)}` : "Para todos os cultos cadastrados"}
                  </p>
                </div>
              </div>
            </Card>

            {unavailableMembers.map((member, index) => (
              <Card key={index} className="p-6 hover:shadow-lg transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-xl text-foreground mb-1">{member.name}</h3>
                    <p className="text-sm text-muted-foreground mb-3">{member.phone}</p>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-red-600" />
                      <span className="text-sm font-medium text-red-700">Não pode servir em:</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {member.dates.map((date, idx) => (
                        <span
                          key={idx}
                          className="text-sm bg-red-100 text-red-800 px-3 py-1 rounded-full capitalize font-medium"
                        >
                          {date}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
